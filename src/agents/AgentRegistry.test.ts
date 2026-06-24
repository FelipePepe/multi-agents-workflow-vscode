import { describe, it, expect, beforeEach } from 'vitest';
import { AgentRegistry } from './AgentRegistry.js';

describe('AgentRegistry', () => {
  let registry: AgentRegistry;

  beforeEach(() => {
    registry = new AgentRegistry();
  });

  it('starts empty', () => {
    expect(registry.getAll()).toEqual([]);
  });

  it('registers an agent and returns it in getAll', () => {
    const ctrl = new AbortController();
    registry.register('my-change:explorer', ctrl);
    expect(registry.getAll()).toEqual([{ key: 'my-change:explorer' }]);
  });

  it('unregisters an agent', () => {
    const ctrl = new AbortController();
    registry.register('my-change:explorer', ctrl);
    registry.unregister('my-change:explorer');
    expect(registry.getAll()).toEqual([]);
  });

  it('abortAll aborts every registered controller and returns the count', () => {
    const ctrl1 = new AbortController();
    const ctrl2 = new AbortController();
    registry.register('change-a:spec', ctrl1);
    registry.register('change-b:verifier', ctrl2);

    const count = registry.abortAll();

    expect(count).toBe(2);
    expect(ctrl1.signal.aborted).toBe(true);
    expect(ctrl2.signal.aborted).toBe(true);
  });

  it('abortAll clears the registry', () => {
    registry.register('x:explorer', new AbortController());
    registry.abortAll();
    expect(registry.getAll()).toEqual([]);
  });

  it('abortAll returns 0 when nothing is running', () => {
    expect(registry.abortAll()).toBe(0);
  });

  it('unregister is a no-op for unknown keys', () => {
    expect(() => registry.unregister('nonexistent')).not.toThrow();
  });
});
