import * as vscode from 'vscode';
import type { StateManager } from '../StateManager.js';
import type { WorkflowOrchestrator } from '../WorkflowOrchestrator.js';
import type { WorkflowsProvider } from '../providers/WorkflowsProvider.js';

const KEBAB_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function validateName(value: string): string | null {
  if (!value || value.length === 0) return 'Name cannot be empty.';
  if (value.length > 64) return 'Name must be 64 characters or fewer.';
  if (!KEBAB_RE.test(value)) return 'Use kebab-case only: lowercase letters, digits, and hyphens (e.g. my-feature).';
  return null;
}

export async function startWorkflow(
  stateManager: StateManager,
  orchestrator: WorkflowOrchestrator,
  workflowsProvider: WorkflowsProvider,
): Promise<void> {
  const name = await vscode.window.showInputBox({
    prompt: 'Enter a kebab-case name for the new change',
    placeHolder: 'e.g. add-login-flow',
    validateInput: validateName,
  });

  if (!name) return;

  if (await stateManager.exists(name)) {
    vscode.window.showErrorMessage(`Multi-Agents: A change named "${name}" already exists.`);
    return;
  }

  await stateManager.create(name);
  workflowsProvider.refresh();

  void orchestrator.run(name);
}
