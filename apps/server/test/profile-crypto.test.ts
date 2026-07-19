import { describe, expect, test } from "bun:test";
import { decryptProfileConfig, encryptProfileConfig } from "../src/profile-crypto";

describe("profile encryption", () => {
  test("round-trips configuration with randomized ciphertext", () => {
    const config = { mode: "setupkey", setupKey: "secret", nested: { enabled: true } };
    const first = encryptProfileConfig(config);
    const second = encryptProfileConfig(config);
    expect(first).toStartWith("enc:v1:");
    expect(first).not.toBe(second);
    expect(decryptProfileConfig(first)).toEqual(config);
  });

  test("rejects plaintext, truncation, and tampering", () => {
    expect(() => decryptProfileConfig('{"secret":true}')).toThrow("not encrypted");
    expect(() => decryptProfileConfig("enc:v1:AA==")).toThrow("Invalid encrypted");
    const encrypted = encryptProfileConfig({ secret: true });
    const payload = Buffer.from(encrypted.slice("enc:v1:".length), "base64");
    payload[payload.length - 1] ^= 1;
    expect(() => decryptProfileConfig(`enc:v1:${payload.toString("base64")}`)).toThrow("Unable to decrypt");
  });
});
