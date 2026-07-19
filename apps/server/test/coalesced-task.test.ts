import { describe, expect, test } from "bun:test";
import { CoalescedTask } from "../src/lib/coalesced-task";

describe("CoalescedTask", () => {
  test("reruns once when triggered during an active task", async () => {
    let calls = 0;
    let release!: () => void;
    const firstRun = new Promise<void>((resolve) => {
      release = resolve;
    });
    const task = new CoalescedTask(async () => {
      calls++;
      if (calls === 1) await firstRun;
    });

    const first = task.run();
    const second = task.run();
    const third = task.run();
    expect(second).toBe(first);
    expect(third).toBe(first);

    release();
    await first;
    expect(calls).toBe(2);
  });
});
