import { Storage } from "nsh";
import * as fs from "fs/promises";
import * as path from "path";
import process from "process";
import type { ChildProcess } from "process";
import { createDefaultNodeProfile, normalizeNodeProfile } from "../core/nodeProtocols";
import { createDefaultRoutingSettings } from "../core/routePresets";
import { buildSingBoxConfig, createDefaultSettings } from "../core/singboxConfig";
import type {
  AppSettings,
  ClashConnectionItem,
  CoreBinaryOrigin,
  CoreRunState,
  LogEntry,
  NodeProfile,
  TrafficStats,
} from "../types/singbox";

const STORAGE_KEYS = {
  profiles: "lebox.profiles.v1",
  activeId: "lebox.activeProfileId.v1",
  settings: "lebox.settings.v1",
} as const;

const CORE_ORIGIN_FILENAME = "sing-box.origin.json";

export interface CoreOriginMarker {
  origin: CoreBinaryOrigin;
  version?: string;
  updatedAt: string;
}

export interface ResolvedSingBoxExecution {
  command: string;
  prefixArgs: string[];
  cwd?: string;
  displayPath: string;
  origin: CoreBinaryOrigin;
}

export interface BootstrapSingBoxResult {
  copied: boolean;
  origin: CoreBinaryOrigin;
  path: string | null;
}

export interface PersistedState {
  profiles: NodeProfile[];
  activeProfileId: string | null;
  settings: AppSettings;
}

export async function loadPersistedState(): Promise<PersistedState> {
  const defaultSettings = createDefaultSettings();
  let profiles: NodeProfile[] = [];
  let activeProfileId: string | null = null;
  let settings: AppSettings = defaultSettings;

  try {
    const rawProfiles = await Storage.getItem(STORAGE_KEYS.profiles);
    if (rawProfiles) {
      const parsed = JSON.parse(rawProfiles);
      if (Array.isArray(parsed)) {
        profiles = parsed.map((item) => normalizeNodeProfile(item));
      }
    }
  } catch {
    profiles = [];
  }

  if (profiles.length === 0) {
    const starter = createDefaultNodeProfile("naive", {
      id: "naive-default-1",
      name: "NaiveProxy 示例节点",
      tag: "naive-out",
      server: "example.com",
      serverPort: 443,
      username: "alice",
      password: "password",
    });
    profiles = [starter];
    activeProfileId = starter.id;
  }

  try {
    const rawActive = await Storage.getItem(STORAGE_KEYS.activeId);
    if (rawActive) activeProfileId = rawActive;
  } catch {
    // ignore storage read issue
  }
  if (!activeProfileId || !profiles.some((p) => p.id === activeProfileId)) {
    activeProfileId = profiles[0]?.id ?? null;
  }

  try {
    const rawSettings = await Storage.getItem(STORAGE_KEYS.settings);
    if (rawSettings) {
      const parsed = JSON.parse(rawSettings) as Partial<AppSettings>;
      const defaultRouting = createDefaultRoutingSettings();
      const parsedRouting = parsed.routing;
      const migratedRouting = parsedRouting
        ? {
            ...defaultRouting,
            ...parsedRouting,
            rules: Array.isArray(parsedRouting.rules) ? parsedRouting.rules : defaultRouting.rules,
          }
        : {
            ...defaultRouting,
            rules: defaultRouting.rules.map((r) => {
              if (r.matchType === "ip_is_private" && typeof parsed.bypassPrivateIp === "boolean") {
                return { ...r, enabled: parsed.bypassPrivateIp };
              }
              return r;
            }),
          };
      const parsedRevision = typeof parsed.settingsRevision === "number" ? parsed.settingsRevision : 1;
      const shouldUpgradeLegacyDns =
        parsedRevision < 2 &&
        parsed.dns?.localType === "local" &&
        !parsed.dns?.strategy;
      settings = {
        ...defaultSettings,
        ...parsed,
        settingsRevision: Math.max(2, parsedRevision),
        mixed: { ...defaultSettings.mixed, ...(parsed.mixed ?? {}) },
        tun: { ...defaultSettings.tun, ...(parsed.tun ?? {}) },
        dns: {
          ...defaultSettings.dns,
          ...(parsed.dns ?? {}),
          localType: shouldUpgradeLegacyDns
            ? "udp"
            : parsed.dns?.localType ?? defaultSettings.dns.localType,
          strategy: shouldUpgradeLegacyDns
            ? "prefer_ipv4"
            : parsed.dns?.strategy ?? defaultSettings.dns.strategy,
          localServer:
            parsed.dns?.localServer && parsed.dns.localServer.trim().toLowerCase() !== "local"
              ? parsed.dns.localServer
              : defaultSettings.dns.localServer,
        },
        clashApi: { ...defaultSettings.clashApi, ...(parsed.clashApi ?? {}) },
        routing: migratedRouting,
      };
    }
  } catch {
    settings = defaultSettings;
  }

  return { profiles, activeProfileId, settings };
}

