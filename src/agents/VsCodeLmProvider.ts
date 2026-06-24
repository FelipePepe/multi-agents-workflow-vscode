import * as vscode from 'vscode';
import type { LlmMessage, LlmProvider } from './LlmProvider.js';

export class VsCodeLmProvider implements LlmProvider {
  async stream(
    messages: LlmMessage[],
    model: string,
    onChunk: (text: string) => void,
    onDone: () => void,
    onError: (err: Error) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    if (signal?.aborted) { onDone(); return; }

    const selector = model ? { family: model } : {};
    let models: vscode.LanguageModelChat[];
    try {
      models = await vscode.lm.selectChatModels(selector);
    } catch (err) {
      onError(err instanceof Error ? err : new Error(String(err)));
      return;
    }

    if (!models.length) {
      const hint = model ? `family "${model}"` : 'any available model';
      onError(new Error(
        `No VS Code language model found (${hint}). Install GitHub Copilot or another LM provider.`,
      ));
      return;
    }

    // VS Code LM has no 'system' role — prepend system content to the first user message.
    const lmMessages: vscode.LanguageModelChatMessage[] = [];
    let pendingSystem = '';
    for (const msg of messages) {
      if (msg.role === 'system') {
        pendingSystem += msg.content + '\n\n';
      } else {
        const text = pendingSystem ? pendingSystem + msg.content : msg.content;
        lmMessages.push(vscode.LanguageModelChatMessage.User(text));
        pendingSystem = '';
      }
    }

    const cts = new vscode.CancellationTokenSource();
    if (signal) {
      signal.addEventListener('abort', () => cts.cancel(), { once: true });
    }

    try {
      const response = await models[0].sendRequest(lmMessages, {}, cts.token);
      for await (const chunk of response.text) {
        if (signal?.aborted) break;
        onChunk(chunk);
      }
      onDone();
    } catch (err) {
      if (signal?.aborted || cts.token.isCancellationRequested) { onDone(); return; }
      onError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      cts.dispose();
    }
  }
}
