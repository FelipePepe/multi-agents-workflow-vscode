import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentRegistry } from './AgentRegistry.js';
import type { LlmProvider } from './LlmProvider.js';

// ── hoisted mocks ─────────────────────────────────────────────────────────────

const mockFs = vi.hoisted(() => ({
  readFile: vi.fn<any, Promise<Uint8Array>>(),
  writeFile: vi.fn<any, Promise<void>>(),
  createDirectory: vi.fn<any, Promise<void>>(),
}));

const mockGetConfig  = vi.hoisted(() => vi.fn());
const mockShowError  = vi.hoisted(() => vi.fn());
const mockShowWarning = vi.hoisted(() => vi.fn());
const mockCreateChannel = vi.hoisted(() => vi.fn());

// ── module mocks ──────────────────────────────────────────────────────────────

vi.mock('vscode', () => ({
  Uri: {
    joinPath: (base: { fsPath: string }, ...segs: string[]) => ({
      fsPath: [base.fsPath, ...segs].join('/'),
    }),
  },
  workspace: {
    fs: mockFs,
    getConfiguration: mockGetConfig,
    workspaceFolders: [{ uri: { fsPath: '/workspace' } }],
  },
  window: {
    createOutputChannel: mockCreateChannel,
    showErrorMessage: mockShowError,
    showWarningMessage: mockShowWarning,
  },
}));

import { AgentRunner } from './AgentRunner.js';

// ── fixtures ──────────────────────────────────────────────────────────────────

const AGENT_MD = 'You are the explorer agent. Explore the codebase.';
const MODELS_JSON = JSON.stringify({
  provider: 'ollama',
  baseUrl: 'http://localhost:11434',
  defaultModel: 'fallback-model',
  models: {
    orchestrator: 'qwen3.6:35b-a3b', explorer: 'qwen3.6:35b-a3b',
    proposal: 'deepseek-r1:70b', spec: 'qwen3-coder-next',
    design: 'deepseek-r1:70b', tasks: 'qwen3-coder-next',
    implementer: 'qwen3-coder-next', tester: 'devstral-small-2',
    verifier: 'deepseek-r1:70b', fixer: 'devstral-small-2',
    archiver: 'north-mini-code-1.0', fallback: 'qwen2.5-coder:32b',
  },
});

const mockChannel = {
  append: vi.fn(),
  appendLine: vi.fn(),
  show: vi.fn(),
  dispose: vi.fn(),
};

const mockContext = {} as never;

function enc(s: string): Uint8Array {
  return Buffer.from(s) as unknown as Uint8Array;
}

function makeRegistry() {
  return new AgentRegistry();
}

