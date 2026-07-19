import { describe, expect, test } from "bun:test";
import { aggregateAdvertisedNetwork, parseJsonList, workerRoutes } from "../src/domain/profile-routes";

describe("profile routes", () => {
  test("parses stored JSON lists defensively", () => {
    expect(parseJsonList('["10.0.0.0/8"]')).toEqual(["10.0.0.0/8"]);
    expect(parseJsonList("")).toEqual([]);
    expect(parseJsonList(null)).toEqual([]);
    expect(parseJsonList("not json")).toEqual([]);
    expect(parseJsonList('{"a":1}')).toEqual([]);
    expect(parseJsonList('["ok", 42]')).toEqual(["ok"]);
  });

  test("adds host routes for DNS servers and deduplicates", () => {
    expect(workerRoutes(["10.0.0.0/8", "10.1.0.53/32"], ["10.1.0.53", "10.1.0.54"])).toEqual([
      "10.0.0.0/8",
      "10.1.0.53/32",
      "10.1.0.54/32",
    ]);
  });

  test("aggregates the advertised network across profiles", () => {
    const network = aggregateAdvertisedNetwork([
      { routes: '["10.2.0.0/16", "invalid"]', dnsServers: '["10.2.0.53"]' },
      { routes: '["10.1.0.0/16", "10.2.0.0/16"]', dnsServers: "[]" },
    ]);
    expect(network.routes).toEqual(["10.1.0.0/16", "10.2.0.0/16", "10.2.0.53/32"]);
    expect(network.dnsServers).toEqual(["10.2.0.53"]);
  });
});
