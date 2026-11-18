import type { NodeProfile } from "../types/singbox";

export type QuickSwitchSort = "default" | "delay" | "name";
export type QuickSwitchTransportFilter = "all" | "h2" | "quic";

export interface QuickSwitchFilterOptions {
  query: string;
  transport: QuickSwitchTransportFilter;
  onlyAvailable: boolean;
  sortBy: QuickSwitchSort;
  delays: Record<string, number | "testing" | "error">;
}

export function selectQuickPillNodes(
  profiles: NodeProfile[],
  activeProfileId: string | null,
  delays: Record<string, number | "testing" | "error">,
  limit = 8,
): NodeProfile[] {
  if (profiles.length <= limit) {
    return profiles;
  }

  const picked: NodeProfile[] = [];
  const seen = new Set<string>();
  const push = (node: NodeProfile | undefined) => {
    if (!node || seen.has(node.id) || picked.length >= limit) return;
    seen.add(node.id);
    picked.push(node);
  };

  if (activeProfileId) {
    push(profiles.find((p) => p.id === activeProfileId));
  }

  const tested = profiles
    .filter((p) => typeof delays[p.id] === "number")
    .slice()
    .sort((a, b) => (delays[a.id] as number) - (delays[b.id] as number));
  for (const node of tested) {
    push(node);
  }

  for (const node of profiles) {
    push(node);
  }

  return picked;
}

function delaySortRank(val: number | "testing" | "error" | undefined): number {
  if (typeof val === "number") return val;
  if (val === "testing") return 1_000_000;
  if (val === undefined) return 2_000_000;
  return 3_000_000;
}

export function filterAndSortQuickSwitchNodes(
  profiles: NodeProfile[],
  opts: QuickSwitchFilterOptions,
): NodeProfile[] {
  const q = opts.query.trim().toLowerCase();
  const filtered = profiles.filter((node) => {
    if (opts.transport === "quic" && !node.quic) return false;
    if (opts.transport === "h2" && node.quic) return false;
    if (opts.onlyAvailable && typeof opts.delays[node.id] !== "number") return false;
    if (!q) return true;
    const proto = (node.protocol ?? "naive").toLowerCase();
    const addr = `${node.server}:${node.serverPort}`.toLowerCase();
    return (
      node.name.toLowerCase().includes(q) ||
      node.server.toLowerCase().includes(q) ||
      addr.includes(q) ||
      node.tag.toLowerCase().includes(q) ||
      proto.includes(q)
    );
  });

  if (opts.sortBy === "delay") {
    return filtered.slice().sort((a, b) => {
      const diff = delaySortRank(opts.delays[a.id]) - delaySortRank(opts.delays[b.id]);
      if (diff !== 0) return diff;
      return a.name.localeCompare(b.name);
    });
  }

  if (opts.sortBy === "name") {
    return filtered.slice().sort((a, b) => a.name.localeCompare(b.name));
  }

  return filtered;
}
