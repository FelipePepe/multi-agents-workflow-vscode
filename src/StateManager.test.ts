import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { WorkflowState } from './types/index.js';

// ── vscode mock ───────────────────────────────────────────────────────────────

const mockFs = vi.hoisted(() => ({
  readFile:        vi.fn(),
  writeFile:       vi.fn(),
  createDirectory: vi.fn(),
  rename:          vi.fn(),
  readDirectory:   vi.fn(),
  stat:            vi.fn(),
}));

vi.mock('vscode', () => {
  class MockEventEmitter<T> {
    private cbs: Array<(v: T) => void> = [];
    readonly event = (cb: (v: T) => void) => {
      this.cbs.push(cb);
      return { dispose: () => { this.cbs = this.cbs.filter((c) => c !== cb); } };
    };
    fire(v: T): void { this.cbs.forEach((c) => c(v)); }
    dispose(): void { this.cbs = []; }
  }

  return {
    EventEmitter: MockEventEmitter,
    Uri: {
      joinPath: (base: { fsPath: string }, ...segs: string[]) => ({
        fsPath: [base.fsPath, ...segs].join('/'),
        toString: () => [base.fsPath, ...segs].join('/'),
      }),
    },
    workspace: {
      fs: mockFs,
      createFileSystemWatcher: vi.fn(() => ({
        onDidChange: vi.fn(() => ({ dispose: vi.fn() })),
        onDidCreate: vi.fn(() => ({ dispose: vi.fn() })),
        onDidDelete: vi.fn(() => ({ dispose: vi.fn() })),
        dispose: vi.fn(),
      })),
    },
    FileType: { Unknown: 0, File: 1, Directory: 2, SymbolicLink: 64 },
  };
});

import { workspace } from 'vscode';
import { StateManager } from './StateManager.js';

// ── helpers ───────────────────────────────────────────────────────────────────

const ROOT = { fsPath: '/workspace' } as { fsPath: string };
const WORKFLOWS_DIR = '.ai-workflows';

function makeWatcherMock() {
  return {
    onDidChange: vi.fn(() => ({ dispose: vi.fn() })),
    onDidCreate: vi.fn(() => ({ dispose: vi.fn() })),
    onDidDelete: vi.fn(() => ({ dispose: vi.fn() })),
    dispose: vi.fn(),
  };
}

function makeManager() {
  return new StateManager(ROOT as never, WORKFLOWS_DIR);
}

