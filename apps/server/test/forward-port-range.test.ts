import { afterEach, describe, expect, test } from "bun:test";
import { forwardPortRange } from "../src/relay/forwards";

const original = process.env.FORWARD_PORT_RANGE;
afterEach(() => {
  if (original === undefined) delete process.env.FORWARD_PORT_RANGE;
  else process.env.FORWARD_PORT_RANGE = original;
});

describe("forward port range parsing", () => {
  test("parses single ports and ranges", () => {
    process.env.FORWARD_PORT_RANGE = "40000-40100";
    expect(forwardPortRange()).toEqual({ lo: 40000, hi: 40100 });
    process.env.FORWARD_PORT_RANGE = "8080";
    expect(forwardPortRange()).toEqual({ lo: 8080, hi: 8080 });
  });

  test("rejects unset, inverted, and out-of-range values", () => {
    delete process.env.FORWARD_PORT_RANGE;
    expect(forwardPortRange()).toBeNull();
    process.env.FORWARD_PORT_RANGE = "40100-40000";
    expect(forwardPortRange()).toBeNull();
    process.env.FORWARD_PORT_RANGE = "0-70000";
    expect(forwardPortRange()).toBeNull();
    process.env.FORWARD_PORT_RANGE = "abc";
    expect(forwardPortRange()).toBeNull();
  });
});
