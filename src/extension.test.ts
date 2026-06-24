import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── vscode mock ───────────────────────────────────────────────────────────────

const mockRegisterTreeDataProvider = vi.hoisted(() => vi.fn(() => ({ dispose: vi.fn() })));
const mockRegisterCommand           = vi.hoisted(() => vi.fn(() => ({ dispose: vi.fn() })));
const mockExecuteCommand            = vi.hoisted(() => vi.fn());
const mockShowInfo                  = vi.hoisted(() => vi.fn());
const mockGetConfig                 = vi.hoisted(() => vi.fn());

vi.mock('vscode', () => ({
  workspace: {
    workspaceFolders: [{ uri: { fsPath: '/workspace' } }],
    getConfiguration: mockGetConfig,
    createFileSystemWatcher: vi.fn(() => ({
      onDidChange: vi.fn(() => ({ dispose: vi.fn() })),
      onDidCreate: vi.fn(() => ({ dispose: vi.fn() })),
      onDidDelete: vi.fn(() => ({ dispose: vi.fn() })),
      dispose: vi.fn(),
    })),
    fs: {
      readFile: vi.fn(), writeFile: vi.fn(), createDirectory: vi.fn(),
      rename: vi.fn(), readDirectory: vi.fn(), stat: vi.fn(), delete: vi.fn(),
    },
  },
  window: {
    showInformationMessage: mockShowInfo,
    registerTreeDataProvider: mockRegisterTreeDataProvider,
    registerWebviewViewProvider: vi.fn(() => ({ dispose: vi.fn() })),
    createOutputChannel: vi.fn(() => ({ append: vi.fn(), appendLine: vi.fn(), show: vi.fn(), dispose: vi.fn() })),
  },
  commands: {
    registerCommand: mockRegisterCommand,
    executeCommand: mockExecuteCommand,
  },
  EventEmitter: class {
    private cbs: Array<(v: unknown) => void> = [];
    readonly event = (cb: (v: unknown) => void) => {
      this.cbs.push(cb);
      return { dispose: () => undefined };
    };
    fire(v: unknown): void { this.cbs.forEach((c) => c(v)); }
    dispose(): void { this.cbs = []; }
  },
  Uri: {
    joinPath: (base: { fsPath: string }, ...segs: string[]) => ({
      fsPath: [base.fsPath, ...segs].join('/'),
    }),
  },
  FileType: { Directory: 2, File: 1 },
  ThemeIcon: class { constructor(public id: string) {} },
  TreeItem: class {
    description?: string; iconPath?: unknown; contextValue?: string;
    constructor(public label: string, public collapsibleState?: number) {}
  },
  TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
}));

import * as vscode from 'vscode';
import { activate, deactivate } from './extension.js';

// ── helpers ───────────────────────────────────────────────────────────────────

function makeWatcher() {
  return {
    onDidChange: vi.fn(() => ({ dispose: vi.fn() })),
    onDidCreate: vi.fn(() => ({ dispose: vi.fn() })),
    onDidDelete: vi.fn(() => ({ dispose: vi.fn() })),
    dispose: vi.fn(),
  };
}

function makeContext() {
  const subscriptions: Array<{ dispose: () => void }> = [];
  return {
    subscriptions,
    extensionPath: '/ext',
    extensionUri: { fsPath: '/ext' },
  } as unknown as vscode.ExtensionContext;
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('extension', () => {
  beforeEach(() => {
    vi.resetAllMocks();

    mockGetConfig.mockReturnValue({
      get: (key: string, def?: unknown) => {
        if (key === 'workflowsDir') return '.ai-workflows';
        if (key === 'ollamaBaseUrl') return 'http://localhost:11434';
        return def;
      },
    });

    // Restore createFileSystemWatcher and workspaceFolders after reset
    vi.mocked(vscode.workspace.createFileSystemWatcher).mockReturnValue(makeWatcher() as never);
    vi.mocked(vscode.workspace).workspaceFolders = [{ uri: { fsPath: '/workspace' } }] as never;
  });

  // ── no-workspace guard ──────────────────────────────────────────────────────

  it('shows info message and returns early when no workspaceFolders', () => {
    vi.mocked(vscode.workspace).workspaceFolders = undefined as never;

    const ctx = makeContext();
    activate(ctx);

    expect(mockShowInfo).toHaveBeenCalledWith('Multi-Agents: Open a folder first.');
    expect(mockRegisterCommand).not.toHaveBeenCalled();
    expect(mockRegisterTreeDataProvider).not.toHaveBeenCalled();
  });

  // ── command registration ────────────────────────────────────────────────────

  it('registers multi-agents.startWorkflow command', () => {
    activate(makeContext());
    const ids = mockRegisterCommand.mock.calls.map((c) => (c as unknown[])[0] as string);
    expect(ids).toContain('multi-agents.startWorkflow');
  });

  it('registers multi-agents.showPanel command', () => {
    activate(makeContext());
    const ids = mockRegisterCommand.mock.calls.map((c) => (c as unknown[])[0] as string);
    expect(ids).toContain('multi-agents.showPanel');
  });

  it('registers multi-agents.stopAll command', () => {
    activate(makeContext());
    const ids = mockRegisterCommand.mock.calls.map((c) => (c as unknown[])[0] as string);
    expect(ids).toContain('multi-agents.stopAll');
  });

  // ── tree provider registration ──────────────────────────────────────────────

  it('registers multi-agents.workflowsView tree provider', () => {
    activate(makeContext());
    const ids = mockRegisterTreeDataProvider.mock.calls.map((c) => (c as unknown[])[0] as string);
    expect(ids).toContain('multi-agents.workflowsView');
  });

  it('registers multi-agents.agentsView tree provider', () => {
    activate(makeContext());
    const ids = mockRegisterTreeDataProvider.mock.calls.map((c) => (c as unknown[])[0] as string);
    expect(ids).toContain('multi-agents.agentsView');
  });

  // ── subscriptions ───────────────────────────────────────────────────────────

  it('pushes all registrations to context.subscriptions', () => {
    const ctx = makeContext();
    activate(ctx);
    expect(ctx.subscriptions.length).toBeGreaterThanOrEqual(6);
  });

  it('registers multi-agents.chatView webview provider', () => {
    activate(makeContext());
    const ids = (vi.mocked(vscode.window.registerWebviewViewProvider) as ReturnType<typeof vi.fn>)
      .mock.calls.map((c: unknown[]) => c[0] as string);
    expect(ids).toContain('multi-agents.chatView');
  });

  // ── showPanel command ───────────────────────────────────────────────────────

  it('showPanel command calls executeCommand for the sidebar', () => {
    activate(makeContext());
    const showPanelCall = mockRegisterCommand.mock.calls.find((c) => (c as unknown[])[0] === 'multi-agents.showPanel');
    const handler = (showPanelCall as unknown[] | undefined)?.[1] as (() => void) | undefined;
    handler?.();
    expect(mockExecuteCommand).toHaveBeenCalledWith('workbench.view.extension.multi-agents');
  });

  // ── deactivate ──────────────────────────────────────────────────────────────

  it('exports a deactivate function', () => {
    expect(typeof deactivate).toBe('function');
  });

  it('deactivate() does not throw', () => {
    expect(() => deactivate()).not.toThrow();
  });
});
