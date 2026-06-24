/**
 * End-to-end tests for the multi-agent SDD workflow pipeline.
 *
 * Exercises the full stack: WorkflowOrchestrator → AgentRunner → OllamaProvider,
 * against a real HTTP server (real fetch, no mocking) and an in-memory vscode.fs
 * (no real VS Code process required).
 *
 * Each test covers a distinct correctness property of the pipeline:
 *   1. Full 8-phase happy path
 *   2. Phase failure stops the chain and marks state correctly
 *   3. Upstream artifact content is forwarded to the downstream prompt
 *   4. Concurrency gate prevents over-limit runs (TOCTOU safety)
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import * as http from 'node:http';
import * as net from 'node:net';

// ── In-memory vscode.fs shared with the vi.mock factory ──────────────────────
//
// vi.hoisted() guarantees these run before vi.mock(), making them available
// inside the factory closure. Mutations done in beforeEach are reflected
// in all subsequent calls through the mock.

const memFiles = vi.hoisted(() => new Map<string, Buffer>());
const memDirs  = vi.hoisted(() => new Set<string>());
const cfg      = vi.hoisted(() => ({
  ollamaBaseUrl:       'http://localhost:0', // set in beforeAll
  workflowsDir:        '.ai-workflows',
  maxConcurrentAgents: 3,
}));

vi.mock('vscode', () => ({
  workspace: {
    workspaceFolders: [{ uri: { fsPath: '/workspace' } }],
    getConfiguration: (_section: string) => ({
      get: <T>(key: string, def?: T): T =>
        ((cfg as Record<string, unknown>)[key] ?? def) as T,
    }),
    fs: {
      readFile: async (uri: { fsPath: string }): Promise<Uint8Array> => {
        const data = memFiles.get(uri.fsPath);
        if (!data) {
          const err = Object.assign(new Error(`ENOENT: ${uri.fsPath}`), { code: 'FileSystemError' });
          throw err;
        }
        return new Uint8Array(data);
      },
      writeFile: async (uri: { fsPath: string }, data: Uint8Array): Promise<void> => {
        memFiles.set(uri.fsPath, Buffer.from(data));
      },
      createDirectory: async (uri: { fsPath: string }): Promise<void> => {
        memDirs.add(uri.fsPath);
      },
      rename: async (from: { fsPath: string }, to: { fsPath: string }): Promise<void> => {
        const data = memFiles.get(from.fsPath);
        if (data) { memFiles.set(to.fsPath, data); memFiles.delete(from.fsPath); }
      },
      readDirectory: async (uri: { fsPath: string }): Promise<Array<[string, number]>> => {
        const prefix = uri.fsPath + '/';
        const result: Array<[string, number]> = [];
        for (const dir of memDirs) {
          const rel = dir.slice(prefix.length);
          if (dir.startsWith(prefix) && !rel.includes('/')) result.push([rel, 2]);
        }
        for (const file of memFiles.keys()) {
          const rel = file.slice(prefix.length);
          if (file.startsWith(prefix) && !rel.includes('/')) result.push([rel, 1]);
        }
        return result;
      },
      stat: async (uri: { fsPath: string }): Promise<{ type: number }> => {
        if (memFiles.has(uri.fsPath) || memDirs.has(uri.fsPath)) return { type: 1 };
        throw Object.assign(new Error(`ENOENT: ${uri.fsPath}`), { code: 'FileSystemError' });
      },
    },
    createFileSystemWatcher: (_pattern: string) => ({
      onDidChange: (_fn: () => void) => ({ dispose: () => {} }),
      onDidCreate: (_fn: () => void) => ({ dispose: () => {} }),
      onDidDelete: (_fn: () => void) => ({ dispose: () => {} }),
      dispose: () => {},
    }),
  },
  window: {
    showInformationMessage: vi.fn(),
    showErrorMessage:       vi.fn(),
    showWarningMessage:     vi.fn(),
    createOutputChannel: () => ({
      append:     vi.fn(),
      appendLine: vi.fn(),
      show:       vi.fn(),
      dispose:    vi.fn(),
    }),
  },
  commands: { executeCommand: vi.fn() },
  EventEmitter: class {
    private cbs: Array<(v: unknown) => void> = [];
    readonly event = (cb: (v: unknown) => void) => {
      this.cbs.push(cb);
      return { dispose: () => { this.cbs = this.cbs.filter((c) => c !== cb); } };
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
}));

// ── Extension code (imported after vi.mock so they receive the mock) ──────────
import type { WorkflowState } from '../types/index.js';
import { StateManager }        from '../StateManager.js';
import { AgentRegistry }       from '../agents/AgentRegistry.js';
import { AgentRunner }         from '../agents/AgentRunner.js';
import { OllamaProvider }      from '../agents/OllamaProvider.js';
import { WorkflowOrchestrator } from '../WorkflowOrchestrator.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const WORKSPACE     = '/workspace';
const WORKFLOWS_DIR = '.ai-workflows';
const BASE          = `${WORKSPACE}/${WORKFLOWS_DIR}`;
const CHANGE        = 'test-change';
const CHANGES_BASE  = `${BASE}/sdd/changes/${CHANGE}`;

const ALL_PHASES = [
  'sdd-explore', 'sdd-propose', 'sdd-spec',   'sdd-design',
  'sdd-tasks',   'sdd-apply',   'sdd-verify',  'sdd-archive',
] as const;

const ARTIFACT_FILES = [
  '01-explore.md', '02-proposal.md', '03-spec.md',   '04-design.md',
  '05-tasks.md',   '06-apply-progress.md', '07-verify-report.md', '08-archive-report.md',
];

const WORKFLOW_JSON = {
  phases: [
    { id: 'sdd-explore',  agent: 'explorer',   artifact: { reads: [],                                                         writes: '01-explore.md'        } },
    { id: 'sdd-propose',  agent: 'proposal',   artifact: { reads: ['01-explore.md'],                                          writes: '02-proposal.md'       } },
    { id: 'sdd-spec',     agent: 'spec',        artifact: { reads: ['01-explore.md', '02-proposal.md'],                        writes: '03-spec.md'           } },
    { id: 'sdd-design',   agent: 'design',      artifact: { reads: ['01-explore.md', '02-proposal.md', '03-spec.md'],          writes: '04-design.md'         } },
    { id: 'sdd-tasks',    agent: 'tasks',       artifact: { reads: ['03-spec.md', '04-design.md'],                             writes: '05-tasks.md'          } },
    { id: 'sdd-apply',    agent: 'implementer', artifact: { reads: ['03-spec.md', '04-design.md', '05-tasks.md'],              writes: '06-apply-progress.md' } },
    { id: 'sdd-verify',   agent: 'verifier',    artifact: { reads: ['03-spec.md', '05-tasks.md', '06-apply-progress.md'],      writes: '07-verify-report.md'  } },
    { id: 'sdd-archive',  agent: 'archiver',    artifact: { reads: ['01-explore.md', '02-proposal.md', '03-spec.md', '04-design.md', '05-tasks.md', '06-apply-progress.md', '07-verify-report.md'], writes: '08-archive-report.md' } },
  ],
};

const MODELS_JSON = {
  defaultModel: 'test-model',
  models: {
    orchestrator: 'test-model', explorer: 'test-model', proposal:     'test-model',
    spec:         'test-model', design:   'test-model', tasks:        'test-model',
    implementer:  'test-model', tester:   'test-model', verifier:     'test-model',
    fixer:        'test-model', archiver: 'test-model', fallback:     'test-model',
  },
};

const AGENT_ROLES = Object.keys(MODELS_JSON.models).filter((r) => r !== 'fallback');

/** Reset in-memory FS and seed all files the workflow needs. */
function seedFs(): void {
  memFiles.clear();
  memDirs.clear();
  for (const role of AGENT_ROLES) {
    memFiles.set(`${BASE}/agents/${role}.md`, Buffer.from(`# ${role} agent`));
  }
  memFiles.set(`${BASE}/config/models.json`,   Buffer.from(JSON.stringify(MODELS_JSON)));
  memFiles.set(`${BASE}/config/workflow.json`,  Buffer.from(JSON.stringify(WORKFLOW_JSON)));
}

