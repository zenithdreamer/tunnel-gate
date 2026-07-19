import { describe, expect, test } from "bun:test";
import { tarSingleFile } from "../src/vpn/docker-tar";

function field(archive: Uint8Array, offset: number, length: number): string {
  return new TextDecoder().decode(archive.slice(offset, offset + length)).replace(/\0.*$/, "");
}

describe("single-file tar archives", () => {
  test("writes a valid ustar header and padded content", async () => {
    const content = "hello worker";
    const archive = await tarSingleFile("profile.json", content, 0o600);

    expect(field(archive, 0, 100)).toBe("profile.json");
    expect(Number.parseInt(field(archive, 100, 8), 8)).toBe(0o600);
    expect(Number.parseInt(field(archive, 124, 12), 8)).toBe(content.length);
    expect(field(archive, 257, 6)).toBe("ustar");
    expect(new TextDecoder().decode(archive.slice(512, 512 + content.length))).toBe(content);
    // one header block + one padded content block + two zero end blocks
    expect(archive.length).toBe(512 * 4);
  });

  test("header checksum matches the ustar algorithm", async () => {
    const archive = await tarSingleFile("a.txt", "x");
    const header = archive.slice(0, 512);
    const stored = Number.parseInt(field(archive, 148, 8).trim(), 8);
    let computed = 0;
    for (let i = 0; i < 512; i++) computed += i >= 148 && i < 156 ? 32 : header[i];
    expect(stored).toBe(computed);
  });

  test("pads content to full blocks", async () => {
    const archive = await tarSingleFile("big.bin", new Uint8Array(513));
    expect(archive.length).toBe(512 + 1024 + 1024);
  });
});