function fileNotFoundError() {
  const e = new Error('FileNotFound') as Error & { code: string };
  e.code = 'FileNotFound';
  return e;
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('StateManager', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // createFileSystemWatcher is called in the constructor — restore after each reset
    vi.mocked(workspace.createFileSystemWatcher).mockReturnValue(
      makeWatcherMock() as never,
    );
  });

  describe('read()', () => {
    it('returns null when state.json does not exist', async () => {
      mockFs.readFile.mockRejectedValue(fileNotFoundError());
      const manager = makeManager();
      const result = await manager.read('my-change');
      expect(result).toBeNull();
    });

    it('returns parsed state when file exists', async () => {
      const state: WorkflowState = buildState('my-change');
      mockFs.readFile.mockResolvedValue(
        Buffer.from(JSON.stringify(state)) as unknown as Uint8Array,
      );
      const manager = makeManager();
      const result = await manager.read('my-change');
      expect(result?.changeName).toBe('my-change');
      expect(result?.currentPhase).toBe('sdd-explore');
    });
  });

  describe('create()', () => {
    beforeEach(() => {
      mockFs.createDirectory.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.rename.mockResolvedValue(undefined);
    });

    it('creates state with all phases pending', async () => {
      const manager = makeManager();
      const state = await manager.create('new-feature');

      expect(state.changeName).toBe('new-feature');
      expect(state.currentPhase).toBe('sdd-explore');
      expect(state.verifyVerdict).toBeNull();
      expect(state.reviewLoopIteration).toBe(0);

      const phases = Object.values(state.phases);
      expect(phases).toHaveLength(8);
      expect(phases.every((s) => s === 'pending')).toBe(true);
    });

    it('includes all 8 SDD phase keys', async () => {
      const manager = makeManager();
      const state = await manager.create('new-feature');
      const keys = Object.keys(state.phases);
      expect(keys).toContain('sdd-explore');
      expect(keys).toContain('sdd-archive');
      expect(keys).toHaveLength(8);
    });

    it('uses atomic write: writeFile to .tmp then rename', async () => {
      const manager = makeManager();
      await manager.create('my-change');

      const writtenPath = (mockFs.writeFile.mock.calls[0]?.[0] as { fsPath: string })?.fsPath;
      expect(writtenPath).toMatch(/state\.json\.tmp$/);

      const renameSrc = (mockFs.rename.mock.calls[0]?.[0] as { fsPath: string })?.fsPath;
      const renameDst = (mockFs.rename.mock.calls[0]?.[1] as { fsPath: string })?.fsPath;
      expect(renameSrc).toMatch(/state\.json\.tmp$/);
      expect(renameDst).toMatch(/state\.json$/);
      expect(renameDst).not.toMatch(/\.tmp$/);
    });
  });

  describe('write()', () => {
    beforeEach(() => {
      mockFs.createDirectory.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.rename.mockResolvedValue(undefined);
    });

    it('updates updatedAt on every write', async () => {
      const manager = makeManager();
      const original = buildState('my-change');
      const before = new Date(original.updatedAt).getTime();

      await new Promise((r) => setTimeout(r, 5)); // ensure time advances
      await manager.write(original);

      const written = JSON.parse(
        Buffer.from(mockFs.writeFile.mock.calls[0]![1] as Uint8Array).toString('utf8'),
      ) as WorkflowState;

      expect(new Date(written.updatedAt).getTime()).toBeGreaterThan(before);
    });
  });

  describe('exists()', () => {
    it('returns true when stat succeeds', async () => {
      mockFs.stat.mockResolvedValue({ type: 1 });
      const manager = makeManager();
      expect(await manager.exists('my-change')).toBe(true);
    });

    it('returns false when stat throws', async () => {
      mockFs.stat.mockRejectedValue(fileNotFoundError());
      const manager = makeManager();
      expect(await manager.exists('my-change')).toBe(false);
    });
  });

  describe('list()', () => {
    it('returns full WorkflowState objects sorted by updatedAt descending', async () => {
      const older = { ...buildState('older'), updatedAt: '2026-06-23T10:00:00Z' };
      const newer = { ...buildState('newer'), updatedAt: '2026-06-24T10:00:00Z' };

      mockFs.readDirectory.mockResolvedValue([['older', 2], ['newer', 2]]);
      mockFs.readFile.mockImplementation((uri: unknown) => {
        const p = (uri as { fsPath: string }).fsPath;
        if (p.includes('older')) return Promise.resolve(Buffer.from(JSON.stringify(older)) as unknown as Uint8Array);
        return Promise.resolve(Buffer.from(JSON.stringify(newer)) as unknown as Uint8Array);
      });

      const result = await makeManager().list();

      expect(result).toHaveLength(2);
      expect(result[0]!.changeName).toBe('newer');
      expect(result[1]!.changeName).toBe('older');
    });

    it('skips entries whose state.json cannot be read', async () => {
      mockFs.readDirectory.mockResolvedValue([['good', 2], ['bad', 2]]);
      mockFs.readFile.mockImplementation((uri: unknown) => {
        const p = (uri as { fsPath: string }).fsPath;
        if (p.includes('good'))
          return Promise.resolve(Buffer.from(JSON.stringify(buildState('good'))) as unknown as Uint8Array);
        return Promise.reject(fileNotFoundError());
      });

      const result = await makeManager().list();

      expect(result).toHaveLength(1);
      expect(result[0]!.changeName).toBe('good');
    });

    it('returns empty array when no changes exist', async () => {
      mockFs.readDirectory.mockRejectedValue(fileNotFoundError());
      expect(await makeManager().list()).toEqual([]);
    });
  });

  describe('delete()', () => {
    it('deletes the change directory recursively', async () => {
      const mockDelete = vi.fn().mockResolvedValue(undefined);
      (mockFs as unknown as Record<string, unknown>)['delete'] = mockDelete;

      const manager = makeManager();
      await manager.delete('my-change');

      expect(mockDelete).toHaveBeenCalledOnce();
      const [uri, opts] = mockDelete.mock.calls[0]!;
      expect((uri as { fsPath: string }).fsPath).toContain('my-change');
      expect((opts as { recursive: boolean }).recursive).toBe(true);

      delete (mockFs as unknown as Record<string, unknown>)['delete'];
    });
  });

  describe('listChanges()', () => {
    it('returns names of Directory entries', async () => {
      mockFs.readDirectory.mockResolvedValue([
        ['feature-a', 2],
        ['feature-b', 2],
        ['some-file.json', 1],
      ]);
      const manager = makeManager();
      const result = await manager.listChanges();
      expect(result).toEqual(['feature-a', 'feature-b']);
    });

    it('returns empty array when changes dir does not exist', async () => {
      mockFs.readDirectory.mockRejectedValue(fileNotFoundError());
      const manager = makeManager();
      expect(await manager.listChanges()).toEqual([]);
    });
  });
});

// ── fixture ───────────────────────────────────────────────────────────────────

function buildState(changeName: string): WorkflowState {
  const now = new Date().toISOString();
  return {
    changeName,
    changeDir: `.ai-workflows/sdd/changes/${changeName}`,
    createdAt: now,
    updatedAt: now,
    currentPhase: 'sdd-explore',
    phases: {
      'sdd-explore': 'pending', 'sdd-propose': 'pending',
      'sdd-spec': 'pending',    'sdd-design': 'pending',
      'sdd-tasks': 'pending',   'sdd-apply': 'pending',
      'sdd-verify': 'pending',  'sdd-archive': 'pending',
    },
    verifyVerdict: null,
    reviewLoopIteration: 0,
    notes: '',
  };
}
