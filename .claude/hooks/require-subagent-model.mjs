#!/usr/bin/env node
/**
 * PreToolUse hook for the Agent tool: block subagent spawns with no explicit model.
 *
 * Node port of require-subagent-model.py for machines without Python 3.10+.
 * Behaviour is identical:
 *   - allowed when the call itself passes `model`
 *   - allowed when the agent's definition file has a `model:` line
 *   - denied otherwise, so nothing silently inherits the main model
 *
 * Enable it in .claude/settings.json:
 *   "hooks": {
 *     "PreToolUse": [{
 *       "matcher": "Agent",
 *       "hooks": [{ "type": "command",
 *                   "command": "node \"${CLAUDE_PROJECT_DIR}/.claude/hooks/require-subagent-model.mjs\"" }]
 *     }]
 *   }
 *
 * Set ROUTING_HOOK_LOG=/path/file.jsonl to log every input this hook sees.
 * Original Python version by @donimas · AI Levels series.
 */
import { existsSync, readdirSync, readFileSync, appendFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

function agentDirs() {
  const project = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  return [join(project, ".claude", "agents"), join(homedir(), ".claude", "agents")];
}

function frontmatterModel(agentName) {
  for (const directory of agentDirs()) {
    if (!existsSync(directory)) continue;
    for (const file of readdirSync(directory)) {
      if (!file.endsWith(".md")) continue;
      const text = readFileSync(join(directory, file), "utf8");
      const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
      if (!match) continue;
      const fields = {};
      for (const line of match[1].split(/\r?\n/)) {
        const field = line.match(/^(\w+):\s*(.+?)\s*$/);
        if (field) fields[field[1]] = field[2];
      }
      if (fields.name === agentName) return fields.model;
    }
  }
  return undefined;
}

function deny(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: reason,
      },
    }),
  );
  process.exit(0);
}

let raw = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) raw += chunk;

let data = {};
try {
  data = JSON.parse(raw);
} catch {
  process.exit(0); // Never block a tool call because the payload was unreadable.
}

const log = process.env.ROUTING_HOOK_LOG;
if (log) {
  try {
    appendFileSync(log, `${JSON.stringify(data)}\n`);
  } catch {
    // Logging is best-effort.
  }
}

const toolInput = data.tool_input || {};
if (toolInput.model) process.exit(0);

const agent = toolInput.subagent_type || "general-purpose";
if (frontmatterModel(agent)) process.exit(0);

deny(
  `Subagent '${agent}' has no explicit model. Retry the Agent call with ` +
    "model set to haiku (search, tests), sonnet (edits) or opus (risky review), " +
    "or delegate to one of the routed agents in .claude/agents/.",
);
