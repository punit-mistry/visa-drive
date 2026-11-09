# ai-router MCP server

A small, dependency-free MCP server that gives **Claude Code and OpenCode the
same routing policy**. Based on [donimas/ai-routing](https://github.com/donimas/ai-routing).

It runs over stdio and needs no API key: classification is deterministic, so
both harnesses get the same answer for the same task.

## Tools

| Tool | What it does |
| - | - |
| `route_task` | Classifies a task (`lookup`, `edit`, `debug`, `risky`, `unsure`) and returns the agent, model and effort to delegate to. Records the decision. |
| `get_routing_policy` | Returns the routing table, the agent catalogue and the six delegation rules. |
| `routing_stats` | Aggregates recorded decisions by route, agent and model. |

## Resources

| URI | Contents |
| - | - |
| `ai-router://policy` | Routing table and rules. |
| `ai-router://agents` | Routed agents with their pinned Claude Code and OpenCode models. |

## How both harnesses load it

- Claude Code: `.mcp.json` → `"command": "node"`, `"args": ["tools/ai-router-mcp/server.mjs"]`.
  `.claude/settings.json` lists it in `enabledMcpjsonServers`, so it is approved
  on first open instead of waiting for the trust prompt.
- OpenCode: `opencode.json` → `mcp.servers.ai-router` with the same command.
  `codemode` is `false` so the three tools appear directly in the tool list.

Both start the same file, so the policy cannot drift between harnesses.

## Routing table

| Task type | Agent | Model · effort |
| - | - | - |
| Find files, symbols, usages, "where is X" | `code-searcher` | haiku · low |
| Scoped edit / feature / fix / refactor | `implementer` | sonnet · medium |
| Debug an unclear or repeated failure | `implementer`, then `test-runner` | sonnet · medium |
| Risky diff: auth, payments, migrations, security, public API, concurrency | `reviewer` | opus · high |
| Anything else / unsure | `implementer` | sonnet · medium |

Model identifiers:

- Claude Code: `haiku` / `sonnet` / `opus` aliases plus `effort` in agent frontmatter.
- OpenCode: `opencode/claude-haiku-5-5#low`, `opencode/claude-sonnet-5-5#medium`,
  `opencode/claude-opus-5-5#high`.

If your OpenCode provider uses different model IDs, change the `ROUTES` table at
the top of `server.mjs` and the four files in `.opencode/agents/` together.

## Decision log

`route_task` appends one JSON line per decision to `.ai-routing/decisions.jsonl`
(gitignored). `routing_stats` reads it. Delete the file to reset the stats.

## Test it without a harness

```bash
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
  '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"route_task","arguments":{"task":"Change the payment refund logic in the Razorpay webhook"}}}' \
  | node tools/ai-router-mcp/server.mjs
```

Expected route for that task: `risky` → `reviewer` → `opus · high`.

## Optional: block subagents without an explicit model

`.claude/hooks/` contains two equivalent Claude Code `PreToolUse` hooks:

- `require-subagent-model.py` — original from the upstream repo (needs Python 3.10+).
- `require-subagent-model.mjs` — Node port for machines without Python.

Enable the Node one by adding this to `.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Agent",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PROJECT_DIR}/.claude/hooks/require-subagent-model.mjs\""
          }
        ]
      }
    ]
  }
}
```

It allows a spawn when the call passes `model` or the agent file has a `model:`
line, and denies everything else so a subagent cannot silently inherit the main
model. Set `ROUTING_HOOK_LOG=/path/file.jsonl` to log every spawn it sees.
