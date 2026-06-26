import * as vscode from 'vscode';
import { AgentRegistry } from './agents/AgentRegistry.js';
import { AgentRunner } from './agents/AgentRunner.js';
import { OllamaProvider } from './agents/OllamaProvider.js';
import { VsCodeLmProvider } from './agents/VsCodeLmProvider.js';
import { StateManager } from './StateManager.js';
import { WorkflowOrchestrator } from './WorkflowOrchestrator.js';
import { WorkflowsProvider } from './providers/WorkflowsProvider.js';
import { AgentsProvider } from './providers/AgentsProvider.js';
import { startWorkflow } from './commands/startWorkflow.js';
import { stopAll } from './commands/stopAll.js';
import { initWorkspace } from './commands/initWorkspace.js';
import { SettingsProvider } from './providers/SettingsProvider.js';
import { ChatProvider } from './providers/ChatProvider.js';

export function activate(context: vscode.ExtensionContext): void {
  if (!vscode.workspace.workspaceFolders?.length) {
    vscode.window.showInformationMessage('Multi-Agents: Open a folder first.');
    return;
  }

  const workspaceRoot = vscode.workspace.workspaceFolders[0].uri;
  const config = vscode.workspace.getConfiguration('multi-agents');
  const rawWorkflowsDir = config.get<string>('workflowsDir', '.ai-workflows');
  const workflowsDir = /^[a-zA-Z0-9._-]+$/.test(rawWorkflowsDir) && !rawWorkflowsDir.startsWith('.')
    ? rawWorkflowsDir
    : '.ai-workflows';

  const providerSetting = config.get<string>('provider', 'ollama');
  const llmProvider = providerSetting === 'vscode-lm'
    ? new VsCodeLmProvider()
    : new OllamaProvider(() =>
        vscode.workspace.getConfiguration('multi-agents').get<string>('ollamaBaseUrl', 'http://localhost:11434'),
      );

  const registry          = new AgentRegistry();
  const stateManager      = new StateManager(workspaceRoot, workflowsDir);
  const agentsProvider    = new AgentsProvider(registry);
  const runner            = new AgentRunner(context, registry, llmProvider, () => agentsProvider.refresh());
  const orchestrator      = new WorkflowOrchestrator(stateManager, runner, workspaceRoot, workflowsDir);
  const workflowsProvider = new WorkflowsProvider(stateManager);
  const settingsProvider  = new SettingsProvider();
  const stopAllFn = () => { orchestrator.stop(); void stopAll(registry, agentsProvider); };
  const chatProvider = new ChatProvider(
    stateManager, orchestrator, workspaceRoot, workflowsDir,
    stopAllFn,
    () => workflowsProvider.refresh(),
  );

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('multi-agents.workflowsView', workflowsProvider),
    vscode.window.registerTreeDataProvider('multi-agents.agentsView',    agentsProvider),
    vscode.window.registerWebviewViewProvider(SettingsProvider.viewId,   settingsProvider),
    vscode.window.registerWebviewViewProvider(ChatProvider.viewId,       chatProvider),
    vscode.commands.registerCommand('multi-agents.startWorkflow',
      () => startWorkflow(stateManager, orchestrator, workflowsProvider)),
    vscode.commands.registerCommand('multi-agents.initWorkspace',
      () => initWorkspace(context.extensionUri)),
    vscode.commands.registerCommand('multi-agents.showPanel',
      () => vscode.commands.executeCommand('workbench.view.extension.multi-agents')),
    vscode.commands.registerCommand('multi-agents.stopAll', stopAllFn),
    stateManager,
    workflowsProvider,
    agentsProvider,
    runner,
  );
}

export function deactivate(): void {}
