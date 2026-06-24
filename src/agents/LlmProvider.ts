export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmProvider {
  stream(
    messages: LlmMessage[],
    model: string,
    onChunk: (text: string) => void,
    onDone: () => void,
    onError: (err: Error) => void,
    signal?: AbortSignal,
  ): Promise<void>;
}
