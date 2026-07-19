import { PassThrough, type Readable } from "node:stream";
import Docker from "dockerode";
import { readLines } from "../lib/proc";
import type { ContainerStatsResponse } from "./docker-usage";
import type { WorkerCreateBody } from "./worker-spec";

const docker = new Docker({ socketPath: process.env.DOCKER_SOCKET ?? "/var/run/docker.sock" });

function statusCode(error: unknown): number | null {
  return typeof (error as { statusCode?: number })?.statusCode === "number"
    ? (error as { statusCode: number }).statusCode
    : null;
}

function ignoringStatus(statuses: number[]) {
  return (error: unknown) => {
    if (statusCode(error) !== null && statuses.includes(statusCode(error) as number)) return;
    throw error;
  };
}

export function dockerInfo() {
  return docker.info() as Promise<{
    ServerVersion: string;
    OperatingSystem: string;
    Architecture: string;
    NCPU: number;
    MemTotal: number;
    ContainersRunning: number;
  }>;
}

export function listContainers(labelFilters: string[]) {
  return docker.listContainers({ all: true, filters: { label: labelFilters } });
}

export async function inspectContainer(id: string): Promise<Docker.ContainerInspectInfo | null> {
  try {
    return await docker.getContainer(id).inspect();
  } catch (error) {
    if (statusCode(error) === 404) return null;
    throw error;
  }
}

export async function createContainer(name: string, body: WorkerCreateBody): Promise<string> {
  const container = await docker.createContainer({ ...body, name } as Docker.ContainerCreateOptions);
  return container.id;
}

export async function startContainer(id: string): Promise<void> {
  await docker
    .getContainer(id)
    .start()
    .catch(ignoringStatus([304]));
}

export async function removeContainer(idOrName: string): Promise<void> {
  await docker
    .getContainer(idOrName)
    .remove({ force: true })
    .catch(ignoringStatus([404, 409]));
}

export async function removeVolume(name: string): Promise<void> {
  await docker
    .getVolume(name)
    .remove()
    .catch(ignoringStatus([404, 409]));
}

export async function putArchive(id: string, directory: string, archive: Uint8Array): Promise<void> {
  await docker.getContainer(id).putArchive(Buffer.from(archive), { path: directory });
}

export async function containerStats(id: string): Promise<ContainerStatsResponse | null> {
  try {
    return (await docker.getContainer(id).stats({ stream: false, "one-shot": true })) as ContainerStatsResponse;
  } catch {
    return null;
  }
}

export async function followContainerLogs(
  id: string,
  onLine: (line: string) => void,
  signal: AbortSignal,
): Promise<void> {
  const stream = (await docker.getContainer(id).logs({ follow: true, stdout: true, stderr: true })) as Readable;
  signal.addEventListener("abort", () => stream.destroy(), { once: true });

  const attach = (target: PassThrough) => {
    readLines(target, onLine);
    return target;
  };
  docker.modem.demuxStream(stream, attach(new PassThrough()), attach(new PassThrough()));
  await new Promise<void>((resolve) => {
    stream.once("end", resolve);
    stream.once("close", resolve);
    stream.once("error", resolve);
  });
}
