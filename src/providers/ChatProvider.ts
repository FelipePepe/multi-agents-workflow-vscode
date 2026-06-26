import * as vscode from 'vscode';
import { ALL_SDD_PHASES } from '../types/index.js';
import type { SddPhase, PhaseStatus } from '../types/index.js';
import type { StateManager } from '../StateManager.js';
import type { WorkflowOrchestrator } from '../WorkflowOrchestrator.js';
import { assertSafeUrl } from '../agents/OllamaProvider.js';

// ── Phase helpers ─────────────────────────────────────────────────────────────

const PHASE_ARTIFACT: Record<SddPhase, string> = {
  'sdd-explore':  '01-explore.md',
  'sdd-propose':  '02-proposal.md',
  'sdd-spec':     '03-spec.md',
  'sdd-design':   '04-design.md',
  'sdd-tasks':    '05-tasks.md',
  'sdd-apply':    '06-apply-progress.md',
  'sdd-verify':   '07-verify-report.md',
  'sdd-archive':  '08-archive-report.md',
};

const ALL_PHASES = ALL_SDD_PHASES;

function phaseIcon(status: PhaseStatus): string {
  switch (status) {
    case 'complete':    return '✓';
    case 'in-progress': return '▸';
    case 'fail':        return '✗';
    case 'pending':     return '○';
  }
}

// ── Message types ─────────────────────────────────────────────────────────────

type ToWebview =
  | { type: 'message'; role: 'user' | 'bot' | 'error'; text: string }
  | { type: 'stream-start'; label: string }
  | { type: 'stream-chunk'; text: string }
  | { type: 'stream-end' }
  | { type: 'clear' };

// ── ChatProvider ──────────────────────────────────────────────────────────────

export class ChatProvider implements vscode.WebviewViewProvider {
  static readonly viewId = 'multi-agents.chatView';

  private _view?: vscode.WebviewView;

  constructor(
    private readonly stateManager: StateManager,
    private readonly orchestrator: WorkflowOrchestrator,
    private readonly workspaceRoot: vscode.Uri,
    private readonly workflowsDir: string,
    private readonly stopAll: () => void,
    private readonly refresh: () => void,
  ) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this._view = view;
    view.webview.options = { enableScripts: true };
    view.webview.html = this.buildHtml(view.webview);

    view.webview.onDidReceiveMessage((msg: { type: string; text: string }) => {
      if (msg.type === 'submit') {
        this.handleInput(msg.text).catch((err: unknown) => {
          this.post({ type: 'message', role: 'error', text: `Internal error: ${String(err)}` });
        });
      }
    });

