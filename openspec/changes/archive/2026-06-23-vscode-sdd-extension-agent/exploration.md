# Exploration: vscode-sdd-extension-agent

**Date:** 2026-06-23
**Mode:** hybrid
**Status:** complete

## Repository Overview

VS Code extension project (`multi-agents-workflow`). The repository contains two distinct layers:
1. **Extension scaffold** — `package.json`, `tsconfig.json`, `esbuild.js`, empty `src/` directories. Entry point `src/extension.ts` does not exist yet.
2. **Workflow infrastructure** — `.ai-workflows/` with 11 agent definitions, 8 SDD templates, 7 prompts, config files, bash/PowerShell scripts, and VS Code task integration.

The goal is to build the extension that makes the workflow infrastructure native to VS Code — replacing copy-paste prompts with a sidebar UI, direct Ollama calls, and streaming agent output.

## Detected Stack

| Category | Detected | Confidence |
|----------|----------|------------|
| Language | TypeScript 5.4, strict mode | High |
| Runtime | Node.js 22 (host: VS Code Electron + Node 20+) | High |
| Build | esbuild 0.21, CJS output, `vscode` externalized | High |
| Extension API | `@types/vscode ^1.90.0` | High |
| Module system | Node16 (`module: Node16`) | High |
| Test runner | Vitest 1.6 (declared, not configured for VS Code host) | Medium |
| Linter | ESLint 9 | High |

## Important Files

| File | Purpose | Relevance |
|------|---------|-----------|
| `package.json` | Extension manifest — views, commands, config already declared | High — must extend, not replace |
| `tsconfig.json` | Strict TS, Node16 modules, `rootDir: src` | High — constraints for all source files |
| `esbuild.js` | Bundles `src/extension.ts` → `dist/extension.js` | High — entry point must exist |
| `.ai-workflows/config/models.json` | Model role assignments, Ollama base URL | High — extension reads this at runtime |
| `.ai-workflows/config/workflow.json` | Phase definitions, rules, maxIterations | High — extension reads this for phase routing |
| `.ai-workflows/sdd/changes/` | Where change state.json lives | High — extension reads/writes this |
| `.ai-workflows/agents/*.md` | System prompts per agent role | High — extension sends these as system messages |
| `.ai-workflows/scripts/run-validation.sh` | Deterministic validation gate | Medium — extension triggers this |

## Existing Structure

```
src/
  agents/       → OllamaClient, AgentRunner
  commands/     → startWorkflow, stopAll, showPanel handlers
  providers/    → WorkflowsProvider, AgentsProvider (TreeDataProviders)
  types/        → Phase, AgentRole, WorkflowState, OllamaMessage interfaces
```

All directories are empty. Structure is correct and intentional — no need to change it.

## Already Declared in package.json (must be respected)

**Commands:**
- `multi-agents.startWorkflow` — Start Agent Workflow
- `multi-agents.showPanel` — Show Agent Panel
- `multi-agents.stopAll` — Stop All Agents

**Views (activity bar sidebar):**
- `multi-agents.workflowsView` (tree) — "Workflows"
- `multi-agents.agentsView` (tree) — "Active Agents"

**Configuration:**
- `multi-agents.claudeCodePath` — string (repurposable as Ollama base URL override)
- `multi-agents.maxConcurrentAgents` — number (maps to workflow.json maxIterations)
- `multi-agents.workflowsDir` — string (path to .ai-workflows/sdd/changes/)

## Risks

| Risk | Severity | Notes |
|------|----------|-------|
| `vscode` module not available in test context | Medium | Vitest cannot import `vscode` directly; need to mock or use `@vscode/test-electron` for integration tests |
| Native `fetch` in extension host | Low | VS Code 1.90+ uses Electron with Node 20+; native fetch available. Fallback: `https` module |
| Streaming Ollama responses | Medium | Ollama returns NDJSON (one JSON per line); requires line-by-line stream parsing |
| `state.json` write races | Low | Single-user extension; races unlikely but file writes must be atomic |
| Long-running agent calls blocking VS Code | Medium | All Ollama calls must be async and cancellable via `AbortController` |

## Unknowns

- Does the user want a WebviewPanel (rich HTML UI) or OutputChannel (text streaming)? → Recommend OutputChannel for v1; Webview for v2.
- Should the extension support multiple concurrent changes, or one active change at a time? → Recommend one active change for v1.
- Should `multi-agents.claudeCodePath` be repurposed as `ollamaBaseUrl` or removed? → Recommend repurposing.

## Approach Options

| Approach | Pros | Cons | Effort |
|----------|------|------|--------|
| **OutputChannel + TreeView sidebar** | Matches declared manifest exactly; no extra deps; correct for text streaming | No rich UI (v1 limitation) | Low |
| **WebviewPanel with React** | Rich UI, progress visualization | Major scope increase, bundling complexity | High |
| **Terminal + commands only** | Simplest possible | No state visibility; poor UX | Very Low |

## Recommended Approach

**OutputChannel + TreeView sidebar.** Implement the two declared tree views to show phase state and active agents. Stream all Ollama responses to a dedicated `OutputChannel`. All Ollama calls go direct to `http://localhost:11434/v1/chat/completions` using native Node `https` or `fetch`. This matches the declared manifest exactly and delivers a working v1 without scope creep.

## Recommended Next Step

Proceed to `sdd-propose` with: Direct Ollama + OutputChannel + TreeView approach, repurpose `claudeCodePath` config as `ollamaBaseUrl`, one active change at a time.
