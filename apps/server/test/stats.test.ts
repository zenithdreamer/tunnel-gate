import { describe, expect, test } from "bun:test";
import { calculateTrafficSample } from "../src/stats";

describe("traffic samples", () => {
  test("calculates rates and handles counter resets", () => {
    const previous = new Map([["p", { rx: 100, tx: 200, t: 1000 }]]);
    const current = calculateTrafficSample([{ profileId: "p", rx: 300, tx: 500 }], previous, 3000);
    expect(current.sample.by.p).toEqual({ rx: 100, tx: 150 });
    const reset = calculateTrafficSample([{ profileId: "p", rx: 1, tx: 2 }], current.next, 5000);
    expect(reset.sample.by.p).toEqual({ rx: 0, tx: 0 });
  });

  test("does not produce rates without a positive time interval", () => {
    const first = calculateTrafficSample([{ profileId: "p", rx: 10, tx: 20 }], new Map(), 1000);
    expect(first.sample).toEqual({ t: 1000, rx: 0, tx: 0, by: {} });
    const sameTime = calculateTrafficSample([{ profileId: "p", rx: 20, tx: 40 }], first.next, 1000);
    expect(sameTime.sample.by).toEqual({});
  });
});
