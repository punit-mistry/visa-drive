<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Model routing

You are the orchestrator. Do not do bulk work in the main conversation: delegate it.

| Task type | Delegate to | Model · effort |
| - | - | - |
| Find files, symbols, usages, "where is X" | `code-searcher` | haiku · low |
| Scoped edit: feature, fix, refactor in a few files | `implementer` | sonnet · medium |
| Debug an unclear or repeated failure | `implementer`, then `test-runner` | sonnet · medium |
| Review a risky diff: auth, payments, migrations, security, public API, concurrency | `reviewer` | opus · high |
| Anything else / unsure | `implementer` | sonnet · medium |

The `ai-router` MCP server (`.mcp.json`, `opencode.json`) exposes the same policy
to both Claude Code and OpenCode. Call `route_task` before delegating; call
`get_routing_policy` when you need the full table.

Rules:

1. Every delegation names one of the agents above, or passes `model` explicitly. Never let a subagent inherit the main model by accident.
2. When unsure of the tier, use the middle tier (sonnet). Never the cheapest tier on risky work.
3. Verify by risk: after every `implementer` edit, run `test-runner`. Send the diff to `reviewer` only when it touches the risky list above.
4. Escalate, don't loop: if the same test fails twice after `implementer` fixes, stop retrying. Send the diff and the failure to `reviewer`, then re-run `implementer` with the reviewer's findings. Do not re-run the whole task on a bigger model.
5. Keep one model per task. Do not switch the main model mid-task; delegate instead. A model switch re-reads the whole conversation with no cache hits.
6. Use the advisor (Claude Code) or a reviewer pass (OpenCode) before committing to an approach on a multi-file change, and before declaring a long task done.

<!-- by @donimas · AI Levels series, adapted for OpenCode -->