    this.post({ type: 'message', role: 'bot', text: 'Multi-Agents ready. Type /help for commands.' });
  }

  // ── Command dispatcher ────────────────────────────────────────────────────

  async handleInput(raw: string): Promise<void> {
    const input = raw.trim();
    if (!input) return;

    this.post({ type: 'message', role: 'user', text: input });

    const [cmd, ...args] = input.split(/\s+/);

    switch (cmd) {
      case '/help':     this.cmdHelp();                                                          break;
      case '/scaffold': await this.cmdScaffold();                                                break;
      case '/panel':    this.cmdPanel();                                                         break;
      case '/abort':    this.cmdAbort();                                                         break;
      case '/change':   await this.cmdChange(args[0]);                                           break;
      case '/changes':  await this.cmdChanges();                                                 break;
      case '/phases':   await this.cmdPhases(args[0]);                                           break;
      case '/continue': await this.cmdContinue(args[0]);                                         break;
      case '/rerun':    await this.cmdRerun(args[0], args[1] as SddPhase | undefined);           break;
      case '/run':      await this.cmdRun(args[0], args[1] as SddPhase | undefined, args[2] as SddPhase | undefined); break;
      case '/artifact': await this.cmdArtifact(args[0], args[1] as SddPhase | undefined);       break;
      case '/logs':     await this.cmdLogs(args[0], args[1] as SddPhase | undefined);           break;
      case '/drop':     await this.cmdDrop(args[0]);                                             break;
      case '/ping':     await this.cmdPing();                                                    break;
      case '/config':   this.cmdConfig();                                                        break;
      case '/clear':    this.cmdClear();                                                         break;
      default:
        this.post({ type: 'message', role: 'error',
          text: `Unknown command: ${cmd ?? input}\nType /help for a list.` });
    }
  }

  // ── Individual commands ───────────────────────────────────────────────────

  private cmdHelp(): void {
    this.post({ type: 'message', role: 'bot', text: [
      'Workflow commands:',
      '',
      '  /change   <name>              Start a new SDD change',
      '  /continue <name>              Resume from first incomplete phase',
      '  /rerun    <name> <phase>      Re-run a single phase',
      '  /run      <name> <from> <to>  Run a phase range',
      '  /abort                        Stop all running agents',
      '',
      'Inspection commands:',
      '',
      '  /changes                      List all changes',
      '  /phases   <name>              Show full phase breakdown',
      '  /logs     <name> [phase]      Show artifact content inline',
      '  /artifact <name> <phase>      Open artifact in editor',
      '',
      'Maintenance commands:',
      '',
      '  /drop     <name>              Delete a change and its artifacts',
      '  /scaffold                     Initialize .ai-workflows/ in workspace',
      '',
      'Diagnostic commands:',
      '',
      '  /ping                         Check LLM provider connectivity',
      '  /config                       Show current extension settings',
      '  /clear                        Clear this chat',
      '  /panel                        Reveal the sidebar',
      '',
      'Phases:',
      '  sdd-explore  sdd-propose  sdd-spec   sdd-design',
      '  sdd-tasks    sdd-apply    sdd-verify  sdd-archive',
    ].join('\n') });
  }

  private async cmdScaffold(): Promise<void> {
    await vscode.commands.executeCommand('multi-agents.initWorkspace');
  }

  private cmdPanel(): void {
    void vscode.commands.executeCommand('workbench.view.extension.multi-agents');
  }

  private cmdAbort(): void {
    this.stopAll();
    this.post({ type: 'message', role: 'bot', text: 'All agents stopped.' });
  }

  private cmdClear(): void {
    this.post({ type: 'clear' });
  }

  private cmdConfig(): void {
    const cfg = vscode.workspace.getConfiguration('multi-agents');
    this.post({ type: 'message', role: 'bot', text: [
      'Current configuration:',
      '',
      `  provider:            ${cfg.get<string>('provider', 'ollama')}`,
      `  ollamaBaseUrl:       ${cfg.get<string>('ollamaBaseUrl', 'http://localhost:11434')}`,
      `  workflowsDir:        ${cfg.get<string>('workflowsDir', '.ai-workflows')}`,
      `  maxConcurrentAgents: ${cfg.get<number>('maxConcurrentAgents', 3)}`,
    ].join('\n') });
  }

  private async cmdPing(): Promise<void> {
    const cfg = vscode.workspace.getConfiguration('multi-agents');
    const provider = cfg.get<string>('provider', 'ollama');

    if (provider === 'vscode-lm') {
      try {
        const models = await vscode.lm.selectChatModels({});
        const names = models.map((m) => `  • ${m.id}`).join('\n') || '  (none available)';
        this.post({ type: 'message', role: 'bot',
          text: `Provider: vscode-lm\n\nAvailable models:\n${names}` });
      } catch (err) {
        this.post({ type: 'message', role: 'error',
          text: `Failed to query VS Code LM: ${String(err)}` });
      }
      return;
    }

    const baseUrl = cfg.get<string>('ollamaBaseUrl', 'http://localhost:11434');
    this.post({ type: 'message', role: 'bot', text: `Pinging ${baseUrl} …` });

    try {
      assertSafeUrl(baseUrl);
      const res = await fetch(`${baseUrl}/api/tags`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { models: Array<{ name: string }> };
      const names = data.models.map((m) => `  • ${m.name}`).join('\n') || '  (no models installed)';
      this.post({ type: 'message', role: 'bot',
        text: `✓ Ollama reachable at ${baseUrl}\n\nModels:\n${names}` });
    } catch (err) {
      this.post({ type: 'message', role: 'error',
        text: `✗ Cannot reach Ollama at ${baseUrl}\n${String(err)}` });
    }
  }

  private async cmdChange(name: string | undefined): Promise<void> {
    if (!name) {
      this.post({ type: 'message', role: 'error', text: 'Usage: /change <name>' });
      return;
    }

    if (await this.stateManager.exists(name)) {
      const choice = await vscode.window.showWarningMessage(
        `Change "${name}" already exists. Overwrite it?`,
        { modal: true },
        'Overwrite',
      );
      if (choice !== 'Overwrite') {
        this.post({ type: 'message', role: 'bot', text: 'Cancelled.' });
        return;
      }
    }

    try {
      await this.stateManager.create(name);
    } catch (err) {
      this.post({ type: 'message', role: 'error', text: `Failed to create change: ${String(err)}` });
      return;
    }

    this.post({ type: 'stream-start', label: `Running change: ${name}` });
    try {
      await this.orchestrator.run(name, (phase, event) => {
        const icon = event === 'start' ? '▸' : event === 'done' ? '✓' : '✗';
        this.post({ type: 'stream-chunk', text: `${icon} ${phase}\n` });
      });
      this.post({ type: 'stream-chunk', text: '\nChange complete.' });
    } catch (err) {
      this.post({ type: 'stream-chunk', text: `\nError: ${String(err)}` });
    }
    this.post({ type: 'stream-end' });
  }

  private async cmdChanges(): Promise<void> {
    const states = await this.stateManager.list();
    if (!states.length) {
      this.post({ type: 'message', role: 'bot', text: 'No changes found.' });
      return;
    }

    const rows = states.map((s) => {
      const icon = phaseIcon(s.phases[s.currentPhase]);
      return `${s.changeName.padEnd(30)} ${s.currentPhase.padEnd(14)} ${icon}`;
    });

    this.post({ type: 'message', role: 'bot', text:
      `${'Name'.padEnd(30)} ${'Current phase'.padEnd(14)} Status\n` +
      '─'.repeat(52) + '\n' +
      rows.join('\n'),
    });
  }

  private async cmdPhases(name: string | undefined): Promise<void> {
    if (!name) {
      this.post({ type: 'message', role: 'error', text: 'Usage: /phases <name>' });
      return;
    }

    const state = await this.stateManager.read(name);
    if (!state) {
      this.post({ type: 'message', role: 'error', text: `Change "${name}" not found.` });
      return;
    }

    const lines = [
      `Change:  ${state.changeName}`,
      `Created: ${state.createdAt.slice(0, 19).replace('T', ' ')}`,
      `Updated: ${state.updatedAt.slice(0, 19).replace('T', ' ')}`,
      '',
      ...ALL_PHASES.map((p) => {
        const status = state.phases[p];
        const active = p === state.currentPhase ? ' ◀' : '';
        return `  ${phaseIcon(status)} ${p}${active}`;
      }),
    ];

    if (state.verifyVerdict) {
      lines.push('', `Verify verdict: ${state.verifyVerdict}`);
    }

    this.post({ type: 'message', role: 'bot', text: lines.join('\n') });
  }

  private async cmdContinue(name: string | undefined): Promise<void> {
    if (!name) {
      this.post({ type: 'message', role: 'error', text: 'Usage: /continue <name>' });
      return;
    }

    const state = await this.stateManager.read(name);
    if (!state) {
      this.post({ type: 'message', role: 'error', text: `Change "${name}" not found.` });
      return;
    }

    this.post({ type: 'stream-start', label: `Continuing: ${name}` });
    try {
      await this.orchestrator.resume(name, (phase, event) => {
        const icon = event === 'start' ? '▸' : event === 'done' ? '✓' : '✗';
        this.post({ type: 'stream-chunk', text: `${icon} ${phase}\n` });
      });
      this.post({ type: 'stream-chunk', text: '\nDone.' });
    } catch (err) {
      this.post({ type: 'stream-chunk', text: `\nError: ${String(err)}` });
    }
    this.post({ type: 'stream-end' });
  }

  private async cmdRerun(name: string | undefined, phase: SddPhase | undefined): Promise<void> {
    if (!name || !phase) {
      this.post({ type: 'message', role: 'error', text: 'Usage: /rerun <name> <phase>' });
      return;
    }

    if (!ALL_PHASES.includes(phase)) {
      this.post({ type: 'message', role: 'error',
        text: `Unknown phase: ${phase}\nValid phases: ${ALL_PHASES.join(', ')}` });
      return;
    }

    this.post({ type: 'stream-start', label: `Rerunning ${phase} in: ${name}` });
    try {
      await this.orchestrator.runSinglePhase(name, phase, (p, event) => {
        const icon = event === 'start' ? '▸' : event === 'done' ? '✓' : '✗';
        this.post({ type: 'stream-chunk', text: `${icon} ${p}\n` });
      });
      this.post({ type: 'stream-chunk', text: '\nDone.' });
    } catch (err) {
      this.post({ type: 'stream-chunk', text: `\nError: ${String(err)}` });
    }
    this.post({ type: 'stream-end' });
  }

  private async cmdRun(
    name: string | undefined,
    from: SddPhase | undefined,
    to: SddPhase | undefined,
  ): Promise<void> {
    if (!name || !from || !to) {
      this.post({ type: 'message', role: 'error', text: 'Usage: /run <name> <from-phase> <to-phase>' });
      return;
    }

    if (!ALL_PHASES.includes(from) || !ALL_PHASES.includes(to)) {
      this.post({ type: 'message', role: 'error',
        text: `Invalid phase.\nValid phases: ${ALL_PHASES.join(', ')}` });
      return;
    }

    this.post({ type: 'stream-start', label: `Running ${from} → ${to} in: ${name}` });
    try {
      await this.orchestrator.runRange(name, from, to, (phase, event) => {
        const icon = event === 'start' ? '▸' : event === 'done' ? '✓' : '✗';
        this.post({ type: 'stream-chunk', text: `${icon} ${phase}\n` });
      });
      this.post({ type: 'stream-chunk', text: '\nDone.' });
    } catch (err) {
      this.post({ type: 'stream-chunk', text: `\nError: ${String(err)}` });
    }
    this.post({ type: 'stream-end' });
  }

  private async cmdArtifact(name: string | undefined, phase: SddPhase | undefined): Promise<void> {
    if (!name || !phase) {
      this.post({ type: 'message', role: 'error', text: 'Usage: /artifact <name> <phase>' });
      return;
    }

    const file = PHASE_ARTIFACT[phase];
    if (!file) {
      this.post({ type: 'message', role: 'error',
        text: `Unknown phase: ${phase}\nValid phases: ${ALL_PHASES.join(', ')}` });
      return;
    }

    const uri = vscode.Uri.joinPath(
      this.workspaceRoot, this.workflowsDir, 'sdd', 'changes', name, file,
    );

    try {
      await vscode.window.showTextDocument(uri);
      this.post({ type: 'message', role: 'bot', text: `Opened ${file}` });
    } catch {
      this.post({ type: 'message', role: 'error', text: `Artifact not found: ${file}` });
    }
  }

  private async cmdLogs(name: string | undefined, phase: SddPhase | undefined): Promise<void> {
    if (!name) {
      this.post({ type: 'message', role: 'error', text: 'Usage: /logs <name> [phase]' });
      return;
    }

    const state = await this.stateManager.read(name);
    if (!state) {
      this.post({ type: 'message', role: 'error', text: `Change "${name}" not found.` });
      return;
    }

    if (!phase) {
      const available = ALL_PHASES
        .filter((p) => state.phases[p] !== 'pending')
        .map((p) => `  ${phaseIcon(state.phases[p])} ${p}  →  ${PHASE_ARTIFACT[p]}`)
        .join('\n');
      this.post({ type: 'message', role: 'bot',
        text: `Artifacts for "${name}":\n${available || '  (none yet)'}\n\nUsage: /logs ${name} <phase>` });
      return;
    }

    const file = PHASE_ARTIFACT[phase];
    if (!file) {
      this.post({ type: 'message', role: 'error',
        text: `Unknown phase: ${phase}\nValid phases: ${ALL_PHASES.join(', ')}` });
      return;
    }

    const uri = vscode.Uri.joinPath(
      this.workspaceRoot, this.workflowsDir, 'sdd', 'changes', name, file,
    );

    try {
      const bytes = await vscode.workspace.fs.readFile(uri);
      const content = Buffer.from(bytes).toString('utf8');
      const preview = content.length > 2000
        ? `${content.slice(0, 2000)}\n\n… (truncated — use /artifact ${name} ${phase} to open full file)`
        : content;
      this.post({ type: 'stream-start', label: `${phase}  →  ${file}` });
      this.post({ type: 'stream-chunk', text: preview });
      this.post({ type: 'stream-end' });
    } catch {
      this.post({ type: 'message', role: 'error', text: `Artifact not found: ${file}` });
    }
  }

  private async cmdDrop(name: string | undefined): Promise<void> {
    if (!name) {
      this.post({ type: 'message', role: 'error', text: 'Usage: /drop <name>' });
      return;
    }

    const choice = await vscode.window.showWarningMessage(
      `Drop change "${name}" and all its artifacts?`,
      { modal: true },
      'Drop',
    );
    if (choice !== 'Drop') {
      this.post({ type: 'message', role: 'bot', text: 'Cancelled.' });
      return;
    }

    try {
      await this.stateManager.delete(name);
      this.refresh();
      this.post({ type: 'message', role: 'bot', text: `Dropped change "${name}".` });
    } catch (err) {
      this.post({ type: 'message', role: 'error', text: `Failed to drop: ${String(err)}` });
    }
  }

  // ── Webview helpers ───────────────────────────────────────────────────────

  private post(msg: ToWebview): void {
    this._view?.webview.postMessage(msg).then(undefined, (err: unknown) => {
      console.warn('[ChatProvider] postMessage failed:', err);
    });
  }

  // ── HTML ──────────────────────────────────────────────────────────────────

  private buildHtml(webview: vscode.Webview): string {
    const nonce = crypto.randomUUID().replace(/-/g, '');
    const csp = [
      `default-src 'none'`,
      `style-src 'nonce-${nonce}'`,
      `script-src 'nonce-${nonce}'`,
    ].join('; ');

    return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style nonce="${nonce}">
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
    }

    #messages {
      flex: 1;
      overflow-y: auto;
      padding: 8px 10px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .msg {
      max-width: 92%;
      padding: 6px 10px;
      border-radius: 6px;
      font-size: 12px;
      line-height: 1.6;
      white-space: pre-wrap;
      word-break: break-word;
      font-family: var(--vscode-editor-font-family, monospace);
    }

    .msg.user {
      align-self: flex-end;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      font-family: var(--vscode-font-family);
    }

    .msg.bot {
      align-self: flex-start;
      background: var(--vscode-editor-inactiveSelectionBackground);
      color: var(--vscode-foreground);
    }

    .msg.error {
      align-self: flex-start;
      border-left: 3px solid var(--vscode-errorForeground, #f48771);
      background: var(--vscode-inputValidation-errorBackground, transparent);
      color: var(--vscode-errorForeground, #f48771);
    }

    .msg.stream {
      align-self: flex-start;
      background: var(--vscode-editor-inactiveSelectionBackground);
      color: var(--vscode-foreground);
      border-left: 3px solid var(--vscode-progressBar-background, #0e70c0);
      width: 92%;
    }

    .stream-label {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 4px;
    }

    .cursor::after {
      content: '▋';
      animation: blink 1s step-end infinite;
    }

    @keyframes blink { 50% { opacity: 0; } }

    #input-row {
      display: flex;
      padding: 8px;
      gap: 6px;
      border-top: 1px solid var(--vscode-panel-border, var(--vscode-sideBarSectionHeader-border));
    }

    #input {
      flex: 1;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, transparent);
      padding: 5px 8px;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      border-radius: 2px;
      outline: none;
    }

    #input::placeholder { color: var(--vscode-input-placeholderForeground); }
    #input:focus { border-color: var(--vscode-focusBorder); }

    #send {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 5px 10px;
      border-radius: 2px;
      cursor: pointer;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      flex-shrink: 0;
    }

    #send:hover { background: var(--vscode-button-hoverBackground); }
    #send:disabled { opacity: 0.5; cursor: not-allowed; }
  </style>
