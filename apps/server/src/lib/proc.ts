import type { ChildProcess } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import type { Readable } from "node:stream";

export function readLines(stream: Readable, onLine: (line: string) => void) {
  createInterface({ input: stream, crlfDelay: Infinity }).on("line", (line) => {
    const trimmed = line.trim();
    if (trimmed) onLine(trimmed);
  });
}

export function pipeLines(proc: ChildProcess, onLine: (line: string) => void) {
  for (const stream of [proc.stdout, proc.stderr]) {
    if (stream) readLines(stream, onLine);
  }
}

export async function killByName(name: string, signal: NodeJS.Signals = "SIGTERM"): Promise<void> {
  const entries = await readdir("/proc").catch(() => []);
  for (const entry of entries) {
    if (!/^\d+$/.test(entry)) continue;
    const pid = Number(entry);
    try {
      const comm = (await readFile(`/proc/${pid}/comm`, "utf8")).trim();
      if (comm === name) process.kill(pid, signal);
    } catch {}
  }
}

export function stopProc(proc: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    if (proc.exitCode !== null || proc.signalCode) return resolve();
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(forceKill);
      clearTimeout(giveUp);
      resolve();
    };
    proc.once("exit", finish);
    const forceKill = setTimeout(() => {
      if (proc.exitCode === null) proc.kill("SIGKILL");
    }, 5000);
    const giveUp = setTimeout(finish, 6000);
    proc.kill("SIGTERM");
  });
}
