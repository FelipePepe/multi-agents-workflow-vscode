import * as vscode from 'vscode';
import type { AgentRegistry } from '../agents/AgentRegistry.js';

export class AgentItem extends vscode.TreeItem {
  constructor(label: string, description?: string, contextValue?: string) {
    super(label, vscode.TreeItemCollapsibleState.None);
    if (description !== undefined) this.description = description;
    if (contextValue !== undefined) this.contextValue = contextValue;
  }
}

export class AgentsProvider implements vscode.TreeDataProvider<AgentItem> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private readonly registry: AgentRegistry) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: AgentItem): vscode.TreeItem {
    return element;
  }

  getChildren(): AgentItem[] {
    const agents = this.registry.getAll();
    if (agents.length === 0) {
      return [new AgentItem('(none running)', undefined, 'none')];
    }
    return agents.map(({ key }) => new AgentItem(key, 'Running...'));
  }

  dispose(): void {
    this._onDidChangeTreeData.dispose();
  }
}
