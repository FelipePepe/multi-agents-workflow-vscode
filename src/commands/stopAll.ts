import * as vscode from 'vscode';
import type { AgentRegistry } from '../agents/AgentRegistry.js';
import type { AgentsProvider } from '../providers/AgentsProvider.js';

export async function stopAll(
  registry: AgentRegistry,
  agentsProvider: AgentsProvider,
): Promise<void> {
  const count = registry.abortAll();
  agentsProvider.refresh();
  vscode.window.showInformationMessage(`Multi-Agents: Stopped ${count} agent(s).`);
}
