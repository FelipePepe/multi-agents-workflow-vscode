import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { WorkflowState, SddPhase, PhaseStatus } from '../types/index.js';

// ── vscode mock ───────────────────────────────────────────────────────────────

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

  class MockTreeItem {
    iconPath?: unknown;
    description?: string;
    contextValue?: string;
    constructor(
      public readonly label: string,
      public readonly collapsibleState?: number,
    ) {}
  }

  class MockThemeIcon {
    constructor(public readonly id: string) {}
  }

  return {
    EventEmitter: MockEventEmitter,
    TreeItem: MockTreeItem,
    TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
    ThemeIcon: MockThemeIcon,
  };
});

import { WorkflowsProvider } from './WorkflowsProvider.js';

// ── helpers ───────────────────────────────────────────────────────────────────

function buildState(changeName: string, overrides: Partial<Record<SddPhase, PhaseStatus>> = {}): WorkflowState {
  const now = new Date().toISOString();
  return {
    changeName,
    changeDir: `.ai-workflows/sdd/changes/${changeName}`,
    createdAt: now,
    updatedAt: now,
    currentPhase: 'sdd-explore',
    phases: {
      'sdd-explore':  overrides['sdd-explore']  ?? 'pending',
      'sdd-propose':  overrides['sdd-propose']  ?? 'pending',
      'sdd-spec':     overrides['sdd-spec']     ?? 'pending',
      'sdd-design':   overrides['sdd-design']   ?? 'pending',
      'sdd-tasks':    overrides['sdd-tasks']    ?? 'pending',
      'sdd-apply':    overrides['sdd-apply']    ?? 'pending',
      'sdd-verify':   overrides['sdd-verify']   ?? 'pending',
      'sdd-archive':  overrides['sdd-archive']  ?? 'pending',
    },
    verifyVerdict: null,
    reviewLoopIteration: 0,
    notes: '',
  };
}

