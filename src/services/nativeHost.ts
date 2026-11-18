import { host, platform } from "nsh";
import { buildSingBoxConfig, resolveNodeOutboundTags } from "../core/singboxConfig";
import type {
  AppSettings,
  ClashConnectionItem,
  CoreRunState,
  LogEntry,
  NodeProfile,
  TrafficStats,
} from "../types/singbox";

export interface HostVpnInfo {
  available: boolean;
  engine: string;
  version: string;
  platform: string;
  running: boolean;
  error?: string | null;
}

export interface HostVpnCheckResult {
  ok: boolean;
  output: string;
}

export interface HostVpnStartResult {
  ok: boolean;
  version?: string;
  error?: string | null;
}

export interface HostVpnStatsResult {
  stats: TrafficStats;
  connections: ClashConnectionItem[];
}

export interface HostVpnSubscriptions {
  onState?: (state: CoreRunState, errorMessage?: string | null) => void;
  onLog?: (entry: Omit<LogEntry, "id">) => void;
  onStats?: (payload: HostVpnStatsResult) => void;
}

export function isNativeHostAvailable(): boolean {
  try {
    return typeof host?.available === "function" && Boolean(host.available());
  } catch {
    return false;
  }
}

export function buildHostVpnConfigJson(
  profiles: NodeProfile[],
  activeProfileId: string | null,
  settings: AppSettings,
): string {
  const targetPlatform = platform.os === "android" ? "android" : platform.os;
  const configObj = buildSingBoxConfig(profiles, activeProfileId, settings, {
    platform: targetPlatform,
  });
  return JSON.stringify(configObj, null, 2);
}

export async function getHostVpnInfo(): Promise<HostVpnInfo> {
  const res = (await host.call("vpn.getInfo")) as Partial<HostVpnInfo> | null;
  return {
    available: Boolean(res?.available ?? true),
    engine: typeof res?.engine === "string" ? res.engine : "libbox",
    version: typeof res?.version === "string" ? res.version : "libbox",
    platform: typeof res?.platform === "string" ? res.platform : platform.os,
    running: Boolean(res?.running),
    error: typeof res?.error === "string" ? res.error : null,
  };
}

export async function checkHostVpnConfig(
  profiles: NodeProfile[],
  activeProfileId: string | null,
  settings: AppSettings,
): Promise<HostVpnCheckResult> {
  const configJson = buildHostVpnConfigJson(profiles, activeProfileId, settings);
  const res = (await host.call("vpn.checkConfig", { configJson })) as Partial<HostVpnCheckResult> | null;
  return {
    ok: Boolean(res?.ok),
    output: typeof res?.output === "string" ? res.output : res?.ok ? "libbox 配置校验通过" : "libbox 配置校验失败",
  };
}

export async function startHostVpn(
  profiles: NodeProfile[],
  activeProfileId: string | null,
  settings: AppSettings,
): Promise<HostVpnStartResult> {
  const configJson = buildHostVpnConfigJson(profiles, activeProfileId, settings);
  const active = profiles.find((p) => p.id === activeProfileId) ?? profiles[0] ?? null;
  const activeTag = active
    ? (resolveNodeOutboundTags(profiles).get(active.id) ?? active.tag)
    : "direct";
  const res = (await host.call("vpn.start", { configJson, activeTag }, { timeout: 60000 })) as Partial<HostVpnStartResult> | null;
  return {
    ok: Boolean(res?.ok),
    version: typeof res?.version === "string" ? res.version : undefined,
    error: typeof res?.error === "string" ? res.error : null,
  };
}

export async function stopHostVpn(): Promise<void> {
  await host.call("vpn.stop");
}

export async function selectHostOutbound(tag: string): Promise<boolean> {
  const res = (await host.call("vpn.selectOutbound", { tag })) as { ok?: boolean } | null;
  return Boolean(res?.ok);
}

export async function getHostVpnStats(): Promise<HostVpnStatsResult> {
  const res = (await host.call("vpn.getStats")) as Partial<HostVpnStatsResult> | null;
  return {
    stats: {
      up: Number(res?.stats?.up ?? 0),
      down: Number(res?.stats?.down ?? 0),
      connections: Number(res?.stats?.connections ?? 0),
      memoryBytes: Number(res?.stats?.memoryBytes ?? 0),
    },
    connections: Array.isArray(res?.connections) ? res.connections : [],
  };
}

export async function testHostOutboundDelay(
  tag: string,
  url = "https://www.gstatic.com/generate_204",
  timeoutMs = 5000,
): Promise<number> {
  const res = (await host.call(
    "vpn.testDelay",
    { tag, url, timeoutMs },
    { timeout: timeoutMs + 2500 },
  )) as { ok?: boolean; delayMs?: number; error?: string } | null;
  if (res?.ok && typeof res.delayMs === "number") {
    return res.delayMs;
  }
  throw new Error(res?.error || "原生延迟测试失败");
}

function normalizeLogLevel(raw: unknown): LogEntry["level"] {
  if (raw === "error" || raw === "warn" || raw === "info" || raw === "debug") {
    return raw;
  }
  return "info";
}

function normalizeRunState(raw: unknown): CoreRunState {
  if (
    raw === "stopped" ||
    raw === "checking" ||
    raw === "starting" ||
    raw === "running" ||
    raw === "stopping" ||
    raw === "error"
  ) {
    return raw;
  }
  return "stopped";
}

export function subscribeHostVpnEvents(callbacks: HostVpnSubscriptions): () => void {
  if (!isNativeHostAvailable()) {
    return () => {};
  }

  const offState = host.on<{ state?: string; error?: string | null }>("vpn.state", (payload) => {
    callbacks.onState?.(normalizeRunState(payload?.state), payload?.error ?? null);
  });

  const offLog = host.on<{ timestamp?: string; level?: string; message?: string }>("vpn.log", (payload) => {
    const message = typeof payload?.message === "string" ? payload.message : "";
    if (!message.trim()) return;
    callbacks.onLog?.({
      timestamp: typeof payload?.timestamp === "string" ? payload.timestamp : new Date().toLocaleTimeString(),
      stream: "stdout",
      level: normalizeLogLevel(payload?.level),
      message,
    });
  });

  const offStats = host.on<Partial<HostVpnStatsResult>>("vpn.stats", (payload) => {
    callbacks.onStats?.({
      stats: {
        up: Number(payload?.stats?.up ?? 0),
        down: Number(payload?.stats?.down ?? 0),
        connections: Number(payload?.stats?.connections ?? 0),
        memoryBytes: Number(payload?.stats?.memoryBytes ?? 0),
      },
      connections: Array.isArray(payload?.connections) ? payload.connections : [],
    });
  });

  return () => {
    offState();
    offLog();
    offStats();
  };
}
