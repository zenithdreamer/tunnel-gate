import { describe, expect, test } from "bun:test";
import type { ChildProcess } from "node:child_process";
import { EventEmitter, once } from "node:events";
import { PassThrough } from "node:stream";
import { pipeLines, stopProc } from "../src/lib/proc";

class FakeProcess extends EventEmitter {
  stdout = new PassThrough();
  stderr = new PassThrough();
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;
  signals: NodeJS.Signals[] = [];
  exitOnTerm = false;

  kill(signal: NodeJS.Signals) {
    this.signals.push(signal);
    if (signal === "SIGTERM" && this.exitOnTerm) {
      this.signalCode = signal;
      this.emit("exit", null, signal);
    }
    return true;
  }
}

describe("process line helpers", () => {
  test("pipeLines emits complete lines and flushes unterminated trailing lines", async () => {
    const proc = new FakeProcess();
    const lines: string[] = [];
    pipeLines(proc as unknown as ChildProcess, (line) => lines.push(line));
    const ended = Promise.all([once(proc.stdout, "end"), once(proc.stderr, "end")]);

    proc.stdout.write(" first line \nsecond");
    proc.stderr.write(" stderr tail ");
    proc.stdout.end(" line\n\n stdout tail ");
    proc.stderr.end();
    await ended;

    expect(lines).toEqual(["first line", "second line", "stdout tail", "stderr tail"]);
  });

  test("stopProc waits for exit after SIGTERM", async () => {
    const proc = new FakeProcess();
    let resolved = false;
    const stopped = stopProc(proc as unknown as ChildProcess).then(() => {
      resolved = true;
    });

    expect(proc.signals).toEqual(["SIGTERM"]);
    await Promise.resolve();
    expect(resolved).toBe(false);

    proc.exitCode = 0;
    proc.emit("exit", 0, null);
    await stopped;
    expect(resolved).toBe(true);
  });

  test("stopProc handles a synchronous exit while sending SIGTERM", async () => {
    const proc = new FakeProcess();
    proc.exitOnTerm = true;

    await expect(stopProc(proc as unknown as ChildProcess)).resolves.toBeUndefined();
    expect(proc.signals).toEqual(["SIGTERM"]);
  });
});
