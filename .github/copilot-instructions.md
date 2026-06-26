# Multi-Agents Workflow — VS Code Extension

VS Code extension for orchestrating multi-agent Claude Code workflows from a single panel. Agents run concurrently (up to 3 by default), coordinated by a workflow orchestrator, and communicate via a shared state manager.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Language | TypeScript strict |
| Runtime | Node.js 22 (CJS for extension, IIFE for webviews) |
| Extension API | `vscode` |
| Bundler | esbuild |
| Package manager | pnpm |
| Tests | vitest |
| LLM | Ollama (local) or VS Code LM API (GitHub Copilot) |

## Architecture

```
extension.ts
  → WorkflowOrchestrator   (coordinates agent lifecycle, concurrency cap)
  → StateManager           (shared mutable state across agents)
  → agents/                (individual agent implementations)
  → providers/             (ollama.ts, vscode-lm.ts — LLM routing)
  → commands/              (VS Code command handlers)
```

### Views

| View ID | Type | Purpose |
|---------|------|---------|
| `multi-agents.chatView` | Webview | Main chat interface |
| `multi-agents.workflowsView` | TreeView | Workflow definitions browser |
| `multi-agents.agentsView` | TreeView | Active running agents |
| `multi-agents.settingsView` | Webview | Configuration panel |

### Workflow definitions

Stored in `.ai-workflows/` inside the workspace (configurable via `multi-agents.workflowsDir`). Workflow YAML/JSON files are read from this directory and loaded by `WorkflowOrchestrator`.

## Key Constraints

- **Concurrency cap**: `multi-agents.maxConcurrentAgents` (default 3) — always respect this limit in `WorkflowOrchestrator`.
- **Provider parity**: both `ollama` and `vscode-lm` providers must handle cancellation via VS Code `CancellationToken`.
- **VS Code LM**: has no `system` role — prepend system content to the first user message.
- **No build after changes** — do not run `pnpm build` after edits.
- **Tests**: `vitest run` — run before any PR. Test files: `src/StateManager.test.ts`, `src/extension.test.ts`, `src/e2e/`.

## GitFlow

| Branch | Base | PR target |
|--------|------|-----------|
| `hotfix/*` | `main` | `main` |
| `feature/*` | `develop` | `develop` |

Direct commits to `main` or `develop` are forbidden.

## Relevant Skills

Auto-load from the global Copilot skills catalog when context matches:

| Context | Skill |
|---------|-------|
| Security audit, SSRF, injection, auth | `red-team-offensive` |
| Code review before PR | `code-reviewer` |
| Async errors, unhandled rejections, missing propagation | `silent-failure-hunter` |
| Creating or preparing a PR | `branch-pr` |
| Running or writing vitest tests | `test-runner` |
| React re-renders, hooks, hydration (webview UI) | `react-doctor` |
| Agent coordination, fault tolerance, failure modes | `ddia-distributed-systems` |
| StateManager consistency, read-your-writes, ordering | `ddia-consistency-consensus` |
| Agent event streams, message passing, ordering guarantees | `ddia-stream-processing` |
| Architectural trade-offs, any system design decision | `ddia-architecture-tradeoffs` |
| Any DDIA question — auto-routes to the right skill | `ddia-skill-router` |
