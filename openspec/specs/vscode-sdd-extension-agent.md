# Spec: vscode-sdd-extension-agent

**Date:** 2026-06-23
**Based on:** proposal.md, exploration.md
**Status:** complete

---

## Capability: ollama-client

### FR-01: Streaming chat completion
- **MUST** send `POST /v1/chat/completions` to the configured Ollama base URL
- **MUST** include `{ model, messages, stream: true }` in the request body
- **MUST** parse the response as NDJSON: one JSON object per line, each with `choices[0].delta.content`
- **MUST** call an `onChunk(text: string)` callback for each non-empty delta
- **MUST** call `onDone()` when the stream ends (line `data: [DONE]` received)
- **MUST** support cancellation via `AbortSignal` — aborting stops the stream cleanly
- **MUST NOT** throw unhandled exceptions on network errors; **MUST** call `onError(err)` instead
- **AC-01:** Given a running Ollama instance, a request with a valid model name streams at least one chunk before completion

### FR-02: Base URL configuration
- **MUST** read `multi-agents.ollamaBaseUrl` from VS Code workspace configuration
- **MUST** default to `http://localhost:11434` if the setting is absent or empty
- **AC-02:** Changing `ollamaBaseUrl` in settings takes effect on the next agent call without reloading the extension

---

## Capability: agent-runner

### FR-03: System prompt loading
- **MUST** read the agent's `.md` file from `.ai-workflows/agents/<role>.md` relative to the workspace root
- **MUST** use `multi-agents.workflowsDir` (default: `.ai-workflows`) to resolve the path
- **MUST** throw a descriptive error if the agent file does not exist, surfaced as a VS Code error notification
- **AC-03:** Calling run with `role: "explorer"` reads `.ai-workflows/agents/explorer.md` as the system message

### FR-04: Model resolution
- **MUST** read `.ai-workflows/config/models.json` to resolve the model for a given role
- **MUST** fall back to `models.fallback` if the role is not in the models map
- **AC-04:** Requesting role `"verifier"` resolves to `deepseek-r1:70b` per `models.json`

### FR-05: Prior artifact injection
- **MUST** accept an optional array of artifact file paths to include as user context
- **MUST** read each file and prepend its content to the user message with a clear separator: `--- <filename> ---`
- **MUST** skip files that do not exist (no error) and log a warning to the OutputChannel
- **AC-05:** Passing `["01-explore.md", "02-proposal.md"]` includes both file contents in the user message if both exist

### FR-06: Output streaming
- **MUST** create or reuse a named `vscode.OutputChannel` (`"Multi-Agents: <change-name>"`)
- **MUST** show the OutputChannel on first output (`channel.show(true)`)
- **MUST** append each streamed chunk immediately (no buffering)
- **MUST** append a separator line on completion: `\n--- Agent <role> complete ---\n`
- **AC-06:** Agent output appears in the Output panel with the correct channel name while streaming

### FR-07: Cancellation
- **MUST** expose an `AbortController` per running agent
- **MUST** abort all in-flight controllers when `stopAll` is called
- **MUST** append `\n[CANCELLED]\n` to the OutputChannel when aborted
- **AC-07:** Calling stopAll() within 500ms of starting a stream cancels the request and writes [CANCELLED]

---

## Capability: workflow-state

### FR-08: State file read
- **MUST** read `.ai-workflows/sdd/changes/<name>/state.json` using `vscode.workspace.fs.readFile`
- **MUST** return `null` (not throw) if the file does not exist
- **AC-08:** Calling readState("nonexistent-change") returns null without throwing

### FR-09: State file write
- **MUST** write state.json atomically: write to `<name>.tmp` then rename via `vscode.workspace.fs`
- **MUST** create the change directory if it does not exist
- **MUST** update `updatedAt` to the current ISO datetime on every write
- **AC-09:** After writeState(), state.json exists with the correct `updatedAt` timestamp

### FR-10: File system watcher
- **MUST** create a `vscode.workspace.createFileSystemWatcher` for `**/.ai-workflows/sdd/changes/*/state.json`
- **MUST** fire a refresh event on create, change, and delete
- **AC-10:** Manually editing state.json in the editor refreshes the Workflows tree view within 3 seconds

---

## Capability: sdd-sidebar