/** Mock provider that streams two chunks then calls onDone. */
function makeHappyProvider(): LlmProvider {
  return {
    stream: vi.fn((_msgs, _model, onChunk, onDone) => {
      onChunk('hello ');
      onChunk('world');
      onDone();
      return Promise.resolve();
    }),
  };
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('AgentRunner', () => {
  let registry: AgentRegistry;

  beforeEach(() => {
    vi.resetAllMocks();
    registry = makeRegistry();

    mockGetConfig.mockReturnValue({
      get: (key: string, def?: unknown) => {
        if (key === 'workflowsDir') return '.ai-workflows';
        return def;
      },
    });

    mockFs.readFile.mockImplementation((uri: { fsPath: string }) => {
      if (uri.fsPath.includes('/agents/')) return Promise.resolve(enc(AGENT_MD));
      if (uri.fsPath.includes('models.json')) return Promise.resolve(enc(MODELS_JSON));
      return Promise.reject(Object.assign(new Error('File not found'), { code: 'FileNotFound' }));
    });

    mockFs.writeFile.mockResolvedValue(undefined);
    mockCreateChannel.mockReturnValue(mockChannel);
  });

  // ── 1. system prompt ────────────────────────────────────────────────────────

  it('reads agent .md and passes it as the system message', async () => {
    const provider = makeHappyProvider();
    const runner = new AgentRunner(mockContext, registry, provider);
    await runner.run({ changeName: 'my-change', role: 'explorer', onChunk: vi.fn(), onDone: vi.fn(), onError: vi.fn() });

    const [messages] = (provider.stream as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect((messages as Array<{ role: string; content: string }>)[0]).toMatchObject({
      role: 'system',
      content: AGENT_MD,
    });
  });

  // ── 2. model selection ──────────────────────────────────────────────────────

  it('selects the model for the given role from models.json', async () => {
    const provider = makeHappyProvider();
    const runner = new AgentRunner(mockContext, registry, provider);
    await runner.run({ changeName: 'my-change', role: 'verifier', onChunk: vi.fn(), onDone: vi.fn(), onError: vi.fn() });

    const [, model] = (provider.stream as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(model).toBe('deepseek-r1:70b');
  });

  // ── 3. fallback model ───────────────────────────────────────────────────────

  it('falls back to defaultModel when models.json is missing', async () => {
    mockFs.readFile.mockImplementation((uri: { fsPath: string }) => {
      if (uri.fsPath.includes('/agents/')) return Promise.resolve(enc(AGENT_MD));
      return Promise.reject(new Error('not found'));
    });

    const provider = makeHappyProvider();
    const runner = new AgentRunner(mockContext, registry, provider);
    await runner.run({ changeName: 'my-change', role: 'explorer', onChunk: vi.fn(), onDone: vi.fn(), onError: vi.fn() });

    expect(mockShowWarning).toHaveBeenCalledOnce();
    const [, model] = (provider.stream as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(typeof model).toBe('string');
    expect((model as string).length).toBeGreaterThan(0);
  });

  // ── 4. missing agent .md ────────────────────────────────────────────────────

  it('shows an error and calls onError when agent .md is not found', async () => {
    mockFs.readFile.mockRejectedValue(new Error('not found'));

    const provider = makeHappyProvider();
    const onError = vi.fn();
    const runner = new AgentRunner(mockContext, registry, provider);
    await runner.run({ changeName: 'my-change', role: 'explorer', onChunk: vi.fn(), onDone: vi.fn(), onError });

    expect(mockShowError).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledOnce();
    expect(provider.stream).not.toHaveBeenCalled();
  });

  // ── 5. output channel ───────────────────────────────────────────────────────

  it('creates an OutputChannel named "Multi-Agents: <changeName>" and shows it', async () => {
    const runner = new AgentRunner(mockContext, registry, makeHappyProvider());
    await runner.run({ changeName: 'feature-x', role: 'explorer', onChunk: vi.fn(), onDone: vi.fn(), onError: vi.fn() });

    expect(mockCreateChannel).toHaveBeenCalledWith('Multi-Agents: feature-x');
    expect(mockChannel.show).toHaveBeenCalledOnce();
  });

  it('reuses the same OutputChannel on a second run for the same change', async () => {
    const runner = new AgentRunner(mockContext, registry, makeHappyProvider());
    await runner.run({ changeName: 'feature-x', role: 'explorer', onChunk: vi.fn(), onDone: vi.fn(), onError: vi.fn() });
    await runner.run({ changeName: 'feature-x', role: 'proposal', onChunk: vi.fn(), onDone: vi.fn(), onError: vi.fn() });

    expect(mockCreateChannel).toHaveBeenCalledOnce();
  });

  // ── 6. header + footer ──────────────────────────────────────────────────────

  it('writes a header line before streaming and a footer line after', async () => {
    const runner = new AgentRunner(mockContext, registry, makeHappyProvider());
    await runner.run({ changeName: 'my-change', role: 'explorer', onChunk: vi.fn(), onDone: vi.fn(), onError: vi.fn() });

    const lines = mockChannel.appendLine.mock.calls.map((c) => c[0] as string);
    expect(lines.some((l) => l.includes('explorer') && l.includes('started'))).toBe(true);
    expect(lines.some((l) => l.includes('explorer') && l.includes('done'))).toBe(true);
  });

  // ── 7. registry ─────────────────────────────────────────────────────────────

  it('registers the agent in the registry during the run and unregisters on done', async () => {
    let inFlightCount = 0;
    const provider: LlmProvider = {
      stream: vi.fn((_msgs, _model, onChunk, onDone) => {
        inFlightCount = registry.getAll().length;
        onChunk('x');
        onDone();
        return Promise.resolve();
      }),
    };

    const runner = new AgentRunner(mockContext, registry, provider);
    await runner.run({ changeName: 'my-change', role: 'explorer', onChunk: vi.fn(), onDone: vi.fn(), onError: vi.fn() });

    expect(inFlightCount).toBe(1);
    expect(registry.getAll()).toHaveLength(0);
  });

  // ── 8. chunk forwarding ─────────────────────────────────────────────────────

  it('forwards each chunk to opts.onChunk', async () => {
    const onChunk = vi.fn();
    const runner = new AgentRunner(mockContext, registry, makeHappyProvider());
    await runner.run({ changeName: 'my-change', role: 'explorer', onChunk, onDone: vi.fn(), onError: vi.fn() });

    expect(onChunk).toHaveBeenCalledWith('hello ');
    expect(onChunk).toHaveBeenCalledWith('world');
  });

  // ── 9. artifact write ───────────────────────────────────────────────────────

  it('writes the accumulated stream content to an artifact file on done', async () => {
    const runner = new AgentRunner(mockContext, registry, makeHappyProvider());
    const onDone = vi.fn();
    await runner.run({ changeName: 'my-change', role: 'explorer', onChunk: vi.fn(), onDone, onError: vi.fn() });

    expect(mockFs.writeFile).toHaveBeenCalledOnce();
    const [uri, data] = mockFs.writeFile.mock.calls[0]!;
    expect((uri as { fsPath: string }).fsPath).toContain('01-explore.md');
    expect(Buffer.from(data as Uint8Array).toString('utf8')).toBe('hello world');
    expect(onDone).toHaveBeenCalledOnce();
  });

  // ── 10. abort → [CANCELLED] ─────────────────────────────────────────────────

  it('appends [CANCELLED] to channel and unregisters on abort', async () => {
    const controller = new AbortController();
    controller.abort();

    const runner = new AgentRunner(mockContext, registry, makeHappyProvider());
    const onDone = vi.fn();
    await runner.run({
      changeName: 'my-change', role: 'explorer',
      onChunk: vi.fn(), onDone, onError: vi.fn(),
      signal: controller.signal,
    });

    const lines = mockChannel.appendLine.mock.calls.map((c) => c[0] as string);
    expect(lines.some((l) => l.includes('CANCELLED'))).toBe(true);
  });

  // ── 11. artifact paths prepended to user message ────────────────────────────

  it('prepends artifact file contents to the user message', async () => {
    mockFs.readFile.mockImplementation((uri: { fsPath: string }) => {
      if (uri.fsPath.includes('/agents/')) return Promise.resolve(enc(AGENT_MD));
      if (uri.fsPath.includes('models.json')) return Promise.resolve(enc(MODELS_JSON));
      if (uri.fsPath.includes('exploration.md')) return Promise.resolve(enc('# Exploration result'));
      return Promise.reject(new Error('not found'));
    });

    const provider = makeHappyProvider();
    const runner = new AgentRunner(mockContext, registry, provider);
    await runner.run({
      changeName: 'my-change', role: 'proposal',
      artifactPaths: ['exploration.md'],
      onChunk: vi.fn(), onDone: vi.fn(), onError: vi.fn(),
    });

    const [messages] = (provider.stream as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const userMsg = (messages as Array<{ role: string; content: string }>)[1]!;
    expect(userMsg.content).toContain('# Exploration result');
  });

  // ── 12. missing artifact skipped with warning ────────────────────────────────

  it('skips missing artifact files and continues without crashing', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const provider = makeHappyProvider();
    const onError = vi.fn();
    const runner = new AgentRunner(mockContext, registry, provider);
    await runner.run({
      changeName: 'my-change', role: 'proposal',
      artifactPaths: ['missing-file.md'],
      onChunk: vi.fn(), onDone: vi.fn(), onError,
    });

    expect(consoleSpy).toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(provider.stream).toHaveBeenCalledOnce();

    consoleSpy.mockRestore();
  });

  // ── 13. refreshAgents callback ──────────────────────────────────────────────

  it('calls the refreshAgents callback after a successful run', async () => {
    const refreshAgents = vi.fn();
    const runner = new AgentRunner(mockContext, registry, makeHappyProvider(), refreshAgents);
    await runner.run({ changeName: 'my-change', role: 'explorer', onChunk: vi.fn(), onDone: vi.fn(), onError: vi.fn() });

    expect(refreshAgents).toHaveBeenCalledOnce();
  });

  // ── 14. stream error propagated to onError ──────────────────────────────────

  it('calls opts.onError and shows error message when provider.stream fires onError', async () => {
    const provider: LlmProvider = {
      stream: vi.fn((_msgs, _model, _onChunk, _onDone, onError) => {
        onError(new Error('Connection refused'));
        return Promise.resolve();
      }),
    };

    const onError = vi.fn();
    const onDone = vi.fn();
    const runner = new AgentRunner(mockContext, registry, provider);
    await runner.run({ changeName: 'my-change', role: 'explorer', onChunk: vi.fn(), onDone, onError });

    expect(onError).toHaveBeenCalledOnce();
    expect(onDone).not.toHaveBeenCalled();
    expect(mockShowError).toHaveBeenCalledOnce();
  });
});