export async function saveProfiles(profiles: NodeProfile[], activeProfileId: string | null): Promise<void> {
  await Storage.setItem(STORAGE_KEYS.profiles, JSON.stringify(profiles));
  if (activeProfileId) {
    await Storage.setItem(STORAGE_KEYS.activeId, activeProfileId);
  } else {
    await Storage.removeItem(STORAGE_KEYS.activeId);
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await Storage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings));
}

export function isDesktopPlatform(): boolean {
  return (
    process.platform === "windows" ||
    process.platform === "macos" ||
    process.platform === "linux"
  );
}

export function getSingBoxBinaryName(): string {
  return process.platform === "windows" ? "sing-box.exe" : "sing-box";
}

export function getBundledTargetSubdir(
  platform = process.platform,
  arch = process.arch,
): string {
  return `${platform}-${arch}`;
}

export function getDataDirSingBoxPath(): string | null {
  if (!process.dataDir || !isDesktopPlatform()) return null;
  return path.join(process.dataDir, getSingBoxBinaryName());
}

function getCoreOriginMarkerPath(): string | null {
  if (!process.dataDir) return null;
  return path.join(process.dataDir, CORE_ORIGIN_FILENAME);
}

export async function readCoreOriginMarker(): Promise<CoreOriginMarker | null> {
  const markerPath = getCoreOriginMarkerPath();
  if (!markerPath) return null;
  try {
    if (!(await fs.exists(markerPath))) return null;
    const raw = await fs.readFile(markerPath, "utf8");
    const parsed = JSON.parse(raw) as Partial<CoreOriginMarker>;
    if (
      parsed.origin === "bundled" ||
      parsed.origin === "hot-updated" ||
      parsed.origin === "path" ||
      parsed.origin === "custom"
    ) {
      return {
        origin: parsed.origin,
        version: typeof parsed.version === "string" ? parsed.version : undefined,
        updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
      };
    }
  } catch {
    return null;
  }
  return null;
}

export async function writeCoreOriginMarker(marker: CoreOriginMarker): Promise<void> {
  const markerPath = getCoreOriginMarkerPath();
  if (!markerPath || !process.dataDir) return;
  await fs.mkdir(process.dataDir, { recursive: true });
  await fs.writeFile(markerPath, JSON.stringify(marker, null, 2));
}

