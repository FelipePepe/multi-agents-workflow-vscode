# Tasks: vscode-sdd-extension-agent

**Date:** 2026-06-23
**Based on:** spec.md, design.md
**Status:** complete

---

## Execution Order

Dependencies flow top-to-bottom. Tasks marked "parallel" can run simultaneously if multiple agents are available.

```
TASK-01  ← no deps
TASK-02  ← no deps (parallel with TASK-01)
TASK-03  ← TASK-01
TASK-04  ← TASK-02
TASK-05  ← TASK-03, TASK-04
TASK-06  ← TASK-05
TASK-07  ← TASK-05
TASK-08  ← TASK-06, TASK-07
TASK-09  ← TASK-08
TASK-10  ← TASK-08
TASK-11  ← TASK-09, TASK-10
TASK-12  ← TASK-11
TASK-13  (tests) ← TASK-05, TASK-06
TASK-14  (tests) ← TASK-09, TASK-10
TASK-15  (types + build) ← all implementation tasks
```

---

## Tasks

### ~~TASK-01: Define all shared TypeScript types~~ ✅
- **Files to add:** `src/types/index.ts`
- **Files to modify:** none
- **Dependencies:** none
- **Parallelizable with:** TASK-02
- **Description:** Define `SddPhase`, `PhaseStatus`, `AgentRole`, `WorkflowState`, `ModelsConfig`, `OllamaMessage`, `AgentRunOptions` exactly as specified in design.md. No `vscode` import.
- **Validation:** `npx tsc --noEmit`
- **Done criteria:** `src/types/index.ts` exists, all types exported, zero TS errors
- **Risk:** LOW

---

### ~~TASK-02: Implement OllamaClient (pure Node.js streaming)~~ ✅
- **Files to add:** `src/agents/OllamaClient.ts`
- **Files to modify:** none
- **Dependencies:** none
- **Parallelizable with:** TASK-01
- **Description:** Implement `streamChat(baseUrl, model, messages, onChunk, onDone, onError, signal?)` using Node's `https` module. Buffer incomplete NDJSON lines across chunks. Parse `data: <json>` lines extracting `choices[0].delta.content`. Handle `data: [DONE]`. Handle AbortSignal. No `vscode` import.
- **Validation:** `npx tsc --noEmit`
- **Done criteria:** File compiles with zero errors; manually testable by calling against a running Ollama instance
- **Risk:** MEDIUM — NDJSON stream parsing requires careful buffer handling

---

### ~~TASK-03: Implement AgentRegistry~~ ✅
- **Files to add:** `src/agents/AgentRegistry.ts`
- **Files to modify:** none
- **Dependencies:** TASK-01
- **Description:** Implement `AgentRegistry` class: `register(key, controller)`, `unregister(key)`, `abortAll(): number`, `getAll(): Array<{key: string}>`. No `vscode` import.
- **Validation:** `npx tsc --noEmit`
- **Done criteria:** File compiles; `abortAll()` returns correct count
- **Risk:** LOW

---

### ~~TASK-04: Implement StateManager~~ ✅
- **Files to add:** `src/StateManager.ts`
- **Files to modify:** none
- **Dependencies:** TASK-01, TASK-02 (TASK-02 not required but parallel)
- **Description:** Implement `StateManager` with `vscode.workspace.fs` for all file I/O. Methods: `read`, `write` (atomic via .tmp), `exists`, `create`, `listChanges`. Emit `onDidChangeState` event. Set up `vscode.workspace.createFileSystemWatcher` on `**/.ai-workflows/sdd/changes/*/state.json`. Write uses `workflowsDir` from constructor.
- **Validation:** `npx tsc --noEmit`
- **Done criteria:** File compiles; `create()` produces correct initial `WorkflowState` with all phases `"pending"`
- **Risk:** LOW

---

### ~~TASK-05: Implement AgentRunner~~ ✅
- **Files to add:** `src/agents/AgentRunner.ts`
- **Files to modify:** none
- **Dependencies:** TASK-01, TASK-03
- **Description:** Implement `AgentRunner.run(opts: AgentRunOptions)`. Steps per design.md: resolve workflowsDir, read agent .md, read models.json, read artifact files (skip missing with warning), get/create OutputChannel, show channel, write header, create AbortController, register in registry, call OllamaClient.streamChat, on done write footer + unregister + refresh AgentsProvider, on error show notification + unregister. Buffer stream chunks and write accumulated content to artifact file on done.
- **Validation:** `npx tsc --noEmit`
- **Done criteria:** File compiles; all error paths handled per spec error handling table
- **Risk:** MEDIUM — artifact file write on done requires buffering logic

