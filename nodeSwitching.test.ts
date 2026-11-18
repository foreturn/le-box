import { describe, expect, test } from "nsh/test";
import { createDefaultNaiveProfile } from "./src/core/naiveSchema";
import {
  filterAndSortQuickSwitchNodes,
  selectQuickPillNodes,
} from "./src/core/nodeSwitching";
import type { NodeProfile } from "./src/types/singbox";

function makeSampleNodes(count: number): NodeProfile[] {
  return Array.from({ length: count }, (_, idx) => {
    const num = String(idx + 1).padStart(2, "0");
    return createDefaultNaiveProfile({
      id: `node-${num}`,
      name: `Node ${num}`,
      tag: `tag-${num}`,
      server: `s${num}.example.com`,
      serverPort: 443 + idx,
      quic: idx % 2 === 1,
    });
  });
}

describe("Dashboard quick node switching helpers", () => {
  test("selectQuickPillNodes preserves original order when count <= limit", () => {
    const nodes = makeSampleNodes(5);
    const selected = selectQuickPillNodes(nodes, "node-04", { "node-02": 18 }, 8);
    expect(selected.map((n) => n.id)).toEqual([
      "node-01",
      "node-02",
      "node-03",
      "node-04",
      "node-05",
    ]);
  });

  test("selectQuickPillNodes pins active node first and prioritizes tested latency when > limit", () => {
    const nodes = makeSampleNodes(14);
    const delays: Record<string, number | "testing" | "error"> = {
      "node-11": 85,
      "node-06": 24,
      "node-09": "error",
      "node-04": "testing",
      "node-13": 42,
    };

    const selected = selectQuickPillNodes(nodes, "node-12", delays, 8);
    expect(selected.length).toBe(8);
    expect(selected[0].id).toBe("node-12");
    expect(selected.slice(1, 4).map((n) => n.id)).toEqual([
      "node-06",
      "node-13",
      "node-11",
    ]);
    expect(selected.slice(4).map((n) => n.id)).toEqual([
      "node-01",
      "node-02",
      "node-03",
      "node-04",
    ]);
  });

  test("filterAndSortQuickSwitchNodes filters by query, transport, and availability", () => {
    const nodes = makeSampleNodes(6);
    const delays: Record<string, number | "testing" | "error"> = {
      "node-01": 120,
      "node-02": 35,
      "node-03": "error",
      "node-04": 60,
      "node-05": "testing",
    };

    const byPort = filterAndSortQuickSwitchNodes(nodes, {
      query: "s04.example.com:446",
      transport: "all",
      onlyAvailable: false,
      sortBy: "default",
      delays,
    });
    expect(byPort.map((n) => n.id)).toEqual(["node-04"]);

    const quicAvailable = filterAndSortQuickSwitchNodes(nodes, {
      query: "",
      transport: "quic",
      onlyAvailable: true,
      sortBy: "delay",
      delays,
    });
    expect(quicAvailable.map((n) => n.id)).toEqual(["node-02", "node-04"]);

    const h2Only = filterAndSortQuickSwitchNodes(nodes, {
      query: "TAG-05",
      transport: "h2",
      onlyAvailable: false,
      sortBy: "default",
      delays,
    });
    expect(h2Only.map((n) => n.id)).toEqual(["node-05"]);
  });

  test("filterAndSortQuickSwitchNodes sorts by delay and name cleanly", () => {
    const nodes = [
      createDefaultNaiveProfile({ id: "a", name: "Tokyo 02", tag: "t2", server: "t2.example.com" }),
      createDefaultNaiveProfile({ id: "b", name: "Alpha 01", tag: "a1", server: "a1.example.com" }),
      createDefaultNaiveProfile({ id: "c", name: "HongKong 03", tag: "hk3", server: "hk3.example.com" }),
      createDefaultNaiveProfile({ id: "d", name: "Boston 04", tag: "b4", server: "b4.example.com" }),
      createDefaultNaiveProfile({ id: "e", name: "London 05", tag: "l5", server: "l5.example.com" }),
    ];
    const delays: Record<string, number | "testing" | "error"> = {
      a: "error",
      b: 90,
      c: 20,
      d: "testing",
    };

    const sortedByDelay = filterAndSortQuickSwitchNodes(nodes, {
      query: "",
      transport: "all",
      onlyAvailable: false,
      sortBy: "delay",
      delays,
    });
    expect(sortedByDelay.map((n) => n.id)).toEqual(["c", "b", "d", "e", "a"]);

    const sortedByName = filterAndSortQuickSwitchNodes(nodes, {
      query: "",
      transport: "all",
      onlyAvailable: false,
      sortBy: "name",
      delays,
    });
    expect(sortedByName.map((n) => n.name)).toEqual([
      "Alpha 01",
      "Boston 04",
      "HongKong 03",
      "London 05",
      "Tokyo 02",
    ]);
  });
});
