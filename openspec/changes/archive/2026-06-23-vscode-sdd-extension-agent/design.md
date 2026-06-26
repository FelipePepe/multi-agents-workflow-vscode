# Design: vscode-sdd-extension-agent

**Date:** 2026-06-23
**Based on:** proposal.md, spec.md, exploration.md
**Status:** complete

---

## Architecture

```
Extension Host (Node.js)
│
├── extension.ts          ← activate() / deactivate()
│   ├── registers 3 commands
│   ├── registers 2 TreeDataProviders
│   └── creates StateManager, AgentRegistry
│
├── types/index.ts        ← pure interfaces, no vscode import
│
├── agents/
│   ├── OllamaClient.ts   ← HTTPS streaming, no vscode dependency
│   └── AgentRunner.ts    ← reads .md files, resolves models, owns OutputChannel
│
├── providers/
│   ├── WorkflowsProvider.ts  ← TreeDataProvider<WorkflowItem>
│   └── AgentsProvider.ts     ← TreeDataProvider<AgentItem>
│
└── commands/
    ├── startWorkflow.ts  ← input box → StateManager.create() → AgentRunner.run()
    └── stopAll.ts        ← AgentRegistry.abortAll()
```

**Key design constraint:** `OllamaClient` has zero `vscode` imports — it is pure Node.js and is independently unit-testable with Vitest.

---

## Component Responsibilities

### `src/types/index.ts`
No `vscode` import. Defines:

```typescript
export type SddPhase =
  | 'sdd-explore' | 'sdd-propose' | 'sdd-spec' | 'sdd-design'
  | 'sdd-tasks'   | 'sdd-apply'   | 'sdd-verify' | 'sdd-archive';

export type PhaseStatus = 'pending' | 'in-progress' | 'complete' | 'fail';
export type AgentRole = 'orchestrator' | 'explorer' | 'proposal' | 'spec'
  | 'design' | 'tasks' | 'implementer' | 'tester' | 'verifier' | 'fixer' | 'archiver';

export interface WorkflowState {
  changeName: string;
  changeDir: string;
  createdAt: string;       // ISO 8601
  updatedAt: string;       // ISO 8601
  currentPhase: SddPhase;
  phases: Record<SddPhase, PhaseStatus>;
  verifyVerdict: 'PASS' | 'PASS_WITH_WARNINGS' | 'FAIL' | null;
  reviewLoopIteration: number;
  notes: string;
}

export interface ModelsConfig {
  provider: string;
  baseUrl: string;
  defaultModel: string;
  models: Record<AgentRole | 'fallback', string>;
}

export interface OllamaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AgentRunOptions {
  changeName: string;
  role: AgentRole;
  artifactPaths?: string[];   // relative to workflowsDir/sdd/changes/<name>/
  userPrompt?: string;
  signal?: AbortSignal;
  onChunk: (text: string) => void;
  onDone: () => void;
  onError: (err: Error) => void;
}
```

---

### `src/agents/OllamaClient.ts`

Pure Node.js, no `vscode`. Uses native `https` (not `fetch`) for Node 20 compatibility in Electron:

```typescript
export async function streamChat(
  baseUrl: string,
  model: string,
  messages: OllamaMessage[],
  onChunk: (text: string) => void,
  onDone: () => void,
  onError: (err: Error) => void,
  signal?: AbortSignal
): Promise<void>
```

**Stream parsing contract:**
- Response is `Transfer-Encoding: chunked`
- Each chunk may contain multiple lines, or a partial line
- Buffer incomplete lines across chunks
- Each complete line: `data: <json>` → parse JSON → `choices[0].delta.content`
- Line `data: [DONE]` → call `onDone()`
- Lines that fail JSON parse → skip, log to console.warn (never crash)

**Cancellation:** if `signal.aborted` is true before sending, resolve immediately. On abort during streaming: destroy the request socket, call `onDone()`.

---

### `src/agents/AgentRunner.ts`

Depends on: `vscode` (for workspace.fs, OutputChannel, workspace.getConfiguration), `OllamaClient`, `types`.