### FR-11: Workflows tree view
- **MUST** display each change directory under `.ai-workflows/sdd/changes/` as a top-level tree item
- **MUST** show the current phase as a description label on the change item
- **MUST** show phase icons: ⏳ pending, 🔄 in-progress, ✅ complete, ❌ fail
- **MUST** show child items for each phase (explore, propose, spec, design, tasks, apply, verify, archive) with individual status
- **AC-11:** Opening VS Code with an existing state.json shows the change in the Workflows view with correct phase status

### FR-12: Active Agents tree view
- **MUST** show one item per currently running agent, with role name and model
- **MUST** update in real time as agents start and stop
- **MUST** show "(none)" when no agents are running
- **AC-12:** Starting an agent adds it to the Active Agents view; completing or cancelling removes it

---

## Capability: sdd-commands

### FR-13: Start New Change
- **MUST** prompt the user for a change name via `vscode.window.showInputBox`
- **MUST** validate the name: kebab-case only (`/^[a-z0-9]+(-[a-z0-9]+)*$/`), non-empty, max 64 chars
- **MUST** show an error message if a change with that name already exists
- **MUST** create the directory and write initial `state.json` with all phases `"pending"`, `currentPhase: "sdd-explore"`
- **MUST** immediately trigger the explore phase (FR-03 through FR-06) after state is created
- **AC-13:** After entering a valid name, state.json is created and the explore agent begins streaming

### FR-14: Show Panel
- **MUST** show the Multi-Agents activity bar and focus the Workflows view
- **AC-14:** Running the command makes the sidebar visible if it was hidden

### FR-15: Stop All
- **MUST** abort all in-flight AbortControllers
- **MUST** show a VS Code information message: `"Stopped N agent(s)"`
- **AC-15:** Running Stop All cancels all streaming agents and shows the correct count

---

## Non-Functional Requirements

### NFR-01: No runtime dependencies
- **MUST NOT** add any packages to `dependencies` in `package.json`
- Use only: `vscode` API, Node built-ins (`https`, `path`, `fs`), and native `fetch`
- **Metric:** `package.json` `dependencies` key remains absent or empty

### NFR-02: Strict TypeScript
- **MUST** compile with zero errors under `tsconfig.json` (strict, noUnusedLocals, noUnusedParameters, exactOptionalPropertyTypes)
- **Metric:** `npx tsc --noEmit` exits with code 0

### NFR-03: Bundle size
- **SHOULD** produce a `dist/extension.js` under 100KB (source maps excluded)
- **Metric:** `ls -lh dist/extension.js` after build

### NFR-04: Activation performance
- **MUST** activate in under 500ms on a cold start
- **Metric:** VS Code extension host activation time (Developer: Show Running Extensions)

---

## Error Handling

| Condition | Expected Behavior |
|-----------|-------------------|
| No workspace folder open | Show info message: "Multi-Agents: Open a folder first". Do not activate providers. |
| Ollama unreachable | Show error notification with base URL. Append error to OutputChannel. Do not crash. |
| Agent .md file missing | Show error notification with file path. Abort phase. |
| models.json missing or malformed | Show error notification. Fall back to `qwen3.6:35b-a3b` for all roles. |
| state.json malformed | Show error notification. Offer to reset state (overwrite with clean initial state). |
| Change name already exists | Show error in input box validation. Do not overwrite. |

## Edge Cases

| Scenario | Expected |
|----------|----------|
| User opens VS Code with no workspace | Extension activates but shows "open a folder" message; all commands disabled |
| state.json deleted mid-session | WorkflowsProvider removes the item within 3s (watcher fires delete event) |
| Ollama stream returns empty response | `onDone()` called immediately; "Agent complete" line appended |
| Two `startWorkflow` commands in rapid succession | Second call blocked while first is in progress; show "Agent already running" |
| workflowsDir points to nonexistent path | Show error notification on first command invocation |

## Backward Compatibility

- `multi-agents.claudeCodePath` configuration key is renamed to `multi-agents.ollamaBaseUrl`
- Users with the old key set will fall back to the default (`http://localhost:11434`)
- The old key should be deprecated with a note in `package.json` description (not removed in v1)

## Out of Scope

- WebviewPanel / React rich UI
- Multi-change concurrency
- Full autopilot (automatic phase chaining)
- Triggering validation scripts from within the extension (VS Code tasks handle this)
- Publishing to VS Code Marketplace
- Windows path handling differences (v1 targets Linux/macOS)
