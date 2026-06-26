import * as vscode from 'vscode';
import type { SddPhase, WorkflowConfig, WorkflowPhaseConfig, PhaseStatus } from './types/index.js';
import type { StateManager } from './StateManager.js';
import type { AgentRunner } from './agents/AgentRunner.js';

export type PhaseNotify = (phase: SddPhase, event: 'start' | 'done' | 'fail') => void;

export class WorkflowOrchestrator {
  private stopped = false;

  constructor(
    private readonly stateManager: StateManager,
    private readonly runner: AgentRunner,
    private readonly workspaceRoot: vscode.Uri,
    private readonly workflowsDir: string,
  ) {}

  stop(): void {
    this.stopped = true;
  }

  async run(changeName: string, notify?: PhaseNotify): Promise<void> {
    this.stopped = false;
    const config = await this.loadConfig();
    if (!config) return;

    for (const phase of config.phases) {
      if (this.stopped) break;
      const advanced = await this.runPhase(changeName, phase, notify);
      if (!advanced || this.stopped) break;
    }
  }

  /** Resume from the first phase that is not 'complete'. */
  async resume(changeName: string, notify?: PhaseNotify): Promise<void> {
    this.stopped = false;
    const config = await this.loadConfig();
    if (!config) return;

    const state = await this.stateManager.read(changeName);
    if (!state) {
      vscode.window.showErrorMessage(`Multi-Agents: Workflow "${changeName}" not found.`);
      return;
    }

    let started = false;
    for (const phase of config.phases) {
      if (this.stopped) break;
      if (!started && state.phases[phase.id as SddPhase] === 'complete') continue;
      started = true;
      const advanced = await this.runPhase(changeName, phase, notify);
      if (!advanced || this.stopped) break;
    }

    if (!started) {
      vscode.window.showInformationMessage(
        `Multi-Agents: Workflow "${changeName}" is already complete.`,
      );
    }
  }

  /** Run a contiguous range of phases [from, to] inclusive. */
  async runRange(changeName: string, from: SddPhase, to: SddPhase, notify?: PhaseNotify): Promise<void> {
    this.stopped = false;
    const config = await this.loadConfig();
    if (!config) return;

    const phases = config.phases;
    const fromIdx = phases.findIndex((p) => p.id === from);
    const toIdx   = phases.findIndex((p) => p.id === to);

    if (fromIdx === -1 || toIdx === -1 || fromIdx > toIdx) {
      vscode.window.showErrorMessage(
        `Multi-Agents: Invalid phase range "${from}" → "${to}".`,
      );
      return;
    }

    for (const phase of phases.slice(fromIdx, toIdx + 1)) {
      if (this.stopped) break;
      const advanced = await this.runPhase(changeName, phase, notify);
      if (!advanced || this.stopped) break;
    }
  }

  /** Re-run a single phase regardless of its current status. */
  async runSinglePhase(changeName: string, phaseId: SddPhase, notify?: PhaseNotify): Promise<void> {
    this.stopped = false;
    const config = await this.loadConfig();
    if (!config) return;

    const phase = config.phases.find((p) => p.id === phaseId);
    if (!phase) {
      vscode.window.showErrorMessage(
        `Multi-Agents: Phase "${phaseId}" not found in workflow.json.`,
      );
      return;
    }

    await this.runPhase(changeName, phase, notify);
  }

  private async runPhase(
    changeName: string,
    phase: WorkflowPhaseConfig,
    notify?: PhaseNotify,
  ): Promise<boolean> {
    const state = await this.stateManager.read(changeName);
    if (!state) return false;

    const phaseId = phase.id as SddPhase;
    state.phases[phaseId] = 'in-progress';
    state.currentPhase = phaseId;
    await this.stateManager.write(state);
    notify?.(phaseId, 'start');

    // runner.run() always resolves (never rejects) — onDone or onError fires before resolution.
    let errored = false;
    await this.runner.run({
      changeName,
      role: phase.agent,
      artifactPaths: phase.artifact.reads,
      onChunk: () => undefined,
      onDone:  () => undefined,
      onError: () => { errored = true; },
    });

    const finalStatus: PhaseStatus = this.stopped ? 'in-progress' : errored ? 'fail' : 'complete';
    const current = await this.stateManager.read(changeName);
    if (current) {
      current.phases[phaseId] = finalStatus;
      await this.stateManager.write(current);
    }

    if (!this.stopped) {
      notify?.(phaseId, errored ? 'fail' : 'done');
    }

    return !errored && !this.stopped;
  }

  private async loadConfig(): Promise<WorkflowConfig | null> {
    try {
      const uri = vscode.Uri.joinPath(
        this.workspaceRoot, this.workflowsDir, 'config', 'workflow.json',
      );
      const bytes = await vscode.workspace.fs.readFile(uri);
      return JSON.parse(Buffer.from(bytes).toString('utf8')) as WorkflowConfig;
    } catch (err) {
      vscode.window.showErrorMessage(`Multi-Agents: workflow.json not found or invalid — ${String(err)}`);
      return null;
    }
  }
}