---

### ~~TASK-06: Implement WorkflowsProvider (TreeDataProvider)~~ ✅
- **Files to add:** `src/providers/WorkflowsProvider.ts`
- **Files to modify:** none
- **Dependencies:** TASK-01, TASK-04
- **Description:** Implement `WorkflowsProvider implements vscode.TreeDataProvider<WorkflowItem>`. Root items = one per change from `stateManager.listChanges()`. Child items = one per SDD phase with status icon (ThemeIcon: `circle-outline`, `sync~spin`, `check`, `error`). Subscribe to `stateManager.onDidChangeState` to auto-refresh. Expose `refresh()` method.
- **Validation:** `npx tsc --noEmit`
- **Done criteria:** File compiles; `getChildren()` returns correct phase items with icons
- **Risk:** LOW

---

### ~~TASK-07: Implement AgentsProvider (TreeDataProvider)~~ ✅
- **Files to add:** `src/providers/AgentsProvider.ts`
- **Files to modify:** none
- **Dependencies:** TASK-01, TASK-03
- **Description:** Implement `AgentsProvider implements vscode.TreeDataProvider<AgentItem>`. Shows one item per running agent from registry. Shows "(none running)" when empty. Expose `refresh()`. No file I/O.
- **Validation:** `npx tsc --noEmit`
- **Done criteria:** File compiles; empty state shows "(none running)"
- **Risk:** LOW

---

### ~~TASK-08: Implement command handlers~~ ✅
- **Files to add:** `src/commands/startWorkflow.ts`, `src/commands/stopAll.ts`
- **Files to modify:** none
- **Dependencies:** TASK-05, TASK-06, TASK-07
- **Description:**
  - `startWorkflow.ts`: `showInputBox` with kebab-case validation + length check, check `stateManager.exists()`, call `stateManager.create()`, call `workflowsProvider.refresh()`, call `runner.run({ role: 'explorer', ... })`.
  - `stopAll.ts`: call `registry.abortAll()`, show info message "Stopped N agent(s)", call `agentsProvider.refresh()`.
- **Validation:** `npx tsc --noEmit`
- **Done criteria:** Both files compile; input validation rejects non-kebab-case names
- **Risk:** LOW

---

### ~~TASK-09: Implement extension entry point~~ ✅
- **Files to add:** `src/extension.ts`
- **Files to modify:** none
- **Dependencies:** TASK-03, TASK-04, TASK-05, TASK-06, TASK-07, TASK-08
- **Description:** Implement `activate()` and `deactivate()` per design.md. Guard for no workspaceFolders. Instantiate all classes. Register commands and TreeDataProviders. Wire events (registry → agentsProvider, stateManager → workflowsProvider). Add all subscriptions to `context.subscriptions`.
- **Validation:** `npx tsc --noEmit`
- **Done criteria:** File compiles; `activate` and `deactivate` exported
- **Risk:** LOW

---

### ~~TASK-10: Update package.json configuration~~ ✅
- **Files to modify:** `package.json`
- **Files to add:** none
- **Dependencies:** TASK-09
- **Description:** Rename `multi-agents.claudeCodePath` → `multi-agents.ollamaBaseUrl` with description "Ollama API base URL (default: http://localhost:11434)". Add deprecation note to old key description (keep old key as deprecated, type string, default null). Add `multi-agents.workflowsDir` if not already present.
- **Validation:** `cat package.json | python3 -m json.tool > /dev/null`
- **Done criteria:** JSON valid; `ollamaBaseUrl` key present with correct default
- **Risk:** LOW

---

### ~~TASK-11: Run full build~~ ✅
- **Files to modify:** none (build output to `dist/`)
- **Dependencies:** TASK-09, TASK-10
- **Description:** Run `npm install` (installs devDeps), then `npm run build` (esbuild). Verify `dist/extension.js` exists and is under 100KB. Fix any build errors.
- **Validation:** `npm run build && ls -lh dist/extension.js`
- **Done criteria:** `dist/extension.js` exists, build exits 0, size < 100KB
- **Risk:** LOW

---