function makeStateManager(
  changes: string[] = [],
  stateByChange: Record<string, WorkflowState | null> = {},
) {
  let stateChangeCb: ((name: string) => void) | undefined;
  return {
    listChanges: vi.fn(() => Promise.resolve(changes)),
    read: vi.fn((name: string) => Promise.resolve(stateByChange[name] ?? null)),
    onDidChangeState: (cb: (name: string) => void) => {
      stateChangeCb = cb;
      return { dispose: vi.fn() };
    },
    // helper to simulate a state change event in tests
    _fire: (name: string) => stateChangeCb?.(name),
  };
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('WorkflowsProvider', () => {
  let stateManager: ReturnType<typeof makeStateManager>;

  beforeEach(() => {
    vi.clearAllMocks();
    stateManager = makeStateManager(['feature-a', 'feature-b'], {
      'feature-a': buildState('feature-a'),
      'feature-b': buildState('feature-b'),
    });
  });

  // ── root level ──────────────────────────────────────────────────────────────

  it('getChildren(undefined) returns one item per change', async () => {
    const provider = new WorkflowsProvider(stateManager as never);
    const items = await provider.getChildren();
    expect(items).toHaveLength(2);
    expect(items[0]!.label).toBe('feature-a');
    expect(items[1]!.label).toBe('feature-b');
  });

  it('getChildren(undefined) returns empty array when no changes exist', async () => {
    stateManager = makeStateManager([], {});
    const provider = new WorkflowsProvider(stateManager as never);
    expect(await provider.getChildren()).toEqual([]);
  });

  it('root items have Collapsed state (they have children)', async () => {
    const { TreeItemCollapsibleState } = await import('vscode');
    const provider = new WorkflowsProvider(stateManager as never);
    const [item] = await provider.getChildren();
    expect(item!.collapsibleState).toBe(TreeItemCollapsibleState.Collapsed);
  });

  // ── child level (phases) ────────────────────────────────────────────────────

  it('getChildren(changeItem) returns 8 phase items', async () => {
    const provider = new WorkflowsProvider(stateManager as never);
    const [changeItem] = await provider.getChildren();
    const phases = await provider.getChildren(changeItem!);
    expect(phases).toHaveLength(8);
  });

  it('phase items appear in SDD order', async () => {
    const provider = new WorkflowsProvider(stateManager as never);
    const [changeItem] = await provider.getChildren();
    const phases = await provider.getChildren(changeItem!);
    expect(phases[0]!.label).toBe('sdd-explore');
    expect(phases[7]!.label).toBe('sdd-archive');
  });

  it('phase items have None collapsible state (no further children)', async () => {
    const { TreeItemCollapsibleState } = await import('vscode');
    const provider = new WorkflowsProvider(stateManager as never);
    const [changeItem] = await provider.getChildren();
    const phases = await provider.getChildren(changeItem!);
    expect(phases.every((p) => p.collapsibleState === TreeItemCollapsibleState.None)).toBe(true);
  });

  it('pending phase uses circle-outline icon', async () => {
    const provider = new WorkflowsProvider(stateManager as never);
    const [changeItem] = await provider.getChildren();
    const [explorItem] = await provider.getChildren(changeItem!);
    expect((explorItem!.iconPath as { id: string }).id).toBe('circle-outline');
  });

  it('in-progress phase uses sync~spin icon', async () => {
    stateManager = makeStateManager(['wip'], {
      wip: buildState('wip', { 'sdd-explore': 'in-progress' }),
    });
    const provider = new WorkflowsProvider(stateManager as never);
    const [changeItem] = await provider.getChildren();
    const [explorItem] = await provider.getChildren(changeItem!);
    expect((explorItem!.iconPath as { id: string }).id).toBe('sync~spin');
  });

  it('complete phase uses check icon', async () => {
    stateManager = makeStateManager(['done'], {
      done: buildState('done', { 'sdd-explore': 'complete' }),
    });
    const provider = new WorkflowsProvider(stateManager as never);
    const [changeItem] = await provider.getChildren();
    const [explorItem] = await provider.getChildren(changeItem!);
    expect((explorItem!.iconPath as { id: string }).id).toBe('check');
  });

  it('fail phase uses error icon', async () => {
    stateManager = makeStateManager(['broken'], {
      broken: buildState('broken', { 'sdd-explore': 'fail' }),
    });
    const provider = new WorkflowsProvider(stateManager as never);
    const [changeItem] = await provider.getChildren();
    const [explorItem] = await provider.getChildren(changeItem!);
    expect((explorItem!.iconPath as { id: string }).id).toBe('error');
  });

  it('getChildren(changeItem) returns empty when state.json is null', async () => {
    stateManager = makeStateManager(['ghost'], { ghost: null });
    const provider = new WorkflowsProvider(stateManager as never);
    const [changeItem] = await provider.getChildren();
    const phases = await provider.getChildren(changeItem!);
    expect(phases).toEqual([]);
  });

  // ── refresh ─────────────────────────────────────────────────────────────────

  it('refresh() fires onDidChangeTreeData', () => {
    const provider = new WorkflowsProvider(stateManager as never);
    const listener = vi.fn();
    provider.onDidChangeTreeData(listener);
    provider.refresh();
    expect(listener).toHaveBeenCalledOnce();
  });

  it('auto-refreshes when StateManager fires onDidChangeState', () => {
    const provider = new WorkflowsProvider(stateManager as never);
    const listener = vi.fn();
    provider.onDidChangeTreeData(listener);
    stateManager._fire('feature-a');
    expect(listener).toHaveBeenCalledOnce();
  });

  // ── getTreeItem ─────────────────────────────────────────────────────────────

  it('getTreeItem returns the element itself', async () => {
    const provider = new WorkflowsProvider(stateManager as never);
    const [item] = await provider.getChildren();
    expect(provider.getTreeItem(item!)).toBe(item);
  });
});
