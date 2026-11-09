#!/usr/bin/env node
/**
 * ai-router MCP server
 *
 * A shared, dependency-free MCP server that both Claude Code and OpenCode use.
 * It turns a task description into a routing decision (agent, model, effort),
 * exposes the routing policy as a resource, and records decisions so the setup
 * can be measured.
 *
 * Transport: MCP stdio, newline-delimited JSON-RPC 2.0.
 *
 * Tools
 *   route_task          classify a task and return the agent/model/effort route
 *   get_routing_policy  return the routing table and rules as markdown
 *   routing_stats       aggregate the recorded routing decisions
 *
 * Resources
 *   ai-router://policy  the routing table and rules
 *   ai-router://agents  the agent catalogue with model and effort
 *
 * No API key, no network, no npm dependencies.
 */
import { createInterface } from "node:readline";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const SERVER_NAME = "ai-router";
const SERVER_VERSION = "1.0.0";

/* ------------------------------------------------------------------ */
/* Routing policy                                                      */
/* ------------------------------------------------------------------ */

/**
 * The single source of truth for routing. The MCP server, the OpenCode agents
 * and the Claude Code agents must agree on these values.
 */
const ROUTES = {
  lookup: {
    agent: "code-searcher",
    model: "haiku",
    effort: "low",
    opencode: "opencode/claude-haiku-5-5#low",
    claude: "haiku",
    verify: "Nothing to verify: the searcher returns path:line and stops.",
    escalate: "If the searcher cannot locate it, widen the patterns once, then ask the main agent.",
  },
  edit: {
    agent: "implementer",
    model: "sonnet",
    effort: "medium",
    opencode: "opencode/claude-sonnet-5-5#medium",
    claude: "sonnet",
    verify: "After every implementer edit, run test-runner on the affected tests.",
    escalate: "If the same test fails twice, send the diff and the failure to reviewer, then re-run implementer with its findings.",
  },
  debug: {
    agent: "implementer",
    model: "sonnet",
    effort: "medium",
    opencode: "opencode/claude-sonnet-5-5#medium",
    claude: "sonnet",
    verify: "Reproduce first: have test-runner capture the exact failing test and error, then implementer fixes it, then test-runner re-runs.",
    escalate: "After two failed fix attempts, stop. reviewer gets the diff plus both failures, then implementer applies the review.",
  },
  risky: {
    agent: "reviewer",
    model: "opus",
    effort: "high",
    opencode: "opencode/claude-opus-5-5#high",
    claude: "opus",
    verify: "reviewer inspects the diff before merge; test-runner still re-runs the affected suite.",
    escalate: "A BLOCKER finding goes back to implementer with the reviewer's path:line notes. Do not re-run the whole task on a bigger model.",
  },
  unsure: {
    agent: "implementer",
    model: "sonnet",
    effort: "medium",
    opencode: "opencode/claude-sonnet-5-5#medium",
    claude: "sonnet",
    verify: "Treat as an edit: run test-runner after the change.",
    escalate: "When in doubt, stay on the middle tier; escalate only the failing step.",
  },
};

// Read-only questions stay lookups even when the topic is auth or payments:
// "where is the auth middleware" is a search, not an auth change.
const LOOKUP_INTENT =
  /\b(?:where|find|locate|search|look ?up|who calls|call sites?|usages?|list|show|summari[sz]e|explain|read|inspect|what does|how does|is there|does .* exist)\b/i;
const CHANGE_INTENT =
  /\b(?:add|implement|create|build|write|introduce|fix|patch|repair|rename|refactor|move|extract|inline|replace|update|change|modify|remove|delete|migrate|review|audit|harden|secure|drop|alter)\b/i;

const RISKY_PATTERNS = [
  [/\bauth(?:entication|orization|z)?\b/i, 3],
  [/\b(?:sign[- ]?in|sign[- ]?up|session handling|login|logout|oauth|clerk)\b/i, 2],
  [/\b(?:payments?|billing|razorpay|stripe|refund|invoice|money|amount|currency)\b/i, 3],
  // "pricing helper" is a rename, not a money change.
  [/\bpricing\b/i, 1],
  [/\b(?:migration|schema change|alter table|drop (?:table|column)|delete (?:column|row|rows)|data loss|backfill)\b/i, 3],
  [/\b(?:security|vulnerab\w*|exploit|xss|csrf|injection|encrypt\w*|decrypt\w*|secret|credential|api key)\b/i, 3],
  [/\b(?:permissions?|roles?|rbac|tenant|multi[- ]?tenant|access control|authoriz\w*|privilege)\b/i, 2],
  [/\b(?:concurren\w*|race condition|locking|deadlock|transaction|atomic)\b/i, 2],
  [/\b(?:public api|breaking change|webhook|signature|idempoten\w*)\b/i, 2],
  [/\b(?:passport|pii|privacy|personal data|document access|signed url|storage)\b/i, 2],
  [/\b(?:production|prod deploy|release|rollback)\b/i, 1],
];