/** Build a fresh orchestration stack for each test. */
function makeStack() {
  const workspaceUri  = { fsPath: WORKSPACE };
  const registry      = new AgentRegistry();
  const stateManager  = new StateManager(workspaceUri as never, WORKFLOWS_DIR);
  const provider      = new OllamaProvider(() => cfg.ollamaBaseUrl);
  const runner        = new AgentRunner(null as never, registry, provider);
  const orchestrator  = new WorkflowOrchestrator(stateManager, runner, workspaceUri as never, WORKFLOWS_DIR);
  return { registry, stateManager, runner, orchestrator };
}

/** Read the current workflow state and throw if missing. */
async function readState(sm: StateManager): Promise<WorkflowState> {
  const s = await sm.read(CHANGE);
  if (!s) throw new Error('state.json not found');
  return s;
}

/** Pick a free OS port. */
function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.listen(0, () => {
      const port = (srv.address() as net.AddressInfo).port;
      srv.close(() => resolve(port));
    });
  });
}

/** Build a mock Ollama server; swap `handler` per test. */
let handler: (body: string, res: http.ServerResponse) => void = (_body, res) => {
  res.writeHead(500).end();
};

function ndjsonOk(res: http.ServerResponse, content: string): void {
  res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
  res.write(JSON.stringify({ message: { content }, done: false }) + '\n');
  res.write(JSON.stringify({ message: { content: '' }, done: true }) + '\n');
  res.end();
}

