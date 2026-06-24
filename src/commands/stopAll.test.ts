import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentRegistry } from '../agents/AgentRegistry.js';

// ── vscode mock ───────────────────────────────────────────────────────────────

const mockShowInfo = vi.hoisted(() => vi.fn());

vi.mock('vscode', () => ({
  window: { showInformationMessage: mockShowInfo },
}));

import { stopAll } from './stopAll.js';

// ── tests ─────────────────────────────────────────────────────────────────────

describe('stopAll', () => {
  let registry: AgentRegistry;

  beforeEach(() => {
    vi.resetAllMocks();
    registry = new AgentRegistry();
  });

  function makeProvider() {
    return { refresh: vi.fn() };
  }

  it('calls registry.abortAll()', async () => {
    const spy = vi.spyOn(registry, 'abortAll');
    await stopAll(registry, makeProvider() as never);
    expect(spy).toHaveBeenCalledOnce();
  });

  it('shows info message "Stopped 0 agent(s)" when nothing was running', async () => {
    await stopAll(registry, makeProvider() as never);
    expect(mockShowInfo).toHaveBeenCalledWith('Multi-Agents: Stopped 0 agent(s).');
  });

  it('shows correct count when agents were running', async () => {
    registry.register('a:explorer', new AbortController());
    registry.register('b:verifier', new AbortController());

    await stopAll(registry, makeProvider() as never);

    expect(mockShowInfo).toHaveBeenCalledWith('Multi-Agents: Stopped 2 agent(s).');
  });

  it('calls agentsProvider.refresh() after aborting', async () => {
    const provider = makeProvider();
    await stopAll(registry, provider as never);
    expect(provider.refresh).toHaveBeenCalledOnce();
  });

  it('aborts all registered controllers', async () => {
    const ctrl1 = new AbortController();
    const ctrl2 = new AbortController();
    registry.register('x:spec', ctrl1);
    registry.register('y:tester', ctrl2);

    await stopAll(registry, makeProvider() as never);

    expect(ctrl1.signal.aborted).toBe(true);
    expect(ctrl2.signal.aborted).toBe(true);
  });
});
