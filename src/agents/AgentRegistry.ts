export class AgentRegistry {
  private readonly running = new Map<string, AbortController>();

  register(key: string, controller: AbortController): void {
    this.running.set(key, controller);
  }

  unregister(key: string): void {
    this.running.delete(key);
  }

  abortAll(): number {
    const count = this.running.size;
    for (const controller of this.running.values()) {
      controller.abort();
    }
    this.running.clear();
    return count;
  }

  getAll(): Array<{ key: string }> {
    return Array.from(this.running.keys()).map((key) => ({ key }));
  }

  isFull(max: number): boolean {
    return this.running.size >= max;
  }
}
