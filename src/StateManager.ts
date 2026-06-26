import * as vscode from 'vscode';
import { ALL_SDD_PHASES } from './types/index.js';
import type { WorkflowState, SddPhase, PhaseStatus } from './types/index.js';

export class StateManager {
  private readonly _onDidChangeState = new vscode.EventEmitter<string>();
  readonly onDidChangeState = this._onDidChangeState.event;

  private readonly changesRoot: vscode.Uri;
  private watcher?: vscode.FileSystemWatcher;

  constructor(
    workspaceRoot: vscode.Uri,
    private readonly workflowsDir: string,
  ) {
    this.changesRoot = vscode.Uri.joinPath(workspaceRoot, workflowsDir, 'sdd', 'changes');
    this.initWatcher();
  }

  async read(changeName: string): Promise<WorkflowState | null> {
    try {
      const bytes = await vscode.workspace.fs.readFile(this.stateUri(changeName));
      return JSON.parse(Buffer.from(bytes).toString('utf8')) as WorkflowState;
    } catch {
      return null;
    }
  }

  async write(state: WorkflowState): Promise<void> {
    const dir = this.changeDir(state.changeName);
    await vscode.workspace.fs.createDirectory(dir);

    const updated: WorkflowState = { ...state, updatedAt: new Date().toISOString() };
    const data = new TextEncoder().encode(JSON.stringify(updated, null, 2));

    const tmpUri = vscode.Uri.joinPath(dir, 'state.json.tmp');
    const finalUri = this.stateUri(state.changeName);

    await vscode.workspace.fs.writeFile(tmpUri, data);
    await vscode.workspace.fs.rename(tmpUri, finalUri, { overwrite: true });
  }

  async exists(changeName: string): Promise<boolean> {
    try {
      await vscode.workspace.fs.stat(this.stateUri(changeName));
      return true;
    } catch {
      return false;
    }
  }

  async create(changeName: string): Promise<WorkflowState> {
    const now = new Date().toISOString();
    const phases = Object.fromEntries(
      ALL_SDD_PHASES.map((p) => [p, 'pending' as PhaseStatus]),
    ) as Record<SddPhase, PhaseStatus>;

    const state: WorkflowState = {
      changeName,
      changeDir: `./${this.workflowsDir}/sdd/changes/${changeName}`,
      createdAt: now,
      updatedAt: now,
      currentPhase: 'sdd-explore',
      phases,
      verifyVerdict: null,
      reviewLoopIteration: 0,
      notes: '',
    };

    await this.write(state);
    return state;
  }

  async listChanges(): Promise<string[]> {
    try {
      const entries = await vscode.workspace.fs.readDirectory(this.changesRoot);
      return entries
        .filter(([, type]) => type === vscode.FileType.Directory)
        .map(([name]) => name);
    } catch {
      return [];
    }
  }

  async list(): Promise<WorkflowState[]> {
    const names = await this.listChanges();
    const states = await Promise.all(names.map((n) => this.read(n)));
    return (states.filter(Boolean) as WorkflowState[])
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async delete(changeName: string): Promise<void> {
    await vscode.workspace.fs.delete(
      vscode.Uri.joinPath(this.changesRoot, changeName),
      { recursive: true },
    );
  }

  dispose(): void {
    this.watcher?.dispose();
    this._onDidChangeState.dispose();
  }

  private initWatcher(): void {
    this.watcher = vscode.workspace.createFileSystemWatcher(
      `**/${this.workflowsDir}/sdd/changes/*/state.json`,
    );
    const fire = (uri: vscode.Uri) => {
      const name = this.extractChangeName(uri);
      if (name) this._onDidChangeState.fire(name);
    };
    this.watcher.onDidChange(fire);
    this.watcher.onDidCreate(fire);
    this.watcher.onDidDelete(fire);
  }

  private extractChangeName(uri: vscode.Uri): string | null {
    // uri.path always uses forward slashes on all platforms; fsPath is platform-specific
    const parts = uri.path.split('/');
    const idx = parts.lastIndexOf('changes');
    return idx >= 0 ? (parts[idx + 1] ?? null) : null;
  }

  private changeDir(changeName: string): vscode.Uri {
    return vscode.Uri.joinPath(this.changesRoot, changeName);
  }

  private stateUri(changeName: string): vscode.Uri {
    return vscode.Uri.joinPath(this.changeDir(changeName), 'state.json');
  }
}
