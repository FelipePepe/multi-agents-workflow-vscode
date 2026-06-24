import * as vscode from 'vscode';
import type { SddPhase, PhaseStatus } from '../types/index.js';
import type { StateManager } from '../StateManager.js';
import type { WorkflowOrchestrator } from '../WorkflowOrchestrator.js';

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

const ALL_PHASES = Object.keys(PHASE_ARTIFACT) as SddPhase[];

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
  | { type: 'stream-end' };

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

    view.webview.onDidReceiveMessage(async (msg: { type: string; text: string }) => {
      if (msg.type === 'submit') {
        await this.handleInput(msg.text);
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
      case '/help':   this.cmdHelp();                                 break;
      case '/init':   await this.cmdInit();                           break;
      case '/panel':  this.cmdPanel();                                break;
      case '/stop':   this.cmdStop();                                 break;
      case '/start':  await this.cmdStart(args[0]);                   break;
      case '/list':   await this.cmdList();                           break;
      case '/status': await this.cmdStatus(args[0]);                  break;
      case '/resume': await this.cmdResume(args[0]);                  break;
      case '/retry':  await this.cmdRetry(args[0], args[1] as SddPhase | undefined); break;
      case '/open':   await this.cmdOpen(args[0], args[1] as SddPhase | undefined);  break;
      case '/delete': await this.cmdDelete(args[0]);                  break;
      default:
        this.post({ type: 'message', role: 'error',
          text: `Unknown command: ${cmd ?? input}\nType /help for a list.` });
    }
  }

  // ── Individual commands ───────────────────────────────────────────────────

  private cmdHelp(): void {
    this.post({ type: 'message', role: 'bot', text: [
      'Available commands:',
      '',
      '  /start <name>            Start a new SDD workflow',
      '  /stop                    Abort all running agents',
      '  /list                    List all workflows',
      '  /status <name>           Show full phase breakdown',
      '  /resume <name>           Resume from first incomplete phase',
      '  /retry  <name> <phase>   Re-run a single phase',
      '  /open   <name> <phase>   Open the artifact in the editor',
      '  /delete <name>           Delete a workflow and its artifacts',
      '  /init                    Scaffold .ai-workflows/ in the workspace',
      '  /panel                   Reveal the sidebar',
      '  /help                    Show this message',
      '',
      'Phases:',
      '  sdd-explore  sdd-propose  sdd-spec   sdd-design',
      '  sdd-tasks    sdd-apply    sdd-verify  sdd-archive',
    ].join('\n') });
  }

  private async cmdInit(): Promise<void> {
    await vscode.commands.executeCommand('multi-agents.initWorkspace');
  }

  private cmdPanel(): void {
    void vscode.commands.executeCommand('workbench.view.extension.multi-agents');
  }

  private cmdStop(): void {
    this.stopAll();
    this.post({ type: 'message', role: 'bot', text: 'All agents stopped.' });
  }

  private async cmdStart(name: string | undefined): Promise<void> {
    if (!name) {
      this.post({ type: 'message', role: 'error', text: 'Usage: /start <name>' });
      return;
    }

    if (await this.stateManager.exists(name)) {
      const choice = await vscode.window.showWarningMessage(
        `Workflow "${name}" already exists. Overwrite it?`,
        { modal: true },
        'Overwrite',
      );
      if (choice !== 'Overwrite') {
        this.post({ type: 'message', role: 'bot', text: 'Cancelled.' });
        return;
      }
    }

    await this.stateManager.create(name);

    this.post({ type: 'stream-start', label: `Running workflow: ${name}` });
    try {
      await this.orchestrator.run(name, (phase, event) => {
        const icon = event === 'start' ? '▸' : event === 'done' ? '✓' : '✗';
        this.post({ type: 'stream-chunk', text: `${icon} ${phase}\n` });
      });
      this.post({ type: 'stream-chunk', text: '\nWorkflow complete.' });
    } catch (err) {
      this.post({ type: 'stream-chunk', text: `\nError: ${String(err)}` });
    }
    this.post({ type: 'stream-end' });
  }

  private async cmdList(): Promise<void> {
    const states = await this.stateManager.list();
    if (!states.length) {
      this.post({ type: 'message', role: 'bot', text: 'No workflows found.' });
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

  private async cmdStatus(name: string | undefined): Promise<void> {
    if (!name) {
      this.post({ type: 'message', role: 'error', text: 'Usage: /status <name>' });
      return;
    }

    const state = await this.stateManager.read(name);
    if (!state) {
      this.post({ type: 'message', role: 'error', text: `Workflow "${name}" not found.` });
      return;
    }

    const lines = [
      `Workflow: ${state.changeName}`,
      `Created:  ${state.createdAt.slice(0, 19).replace('T', ' ')}`,
      `Updated:  ${state.updatedAt.slice(0, 19).replace('T', ' ')}`,
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

  private async cmdResume(name: string | undefined): Promise<void> {
    if (!name) {
      this.post({ type: 'message', role: 'error', text: 'Usage: /resume <name>' });
      return;
    }

    const state = await this.stateManager.read(name);
    if (!state) {
      this.post({ type: 'message', role: 'error', text: `Workflow "${name}" not found.` });
      return;
    }

    this.post({ type: 'stream-start', label: `Resuming: ${name}` });
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

  private async cmdRetry(name: string | undefined, phase: SddPhase | undefined): Promise<void> {
    if (!name || !phase) {
      this.post({ type: 'message', role: 'error', text: 'Usage: /retry <name> <phase>' });
      return;
    }

    if (!ALL_PHASES.includes(phase)) {
      this.post({ type: 'message', role: 'error',
        text: `Unknown phase: ${phase}\nValid phases: ${ALL_PHASES.join(', ')}` });
      return;
    }

    this.post({ type: 'stream-start', label: `Retrying ${phase} in: ${name}` });
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

  private async cmdOpen(name: string | undefined, phase: SddPhase | undefined): Promise<void> {
    if (!name || !phase) {
      this.post({ type: 'message', role: 'error', text: 'Usage: /open <name> <phase>' });
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

  private async cmdDelete(name: string | undefined): Promise<void> {
    if (!name) {
      this.post({ type: 'message', role: 'error', text: 'Usage: /delete <name>' });
      return;
    }

    const choice = await vscode.window.showWarningMessage(
      `Delete workflow "${name}" and all its artifacts?`,
      { modal: true },
      'Delete',
    );
    if (choice !== 'Delete') {
      this.post({ type: 'message', role: 'bot', text: 'Cancelled.' });
      return;
    }

    try {
      await this.stateManager.delete(name);
      this.refresh();
      this.post({ type: 'message', role: 'bot', text: `Deleted workflow "${name}".` });
    } catch (err) {
      this.post({ type: 'message', role: 'error', text: `Failed to delete: ${String(err)}` });
    }
  }

  // ── Webview helpers ───────────────────────────────────────────────────────

  private post(msg: ToWebview): void {
    void this._view?.webview.postMessage(msg);
  }

  // ── HTML ──────────────────────────────────────────────────────────────────

  private buildHtml(webview: vscode.Webview): string {
    const nonce = crypto.randomUUID().replace(/-/g, '');
    const csp = [
      `default-src 'none'`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `script-src 'nonce-${nonce}'`,
    ].join('; ');

    return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
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
    <input id="input" type="text" placeholder="/help  ·  /start <name>  ·  /list"
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
      if (msg.type === 'message') {
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

    // Focus input on load
    inputEl.focus();
  </script>
</body>
</html>`;
  }
}