const DEBUG_PATTERNS = [
  [/\b(?:bug|broken|fails?|failing|failure|error|exception|crash\w*)\b/i, 2],
  [/\b(?:stack trace|traceback|reproduce|regression|flaky|intermittent)\b/i, 2],
  [/\b(?:why (?:does|is|did)|debug|investigate|root cause)\b/i, 1.5],
  [/\b(?:test|tests|vitest|jest|pytest) (?:fail|fails|failing|are red)\b/i, 3],
];

const EDIT_PATTERNS = [
  [/\b(?:add|implement|create|build|write|introduce)\b/i, 1.5],
  [/\b(?:fix|patch|repair)\b/i, 1.5],
  [/\b(?:rename|refactor|move|extract|inline|replace|update|change|modify|remove|delete)\b/i, 1.5],
  [/\b(?:feature|endpoint|component|function|form|page|route|button|field)\b/i, 0.5],
];

const LOOKUP_PATTERNS = [
  [/\b(?:where|find|locate|search|lookup|look up|who calls|call sites?|usages?)\b/i, 2],
  [/\b(?:list|show|summar\w*|explain|read|inspect|what does|how does)\b/i, 1.5],
  [/\b(?:grep|glob|symbol|definition|reference|file|files)\b/i, 0.75],
];

function score(patterns, task) {
  return patterns.reduce((total, [re, weight]) => total + (re.test(task) ? weight : 0), 0);
}

/**
 * Deterministic classifier. Deliberately keyword-based: the shared MCP server
 * must work with no API key and give the same answer in both harnesses.
 */
