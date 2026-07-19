export class CoalescedTask {
  private pending = false;
  private running: Promise<void> | null = null;

  constructor(private readonly task: () => Promise<void>) {}

  run(): Promise<void> {
    this.pending = true;
    if (!this.running) {
      this.running = this.drain().finally(() => {
        this.running = null;
      });
    }
    return this.running;
  }

  private async drain(): Promise<void> {
    while (this.pending) {
      this.pending = false;
      await this.task();
    }
  }
}
