import * as vscode from 'vscode';

async function copyDir(src: vscode.Uri, dest: vscode.Uri): Promise<void> {
  await vscode.workspace.fs.createDirectory(dest);
  const entries = await vscode.workspace.fs.readDirectory(src);
  await Promise.all(
    entries.map(async ([name, type]) => {
      const srcChild  = vscode.Uri.joinPath(src,  name);
      const destChild = vscode.Uri.joinPath(dest, name);
      if (type === vscode.FileType.Directory) {
        await copyDir(srcChild, destChild);
      } else {
        await vscode.workspace.fs.writeFile(destChild, await vscode.workspace.fs.readFile(srcChild));
      }
    }),
  );
}

export async function initWorkspace(extensionUri: vscode.Uri): Promise<void> {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri;
  if (!workspaceRoot) {
    vscode.window.showErrorMessage('Multi-Agents: Open a folder first.');
    return;
  }

  const workflowsDir = vscode.workspace.getConfiguration('multi-agents')
    .get<string>('workflowsDir', '.ai-workflows');

  const destUri = vscode.Uri.joinPath(workspaceRoot, workflowsDir);

  let alreadyExists = false;
  try {
    await vscode.workspace.fs.stat(destUri);
    alreadyExists = true;
  } catch { /* directory does not exist — proceed */ }

  if (alreadyExists) {
    const choice = await vscode.window.showWarningMessage(
      `"${workflowsDir}" already exists in this workspace. Overwrite it?`,
      { modal: true },
      'Overwrite',
    );
    if (choice !== 'Overwrite') return;
  }

  try {
    await copyDir(vscode.Uri.joinPath(extensionUri, '.ai-workflows'), destUri);
  } catch (err) {
    vscode.window.showErrorMessage(`Multi-Agents: Failed to initialize workspace: ${String(err)}`);
    return;
  }

  const action = await vscode.window.showInformationMessage(
    `Multi-Agents: "${workflowsDir}/" created. Pull the required Ollama models before running a workflow.`,
    'Open README',
  );
  if (action === 'Open README') {
    void vscode.commands.executeCommand(
      'markdown.showPreview',
      vscode.Uri.joinPath(destUri, 'README.md'),
    );
  }
}