// ── Server lifecycle ──────────────────────────────────────────────────────────

let server: http.Server;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/api/chat') {
      let body = '';
      req.on('data', (c: Buffer) => { body += c.toString(); });
      req.on('end', () => handler(body, res));
    } else {
      res.writeHead(404).end();
    }
  });
  const port = await freePort();
  await new Promise<void>((r) => server.listen(port, r));
  cfg.ollamaBaseUrl = `http://localhost:${port}`;
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

beforeEach(() => {
  seedFs();
  cfg.maxConcurrentAgents = 3;
  // Default handler: return a short successful SSE response for every request
  handler = (_body, res) => ndjsonOk(res, 'ok');
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('workflow e2e', () => {

  it('happy path: all 8 phases complete and artifact files are written', async () => {
    const requestOrder: string[] = [];
    handler = (body, res) => {
      const parsed = JSON.parse(body) as { model: string; messages: Array<{ role: string; content: string }> };
      // The user message ends with the changeName, so we can derive the phase index from request count
      requestOrder.push(parsed.model);
      const phaseIndex = requestOrder.length - 1;
      ndjsonOk(res, `# Phase ${phaseIndex} output\n`);
    };

    const { stateManager, orchestrator } = makeStack();
    await stateManager.create(CHANGE);
    await orchestrator.run(CHANGE);

    const state = await readState(stateManager);

    // Every phase must be complete
    for (const phase of ALL_PHASES) {
      expect(state.phases[phase], `${phase} should be complete`).toBe('complete');
    }

    // All 8 artifact files must exist in memfs
    for (const file of ARTIFACT_FILES) {
      const path = `${CHANGES_BASE}/${file}`;
      expect(memFiles.has(path), `${file} should exist`).toBe(true);
      expect(memFiles.get(path)!.toString()).toContain('Phase');
    }

    // Exactly 8 Ollama requests — one per phase
    expect(requestOrder).toHaveLength(8);
  }, 15_000);


  it('phase failure: missing agent file marks phase as fail and stops the chain', async () => {
    // Remove the spec agent — sdd-spec will fail to load its system prompt
    memFiles.delete(`${BASE}/agents/spec.md`);

    const { stateManager, orchestrator } = makeStack();
    await stateManager.create(CHANGE);
    await orchestrator.run(CHANGE);

    const state = await readState(stateManager);

    expect(state.phases['sdd-explore']).toBe('complete');
    expect(state.phases['sdd-propose']).toBe('complete');
    expect(state.phases['sdd-spec']).toBe('fail');

    // Phases after the failure must never have been touched
    expect(state.phases['sdd-design']).toBe('pending');
    expect(state.phases['sdd-tasks']).toBe('pending');
    expect(state.phases['sdd-apply']).toBe('pending');
    expect(state.phases['sdd-verify']).toBe('pending');
    expect(state.phases['sdd-archive']).toBe('pending');

    // Artifacts for failed and subsequent phases must not exist
    expect(memFiles.has(`${CHANGES_BASE}/03-spec.md`)).toBe(false);
    expect(memFiles.has(`${CHANGES_BASE}/04-design.md`)).toBe(false);
  }, 10_000);


  it('artifact propagation: explorer output is included in the proposal prompt', async () => {
    const EXPLORER_OUTPUT = '# EXPLORER_SENTINEL_OUTPUT\nsome findings\n';
    const capturedBodies: Array<{ messages: Array<{ role: string; content: string }> }> = [];

    handler = (body, res) => {
      capturedBodies.push(JSON.parse(body) as typeof capturedBodies[number]);
      const phaseIdx = capturedBodies.length - 1;
      // Explorer returns a distinctive string; all others return generic output
      ndjsonOk(res, phaseIdx === 0 ? EXPLORER_OUTPUT : 'generic output\n');
    };

    const { stateManager, orchestrator } = makeStack();
    await stateManager.create(CHANGE);
    await orchestrator.run(CHANGE);

    // Request 0 = explorer, Request 1 = proposal
    expect(capturedBodies.length).toBeGreaterThanOrEqual(2);

    const proposalUserContent = capturedBodies[1]!.messages[1]!.content;

    // The proposal's user message must embed the explorer's output under its artifact header
    expect(proposalUserContent).toContain('## 01-explore.md');
    expect(proposalUserContent).toContain(EXPLORER_OUTPUT.trim());
  }, 15_000);


  it('concurrency gate: second run is rejected immediately when at capacity', async () => {
    cfg.maxConcurrentAgents = 1;

    // Slow down the first request so the second run call starts while the first is registered
    let releaseFirst: () => void;
    const firstHeld = new Promise<void>((r) => { releaseFirst = r; });

    handler = (_body, res) => {
      // Hold the first request until we release it
      firstHeld.then(() => ndjsonOk(res, 'output\n'));
    };

    const { registry, runner } = makeStack();

    const onErrorA = vi.fn();
    const onErrorB = vi.fn();
    const onDoneA  = vi.fn();

    // A: starts, registers the slot, then awaits the HTTP response
    const promiseA = runner.run({
      changeName: CHANGE, role: 'explorer',
      onChunk: vi.fn(), onDone: onDoneA, onError: onErrorA,
    });

    // B: runs synchronously until its concurrency check — A is already registered
    const promiseB = runner.run({
      changeName: CHANGE, role: 'proposal',
      onChunk: vi.fn(), onDone: vi.fn(), onError: onErrorB,
    });

    // B should have been rejected synchronously (before any await in B)
    expect(onErrorB).toHaveBeenCalledOnce();
    expect(onErrorB.mock.calls[0]![0].message).toMatch(/Max concurrent agents/);
    expect(registry.getAll()).toHaveLength(1); // only A is registered

    // Release A and let it finish
    releaseFirst!();
    await Promise.all([promiseA, promiseB]);

    expect(onDoneA).toHaveBeenCalledOnce();
    expect(onErrorA).not.toHaveBeenCalled();
    expect(registry.getAll()).toHaveLength(0); // A unregistered on completion
  }, 10_000);

});
