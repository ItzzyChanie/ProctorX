/**
 * Runs at most `limit` tasks at the same time; the others wait in order
 * (first come, first served). Used to cap concurrent FFmpeg encodes.
 */
export class EncodeQueue {
  private running = 0;
  private waiting: (() => void)[] = [];

  constructor(private readonly limit: number) {}

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.running >= this.limit)
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    else this.running++;
    try {
      return await task();
    } finally {
      // Hand the slot straight to the next waiting task, or free it.
      const next = this.waiting.shift();
      if (next) next();
      else this.running--;
    }
  }
}