```typescript
export class AgentRunner {
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly registry: AgentRegistry
  )

  async run(opts: AgentRunOptions): Promise<void>
    // 1. Resolve workflowsDir from config
    // 2. Read agents/<role>.md → system message
    // 3. Read models.json → model for role
    // 4. Read each artifactPath → prepend to user message
    // 5. Get or create OutputChannel("Multi-Agents: <changeName>")
    // 6. Show channel, write header line
    // 7. Create AbortController, register in AgentRegistry
    // 8. Call OllamaClient.streamChat()
    // 9. On done: write footer, unregister from AgentRegistry, refresh AgentsProvider
    // 10. On error: write error line to channel, show vscode.window.showErrorMessage
}
```

**File reading pattern** (workspace-relative):
```typescript
const workspaceRoot = vscode.workspace.workspaceFolders![0].uri;
const fileUri = vscode.Uri.joinPath(workspaceRoot, relativePath);
const bytes = await vscode.workspace.fs.readFile(fileUri);
const text = Buffer.from(bytes).toString('utf8');
```

---

### `src/agents/AgentRegistry.ts` (new — not in proposal, required by design)

Tracks in-flight AbortControllers. Simple Map, no `vscode`:

```typescript
export class AgentRegistry {
  private running = new Map<string, AbortController>();
  // key: `${changeName}:${role}`

  register(key: string, controller: AbortController): void
  unregister(key: string): void
  abortAll(): number   // returns count of aborted agents
  getAll(): Array<{ key: string }>
}
```

---

### `src/providers/WorkflowsProvider.ts`

```typescript
export class WorkflowsProvider
  implements vscode.TreeDataProvider<WorkflowItem> {

  private _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private readonly stateManager: StateManager) {
    // subscribe to StateManager.onDidChangeState
  }

  refresh(): void  // fires _onDidChangeTreeData

  getTreeItem(element: WorkflowItem): vscode.TreeItem
  getChildren(element?: WorkflowItem): Promise<WorkflowItem[]>
    // Root level: one item per change directory (reads all state.json files)
    // Child level: one item per SDD phase with status icon
}
```

**Phase icons** (ThemeIcon):
- `pending`     → `$(circle-outline)` grey
- `in-progress` → `$(sync~spin)` yellow  
- `complete`    → `$(check)` green
- `fail`        → `$(error)` red

---

### `src/providers/AgentsProvider.ts`

```typescript
export class AgentsProvider
  implements vscode.TreeDataProvider<AgentItem> {

  constructor(private readonly registry: AgentRegistry) {}

  refresh(): void
  getTreeItem(element: AgentItem): vscode.TreeItem
  getChildren(): AgentItem[]
    // Reads registry.getAll(); returns one item per running agent
    // Shows role name + model + "Running..." description
    // If empty: single disabled item "(none running)"
}
```

---

### `src/commands/startWorkflow.ts`

```typescript
export async function startWorkflow(
  stateManager: StateManager,
  runner: AgentRunner,
  workflowsProvider: WorkflowsProvider
): Promise<void> {
  // 1. showInputBox with validateInput (kebab-case regex, length)
  // 2. Check if change already exists via stateManager.exists(name)
  // 3. stateManager.create(name) → writes initial state.json
  // 4. workflowsProvider.refresh()
  // 5. runner.run({ changeName: name, role: 'explorer', ... })
}
```

---

### `src/StateManager.ts` (new — not in proposal, required by design)

Handles all state.json read/write. Emits events on change. Uses `vscode.workspace.fs`.

```typescript
export class StateManager {
  private _onDidChangeState = new vscode.EventEmitter<string>(); // changeName
  readonly onDidChangeState = this._onDidChangeState.event;

  constructor(private readonly workspaceRoot: vscode.Uri, workflowsDir: string)

  async read(changeName: string): Promise<WorkflowState | null>
  async write(state: WorkflowState): Promise<void>   // atomic via .tmp + rename
  async exists(changeName: string): Promise<boolean>
  async create(changeName: string): Promise<WorkflowState>
  async listChanges(): Promise<string[]>

  // FileSystemWatcher fires → reads updated state → fires onDidChangeState
}
```

---

### `src/extension.ts`