### ~~TASK-12: Typecheck pass~~ ✅
- **Files to modify:** none
- **Dependencies:** TASK-11
- **Description:** Run `npm run typecheck`. Fix all remaining TypeScript errors under strict mode. Pay particular attention to `exactOptionalPropertyTypes` — all optional object properties must use `T | undefined` not just `T`.
- **Validation:** `npx tsc --noEmit`
- **Done criteria:** Zero TypeScript errors
- **Risk:** MEDIUM — `exactOptionalPropertyTypes` is strict about optional props

---

### TASK-13: Unit tests for OllamaClient
- **Files to add:** `src/agents/OllamaClient.test.ts`
- **Files to modify:** `package.json` (add vitest config or `vitest.config.ts`)
- **Dependencies:** TASK-02
- **Description:** Write Vitest unit tests for `OllamaClient`. Mock the `https` module. Test: happy path (3 chunks + DONE), empty response, malformed JSON line (should skip), AbortSignal before send, AbortSignal mid-stream. No `vscode` import needed — OllamaClient is pure Node.
- **Validation:** `npm test`
- **Done criteria:** All tests pass; at least 5 test cases
- **Risk:** LOW

---

### TASK-14: Unit tests for AgentRegistry and StateManager
- **Files to add:** `src/agents/AgentRegistry.test.ts`, `src/StateManager.test.ts`
- **Files to modify:** none
- **Dependencies:** TASK-03, TASK-04
- **Description:**
  - `AgentRegistry.test.ts`: test register, unregister, abortAll count, getAll.
  - `StateManager.test.ts`: mock `vscode.workspace.fs`, test create (initial state correct), read (returns null for nonexistent), write (updatedAt updated), listChanges. Use `vi.mock('vscode', ...)` to mock the vscode module.
- **Validation:** `npm test`
- **Done criteria:** All tests pass; StateManager tests correctly mock vscode.workspace.fs
- **Risk:** MEDIUM — mocking vscode in Vitest requires careful setup

---

### ~~TASK-15: Update .vscode/settings.json~~ ✅
- **Files to modify:** `.vscode/settings.json`
- **Files to add:** none
- **Dependencies:** TASK-10
- **Description:** Replace any reference to `multi-agents.claudeCodePath` with `multi-agents.ollamaBaseUrl`. Value: `"http://localhost:11434"`.
- **Validation:** `cat .vscode/settings.json | python3 -m json.tool > /dev/null`
- **Done criteria:** JSON valid; old key absent; new key present
- **Risk:** LOW

---

## Acceptance Criteria Coverage

| AC | Spec Ref | Covered by |
|----|----------|-----------|
| AC-01: streaming works against real Ollama | FR-01 | TASK-02, TASK-13 |
| AC-02: ollamaBaseUrl change takes effect immediately | FR-02 | TASK-09, TASK-10 |
| AC-03: explorer.md loaded as system prompt | FR-03 | TASK-05 |
| AC-04: verifier resolves to deepseek-r1:70b | FR-04 | TASK-05 |
| AC-05: artifact files prepended to user message | FR-05 | TASK-05 |
| AC-06: output appears in correct OutputChannel | FR-06 | TASK-05 |
| AC-07: stopAll cancels within 500ms | FR-07 | TASK-08 |
| AC-08: readState returns null for nonexistent | FR-08 | TASK-04, TASK-14 |
| AC-09: writeState updates timestamp | FR-09 | TASK-04, TASK-14 |
| AC-10: editing state.json refreshes tree within 3s | FR-10 | TASK-04, TASK-06 |
| AC-11: change shows correct phase status | FR-11 | TASK-06 |
| AC-12: running agent appears in Active Agents | FR-12 | TASK-05, TASK-07 |
| AC-13: startWorkflow creates state and starts explore | FR-13 | TASK-08 |
| AC-14: showPanel focuses sidebar | FR-14 | TASK-09 |
| AC-15: stopAll shows correct count | FR-15 | TASK-08 |

---

## Scope Summary

- **Total tasks:** 15
- **Implementation tasks:** 12 (TASK-01 → TASK-12)
- **Test tasks:** 2 (TASK-13, TASK-14)
- **Config/settings tasks:** 1 (TASK-15)
- **New files:** 12
- **Modified files:** 3 (`package.json`, `.vscode/settings.json`, `dist/` generated)
- **Risk summary:** HIGH: 0 / MEDIUM: 3 / LOW: 12
