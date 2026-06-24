import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── vscode mock ───────────────────────────────────────────────────────────────

const mockStat           = vi.hoisted(() => vi.fn());
const mockReadDirectory  = vi.hoisted(() => vi.fn());
const mockReadFile       = vi.hoisted(() => vi.fn());
const mockWriteFile      = vi.hoisted(() => vi.fn());
const mockCreateDir      = vi.hoisted(() => vi.fn());
const mockShowError      = vi.hoisted(() => vi.fn());
const mockShowWarning    = vi.hoisted(() => vi.fn());
const mockShowInfo       = vi.hoisted(() => vi.fn());
const mockExecuteCommand = vi.hoisted(() => vi.fn());
const mockGetConfig      = vi.hoisted(() => vi.fn());
const mockWorkspaceFolders = vi.hoisted(() => ({ value: [{ uri: { fsPath: '/workspace' } }] as typeof import('vscode').workspace.workspaceFolders }));

vi.mock('vscode', () => ({
  workspace: {
    get workspaceFolders() { return mockWorkspaceFolders.value; },
    getConfiguration: mockGetConfig,
    fs: {
      stat:            mockStat,
      readDirectory:   mockReadDirectory,
      readFile:        mockReadFile,
      writeFile:       mockWriteFile,
      createDirectory: mockCreateDir,
    },
  },
  window: {
    showErrorMessage:   mockShowError,
    showWarningMessage: mockShowWarning,
    showInformationMessage: mockShowInfo,
  },
  commands: { executeCommand: mockExecuteCommand },
  Uri: {
    joinPath: (base: { fsPath: string }, ...segs: string[]) => ({
      fsPath: [base.fsPath, ...segs].join('/'),
    }),
  },
  FileType: { Directory: 2, File: 1 },
}));

import { initWorkspace } from './initWorkspace.js';

// ── helpers ───────────────────────────────────────────────────────────────────

const EXT_URI  = { fsPath: '/ext' };
const WS_ROOT  = { fsPath: '/workspace' };

/** Default config mock: workflowsDir = '.ai-workflows' */
function defaultConfig(): void {
  mockGetConfig.mockReturnValue({
    get: (key: string, def?: unknown) =>
      key === 'workflowsDir' ? '.ai-workflows' : def,
  });
}

/**
 * Builds a flat readDirectory mock where only the extension source has files.
 * Source tree (relative to /ext/.ai-workflows):
 *   agents/          (dir)
 *     explorer.md    (file)
 *   config/          (dir)
 *     workflow.json  (file)
 */
