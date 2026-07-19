import { describe, expect, test } from "bun:test";
import { projectSamples, trafficSourceIds } from "../src/lib/traffic";

const samples = [
  { t: 1, rx: 10, tx: 20, by: { a: { rx: 10, tx: 20 } } },
  { t: 2, rx: 7, tx: 3, by: { a: { rx: 5, tx: 1 }, b: { rx: 2, tx: 2 } } },
  { t: 3, rx: 0, tx: 0 },
];

describe("traffic source selection", () => {
  test("collects ids from the sample window and active tunnels", () => {
    expect(trafficSourceIds(samples, ["c"])).toEqual(["a", "b", "c"]);
    expect(trafficSourceIds([], [])).toEqual([]);
  });

  test("deduplicates active ids already present in samples", () => {
    expect(trafficSourceIds(samples, ["a"])).toEqual(["a", "b"]);
  });
});

describe("per-profile sample projection", () => {
  test("extracts one profile and zero-fills gaps", () => {
    expect(projectSamples(samples, "b")).toEqual([
      { t: 1, rx: 0, tx: 0 },
      { t: 2, rx: 2, tx: 2 },
      { t: 3, rx: 0, tx: 0 },
    ]);
  });
});