function resolveFileUrlToLocalPath(fileUrl: string): string | null {
  if (!fileUrl.startsWith("file://")) return null;
  try {
    const parsed = new URL(fileUrl);
    let pathname = decodeURIComponent(parsed.pathname);
    if (process.platform === "windows" && /^\/[A-Za-z]:/.test(pathname)) {
      pathname = pathname.slice(1).replace(/\//g, "\\");
    }
    return pathname;
  } catch {
    return null;
  }
}

function quotePowerShellLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

function getDevBundledCandidate(): string | null {
  try {
    const coreDirUrl = new URL("../../core/", import.meta.url).href;
    const coreDir = resolveFileUrlToLocalPath(coreDirUrl);
    if (!coreDir) return null;
    return path.join(coreDir, getBundledTargetSubdir(), getSingBoxBinaryName());
  } catch {
    return null;
  }
}

export async function bootstrapBundledSingBox(): Promise<BootstrapSingBoxResult> {
  const dataBin = getDataDirSingBoxPath();
  if (!dataBin || !process.dataDir) {
    return { copied: false, origin: "path", path: null };
  }

  try {
    await fs.mkdir(process.dataDir, { recursive: true });
    if (await fs.exists(dataBin)) {
      const marker = await readCoreOriginMarker();
      if (!marker) {
        await writeCoreOriginMarker({
          origin: "bundled",
          updatedAt: new Date().toISOString(),
        });
      }
      return {
        copied: false,
        origin: marker?.origin ?? "bundled",
        path: dataBin,
      };
    }

    const devCandidate = getDevBundledCandidate() ?? "";
    const binName = getSingBoxBinaryName();
    const targetSubdir = getBundledTargetSubdir();

    if (process.platform === "windows") {
      const psScript = [
        "$ErrorActionPreference = 'Stop'",
        "$ppid = (Get-CimInstance Win32_Process -Filter \"ProcessId=$PID\").ParentProcessId",
        "$hostExe = (Get-Process -Id $ppid -ErrorAction SilentlyContinue).Path",
        "$appDir = if ($hostExe) { Split-Path -Parent $hostExe } else { $null }",
        "$candidates = @()",
        `if ($appDir) { $candidates += (Join-Path $appDir 'core\\${binName}'); $candidates += (Join-Path $appDir 'core\\${targetSubdir}\\${binName}') }`,
        devCandidate
          ? `$candidates += '${quotePowerShellLiteral(devCandidate)}'`
          : "$null | Out-Null",
        "$src = $candidates | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1",
        `if ($src) { Copy-Item -LiteralPath $src -Destination '${quotePowerShellLiteral(dataBin)}' -Force }`,
      ].join("; ");

      await process.run(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-Command", psScript],
        { cwd: process.dataDir, timeoutMs: 20000 },
      );
    } else {
      const shellScript = [
        "dest=\"$1\"",
        "dev_cand=\"$2\"",
        "bin_name=\"$3\"",
        "subdir=\"$4\"",
        "ppid_val=$(ps -p $$ -o ppid= 2>/dev/null | tr -d ' ')",
        "host_bin=\"\"",
        "if [ -r \"/proc/$ppid_val/exe\" ]; then host_bin=$(readlink -f \"/proc/$ppid_val/exe\" 2>/dev/null || true); fi",
        "if [ -z \"$host_bin\" ] && [ -n \"$ppid_val\" ]; then host_bin=$(ps -p \"$ppid_val\" -o comm= 2>/dev/null || true); fi",
        "app_dir=\"\"",
        "if [ -n \"$host_bin\" ]; then app_dir=$(dirname \"$host_bin\"); fi",
        "src=\"\"",
        "for cand in \"$app_dir/core/$bin_name\" \"$app_dir/../Resources/core/$bin_name\" \"$app_dir/core/$subdir/$bin_name\" \"$dev_cand\"; do",
        "  if [ -n \"$cand\" ] && [ -f \"$cand\" ]; then src=\"$cand\"; break; fi",
        "done",
        "if [ -n \"$src\" ]; then cp \"$src\" \"$dest\" && chmod +x \"$dest\"; fi",
      ].join("; ");

      await process.run(
        "env",
        ["sh", "-c", shellScript, "_", dataBin, devCandidate, binName, targetSubdir],
        { cwd: process.dataDir, timeoutMs: 20000 },
      );
    }

    if (await fs.exists(dataBin)) {
      await writeCoreOriginMarker({
        origin: "bundled",
        updatedAt: new Date().toISOString(),
      });
      return { copied: true, origin: "bundled", path: dataBin };
    }
  } catch {
    // Graceful fallback when running in sandboxed test or without bundled core
  }

  return { copied: false, origin: "path", path: null };
}

export async function resolveSingBoxExecution(
  configuredPath: string,
): Promise<ResolvedSingBoxExecution> {
  const trimmed = configuredPath.trim();
  const isDefaultName =
    !trimmed || trimmed === "sing-box" || trimmed === "sing-box.exe";

  if (!isDefaultName) {
    return {
      command: trimmed,
      prefixArgs: [],
      cwd: process.dataDir ?? undefined,
      displayPath: trimmed,
      origin: "custom",
    };
  }

  const dataBin = getDataDirSingBoxPath();
  if (dataBin) {
    try {
      if (await fs.exists(dataBin)) {
        const marker = await readCoreOriginMarker();
        const origin: CoreBinaryOrigin =
          marker?.origin === "hot-updated" ? "hot-updated" : "bundled";
        if (process.platform === "windows") {
          return {
            command: "sing-box.exe",
            prefixArgs: [],
            cwd: process.dataDir ?? undefined,
            displayPath: dataBin,
            origin,
          };
        }
        return {
          command: "env",
          prefixArgs: [dataBin],
          cwd: process.dataDir ?? undefined,
          displayPath: dataBin,
          origin,
        };
      }
    } catch {
      // Fallback to PATH resolution
    }
  }

  const fallbackCmd = getSingBoxBinaryName();
  return {
    command: fallbackCmd,
    prefixArgs: [],
    cwd: process.dataDir ?? undefined,
    displayPath: trimmed || fallbackCmd,
    origin: "path",
  };
}

export function getRuntimeConfigPath(): string | null {
  if (!process.dataDir) return null;
  return path.join(process.dataDir, "lebox-config.json");
}

export async function writeRuntimeConfigFile(
  profiles: NodeProfile[],
  activeProfileId: string | null,
  settings: AppSettings,
): Promise<{ path: string; json: string }> {
  const configObj = buildSingBoxConfig(profiles, activeProfileId, settings);
  const json = JSON.stringify(configObj, null, 2);
  const target = getRuntimeConfigPath();
  if (!target || !process.dataDir) {
    throw new Error("当前运行环境未提供桌面数据目录 (process.dataDir 为空)。");
  }
  await fs.mkdir(process.dataDir, { recursive: true });
  await fs.writeFile(target, json);
  return { path: target, json };
}

export function formatProcessError(error: unknown): string {
  if (error instanceof Error) {
    const code = (error as Error & { code?: string }).code;
    return code ? `${code}: ${error.message}` : error.message;
  }
  return String(error);
}

export async function probeSingBoxVersion(
  binary: string,
): Promise<{
  ok: boolean;
  version: string;
  raw: string;
  origin: CoreBinaryOrigin;
  resolvedPath: string;
}> {
  const exec = await resolveSingBoxExecution(binary);
  try {
    const res = await process.run(
      exec.command,
      [...exec.prefixArgs, "version"],
      { timeoutMs: 5000, cwd: exec.cwd },
    );
    const text = (res.stdout || res.stderr || "").trim();
    const firstLine = text.split(/\r?\n/)[0] ?? "";
    return {
      ok: res.code === 0,
      version: firstLine || (res.code === 0 ? "sing-box ready" : `exit ${String(res.code)}`),
      raw: text,
      origin: exec.origin,
      resolvedPath: exec.displayPath,
    };
  } catch (err) {
    return {
      ok: false,
      version: formatProcessError(err),
      raw: formatProcessError(err),
      origin: exec.origin,
      resolvedPath: exec.displayPath,
    };
  }
}

export async function checkSingBoxConfig(
  binary: string,
  profiles: NodeProfile[],
  activeProfileId: string | null,
  settings: AppSettings,
): Promise<{ ok: boolean; output: string; configPath: string }> {
  const { path: configPath } = await writeRuntimeConfigFile(profiles, activeProfileId, settings);
  const exec = await resolveSingBoxExecution(binary);
  const res = await process.run(
    exec.command,
    [...exec.prefixArgs, "check", "-c", configPath],
    { timeoutMs: 10000, cwd: exec.cwd },
  );
  const output = [res.stdout.trim(), res.stderr.trim()].filter(Boolean).join("\n");
  return {
    ok: res.code === 0,
    output: output || (res.code === 0 ? "sing-box check 通过：配置语法与节点出站校验成功。" : `退出码: ${String(res.code)}`),
    configPath,
  };
}

export interface CoreCallbacks {
  onStateChange: (state: CoreRunState, errorMessage?: string | null) => void;
  onLog: (entry: Omit<LogEntry, "id">) => void;
}

const ANSI_ESCAPE_RE = /\u001b\[[0-9;]*[a-zA-Z]/g;

export function stripAnsiCodes(line: string): string {
  return line.replace(ANSI_ESCAPE_RE, "");
}

export function detectLogLevel(line: string, fallbackStream: "stdout" | "stderr"): LogEntry["level"] {
  const clean = stripAnsiCodes(line).trim();
  const tokenMatch = clean.match(/^(?:[+-]\d{4}\s+\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\s+)?(FATAL|PANIC|ERROR|WARN|INFO|DEBUG|TRACE)\b/i);
  if (tokenMatch) {
    const token = tokenMatch[1]!.toUpperCase();
    if (token === "FATAL" || token === "PANIC" || token === "ERROR") return "error";
    if (token === "WARN") return "warn";
    if (token === "INFO") return "info";
    return "debug";
  }
  const lower = clean.toLowerCase();
  if (lower.includes("fatal") || lower.includes("error")) return "error";
  if (lower.includes("warn")) return "warn";
  if (lower.includes("info")) return "info";
  if (lower.includes("debug") || lower.includes("trace")) return "debug";
  return fallbackStream === "stderr" ? "warn" : "info";
}

export class SingBoxController {
  private child: ChildProcess | null = null;
  private exitPromise: Promise<void> | null = null;
  private state: CoreRunState = "stopped";
  private callbacks: CoreCallbacks;

  constructor(callbacks: CoreCallbacks) {
    this.callbacks = callbacks;
  }

  getState(): CoreRunState {
    return this.state;
  }

  getPid(): number | null {
    return this.child ? this.child.pid : null;
  }

  private setState(next: CoreRunState, errorMessage?: string | null): void {
    this.state = next;
    this.callbacks.onStateChange(next, errorMessage ?? null);
  }

  private pushSystemLog(level: LogEntry["level"], message: string): void {
    this.callbacks.onLog({
      timestamp: new Date().toLocaleTimeString(),
      stream: "system",
      level,
      message,
    });
  }

  async start(profiles: NodeProfile[], activeProfileId: string | null, settings: AppSettings): Promise<void> {
    if (this.child) {
      await this.stop();
    }
    const exec = await resolveSingBoxExecution(settings.singBoxPath);
    this.setState("checking");
    this.pushSystemLog("info", `正在生成并校验 sing-box 配置 (${exec.displayPath})...`);

    try {
      const checkRes = await checkSingBoxConfig(settings.singBoxPath, profiles, activeProfileId, settings);
      if (!checkRes.ok) {
        this.setState("error", checkRes.output);
        this.pushSystemLog("error", `配置校验失败: ${checkRes.output}`);
        return;
      }

      this.setState("starting");
      this.pushSystemLog("info", `启动内核: ${exec.displayPath} run -c ${checkRes.configPath}`);

      const child = process.spawn(
        exec.command,
        [...exec.prefixArgs, "run", "-c", checkRes.configPath],
        {
          lines: true,
          stdin: "null",
          cwd: exec.cwd,
        },
      );
      this.child = child;

      let lastFatalHint = "";
      const recordOutput = (stream: "stdout" | "stderr", line: string) => {
        const clean = stripAnsiCodes(line);
        if (!clean.trim()) return;
        const level = detectLogLevel(clean, stream);
        if (level === "error") {
          lastFatalHint = clean.trim();
        }
        this.callbacks.onLog({
          timestamp: new Date().toLocaleTimeString(),
          stream,
          level,
          message: clean,
        });
      };

      let resolveExit: (() => void) | null = null;
      this.exitPromise = new Promise<void>((resolve) => {
        resolveExit = resolve;
      });

      child.on("stdout", (line) => recordOutput("stdout", line));
      child.on("stderr", (line) => recordOutput("stderr", line));

      child.on("exit", (res) => {
        if (this.child === child) {
          this.child = null;
        }
        this.exitPromise = null;
        resolveExit?.();
        if (this.state === "stopping") {
          this.setState("stopped");
          this.pushSystemLog("info", "sing-box 内核已停止。");
        } else if (res.error) {
          this.setState("error", res.error);
          this.pushSystemLog("error", `sing-box 异常退出: ${res.error}`);
        } else if (res.code !== 0) {
          let msg = `sing-box 退出 (code=${String(res.code ?? "null")}, signal=${String(res.signal ?? "none")})`;
          if (lastFatalHint) {
            msg += ` · ${lastFatalHint}`;
          }
          if (
            process.platform === "linux" &&
            /operation not permitted|cap_net_admin|configure tun/i.test(lastFatalHint)
          ) {
            msg += ` (Linux TUN 需授权: sudo setcap cap_net_admin,cap_net_bind_service=+ep ${exec.displayPath})`;
          }
          this.setState("error", msg);
          this.pushSystemLog("error", msg);
        } else {
          this.setState("stopped");
          this.pushSystemLog("info", `sing-box 已退出 (code=${String(res.code ?? "null")})。`);
        }
      });

      this.setState("running");
      this.pushSystemLog("info", `sing-box 已运行 (PID: ${child.pid})。`);
    } catch (err) {
      const msg = formatProcessError(err);
      this.child = null;
      this.exitPromise = null;
      this.setState("error", msg);
      this.pushSystemLog("error", `启动失败: ${msg}`);
    }
  }

  async stop(): Promise<void> {
    if (!this.child) {
      this.setState("stopped");
      return;
    }
    this.setState("stopping");
    const current = this.child;
    const waitExit = this.exitPromise;
    try {
      current.kill();
    } catch {
      this.child = null;
      this.exitPromise = null;
      this.setState("stopped");
      return;
    }

    if (waitExit) {
      await Promise.race([
        waitExit,
        new Promise<void>((resolve) => setTimeout(resolve, 3500)),
      ]);
    }
    if (process.platform === "windows") {
      await new Promise<void>((resolve) => setTimeout(resolve, 120));
    }
    if (this.child === current) {
      this.child = null;
      this.exitPromise = null;
      this.setState("stopped");
    }
  }
}

function buildClashUrl(settings: AppSettings, pathname: string): string {
  const host = settings.clashApi.listen.trim() || "127.0.0.1";
  const formattedHost = host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
  return `http://${formattedHost}:${settings.clashApi.port}${pathname}`;
}

function buildClashHeaders(settings: AppSettings): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (settings.clashApi.secret.trim()) {
    headers.Authorization = `Bearer ${settings.clashApi.secret.trim()}`;
  }
  return headers;
}

export async function fetchClashConnections(
  settings: AppSettings,
): Promise<{ stats: TrafficStats; items: ClashConnectionItem[] }> {
  const res = await fetch(buildClashUrl(settings, "/connections"), {
    headers: buildClashHeaders(settings),
  });
  if (!res.ok) {
    throw new Error(`Clash API HTTP ${res.status}`);
  }
  const data = (await res.json()) as {
    uploadTotal?: number;
    downloadTotal?: number;
    memory?: number;
    connections?: Array<{
      id?: string;
      upload?: number;
      download?: number;
      start?: string;
      rule?: string;
      chains?: string[];
      metadata?: { host?: string; destinationIP?: string; destinationPort?: string; network?: string };
    }>;
  };
  const rawList = Array.isArray(data.connections) ? data.connections : [];
  const items: ClashConnectionItem[] = rawList.slice(0, 60).map((c) => {
    const host = c.metadata?.host || c.metadata?.destinationIP || "-";
    const port = c.metadata?.destinationPort ? `:${c.metadata.destinationPort}` : "";
    return {
      id: String(c.id ?? ""),
      host: `${host}${port}`,
      network: String(c.metadata?.network ?? "tcp"),
      rule: String(c.rule ?? "-"),
      chains: Array.isArray(c.chains) ? c.chains : [],
      upload: Number(c.upload ?? 0),
      download: Number(c.download ?? 0),
      start: String(c.start ?? ""),
    };
  });

  return {
    stats: {
      up: Number(data.uploadTotal ?? 0),
      down: Number(data.downloadTotal ?? 0),
      connections: rawList.length,
      memoryBytes: Number(data.memory ?? 0),
    },
    items,
  };
}

export async function testNaiveDelay(
  settings: AppSettings,
  outboundTag: string,
  testUrl = "https://www.gstatic.com/generate_204",
  timeoutMs = 5000,
): Promise<number> {
  const encodedTag = encodeURIComponent(outboundTag);
  const encodedUrl = encodeURIComponent(testUrl);
  const res = await fetch(buildClashUrl(settings, `/proxies/${encodedTag}/delay?timeout=${timeoutMs}&url=${encodedUrl}`), {
    headers: buildClashHeaders(settings),
  });
  if (!res.ok) {
    throw new Error(`测速失败 (HTTP ${res.status})`);
  }
  const body = (await res.json()) as { delay?: number };
  if (typeof body.delay !== "number") {
    throw new Error("未返回有效延迟数值");
  }
  return body.delay;
}

export async function switchClashSelector(settings: AppSettings, outboundTag: string): Promise<void> {
  const res = await fetch(buildClashUrl(settings, "/proxies/proxy"), {
    method: "PUT",
    headers: buildClashHeaders(settings),
    body: JSON.stringify({ name: outboundTag }),
  });
  if (!res.ok) {
    throw new Error(`切换代理失败 (HTTP ${res.status})`);
  }
}

export async function closeAllClashConnections(settings: AppSettings): Promise<void> {
  const res = await fetch(buildClashUrl(settings, "/connections"), {
    method: "DELETE",
    headers: buildClashHeaders(settings),
  });
  if (!res.ok) {
    throw new Error(`断开连接失败 (HTTP ${res.status})`);
  }
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let idx = 0;
  let value = bytes;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx += 1;
  }
  return `${value >= 100 || idx === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[idx]}`;
}
