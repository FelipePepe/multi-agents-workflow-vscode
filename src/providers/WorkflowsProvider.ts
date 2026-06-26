import * as vscode from 'vscode';
import { ALL_SDD_PHASES } from '../types/index.js';
import type { PhaseStatus } from '../types/index.js';
import type { StateManager } from '../StateManager.js';

const PHASE_ICON: Record<PhaseStatus, vscode.ThemeIcon> = {
  'pending':     new vscode.ThemeIcon('circle-outline'),
  'in-progress': new vscode.ThemeIcon('sync~spin'),
  'complete':    new vscode.ThemeIcon('check'),
  'fail':        new vscode.ThemeIcon('error'),
};

export class WorkflowItem extends vscode.TreeItem {
  constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly changeName?: string,
    iconPath?: vscode.ThemeIcon,
    description?: string,
  ) {
    super(label, collapsibleState);
    if (iconPath !== undefined) this.iconPath = iconPath;
    if (description !== undefined) this.description = description;
  }
}

export class WorkflowsProvider implements vscode.TreeDataProvider<WorkflowItem> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private readonly _subscription: vscode.Disposable;

  constructor(private readonly stateManager: StateManager) {
    this._subscription = stateManager.onDidChangeState(() => this.refresh());
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: WorkflowItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: WorkflowItem): Promise<WorkflowItem[]> {
    if (!element) {
      const changes = await this.stateManager.listChanges();
      return changes.map(
        (name) => new WorkflowItem(name, vscode.TreeItemCollapsibleState.Collapsed, name),
      );
    }

    if (element.changeName) {
      const state = await this.stateManager.read(element.changeName);
      if (!state) return [];

      return ALL_SDD_PHASES.map((phase) => {
        const status = state.phases[phase] ?? 'pending';
        return new WorkflowItem(
          phase,
          vscode.TreeItemCollapsibleState.None,
          undefined,
          PHASE_ICON[status],
          status,
        );
      });
    }

    return [];
  }

  dispose(): void {
    this._subscription.dispose();
    this._onDidChangeTreeData.dispose();
  }
}
