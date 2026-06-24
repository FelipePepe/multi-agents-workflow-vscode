import * as vscode from 'vscode';
import type { AgentRole, AgentRunOptions, ModelsConfig } from '../types/index.js';
import type { LlmMessage, LlmProvider } from './LlmProvider.js';
import { AgentRegistry } from './AgentRegistry.js';

const ROLE_ARTIFACT: Record<AgentRole, string> = {
  orchestrator: 'orchestrator-log.md',
  explorer:     '01-explore.md',
  proposal:     '02-proposal.md',
  spec:         '03-spec.md',
  design:       '04-design.md',
  tasks:        '05-tasks.md',
  implementer:  '06-apply-progress.md',
  tester:       'test-results.md',
  verifier:     '07-verify-report.md',
  fixer:        'fix-report.md',
  archiver:     '08-archive-report.md',
};

export class AgentRunner {
  private readonly channels = new Map<string, vscode.OutputChannel>();

  constructor(
    _context: vscode.ExtensionContext,
    private readonly registry: AgentRegistry,
    private readonly provider: LlmProvider,
    private readonly refreshAgents?: () => void,
  ) {}

  async run(opts: AgentRunOptions): Promise<void> {
    const config = vscode.workspace.getConfiguration('multi-agents');
    const workflowsDir = config.get<string>('workflowsDir', '.ai-workflows');
    const maxAgents = config.get<number>('maxConcurrentAgents', 3);
    const workspaceRoot = vscode.workspace.workspaceFolders![0].uri;

    // ── 0. Concurrency gate + early registration (atomic check-and-claim) ────────
    if (this.registry.isFull(maxAgents)) {
      vscode.window.showWarningMessage(
        `Multi-Agents: max concurrent agents (${maxAgents}) reached. Wait for a running agent to finish.`,
      );
      opts.onError(new Error(`Max concurrent agents (${maxAgents}) reached`));
      return;
    }
    const controller = new AbortController();
    const registryKey = `${opts.changeName}:${opts.role}`;
    this.registry.register(registryKey, controller);

    // ── 1. Read agent .md → system prompt ──────────────────────────────────────
    const agentMdUri = vscode.Uri.joinPath(workspaceRoot, workflowsDir, 'agents', `${opts.role}.md`);
    let systemPrompt: string;
    try {
      const bytes = await vscode.workspace.fs.readFile(agentMdUri);
      systemPrompt = Buffer.from(bytes).toString('utf8');
    } catch {
      vscode.window.showErrorMessage(
        `Multi-Agents: Agent definition not found: ${workflowsDir}/agents/${opts.role}.md`,
      );
      this.registry.unregister(registryKey);
      this.refreshAgents?.();
      opts.onError(new Error(`Agent .md not found: ${opts.role}`));
      return;
    }

    // ── 2. Read models.json → resolve model ─────────────────────────────────────
    let model: string;
    try {
      const bytes = await vscode.workspace.fs.readFile(
        vscode.Uri.joinPath(workspaceRoot, workflowsDir, 'config', 'models.json'),
      );
      const cfg = JSON.parse(Buffer.from(bytes).toString('utf8')) as ModelsConfig;
      model = cfg.models[opts.role] ?? cfg.models.fallback ?? cfg.defaultModel;
    } catch {
      vscode.window.showWarningMessage('Multi-Agents: models.json not found, using default model');
      model = 'qwen3.6:35b-a3b';
    }

    // ── 3. Read artifact files (skip missing) ───────────────────────────────────
    const artifactTexts: string[] = [];
    for (const artifactPath of opts.artifactPaths ?? []) {
      const uri = vscode.Uri.joinPath(
        workspaceRoot, workflowsDir, 'sdd', 'changes', opts.changeName, artifactPath,
      );
      try {
        const bytes = await vscode.workspace.fs.readFile(uri);
        artifactTexts.push(`## ${artifactPath}\n\n${Buffer.from(bytes).toString('utf8')}`);
      } catch {
        console.warn(`[AgentRunner] Skipping missing artifact: ${uri.fsPath}`);
      }
    }

    // ── 4. Build messages ────────────────────────────────────────────────────────
    const userContent = [
      ...artifactTexts,
      opts.userPrompt ?? `Continue the SDD workflow for: ${opts.changeName}`,
    ].join('\n\n---\n\n');

    const messages: LlmMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userContent },
    ];

    // ── 5. OutputChannel (reuse per changeName) ──────────────────────────────────
    let channel = this.channels.get(opts.changeName);
    if (!channel) {
      channel = vscode.window.createOutputChannel(`Multi-Agents: ${opts.changeName}`);
      this.channels.set(opts.changeName, channel);
    }
    channel.show(true);
    channel.appendLine(`\n── [${opts.role}] started at ${new Date().toISOString()} ──`);

    // ── 6. Stream ────────────────────────────────────────────────────────────────
    const chunks: string[] = [];
    let doneFired = false;
    let streamError: Error | undefined;

    const ch = channel;

    await this.provider.stream(
      messages,
      model,
      (chunk) => { chunks.push(chunk); ch.append(chunk); opts.onChunk(chunk); },
      () => { doneFired = true; },
      (err) => { streamError = err; },
      opts.signal ?? controller.signal,
    );

    // ── 7. Post-stream ───────────────────────────────────────────────────────────
    this.registry.unregister(registryKey);
    this.refreshAgents?.();

    if (opts.signal?.aborted ?? controller.signal.aborted) {
      ch.appendLine(`── [${opts.role}] [CANCELLED] ──`);
      opts.onDone();
      return;
    }

    if (streamError && !doneFired) {
      ch.appendLine(`── [${opts.role}] [ERROR] ${streamError.message} ──`);
      vscode.window.showErrorMessage(`Multi-Agents [${opts.role}]: ${streamError.message}`);
      opts.onError(streamError);
      return;
    }

    ch.appendLine(`── [${opts.role}] done at ${new Date().toISOString()} ──`);

    // ── 8. Write artifact ────────────────────────────────────────────────────────
    const content = chunks.join('');
    if (content) {
      const artifactFilename = ROLE_ARTIFACT[opts.role];
      const artifactUri = vscode.Uri.joinPath(
        workspaceRoot, workflowsDir, 'sdd', 'changes', opts.changeName, artifactFilename,
      );
      try {
        await vscode.workspace.fs.writeFile(
          artifactUri,
          Buffer.from(content) as unknown as Uint8Array,
        );
      } catch (err) {
        console.error('[AgentRunner] Failed to write artifact:', err);
      }
    }

    opts.onDone();
  }

  dispose(): void {
    for (const channel of this.channels.values()) {
      channel.dispose();
    }
    this.channels.clear();
  }
}
