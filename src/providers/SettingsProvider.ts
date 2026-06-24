import * as vscode from 'vscode';

type SettingsMessage =
  | { type: 'save'; ollamaBaseUrl: string; workflowsDir: string; maxConcurrentAgents: number }
  | { type: 'ready' };

function getHtml(
  webview: vscode.Webview,
  ollamaBaseUrl: string,
  workflowsDir: string,
  maxConcurrentAgents: number,
): string {
  const nonce = crypto.randomUUID().replace(/-/g, '');
  const csp = [
    `default-src 'none'`,
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `script-src 'nonce-${nonce}'`,
  ].join('; ');

  return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
      padding: 12px;
      margin: 0;
    }
    label {
      display: block;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 4px;
    }
    input[type="text"], input[type="number"] {
      width: 100%;
      box-sizing: border-box;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, transparent);
      padding: 4px 6px;
      font-family: inherit;
      font-size: inherit;
      border-radius: 2px;
      outline: none;
    }
    input:focus {
      border-color: var(--vscode-focusBorder);
    }
    .field { margin-bottom: 14px; }
    .hint {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      margin-top: 3px;
    }
    button {
      width: 100%;
      padding: 6px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 2px;
      font-family: inherit;
      font-size: inherit;
      cursor: pointer;
      margin-top: 4px;
    }
    button:hover { background: var(--vscode-button-hoverBackground); }
    #status {
      font-size: 11px;
      text-align: center;
      margin-top: 8px;
      height: 16px;
      color: var(--vscode-notificationsInfoIcon-foreground);
    }
  </style>
</head>
<body>
  <div class="field">
    <label for="ollamaBaseUrl">Ollama Base URL</label>
    <input type="text" id="ollamaBaseUrl" value="${escapeHtml(ollamaBaseUrl)}" />
    <div class="hint">e.g. http://localhost:11434</div>
  </div>
  <div class="field">
    <label for="workflowsDir">Workflows Directory</label>
    <input type="text" id="workflowsDir" value="${escapeHtml(workflowsDir)}" />
    <div class="hint">Relative to workspace root</div>
  </div>
  <div class="field">
    <label for="maxConcurrentAgents">Max Concurrent Agents</label>
    <input type="number" id="maxConcurrentAgents" min="1" max="10" value="${maxConcurrentAgents}" />
  </div>
  <button id="save">Save</button>
  <div id="status"></div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const status = document.getElementById('status');

    document.getElementById('save').addEventListener('click', () => {
      const url = document.getElementById('ollamaBaseUrl').value.trim();
      const dir = document.getElementById('workflowsDir').value.trim();
      const max = parseInt(document.getElementById('maxConcurrentAgents').value, 10);
      if (!url || !dir || isNaN(max) || max < 1) {
        status.textContent = 'Please fill all fields correctly.';
        return;
      }
      vscode.postMessage({ type: 'save', ollamaBaseUrl: url, workflowsDir: dir, maxConcurrentAgents: max });
    });

    window.addEventListener('message', (e) => {
      if (e.data?.type === 'saved') {
        status.textContent = 'Settings saved.';
        setTimeout(() => { status.textContent = ''; }, 2000);
      }
    });

    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export class SettingsProvider implements vscode.WebviewViewProvider {
  static readonly viewId = 'multi-agents.settingsView';

  private _view?: vscode.WebviewView;

  resolveWebviewView(view: vscode.WebviewView): void {
    this._view = view;
    view.webview.options = { enableScripts: true };
    this._render();

    view.webview.onDidReceiveMessage((msg: SettingsMessage) => {
      if (msg.type === 'save') {
        const config = vscode.workspace.getConfiguration('multi-agents');
        Promise.all([
          config.update('ollamaBaseUrl', msg.ollamaBaseUrl, vscode.ConfigurationTarget.Workspace),
          config.update('workflowsDir', msg.workflowsDir, vscode.ConfigurationTarget.Workspace),
          config.update('maxConcurrentAgents', msg.maxConcurrentAgents, vscode.ConfigurationTarget.Workspace),
        ]).then(() => {
          view.webview.postMessage({ type: 'saved' });
        }, (err: unknown) => {
          vscode.window.showErrorMessage(`Failed to save settings: ${String(err)}`);
        });
      }
    });

    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('multi-agents')) this._render();
    });
  }

  private _render(): void {
    if (!this._view) return;
    const config = vscode.workspace.getConfiguration('multi-agents');
    this._view.webview.html = getHtml(
      this._view.webview,
      config.get<string>('ollamaBaseUrl', 'http://localhost:11434'),
      config.get<string>('workflowsDir', '.ai-workflows'),
      config.get<number>('maxConcurrentAgents', 3),
    );
  }
}