function seedExtensionFs(): void {
  mockReadFile.mockResolvedValue(new Uint8Array(Buffer.from('file-content')));
  mockWriteFile.mockResolvedValue(undefined);
  mockCreateDir.mockResolvedValue(undefined);

  mockReadDirectory.mockImplementation(async (uri: { fsPath: string }) => {
    if (uri.fsPath === '/ext/.ai-workflows') {
      return [['agents', 2], ['config', 2]] as Array<[string, number]>;
    }
    if (uri.fsPath === '/ext/.ai-workflows/agents') {
      return [['explorer.md', 1]] as Array<[string, number]>;
    }
    if (uri.fsPath === '/ext/.ai-workflows/config') {
      return [['workflow.json', 1]] as Array<[string, number]>;
    }
    return [];
  });
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('initWorkspace', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockWorkspaceFolders.value = [{ uri: WS_ROOT }] as never;
    defaultConfig();
  });

  // ── guard: no workspace ─────────────────────────────────────────────────────

  it('shows an error and returns when no workspace folder is open', async () => {
    mockWorkspaceFolders.value = undefined as never;

    await initWorkspace(EXT_URI as never);

    expect(mockShowError).toHaveBeenCalledWith('Multi-Agents: Open a folder first.');
    expect(mockReadDirectory).not.toHaveBeenCalled();
  });

  // ── fresh install (dir does not exist) ─────────────────────────────────────

  it('copies the full .ai-workflows tree when the directory does not exist', async () => {
    mockStat.mockRejectedValue(new Error('ENOENT'));
    seedExtensionFs();
    mockShowInfo.mockResolvedValue(undefined);

    await initWorkspace(EXT_URI as never);

    // Root dir + two subdirs created
    const createdPaths = mockCreateDir.mock.calls.map((c) => (c[0] as { fsPath: string }).fsPath);
    expect(createdPaths).toContain('/workspace/.ai-workflows');
    expect(createdPaths).toContain('/workspace/.ai-workflows/agents');
    expect(createdPaths).toContain('/workspace/.ai-workflows/config');

    // Both files written to the correct destination paths
    const writtenPaths = mockWriteFile.mock.calls.map((c) => (c[0] as { fsPath: string }).fsPath);
    expect(writtenPaths).toContain('/workspace/.ai-workflows/agents/explorer.md');
    expect(writtenPaths).toContain('/workspace/.ai-workflows/config/workflow.json');
  });

  it('reads every source file from the extension directory, not the workspace', async () => {
    mockStat.mockRejectedValue(new Error('ENOENT'));
    seedExtensionFs();
    mockShowInfo.mockResolvedValue(undefined);

    await initWorkspace(EXT_URI as never);

    const readPaths = mockReadFile.mock.calls.map((c) => (c[0] as { fsPath: string }).fsPath);
    expect(readPaths.every((p) => p.startsWith('/ext/'))).toBe(true);
  });

  it('shows a success notification after copying', async () => {
    mockStat.mockRejectedValue(new Error('ENOENT'));
    seedExtensionFs();
    mockShowInfo.mockResolvedValue(undefined);

    await initWorkspace(EXT_URI as never);

    expect(mockShowInfo).toHaveBeenCalledOnce();
    expect((mockShowInfo.mock.calls[0] as string[])[0]).toContain('.ai-workflows');
  });

  it('opens the README preview when the user clicks "Open README"', async () => {
    mockStat.mockRejectedValue(new Error('ENOENT'));
    seedExtensionFs();
    mockShowInfo.mockResolvedValue('Open README');

    await initWorkspace(EXT_URI as never);

    expect(mockExecuteCommand).toHaveBeenCalledWith(
      'markdown.showPreview',
      expect.objectContaining({ fsPath: '/workspace/.ai-workflows/README.md' }),
    );
  });

  // ── directory already exists ────────────────────────────────────────────────

  it('prompts for confirmation when the directory already exists', async () => {
    mockStat.mockResolvedValue({ type: 2 }); // directory exists
    mockShowWarning.mockResolvedValue(undefined); // user dismisses

    await initWorkspace(EXT_URI as never);

    expect(mockShowWarning).toHaveBeenCalledOnce();
    expect((mockShowWarning.mock.calls[0] as string[])[0]).toContain('already exists');
  });

  it('aborts without copying when the user dismisses the overwrite prompt', async () => {
    mockStat.mockResolvedValue({ type: 2 });
    mockShowWarning.mockResolvedValue(undefined); // dismissed (not 'Overwrite')

    await initWorkspace(EXT_URI as never);

    expect(mockWriteFile).not.toHaveBeenCalled();
    expect(mockCreateDir).not.toHaveBeenCalled();
  });

  it('copies when the user confirms overwrite', async () => {
    mockStat.mockResolvedValue({ type: 2 });
    mockShowWarning.mockResolvedValue('Overwrite');
    seedExtensionFs();
    mockShowInfo.mockResolvedValue(undefined);

    await initWorkspace(EXT_URI as never);

    expect(mockWriteFile).toHaveBeenCalled();
  });

  // ── custom workflowsDir ─────────────────────────────────────────────────────

  it('uses the workflowsDir setting rather than a hardcoded path', async () => {
    mockGetConfig.mockReturnValue({
      get: (key: string, def?: unknown) => key === 'workflowsDir' ? 'my-custom-dir' : def,
    });
    mockStat.mockRejectedValue(new Error('ENOENT'));
    seedExtensionFs();
    mockShowInfo.mockResolvedValue(undefined);

    await initWorkspace(EXT_URI as never);

    const createdPaths = mockCreateDir.mock.calls.map((c) => (c[0] as { fsPath: string }).fsPath);
    expect(createdPaths.some((p) => p.includes('my-custom-dir'))).toBe(true);
    expect(createdPaths.some((p) => p.includes('.ai-workflows'))).toBe(false);
  });

  // ── copy failure ─────────────────────────────────────────────────────────────

  it('shows an error and does not show success when the copy fails', async () => {
    mockStat.mockRejectedValue(new Error('ENOENT'));
    mockCreateDir.mockRejectedValue(new Error('Permission denied'));

    await initWorkspace(EXT_URI as never);

    expect(mockShowError).toHaveBeenCalledOnce();
    expect((mockShowError.mock.calls[0] as string[])[0]).toContain('Failed to initialize');
    expect(mockShowInfo).not.toHaveBeenCalled();
  });
});
