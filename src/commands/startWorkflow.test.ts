import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── vscode mock ───────────────────────────────────────────────────────────────

const mockShowInputBox    = vi.hoisted(() => vi.fn<any, Promise<string | undefined>>());
const mockShowError       = vi.hoisted(() => vi.fn());
const mockShowInfo        = vi.hoisted(() => vi.fn());

vi.mock('vscode', () => ({
  window: {
    showInputBox:      mockShowInputBox,
    showErrorMessage:  mockShowError,
    showInformationMessage: mockShowInfo,
  },
}));

import { startWorkflow } from './startWorkflow.js';

// ── helpers ───────────────────────────────────────────────────────────────────

function makeStateManager(existsResult = false) {
  return {
    exists: vi.fn(() => Promise.resolve(existsResult)),
    create: vi.fn(() => Promise.resolve({ changeName: 'test', phases: {} })),
  };
}

function makeOrchestrator() {
  return { run: vi.fn(() => Promise.resolve()) };
}

function makeWorkflowsProvider() {
  return { refresh: vi.fn() };
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('startWorkflow', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  // ── input validation ────────────────────────────────────────────────────────

  it('does nothing when user cancels the input box', async () => {
    mockShowInputBox.mockResolvedValue(undefined);
    const sm = makeStateManager();
    const orchestrator = makeOrchestrator();
    const provider = makeWorkflowsProvider();

    await startWorkflow(sm as never, orchestrator as never, provider as never);

    expect(sm.create).not.toHaveBeenCalled();
    expect(orchestrator.run).not.toHaveBeenCalled();
  });

  it('accepts valid kebab-case names', async () => {
    mockShowInputBox.mockResolvedValue('my-feature-change');
    const sm = makeStateManager();
    const orchestrator = makeOrchestrator();

    await startWorkflow(sm as never, orchestrator as never, makeWorkflowsProvider() as never);

    expect(sm.create).toHaveBeenCalledWith('my-feature-change');
  });

  it('showInputBox validateInput rejects non-kebab-case names', async () => {
    mockShowInputBox.mockImplementation(async (opts: { validateInput?: (v: string) => string | null }) => {
      const err = opts.validateInput?.('My Feature!');
      expect(err).toBeTruthy();
      return undefined;
    });

    await startWorkflow(makeStateManager() as never, makeOrchestrator() as never, makeWorkflowsProvider() as never);
    expect(mockShowInputBox).toHaveBeenCalledOnce();
  });

  it('showInputBox validateInput accepts valid kebab-case', async () => {
    mockShowInputBox.mockImplementation(async (opts: { validateInput?: (v: string) => string | null }) => {
      const err = opts.validateInput?.('valid-name-123');
      expect(err).toBeNull();
      return undefined;
    });

    await startWorkflow(makeStateManager() as never, makeOrchestrator() as never, makeWorkflowsProvider() as never);
  });

  it('showInputBox validateInput rejects names longer than 64 chars', async () => {
    mockShowInputBox.mockImplementation(async (opts: { validateInput?: (v: string) => string | null }) => {
      const err = opts.validateInput?.('a'.repeat(65));
      expect(err).toBeTruthy();
      return undefined;
    });

    await startWorkflow(makeStateManager() as never, makeOrchestrator() as never, makeWorkflowsProvider() as never);
  });

  it('showInputBox validateInput accepts names exactly 64 chars', async () => {
    mockShowInputBox.mockImplementation(async (opts: { validateInput?: (v: string) => string | null }) => {
      const err = opts.validateInput?.('a'.repeat(64));
      expect(err).toBeNull();
      return undefined;
    });

    await startWorkflow(makeStateManager() as never, makeOrchestrator() as never, makeWorkflowsProvider() as never);
  });

  // ── duplicate guard ─────────────────────────────────────────────────────────

  it('shows an error and aborts when a change with that name already exists', async () => {
    mockShowInputBox.mockResolvedValue('existing-change');
    const sm = makeStateManager(true); // exists = true

    await startWorkflow(sm as never, makeOrchestrator() as never, makeWorkflowsProvider() as never);

    expect(mockShowError).toHaveBeenCalledOnce();
    expect(sm.create).not.toHaveBeenCalled();
  });

  // ── happy path ──────────────────────────────────────────────────────────────

  it('creates state, refreshes provider, and starts the workflow', async () => {
    mockShowInputBox.mockResolvedValue('new-feature');
    const sm = makeStateManager(false);
    const orchestrator = makeOrchestrator();
    const provider = makeWorkflowsProvider();

    await startWorkflow(sm as never, orchestrator as never, provider as never);

    expect(sm.create).toHaveBeenCalledWith('new-feature');
    expect(provider.refresh).toHaveBeenCalledOnce();
    expect(orchestrator.run).toHaveBeenCalledOnce();
  });

  it('passes the change name to the orchestrator', async () => {
    mockShowInputBox.mockResolvedValue('new-feature');
    const sm = makeStateManager(false);
    const orchestrator = makeOrchestrator();

    await startWorkflow(sm as never, orchestrator as never, makeWorkflowsProvider() as never);

    expect(orchestrator.run).toHaveBeenCalledWith('new-feature');
  });

  it('provider.refresh() is called before orchestrator.run()', async () => {
    mockShowInputBox.mockResolvedValue('new-feature');
    const sm = makeStateManager(false);
    const callOrder: string[] = [];
    const orchestrator = { run: vi.fn(() => { callOrder.push('run'); return Promise.resolve(); }) };
    const provider = { refresh: vi.fn(() => { callOrder.push('refresh'); }) };

    await startWorkflow(sm as never, orchestrator as never, provider as never);

    expect(callOrder).toEqual(['refresh', 'run']);
  });
});