function classify(task) {
  const text = String(task ?? "").trim();
  if (!text) return { label: "unsure", scores: {} };

  // Intent first: a pure "where is X" question is a lookup even when X is
  // auth or payments. Any change verb keeps it in the scoring path.
  if (LOOKUP_INTENT.test(text) && !CHANGE_INTENT.test(text)) {
    return { label: "lookup", scores: { lookup: 1 } };
  }

  const scores = {
    risky: score(RISKY_PATTERNS, text),
    debug: score(DEBUG_PATTERNS, text),
    edit: score(EDIT_PATTERNS, text),
    lookup: score(LOOKUP_PATTERNS, text),
  };

  let label = "unsure";
  if (scores.risky >= 3) label = "risky";
  else if (scores.debug >= 2) label = "debug";
  else if (scores.edit > 0 || CHANGE_INTENT.test(text)) label = "edit";
  else if (scores.lookup > 0) label = "lookup";

  return { label, scores };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function findProjectRoot() {
  if (process.env.AI_ROUTER_ROOT) return resolve(process.env.AI_ROUTER_ROOT);
  let dir = process.cwd();
  for (let i = 0; i < 8; i += 1) {
    if (
      existsSync(join(dir, ".git")) ||
      existsSync(join(dir, "AGENTS.md")) ||
      existsSync(join(dir, "CLAUDE.md"))
    ) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

const LOG_PATH = join(findProjectRoot(), ".ai-routing", "decisions.jsonl");

function recordDecision(route, task) {
  try {
    mkdirSync(dirname(LOG_PATH), { recursive: true });
    appendFileSync(
      LOG_PATH,
      `${JSON.stringify({
        ts: new Date().toISOString(),
        route: route.label,
        agent: ROUTES[route.label].agent,
        model: ROUTES[route.label].model,
        effort: ROUTES[route.label].effort,
        task: String(task ?? "").slice(0, 500),
      })}\n`,
      "utf8",
    );
  } catch {
    // Logging is best-effort: never fail a routing request because the
    // workspace is read-only.
  }
}

function routingTable() {
  const rows = [
    "| Task type | Delegate to | Model · effort | OpenCode model |",
    "| - | - | - | - |",
    "| Find files, symbols, usages, \"where is X\" | `code-searcher` | haiku · low | `opencode/claude-haiku-5-5#low` |",
    "| Scoped edit: feature, fix, refactor in a few files | `implementer` | sonnet · medium | `opencode/claude-sonnet-5-5#medium` |",
    "| Debug an unclear or repeated failure | `implementer`, then `test-runner` | sonnet · medium | `opencode/claude-sonnet-5-5#medium` |",
    "| Risky diff: auth, payments, migrations, security, public API, concurrency | `reviewer` | opus · high | `opencode/claude-opus-5-5#high` |",
    "| Anything else / unsure | `implementer` | sonnet · medium | `opencode/claude-sonnet-5-5#medium` |",
    "",
  ].join("\n");

  const rules = [
    "1. Every delegation names one of the agents above, or passes `model` explicitly. Never let a subagent inherit the main model by accident.",
    "2. When unsure of the tier, use the middle tier (sonnet). Never the cheapest tier on risky work.",
    "3. Verify by risk: after every implementer edit, run test-runner. Send the diff to reviewer only when it touches the risky list above.",
    "4. Escalate, don't loop: if the same test fails twice, stop retrying. Send the diff and the failure to reviewer, then re-run implementer with the reviewer's findings.",
    "5. Keep one model per task. Do not switch the main model mid-task; delegate instead. A model switch re-reads the whole conversation with no cache hits.",
    "6. Use the advisor (Claude Code) or a reviewer pass (OpenCode) before committing to a multi-file approach and before declaring a long task done.",
  ].join("\n");

  return `## Model routing\n\nYou are the orchestrator. Do not do bulk work in the main conversation: delegate it.\n\n${rows}\n### Rules\n\n${rules}`;
}

function agentCatalogue() {
  const rows = Object.entries(ROUTES)
    .filter(([label]) => label !== "unsure")
    .map(
      ([label, r]) =>
        `| \`${r.agent}\` | ${label} | ${r.model} · ${r.effort} | Claude Code \`${r.claude}\` | \`${r.opencode}\` |`,
    );
  return [
    "## Routed agents",
    "",
    "| Agent | Route | Model · effort | Claude Code model | OpenCode model |",
    "| - | - | - | - | - |",
    ...rows,
    "",
    "OpenCode agents live in `.opencode/agents/`. Claude Code agents live in `.claude/agents/`.",
    "Both sets are generated from the same policy and must stay in sync.",
  ].join("\n");
}

function routeResult(task) {
  const { label, scores } = classify(task);
  const route = ROUTES[label];
  recordDecision({ label }, task);

  const confidence = label === "unsure" ? "fallback: no route keyword matched" : `matched ${label} (score ${scores[label]})`;
  const lines = [
    `## Route: ${label}`,
    "",
    `**Delegate to:** \`${route.agent}\`  `,
    `**Model · effort:** ${route.model} · ${route.effort}  `,
    `**Claude Code:** \`${route.claude}\`  `,
    `**OpenCode:** \`${route.opencode}\`  `,
    `**Why:** ${confidence}`,
    "",
    `**Verify:** ${route.verify}`,
    "",
    `**Escalate:** ${route.escalate}`,
    "",
    "### How to delegate",
    "",
    `- Claude Code: use the Agent tool with \`subagent_type: "${route.agent}"\`. The agent file already pins model and effort; pass \`model: "${route.claude}"\` if you override.`,
    `- OpenCode: use the \`subagent\` tool with agent \`"${route.agent}"\`. Its agent file pins \`${route.opencode}\`.`,
    "- Keep the main session on its current model. Delegate instead of switching models mid-task.",
  ];

  if (label === "risky") {
    lines.push(
      "",
      "### Risky-change checklist",
      "",
      "- Read the surrounding code before approving the diff.",
      "- Check authorisation is enforced server-side, never by the client.",
      "- Check money totals are recomputed server-side, never trusted from input.",
      "- Check private documents are behind an access-checked helper, not a bare URL.",
      "- Report findings as `BLOCKER`, `SHOULD-FIX`, `NIT` with `path:line`.",
    );
  }

  return { label, route, text: lines.join("\n") };
}

/* ------------------------------------------------------------------ */
/* MCP plumbing                                                        */
/* ------------------------------------------------------------------ */

const TOOLS = [
  {
    name: "route_task",
    title: "Route a task",
    description:
      "Classify a coding task and return the cheapest agent, model and effort that reliably solves it. Call this before delegating work. Records the decision in .ai-routing/decisions.jsonl.",
    inputSchema: {
      type: "object",
      properties: {
        task: {
          type: "string",
          description: "The task in one or two sentences, including any risky keywords (auth, payments, migration, security).",
        },
      },
      required: ["task"],
      additionalProperties: false,
    },
  },
  {
    name: "get_routing_policy",
    title: "Get the routing policy",
    description: "Return the full model-routing table and rules that both Claude Code and OpenCode follow.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "routing_stats",
    title: "Routing statistics",
    description: "Aggregate the routing decisions recorded so far. Use it to see whether work is being over-escalated or cheap tiers are failing.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "How many of the most recent decisions to read. Default 500." },
      },
      additionalProperties: false,
    },
  },
];

const RESOURCES = [
  {
    uri: "ai-router://policy",
    name: "Routing policy",
    description: "The model/agent/effort routing table and the six delegation rules.",
    mimeType: "text/markdown",
  },
  {
    uri: "ai-router://agents",
    name: "Routed agents",
    description: "Catalogue of the routed agents and their pinned models in Claude Code and OpenCode.",
    mimeType: "text/markdown",
  },
];

const INSTRUCTIONS =
  "Before delegating, call route_task with the task text. Use the returned agent, model and effort. " +
  "After an implementer edit, run the test-runner. Escalate a failing step to the reviewer instead of re-running the whole task on a bigger model. " +
  "Use get_routing_policy when you need the full table.";

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function result(id, value) {
  send({ jsonrpc: "2.0", id, result: value });
}

function failure(id, code, message) {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}

function textContent(text) {
  return { content: [{ type: "text", text }] };
}

function handleToolCall(id, name, args = {}) {
  if (name === "route_task") {
    if (typeof args.task !== "string" || !args.task.trim()) {
      return failure(id, -32602, "route_task requires a non-empty 'task' string");
    }
    const { text } = routeResult(args.task);
    return result(id, textContent(text));
  }

  if (name === "get_routing_policy") {
    return result(id, textContent(`${routingTable()}\n\n${agentCatalogue()}`));
  }

  if (name === "routing_stats") {
    const limit = Number.isFinite(args.limit) && args.limit > 0 ? Math.floor(args.limit) : 500;
    return result(id, textContent(statsText(limit)));
  }

  return failure(id, -32602, `Unknown tool: ${name}`);
}

function statsText(limit) {
  if (!existsSync(LOG_PATH)) {
    return "No routing decisions recorded yet. Call route_task first.";
  }
  const lines = readFileSync(LOG_PATH, "utf8").trim().split(/\r?\n/).filter(Boolean).slice(-limit);
  const byRoute = {};
  const byAgent = {};
  const byModel = {};
  for (const line of lines) {
    try {
      const d = JSON.parse(line);
      byRoute[d.route] = (byRoute[d.route] ?? 0) + 1;
      byAgent[d.agent] = (byAgent[d.agent] ?? 0) + 1;
      byModel[`${d.model} · ${d.effort}`] = (byModel[`${d.model} · ${d.effort}`] ?? 0) + 1;
    } catch {
      // Skip a corrupt line rather than failing the whole report.
    }
  }
  const render = (title, obj) =>
    [`**${title}**`, "", ...Object.entries(obj).sort((a, b) => b[1] - a[1]).map(([k, v]) => `- ${k}: ${v}`)].join("\n");
  return [
    `## Routing stats (last ${lines.length} decisions)`,
    "",
    render("By route", byRoute),
    "",
    render("By agent", byAgent),
    "",
    render("By model · effort", byModel),
    "",
    `Log: \`${LOG_PATH}\``,
  ].join("\n");
}

function handle(message) {
  const { id, method, params } = message;

  if (!method) return; // response from the client, nothing to do

  switch (method) {
    case "initialize":
      return result(id, {
        protocolVersion: typeof params?.protocolVersion === "string" ? params.protocolVersion : "2024-11-05",
        capabilities: { tools: { listChanged: false }, resources: { subscribe: false, listChanged: false } },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
        instructions: INSTRUCTIONS,
      });

    case "ping":
      return result(id, {});

    case "tools/list":
      return result(id, { tools: TOOLS });

    case "tools/call":
      return handleToolCall(id, params?.name, params?.arguments);

    case "resources/list":
      return result(id, { resources: RESOURCES });

    case "resources/read": {
      const uri = params?.uri;
      if (uri === "ai-router://policy") {
        return result(id, { contents: [{ uri, mimeType: "text/markdown", text: routingTable() }] });
      }
      if (uri === "ai-router://agents") {
        return result(id, { contents: [{ uri, mimeType: "text/markdown", text: agentCatalogue() }] });
      }
      return failure(id, -32002, `Resource not found: ${uri}`);
    }

    // Notifications and methods we do not implement: acknowledge notifications
    // silently, and return an empty result for optional client methods.
    case "notifications/initialized":
    case "notifications/cancelled":
    case "notifications/roots/list_changed":
      return undefined;

    default:
      if (id !== undefined) return failure(id, -32601, `Method not found: ${method}`);
      return undefined;
  }
}

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });

rl.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let message;
  try {
    message = JSON.parse(trimmed);
  } catch {
    failure(null, -32700, "Parse error");
    return;
  }
  if (Array.isArray(message)) {
    message.forEach(handle);
    return;
  }
  handle(message);
});

rl.on("close", () => process.exit(0));
