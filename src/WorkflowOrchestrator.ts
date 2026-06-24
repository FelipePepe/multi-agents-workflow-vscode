import * as vscode from 'vscode';
import type { SddPhase, WorkflowConfig, WorkflowPhaseConfig } from './types/index.js';
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

  private runPhase(
    changeName: string,
    phase: WorkflowPhaseConfig,
    notify?: PhaseNotify,
  ): Promise<boolean> {
    return new Promise((resolve) => {
      void this.stateManager.read(changeName).then(async (state) => {
        if (!state) { resolve(false); return; }

        state.phases[phase.id as SddPhase] = 'in-progress';
        state.currentPhase = phase.id as SddPhase;
        await this.stateManager.write(state);
        notify?.(phase.id as SddPhase, 'start');

        void this.runner.run({
          changeName,
          role: phase.agent,
          artifactPaths: phase.artifact.reads,
          onChunk: () => undefined,
          onDone: () => {
            void this.stateManager.read(changeName).then(async (s) => {
              if (s) {
                s.phases[phase.id as SddPhase] = 'complete';
                await this.stateManager.write(s);
              }
              notify?.(phase.id as SddPhase, 'done');
              resolve(true);
            });
          },
          onError: (_err) => {
            void this.stateManager.read(changeName).then(async (s) => {
              if (s) {
                s.phases[phase.id as SddPhase] = 'fail';
                await this.stateManager.write(s);
              }
              notify?.(phase.id as SddPhase, 'fail');
              resolve(false);
            });
          },
        });
      });
    });
  }

  private async loadConfig(): Promise<WorkflowConfig | null> {
    try {
      const uri = vscode.Uri.joinPath(
        this.workspaceRoot, this.workflowsDir, 'config', 'workflow.json',
      );
      const bytes = await vscode.workspace.fs.readFile(uri);
      return JSON.parse(Buffer.from(bytes).toString('utf8')) as WorkflowConfig;
    } catch {
      vscode.window.showErrorMessage('Multi-Agents: workflow.json not found or invalid.');
      return null;
    }
  }
}