</head>
<body>
  <div id="messages"></div>
  <div id="input-row">
    <input id="input" type="text" placeholder="/help  ·  /change <name>  ·  /ping"
      autocomplete="off" spellcheck="false" />
    <button id="send">↵</button>
  </div>

  <script nonce="${nonce}">
    const vscode   = acquireVsCodeApi();
    const msgList  = document.getElementById('messages');
    const inputEl  = document.getElementById('input');
    const sendBtn  = document.getElementById('send');

    let streamEl   = null;
    let streamBody = null;
    let busy       = false;

    function scrollBottom() {
      msgList.scrollTop = msgList.scrollHeight;
    }

    function addMsg(role, text) {
      const div = document.createElement('div');
      div.className = 'msg ' + role;
      div.textContent = text;
      msgList.appendChild(div);
      scrollBottom();
      return div;
    }

    function setBusy(b) {
      busy = b;
      sendBtn.disabled = b;
      inputEl.disabled = b;
    }

    function submit() {
      if (busy) return;
      const text = inputEl.value.trim();
      if (!text) return;
      inputEl.value = '';
      setBusy(true);
      vscode.postMessage({ type: 'submit', text });
    }

    sendBtn.addEventListener('click', submit);
    inputEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });

    window.addEventListener('message', ({ data: msg }) => {
      if (msg.type === 'clear') {
        msgList.innerHTML = '';
        setBusy(false);

      } else if (msg.type === 'message') {
        addMsg(msg.role, msg.text);
        setBusy(false);

      } else if (msg.type === 'stream-start') {
        const wrapper = document.createElement('div');
        wrapper.className = 'msg stream cursor';
        const label = document.createElement('div');
        label.className = 'stream-label';
        label.textContent = msg.label;
        streamBody = document.createElement('div');
        wrapper.appendChild(label);
        wrapper.appendChild(streamBody);
        msgList.appendChild(wrapper);
        streamEl = wrapper;
        scrollBottom();

      } else if (msg.type === 'stream-chunk') {
        if (streamBody) {
          streamBody.textContent += msg.text;
          scrollBottom();
        }

      } else if (msg.type === 'stream-end') {
        if (streamEl) {
          streamEl.classList.remove('cursor');
          streamEl = null;
          streamBody = null;
        }
        setBusy(false);
      }
    });

    inputEl.focus();
  </script>
</body>
</html>`;
  }
}