```typescript
export function activate(context: vscode.ExtensionContext): void {
  // Guard: no workspace → show message, return early
  if (!vscode.workspace.workspaceFolders?.length) {
    vscode.window.showInformationMessage('Multi-Agents: Open a folder first.');
    return;
  }

  const workspaceRoot = vscode.workspace.workspaceFolders[0].uri;
  const config = vscode.workspace.getConfiguration('multi-agents');
  const workflowsDir = config.get<string>('workflowsDir', '.ai-workflows');

  const registry = new AgentRegistry();
  const stateManager = new StateManager(workspaceRoot, workflowsDir);
  const runner = new AgentRunner(context, registry);

  const workflowsProvider = new WorkflowsProvider(stateManager);
  const agentsProvider = new AgentsProvider(registry);

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('multi-agents.workflowsView', workflowsProvider),
    vscode.window.registerTreeDataProvider('multi-agents.agentsView', agentsProvider),
    vscode.commands.registerCommand('multi-agents.startWorkflow',
      () => startWorkflow(stateManager, runner, workflowsProvider)),
    vscode.commands.registerCommand('multi-agents.showPanel',
      () => vscode.commands.executeCommand('workbench.view.extension.multi-agents')),
    vscode.commands.registerCommand('multi-agents.stopAll',
      () => stopAll(registry, agentsProvider)),
  );

  // Wire AgentRegistry → AgentsProvider refresh
  // StateManager.onDidChangeState → WorkflowsProvider refresh
}

export function deactivate(): void {}
```

---

## Data Flow: Start New Change

```
User → "SDD: Start New Change"
  → showInputBox(validateInput)
  → stateManager.create(name)
    → mkdir .ai-workflows/sdd/changes/<name>/
    → write state.json (all phases pending)
  → workflowsProvider.refresh()
  → runner.run({ role: 'explorer', changeName: name })
    → read .ai-workflows/agents/explorer.md  (system prompt)
    → read .ai-workflows/config/models.json  (model = qwen3.6:35b-a3b)
    → build messages: [system: explorer.md, user: "Explore for: <name>"]
    → OllamaClient.streamChat(baseUrl, model, messages, onChunk, ...)
      → POST http://localhost:11434/v1/chat/completions
      → NDJSON stream → onChunk → OutputChannel.append()
    → onDone: write 01-explore.md (content from stream), update state.json
    → agentsProvider.refresh()
```

---

## Failure Modes

| Failure | Detection | Handling |
|---------|-----------|----------|
| No workspace | `workspaceFolders` empty on activate | Show info message, return early |
| Ollama unreachable | HTTP connection refused / timeout | `onError` → showErrorMessage + OutputChannel |
| Agent .md missing | `vscode.workspace.fs.readFile` throws FileNotFound | showErrorMessage with path, abort phase |
| models.json missing | FileNotFound | showWarningMessage, use defaultModel |
| state.json corrupt | JSON.parse throws | showErrorMessage, offer to reset |
| AbortError during stream | `error.name === 'AbortError'` | Append `[CANCELLED]`, unregister, refresh |

---

## Security

- No network calls except to `multi-agents.ollamaBaseUrl` (local Ollama, user-configured)
- No external HTTP endpoints
- Agent system prompts are read-only from the workspace filesystem
- No secrets, credentials, or tokens are ever handled
- state.json atomic write prevents partial-state reads

---

## Logging and Observability

- Each change gets a dedicated `OutputChannel("Multi-Agents: <changeName>")`
- All agent output, errors, and cancellations go to the OutputChannel
- `console.error` for internal errors (appears in Extension Host output)
- No telemetry

---

## Rollback Strategy

All changes are additions to empty `src/` files. The only modification to existing files is `package.json` (config key rename) and `.vscode/settings.json`. To rollback:
1. `git checkout package.json .vscode/settings.json`
2. `rm -rf src/`
3. `rm -f dist/extension.js`

---

## Open Questions Resolved

1. **OutputChannel vs WebviewPanel** → OutputChannel for v1 (simpler, no extra bundling)
2. **native fetch vs https module** → `https` module for Electron/Node compatibility  
3. **StateManager as separate class** → yes, required for clean event model
4. **AgentRegistry as separate class** → yes, required by stopAll and AgentsProvider
5. **Write explore output to file** → yes, AgentRunner buffers stream → writes `01-explore.md` on `onDone`
