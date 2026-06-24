import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentRegistry } from '../agents/AgentRegistry.js';

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

  return {
    EventEmitter: MockEventEmitter,
    TreeItem: MockTreeItem,
    TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
  };
});

import { AgentsProvider } from './AgentsProvider.js';

// ── tests ─────────────────────────────────────────────────────────────────────

describe('AgentsProvider', () => {
  let registry: AgentRegistry;

  beforeEach(() => {
    registry = new AgentRegistry();
  });

  // ── empty state ─────────────────────────────────────────────────────────────

  it('returns a single "(none running)" item when the registry is empty', () => {
    const provider = new AgentsProvider(registry);
    const items = provider.getChildren();
    expect(items).toHaveLength(1);
    expect(items[0]!.label).toBe('(none running)');
  });

  it('the "(none running)" item has contextValue "none"', () => {
    const provider = new AgentsProvider(registry);
    const [item] = provider.getChildren();
    expect(item!.contextValue).toBe('none');
  });

  // ── agents running ──────────────────────────────────────────────────────────

  it('returns one item per running agent', () => {
    registry.register('change-a:explorer', new AbortController());
    registry.register('change-b:verifier', new AbortController());
    const provider = new AgentsProvider(registry);
    expect(provider.getChildren()).toHaveLength(2);
  });

  it('item label equals the registry key', () => {
    registry.register('my-change:spec', new AbortController());
    const provider = new AgentsProvider(registry);
    const [item] = provider.getChildren();
    expect(item!.label).toBe('my-change:spec');
  });

  it('running agent items have "Running..." as description', () => {
    registry.register('my-change:tester', new AbortController());
    const provider = new AgentsProvider(registry);
    const [item] = provider.getChildren();
    expect(item!.description).toBe('Running...');
  });

  it('does not show "(none running)" when agents are running', () => {
    registry.register('x:implementer', new AbortController());
    const provider = new AgentsProvider(registry);
    const items = provider.getChildren();
    expect(items.some((i) => i.label === '(none running)')).toBe(false);
  });

  // ── refresh ─────────────────────────────────────────────────────────────────

  it('refresh() fires onDidChangeTreeData', () => {
    const provider = new AgentsProvider(registry);
    const listener = vi.fn();
    provider.onDidChangeTreeData(listener);
    provider.refresh();
    expect(listener).toHaveBeenCalledOnce();
  });

  it('after refresh(), getChildren reflects registry changes', () => {
    const provider = new AgentsProvider(registry);
    expect(provider.getChildren()).toHaveLength(1); // "(none running)"

    registry.register('new-change:design', new AbortController());
    provider.refresh();

    expect(provider.getChildren()).toHaveLength(1); // now 1 real agent
    expect(provider.getChildren()[0]!.label).toBe('new-change:design');
  });

  // ── getTreeItem ─────────────────────────────────────────────────────────────

  it('getTreeItem returns the element itself', () => {
    const provider = new AgentsProvider(registry);
    const [item] = provider.getChildren();
    expect(provider.getTreeItem(item!)).toBe(item);
  });
});
