# Proposal: vscode-sdd-extension-agent

**Date:** 2026-06-23
**Based on:** exploration.md
**Risk:** mid
**Status:** complete

## Intent

The workflow infrastructure in `.ai-workflows/` currently requires copy-paste prompts into external AI tools. This creates friction: the user must manually switch context, select the right model, track phase state, and trigger validation scripts. The extension replaces this with a native VS Code experience: phase state visible in the sidebar, Ollama calls made directly from the extension, and agent output streaming into a dedicated output channel. No external tool required for the core loop.

## Scope

### In Scope
- `src/extension.ts` — activation, command registration, provider registration
- `src/types/index.ts` — all shared interfaces (Phase, AgentRole, WorkflowState, OllamaMessage, AgentStream)
- `src/agents/OllamaClient.ts` — HTTP client calling `POST /v1/chat/completions` with streaming
- `src/agents/AgentRunner.ts` — reads agent .md system prompt, selects model from models.json, calls OllamaClient, streams to OutputChannel
- `src/providers/WorkflowsProvider.ts` — TreeDataProvider showing active change + phase progress
- `src/providers/AgentsProvider.ts` — TreeDataProvider showing currently running agents
- `src/commands/startWorkflow.ts` — asks for change name, creates state.json, starts explore phase
- `src/commands/stopAll.ts` — cancels all in-flight AbortControllers
- Update `package.json` configuration: rename `claudeCodePath` → `ollamaBaseUrl`
- Update `.vscode/settings.json` with the new config key

### Out of Scope
- WebviewPanel / React UI (v2)
- Multi-change concurrency (v2)
- Automatic phase chaining (full autopilot) — user triggers each phase explicitly for v1
- Running validation scripts from the extension (VS Code tasks handle this already)
- Publishing to the VS Code Marketplace

## Capabilities

### New Capabilities
- `ollama-client`: HTTP client for Ollama's OpenAI-compatible streaming endpoint
- `agent-runner`: Reads agent system prompts, routes to correct model, streams output
- `workflow-state`: Reads/writes state.json; exposes current phase to the sidebar
- `sdd-sidebar`: Two tree views showing change state and active agents
- `sdd-commands`: Three command handlers (startWorkflow, showPanel, stopAll)

### Modified Capabilities
- None — this is a greenfield implementation

## Approach

Direct Ollama calls using Node's native `https` module (no external runtime deps). Each agent phase maps to: read `agents/<role>.md` as system prompt → read prior artifacts as user context → call `POST http://localhost:11434/v1/chat/completions` with `stream: true` → parse NDJSON line-by-line → write deltas to `vscode.OutputChannel`.

State is read from and written to `.ai-workflows/sdd/changes/<name>/state.json` using `vscode.workspace.fs` (async, workspace-relative paths).

The TreeView providers poll `state.json` on a 2-second interval and refresh on file system events via `vscode.workspace.createFileSystemWatcher`.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/extension.ts` | New | Activation entry point, registers all commands and providers |
| `src/types/index.ts` | New | All shared TypeScript interfaces |
| `src/agents/OllamaClient.ts` | New | HTTPS streaming client for Ollama |
| `src/agents/AgentRunner.ts` | New | Agent orchestration — reads prompts, calls Ollama, streams output |
| `src/providers/WorkflowsProvider.ts` | New | TreeDataProvider for Workflows sidebar view |
| `src/providers/AgentsProvider.ts` | New | TreeDataProvider for Active Agents sidebar view |
| `src/commands/startWorkflow.ts` | New | Command: create change, init state.json, trigger explore |
| `src/commands/stopAll.ts` | New | Command: cancel all in-flight Ollama requests |
| `package.json` | Modified | Rename `claudeCodePath` → `ollamaBaseUrl`, add `ollamaWorkflowsDir` |
| `.vscode/settings.json` | Modified | Update key reference |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Ollama streaming parse failure (malformed NDJSON) | Low | Wrap each line in try/catch; skip malformed lines, log to output |
| `vscode.workspace.fs` unavailable (no workspace open) | Medium | Guard activation with `workspaceFolders` check; show info message if no folder |
| Agent .md files not found (wrong workflowsDir) | Medium | Validate path on activation; surface error in status bar |
| Long agent responses blocking UI thread | Low | All Ollama calls are async; responses stream via callbacks |

## Rollback Plan

All new files are additions to empty `src/` directories. `package.json` config key rename is the only modification to existing files. Reverting means: delete `src/`, restore original `package.json` config keys, revert `.vscode/settings.json`.

## Dependencies

- No new runtime dependencies — uses Node built-ins (`https`, `fs`, `path`) and the `vscode` API
- `@types/vscode ^1.90.0` already present in devDependencies

## Success Criteria

- [ ] Extension activates without errors when a workspace folder is open
- [ ] Sidebar shows two tree views (Workflows, Active Agents) with correct VS Code icon
- [ ] `SDD: Start New Change` prompts for name, creates `.ai-workflows/sdd/changes/<name>/state.json`
- [ ] `SDD: Run Agent Phase` reads the correct agent .md and calls Ollama, streaming to OutputChannel
- [ ] `SDD: Stop All Agents` cancels in-flight requests within 500ms
- [ ] WorkflowsProvider refreshes within 3 seconds of state.json change
- [ ] All TypeScript compiles with zero errors under strict mode
- [ ] esbuild bundles to `dist/extension.js` without errors
