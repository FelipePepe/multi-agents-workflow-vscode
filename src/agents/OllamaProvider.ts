import type { LlmMessage, LlmProvider } from './LlmProvider.js';

function assertSafeUrl(url: string): void {
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new Error(`Invalid Ollama URL: ${url}`); }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`Ollama URL must use http or https. Got: ${parsed.protocol}`);
  }
  if (parsed.hostname.startsWith('169.254.') || parsed.hostname === 'fd00:ec2::254') {
    throw new Error('Ollama URL must not target cloud metadata endpoints.');
  }
}

export class OllamaProvider implements LlmProvider {
  constructor(private readonly getBaseUrl: () => string) {}

  async stream(
    messages: LlmMessage[],
    model: string,
    onChunk: (text: string) => void,
    onDone: () => void,
    onError: (err: Error) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    if (signal?.aborted) { onDone(); return; }

    const baseUrl = this.getBaseUrl();
    try { assertSafeUrl(baseUrl); } catch (err) {
      onError(err instanceof Error ? err : new Error(String(err)));
      return;
    }

    let response: Response;
    try {
      response = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages, stream: true }),
        signal: signal ?? null,
      });
    } catch (err) {
      if (signal?.aborted) { onDone(); return; }
      onError(err instanceof Error ? err : new Error(String(err)));
      return;
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      if (response.status === 404 && body.includes('model')) {
        onError(new Error(`Model "${model}" not found in Ollama. Run: ollama pull ${model}`));
      } else {
        onError(new Error(`Ollama HTTP ${response.status}: ${body}`));
      }
      return;
    }

    if (!response.body) { onError(new Error('Ollama response has no body')); return; }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let doneFired = false;

    const safeDone = () => {
      if (!doneFired) { doneFired = true; onDone(); }
    };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) { safeDone(); break; }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const parsed = JSON.parse(line) as {
              message?: { content?: string };
              error?: string;
              done?: boolean;
            };
            if (parsed.error) { onError(new Error(`Ollama error: ${parsed.error}`)); return; }
            if (parsed.message?.content) onChunk(parsed.message.content);
            if (parsed.done) safeDone();
          } catch {
            console.warn('[OllamaProvider] Skipping malformed line:', line);
          }
        }
      }
    } catch (err) {
      if (signal?.aborted) { safeDone(); return; }
      onError(err instanceof Error ? err : new Error(String(err)));
    }
  }
}
