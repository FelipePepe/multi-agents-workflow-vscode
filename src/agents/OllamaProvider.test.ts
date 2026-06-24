import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OllamaProvider } from './OllamaProvider.js';

// ── helpers ───────────────────────────────────────────────────────────────────

function ndjson(lines: object[]): string {
  return lines.map((l) => JSON.stringify(l)).join('\n') + '\n';
}

function makeStreamResponse(body: string, status = 200): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(body));
      controller.close();
    },
  });
  return new Response(stream, { status });
}

function provider() {
  return new OllamaProvider(() => 'http://localhost:11434');
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('OllamaProvider', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ── happy path ──────────────────────────────────────────────────────────────

  it('streams chunks and calls onDone when done:true line is received', async () => {
    const body = ndjson([
      { message: { content: 'Hello' }, done: false },
      { message: { content: ' world' }, done: false },
      { message: { content: '' }, done: true },
    ]);
    vi.mocked(fetch).mockResolvedValue(makeStreamResponse(body));

    const chunks: string[] = [];
    let done = false;

    await provider().stream(
      [{ role: 'user', content: 'hi' }],
      'test-model',
      (t) => chunks.push(t),
      () => { done = true; },
      (e) => { throw e; },
    );

    expect(chunks).toEqual(['Hello', ' world']);
    expect(done).toBe(true);
  });

  it('calls onDone at stream end even without explicit done:true', async () => {
    const body = ndjson([{ message: { content: 'chunk' }, done: false }]);
    vi.mocked(fetch).mockResolvedValue(makeStreamResponse(body));

    let done = false;
    await provider().stream([], 'model', () => undefined, () => { done = true; }, (e) => { throw e; });

    expect(done).toBe(true);
  });

  // ── partial line buffering ──────────────────────────────────────────────────

  it('buffers partial NDJSON lines split across chunks', async () => {
    const fullLine = JSON.stringify({ message: { content: 'Split' }, done: false });
    const half1 = fullLine.slice(0, 10);
    const half2 = fullLine.slice(10) + '\n';

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(c) {
        c.enqueue(encoder.encode(half1));
        c.enqueue(encoder.encode(half2));
        c.close();
      },
    });
    vi.mocked(fetch).mockResolvedValue(new Response(stream, { status: 200 }));

    const chunks: string[] = [];
    await provider().stream([], 'model', (t) => chunks.push(t), () => undefined, (e) => { throw e; });

    expect(chunks).toEqual(['Split']);
  });

  // ── malformed JSON ──────────────────────────────────────────────────────────

  it('skips malformed JSON lines and continues without calling onError', async () => {
    const body = 'NOT_VALID_JSON\n' + JSON.stringify({ message: { content: 'OK' }, done: true }) + '\n';
    vi.mocked(fetch).mockResolvedValue(makeStreamResponse(body));

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const errors: Error[] = [];
    const chunks: string[] = [];

    await provider().stream([], 'model', (t) => chunks.push(t), () => undefined, (e) => errors.push(e));

    expect(errors).toHaveLength(0);
    expect(chunks).toEqual(['OK']);
    expect(warnSpy).toHaveBeenCalledOnce();
    warnSpy.mockRestore();
  });

  // ── pre-aborted signal ──────────────────────────────────────────────────────

  it('resolves immediately without making a request when signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    let doneCalled = false;
    await provider().stream([], 'model', () => undefined, () => { doneCalled = true; }, (e) => { throw e; }, controller.signal);

    expect(doneCalled).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  // ── network error ───────────────────────────────────────────────────────────

  it('calls onError on network failure without throwing', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('ECONNREFUSED'));

    const errors: Error[] = [];
    await provider().stream([], 'model', () => undefined, () => undefined, (e) => errors.push(e));

    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toBe('ECONNREFUSED');
  });

  // ── HTTP error ──────────────────────────────────────────────────────────────

  it('calls onError when Ollama returns a non-2xx status', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('Internal Server Error', { status: 500 }));

    const errors: Error[] = [];
    await provider().stream([], 'model', () => undefined, () => undefined, (e) => errors.push(e));

    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain('500');
  });

  // ── fetch URL ───────────────────────────────────────────────────────────────

  it('posts to /api/chat with the correct model and messages', async () => {
    const body = ndjson([{ message: { content: 'ok' }, done: true }]);
    vi.mocked(fetch).mockResolvedValue(makeStreamResponse(body));

    const msgs = [{ role: 'user' as const, content: 'test' }];
    await provider().stream(msgs, 'my-model', () => undefined, () => undefined, (e) => { throw e; });

    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe('http://localhost:11434/api/chat');
    const parsed = JSON.parse((init as RequestInit).body as string);
    expect(parsed.model).toBe('my-model');
    expect(parsed.messages).toEqual(msgs);
    expect(parsed.stream).toBe(true);
  });
});
