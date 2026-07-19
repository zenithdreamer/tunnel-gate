import { pack } from "tar-stream";

export async function tarSingleFile(name: string, content: string | Uint8Array, mode = 0o600): Promise<Uint8Array> {
  const data = typeof content === "string" ? Buffer.from(content, "utf8") : Buffer.from(content);
  const archive = pack();
  archive.entry({ name, mode, size: data.length }, data);
  archive.finalize();
  const chunks: Buffer[] = [];
  for await (const chunk of archive) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}
