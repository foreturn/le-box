import type {
  DomainStrategy,
  HeaderEntry,
  NaiveDialConfig,
  NaiveProfile,
  NaiveTlsConfig,
  NetworkStrategy,
  NetworkType,
  QuicCongestionControl,
  UdpOverTcpMode,
  ValidationIssue,
} from "../types/singbox";

const DURATION_RE = /^(\d+(\.\d+)?(ns|us|µs|ms|s|m|h))+$/;
const SIZE_RE = /^\d+(\.\d+)?\s*(b|B|k|K|kb|KB|kib|KiB|m|M|mb|MB|mib|MiB|g|G|gb|GB|gib|GiB)?$/;
const IPV4_RE = /^(\d{1,3}\.){3}\d{1,3}$/;

export const QUIC_CONGESTION_OPTIONS: { value: QuicCongestionControl; title: string }[] = [
  { value: "", title: "默认 (cubic)" },
  { value: "cubic", title: "CUBIC" },
  { value: "bbr", title: "BBR" },
  { value: "bbr2", title: "BBRv2" },
  { value: "reno", title: "New Reno" },
];

export const UOT_MODE_OPTIONS: { value: UdpOverTcpMode; title: string }[] = [
  { value: "off", title: "关闭 (false)" },
  { value: "boolean", title: "启用 (true · 默认 v2)" },
  { value: "v2", title: "版本 2 (v2 · 推荐)" },
  { value: "v1", title: "版本 1 (v1 · 兼容)" },
];

export const NETWORK_STRATEGY_OPTIONS: { value: NetworkStrategy; title: string }[] = [
  { value: "", title: "未设置" },
  { value: "default", title: "default (默认网络)" },
  { value: "hybrid", title: "hybrid (并发多网)" },
  { value: "fallback", title: "fallback (主备回退)" },
];

export const NETWORK_TYPE_OPTIONS: NetworkType[] = ["wifi", "cellular", "ethernet", "other"];

export const DOMAIN_STRATEGY_OPTIONS: { value: DomainStrategy; title: string }[] = [
  { value: "", title: "默认" },
  { value: "prefer_ipv4", title: "prefer_ipv4" },
  { value: "prefer_ipv6", title: "prefer_ipv6" },
  { value: "ipv4_only", title: "ipv4_only" },
  { value: "ipv6_only", title: "ipv6_only" },
];

export const COMMON_SERVER_PORTS: number[] = [443, 8443, 2053, 2083, 2096];

export const CONCURRENCY_OPTIONS: { value: string; title: string }[] = [
  { value: "0", title: "0 (关闭 · 抗流量分析推荐)" },
  { value: "1", title: "1 (单并发 · 不推荐)" },
  { value: "2", title: "2 (双并发 · 不推荐)" },
  { value: "3", title: "3 (三并发 · 不推荐)" },
  { value: "4", title: "4 (四并发 · 不推荐)" },
];

export const STREAM_WINDOW_OPTIONS: { value: string; title: string }[] = [
  { value: "", title: "默认 (由内核自动调节)" },
  { value: "6 MB", title: "6 MB (省内存)" },
  { value: "16 MB", title: "16 MB" },
  { value: "32 MB", title: "32 MB (均衡)" },
  { value: "64 MB", title: "64 MB (高吞吐)" },
  { value: "128 MB", title: "128 MB (极速大带宽)" },
];

export const QUIC_WINDOW_OPTIONS: { value: string; title: string }[] = [
  { value: "", title: "默认 (15 MB)" },
  { value: "8 MB", title: "8 MB (省内存)" },
  { value: "15 MB", title: "15 MB (官方推荐)" },
  { value: "32 MB", title: "32 MB (高带宽)" },
  { value: "64 MB", title: "64 MB (极速)" },
];

export const ECH_QUERY_SERVER_PRESETS: string[] = [
  "",
  "cloudflare-ech.com",
  "crypto.cloudflare.com",
];

export const DOMAIN_RESOLVER_OPTIONS: { value: string; title: string }[] = [
  { value: "dns-local", title: "dns-local (本地解析器 · 推荐)" },
  { value: "dns-remote", title: "dns-remote (远程解析器)" },
  { value: "", title: "自动 (跟随全局 default_domain_resolver)" },
];

export const CONNECT_TIMEOUT_PRESETS: string[] = ["", "3s", "5s", "10s", "15s"];

export const KEEP_ALIVE_OPTIONS: { value: string; title: string }[] = [
  { value: "", title: "默认 (内核内置)" },
  { value: "30s", title: "30s" },
  { value: "1m", title: "1m (60s)" },
  { value: "5m", title: "5m" },
  { value: "10m", title: "10m" },
];

export const FALLBACK_DELAY_OPTIONS: { value: string; title: string }[] = [
  { value: "", title: "默认 (300ms)" },
  { value: "150ms", title: "150ms (快速回退)" },
  { value: "300ms", title: "300ms (推荐)" },
  { value: "500ms", title: "500ms" },
  { value: "1s", title: "1s" },
];

export const COMMON_HEADER_TEMPLATES: { value: string; title: string; key: string; headerValue: string }[] = [
  { value: "ua-chrome", title: "User-Agent (Chrome)", key: "User-Agent", headerValue: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" },
  { value: "accept-lang", title: "Accept-Language (zh-CN)", key: "Accept-Language", headerValue: "zh-CN,zh;q=0.9,en;q=0.8" },
  { value: "cache-nocache", title: "Cache-Control (no-cache)", key: "Cache-Control", headerValue: "no-cache" },
];

export function isCustomOption(options: { value: string }[], current: string): boolean {
  return current !== "" && !options.some((item) => item.value === current);
}

export function createDefaultDial(): NaiveDialConfig {
  return {
    detour: "",
    bindInterface: "",
    inet4BindAddress: "",
    inet6BindAddress: "",
    bindAddressNoPort: false,
    routingMark: "",
    reuseAddr: false,
    netns: "",
    connectTimeout: "",
    tcpFastOpen: false,
    tcpMultiPath: false,
    disableTcpKeepAlive: false,
    tcpKeepAlive: "",
    tcpKeepAliveInterval: "",
    udpFragment: false,
    domainResolver: "dns-local",
    domainResolverStrategy: "",
    networkStrategy: "",
    networkType: [],
    fallbackNetworkType: [],
    fallbackDelay: "",
    domainStrategy: "",
  };
}

export function createDefaultTls(serverName = ""): NaiveTlsConfig {
  return {
    serverName,
    certificateText: "",
    certificatePath: "",
    ech: {
      enabled: false,
      configText: "",
      configPath: "",
      queryServerName: "",
    },
  };
}

export function createDefaultNaiveProfile(partial: Partial<NaiveProfile> = {}): NaiveProfile {
  const now = new Date().toISOString();
  const id = partial.id ?? `naive-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const server = partial.server ?? "example.com";
  return {
    id,
    protocol: "naive",
    name: partial.name ?? "NaiveProxy 主节点",
    tag: partial.tag ?? "naive-out",
    server,
    serverPort: partial.serverPort ?? 443,
    username: partial.username ?? "",
    password: partial.password ?? "",
    insecureConcurrency: partial.insecureConcurrency ?? 0,
    extraHeaders: partial.extraHeaders ?? [],
    streamReceiveWindow: partial.streamReceiveWindow ?? "",
    udpOverTcpMode: partial.udpOverTcpMode ?? "off",
    quic: partial.quic ?? false,
    quicCongestionControl: partial.quicCongestionControl ?? "",
    quicSessionReceiveWindow: partial.quicSessionReceiveWindow ?? "",
    tls: partial.tls ?? createDefaultTls(""),
    dial: partial.dial ?? createDefaultDial(),
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
  };
}

export function sanitizeNodeProfileForSave(
  profile: NaiveProfile,
  existingProfiles: NaiveProfile[] = [],
): NaiveProfile {
  const usedTags = new Set(
    existingProfiles
      .filter((item) => item.id !== profile.id)
      .map((item) => item.tag.trim())
      .filter(Boolean),
  );
  let nextTag = profile.tag.trim();
  if (!nextTag) {
    let seq = existingProfiles.length + 1;
    nextTag = `naive-out-${seq}`;
    while (usedTags.has(nextTag)) {
      seq += 1;
      nextTag = `naive-out-${seq}`;
    }
  }
  const cleanServer = profile.server.trim();
  const nextName = profile.name.trim() || cleanServer || "NaiveProxy 节点";
  const nextPort =
    Number.isInteger(profile.serverPort) && profile.serverPort >= 1 && profile.serverPort <= 65535
      ? profile.serverPort
      : 443;
  const cleanedHeaders = profile.extraHeaders.filter(
    (entry) => entry.key.trim().length > 0 || entry.value.trim().length > 0,
  );
  const nextDetour =
    profile.dial.detour.trim() === nextTag ? "" : profile.dial.detour.trim();
  return {
    ...profile,
    name: nextName,
    tag: nextTag,
    server: cleanServer,
    serverPort: nextPort,
    extraHeaders: cleanedHeaders,
    dial: {
      ...profile.dial,
      detour: nextDetour,
    },
    updatedAt: new Date().toISOString(),
  };
}

export function isIpLiteral(host: string): boolean {
  const trimmed = host.trim();
  if (!trimmed) return false;
  if (IPV4_RE.test(trimmed)) return true;
  return trimmed.includes(":");
}

export function validateNaiveProfile(profile: NaiveProfile): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const server = profile.server.trim();
  const tag = profile.tag.trim();

  if (!tag) {
    issues.push({ field: "tag", severity: "error", message: "出站标签 tag 不能为空。" });
  }
  if (!server) {
    issues.push({ field: "server", severity: "error", message: "服务器地址 server 为必填项。" });
  }
  if (!Number.isInteger(profile.serverPort) || profile.serverPort < 1 || profile.serverPort > 65535) {
    issues.push({ field: "serverPort", severity: "error", message: "服务器端口 server_port 须在 1~65535 之间。" });
  }
  if (!Number.isInteger(profile.insecureConcurrency) || profile.insecureConcurrency < 0) {
    issues.push({ field: "insecureConcurrency", severity: "error", message: "insecure_concurrency 须为大于等于 0 的整数。" });
  }
  if (profile.insecureConcurrency > 0) {
    issues.push({
      field: "insecureConcurrency",
      severity: "warning",
      message: "多连接 (insecure_concurrency > 0) 会增加流量特征暴露风险，违背 NaiveProxy 抗流量分析初衷。",
    });
  }

  if (profile.streamReceiveWindow.trim() && !SIZE_RE.test(profile.streamReceiveWindow.trim())) {
    issues.push({
      field: "streamReceiveWindow",
      severity: "error",
      message: "stream_receive_window 格式无效，示例: 6 MB、128 MB、4m。",
    });
  }
  if (profile.quic && profile.quicSessionReceiveWindow.trim() && !SIZE_RE.test(profile.quicSessionReceiveWindow.trim())) {
    issues.push({
      field: "quicSessionReceiveWindow",
      severity: "error",
      message: "quic_session_receive_window 格式无效，示例: 15 MB、15m。",
    });
  }

  if (!profile.tls.serverName.trim() && isIpLiteral(server) && !profile.tls.certificateText.trim() && !profile.tls.certificatePath.trim()) {
    issues.push({
      field: "tls.serverName",
      severity: "warning",
      message: "server 为 IP 地址时建议填写 tls.server_name (SNI) 以匹配服务端证书。",
    });
  }

  if (profile.tls.certificateText.trim() || profile.tls.certificatePath.trim()) {
    issues.push({
      field: "tls.certificate",
      severity: "warning",
      message: "官方提示：自签名证书会显著改变流量行为，不应在生产环境中使用。",
    });
  }

  const seenHeaderKeys = new Set<string>();
  for (const h of profile.extraHeaders) {
    const k = h.key.trim();
    if (!k && h.value.trim()) {
      issues.push({ field: "extraHeaders", severity: "error", message: "存在未填写 Header 名称的额外头部。" });
      break;
    }
    if (k) {
      const lower = k.toLowerCase();
      if (seenHeaderKeys.has(lower)) {
        issues.push({ field: "extraHeaders", severity: "warning", message: `Header "${k}" 重复，将合并或覆盖。` });
      }
      seenHeaderKeys.add(lower);
    }
  }

  const durationChecks: [string, string][] = [
    ["dial.connectTimeout", profile.dial.connectTimeout],
    ["dial.tcpKeepAlive", profile.dial.tcpKeepAlive],
    ["dial.tcpKeepAliveInterval", profile.dial.tcpKeepAliveInterval],
    ["dial.fallbackDelay", profile.dial.fallbackDelay],
  ];
  for (const [field, raw] of durationChecks) {
    const val = raw.trim();
    if (val && !DURATION_RE.test(val)) {
      issues.push({ field, severity: "error", message: `${field} 须为 Go Duration 格式，如 300ms、5s、2m。` });
    }
  }

  if (profile.dial.routingMark.trim()) {
    const mark = profile.dial.routingMark.trim();
    if (!/^\d+$/.test(mark) && !/^0x[0-9a-fA-F]+$/.test(mark)) {
      issues.push({ field: "dial.routingMark", severity: "error", message: "routing_mark 须为十进制数字或 0x 十六进制字符串。" });
    }
  }

  if (profile.dial.detour.trim() && (profile.dial.bindInterface.trim() || profile.dial.connectTimeout.trim())) {
    issues.push({
      field: "dial.detour",
      severity: "warning",
      message: "已设置 detour 时，sing-box 将忽略其余拨号字段。",
    });
  }

  if (
    profile.dial.networkStrategy &&
    (profile.dial.bindInterface.trim() || profile.dial.inet4BindAddress.trim() || profile.dial.inet6BindAddress.trim())
  ) {
    issues.push({
      field: "dial.networkStrategy",
      severity: "error",
      message: "network_strategy 与 bind_interface / bind_address 冲突。",
    });
  }

  return issues;
}

function splitNonEmptyLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function normalizeExtraHeaders(entries: HeaderEntry[]): Record<string, string | string[]> | undefined {
  const result: Record<string, string | string[]> = {};
  for (const item of entries) {
    const k = item.key.trim();
    if (!k) continue;
    const v = item.value;
    const existing = result[k];
    if (existing === undefined) {
      result[k] = v;
    } else if (Array.isArray(existing)) {
      existing.push(v);
    } else {
      result[k] = [existing, v];
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function normalizeCertField(text: string): string | string[] | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  return trimmed;
}

export function buildNaiveOutbound(profile: NaiveProfile, dnsLocalTag = "dns-local"): Record<string, unknown> {
  const validPort =
    Number.isInteger(profile.serverPort) && profile.serverPort >= 1 && profile.serverPort <= 65535
      ? profile.serverPort
      : 443;
  const out: Record<string, unknown> = {
    type: "naive",
    tag: profile.tag.trim() || "naive-out",
    server: profile.server.trim(),
    server_port: validPort,
  };

  if (profile.username.trim()) {
    out.username = profile.username;
  }
  if (profile.password) {
    out.password = profile.password;
  }
  if (profile.insecureConcurrency > 0) {
    out.insecure_concurrency = profile.insecureConcurrency;
  }

  const headers = normalizeExtraHeaders(profile.extraHeaders);
  if (headers) {
    out.extra_headers = headers;
  }
  if (profile.streamReceiveWindow.trim()) {
    out.stream_receive_window = profile.streamReceiveWindow.trim();
  }

  if (profile.udpOverTcpMode === "boolean") {
    out.udp_over_tcp = true;
  } else if (profile.udpOverTcpMode === "v1") {
    out.udp_over_tcp = { enabled: true, version: 1 };
  } else if (profile.udpOverTcpMode === "v2") {
    out.udp_over_tcp = { enabled: true, version: 2 };
  }

  if (profile.quic) {
    out.quic = true;
    if (profile.quicCongestionControl) {
      out.quic_congestion_control = profile.quicCongestionControl;
    }
    if (profile.quicSessionReceiveWindow.trim()) {
      out.quic_session_receive_window = profile.quicSessionReceiveWindow.trim();
    }
  }

  const tls: Record<string, unknown> = {
    enabled: true,
  };
  const sni = profile.tls.serverName.trim();
  if (sni) {
    tls.server_name = sni;
  } else if (profile.server.trim() && !isIpLiteral(profile.server)) {
    tls.server_name = profile.server.trim();
  }
  const cert = normalizeCertField(profile.tls.certificateText);
  if (cert) {
    tls.certificate = cert;
  }
  if (profile.tls.certificatePath.trim()) {
    tls.certificate_path = profile.tls.certificatePath.trim();
  }
  const ech = profile.tls.ech;
  if (ech.enabled || ech.configText.trim() || ech.configPath.trim() || ech.queryServerName.trim()) {
    const echObj: Record<string, unknown> = {
      enabled: ech.enabled,
    };
    const echLines = splitNonEmptyLines(ech.configText);
    if (echLines.length > 0) {
      echObj.config = echLines;
    }
    if (ech.configPath.trim()) {
      echObj.config_path = ech.configPath.trim();
    }
    if (ech.queryServerName.trim()) {
      echObj.query_server_name = ech.queryServerName.trim();
    }
    tls.ech = echObj;
  }
  out.tls = tls;

  const d = profile.dial;
  if (d.detour.trim()) {
    out.detour = d.detour.trim();
  } else {
    if (d.bindInterface.trim()) out.bind_interface = d.bindInterface.trim();
    if (d.inet4BindAddress.trim()) out.inet4_bind_address = d.inet4BindAddress.trim();
    if (d.inet6BindAddress.trim()) out.inet6_bind_address = d.inet6BindAddress.trim();
    if (d.bindAddressNoPort) out.bind_address_no_port = true;
    if (d.routingMark.trim()) {
      const m = d.routingMark.trim();
      out.routing_mark = /^\d+$/.test(m) ? Number.parseInt(m, 10) : m;
    }
    if (d.reuseAddr) out.reuse_addr = true;
    if (d.netns.trim()) out.netns = d.netns.trim();
    if (d.connectTimeout.trim()) out.connect_timeout = d.connectTimeout.trim();
    if (d.tcpFastOpen) out.tcp_fast_open = true;
    if (d.tcpMultiPath) out.tcp_multi_path = true;
    if (d.disableTcpKeepAlive) out.disable_tcp_keep_alive = true;
    if (d.tcpKeepAlive.trim()) out.tcp_keep_alive = d.tcpKeepAlive.trim();
    if (d.tcpKeepAliveInterval.trim()) out.tcp_keep_alive_interval = d.tcpKeepAliveInterval.trim();
    if (d.udpFragment) out.udp_fragment = true;

    const resolverTag = d.domainResolver.trim() || (!isIpLiteral(profile.server) ? dnsLocalTag : "");
    if (resolverTag) {
      if (d.domainResolverStrategy) {
        out.domain_resolver = {
          server: resolverTag,
          strategy: d.domainResolverStrategy,
        };
      } else {
        out.domain_resolver = resolverTag;
      }
    }

    if (d.networkStrategy) out.network_strategy = d.networkStrategy;
    if (d.networkType.length > 0) out.network_type = [...d.networkType];
    if (d.fallbackNetworkType.length > 0) out.fallback_network_type = [...d.fallbackNetworkType];
    if (d.fallbackDelay.trim()) out.fallback_delay = d.fallbackDelay.trim();
    if (d.domainStrategy) out.domain_strategy = d.domainStrategy;
  }

  return out;
}

export function exportNaiveUri(profile: NaiveProfile): string {
  const scheme = profile.quic ? "naive+quic" : "naive+https";
  const auth =
    profile.username || profile.password
      ? `${encodeURIComponent(profile.username)}:${encodeURIComponent(profile.password)}@`
      : "";
  const host = profile.server.includes(":") && !profile.server.startsWith("[")
    ? `[${profile.server}]`
    : profile.server;
  const params = new URLSearchParams();
  if (profile.tls.serverName.trim() && profile.tls.serverName.trim() !== profile.server.trim()) {
    params.set("sni", profile.tls.serverName.trim());
  }
  if (profile.insecureConcurrency > 0) {
    params.set("insecure-concurrency", String(profile.insecureConcurrency));
  }
  if (profile.streamReceiveWindow.trim()) {
    params.set("stream_receive_window", profile.streamReceiveWindow.trim());
  }
  if (profile.udpOverTcpMode === "boolean") {
    params.set("uot", "1");
  } else if (profile.udpOverTcpMode === "v1") {
    params.set("uot", "v1");
  } else if (profile.udpOverTcpMode === "v2") {
    params.set("uot", "v2");
  }
  if (profile.quic && profile.quicCongestionControl) {
    params.set("congestion_control", profile.quicCongestionControl);
  }
  if (profile.quic && profile.quicSessionReceiveWindow.trim()) {
    params.set("quic_session_receive_window", profile.quicSessionReceiveWindow.trim());
  }
  if (profile.tls.ech.enabled) {
    params.set("ech", "1");
    if (profile.tls.ech.queryServerName.trim()) {
      params.set("ech_query", profile.tls.ech.queryServerName.trim());
    }
  }
  const extraHeaders = normalizeExtraHeaders(profile.extraHeaders);
  if (extraHeaders) {
    params.set("extra_headers", JSON.stringify(extraHeaders));
  }
  const query = params.toString();
  const fragment = profile.name.trim() ? `#${encodeURIComponent(profile.name.trim())}` : "";
  return `${scheme}://${auth}${host}:${profile.serverPort}${query ? `?${query}` : ""}${fragment}`;
}

export function parseNaiveFromUri(rawUri: string): NaiveProfile {
  const trimmed = rawUri.trim();
  const normalized = trimmed
    .replace(/^naive\+https:\/\//i, "https://")
    .replace(/^naive\+quic:\/\//i, "https://")
    .replace(/^naive:\/\//i, "https://");
  const isQuicScheme = /^naive\+quic:\/\//i.test(trimmed);
  const url = new URL(normalized);
  if (!url.hostname) {
    throw new Error("URI 缺少服务器地址。");
  }
  const params = url.searchParams;
  const quicParam = params.get("quic");
  const quic = isQuicScheme || quicParam === "1" || quicParam === "true";
  const uotRaw = (params.get("uot") ?? params.get("udp_over_tcp") ?? "").toLowerCase();
  let udpOverTcpMode: UdpOverTcpMode = "off";
  if (uotRaw === "1" || uotRaw === "true") udpOverTcpMode = "boolean";
  else if (uotRaw === "v1") udpOverTcpMode = "v1";
  else if (uotRaw === "v2" || uotRaw === "2") udpOverTcpMode = "v2";

  const ccRaw = (params.get("congestion_control") ?? params.get("quic_congestion_control") ?? "").toLowerCase();
  const quicCongestionControl: QuicCongestionControl =
    ccRaw === "bbr" || ccRaw === "bbr2" || ccRaw === "cubic" || ccRaw === "reno" ? ccRaw : "";

  const concurrencyRaw = params.get("insecure-concurrency") ?? params.get("insecure_concurrency") ?? "0";
  const insecureConcurrency = Math.max(0, Number.parseInt(concurrencyRaw, 10) || 0);

  const extraHeaders: HeaderEntry[] = [];
  const rawHeaders = params.get("extra_headers") ?? params.get("extra-headers");
  if (rawHeaders) {
    try {
      const parsed = JSON.parse(rawHeaders) as Record<string, string | string[]>;
      for (const [key, val] of Object.entries(parsed)) {
        if (Array.isArray(val)) {
          for (const v of val) extraHeaders.push({ key, value: String(v) });
        } else {
          extraHeaders.push({ key, value: String(val) });
        }
      }
    } catch {
      for (const pair of rawHeaders.split(";")) {
        const idx = pair.indexOf(":");
        if (idx > 0) {
          extraHeaders.push({ key: pair.slice(0, idx).trim(), value: pair.slice(idx + 1).trim() });
        }
      }
    }
  }

  const host = url.hostname.replace(/^\[|\]$/g, "");
  const remarks = url.hash ? decodeURIComponent(url.hash.slice(1)) : `${host}:${url.port || "443"}`;
  const explicitSni = params.get("sni") ?? params.get("server_name") ?? params.get("peer") ?? "";
  const sni = explicitSni.trim() === host ? "" : explicitSni.trim();

  return createDefaultNaiveProfile({
    name: remarks,
    tag: remarks.replace(/[^\w.-]+/g, "-").replace(/^-|-$/g, "") || "naive-out",
    server: host,
    serverPort: url.port ? Number.parseInt(url.port, 10) : 443,
    username: decodeURIComponent(url.username || ""),
    password: decodeURIComponent(url.password || ""),
    insecureConcurrency,
    extraHeaders,
    streamReceiveWindow: params.get("stream_receive_window") ?? "",
    udpOverTcpMode,
    quic,
    quicCongestionControl,
    quicSessionReceiveWindow: params.get("quic_session_receive_window") ?? "",
    tls: {
      serverName: sni,
      certificateText: "",
      certificatePath: "",
      ech: {
        enabled: params.get("ech") === "1" || params.get("ech") === "true",
        configText: "",
        configPath: "",
        queryServerName: params.get("ech_query") ?? params.get("query_server_name") ?? "",
      },
    },
  });
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item));
  if (typeof value === "string" && value.trim()) return [value];
  return [];
}

export function parseNaiveFromJsonObject(obj: Record<string, unknown>): NaiveProfile {
  if (obj.type !== "naive") {
    throw new Error(`期望 type="naive"，实际为 "${String(obj.type ?? "")}"。`);
  }
  const extraHeaders: HeaderEntry[] = [];
  if (obj.extra_headers && typeof obj.extra_headers === "object" && !Array.isArray(obj.extra_headers)) {
    for (const [key, val] of Object.entries(obj.extra_headers as Record<string, unknown>)) {
      if (Array.isArray(val)) {
        for (const v of val) extraHeaders.push({ key, value: String(v) });
      } else if (val !== undefined && val !== null) {
        extraHeaders.push({ key, value: String(val) });
      }
    }
  }

  let udpOverTcpMode: UdpOverTcpMode = "off";
  if (obj.udp_over_tcp === true) {
    udpOverTcpMode = "boolean";
  } else if (obj.udp_over_tcp && typeof obj.udp_over_tcp === "object") {
    const uot = obj.udp_over_tcp as Record<string, unknown>;
    if (uot.enabled !== false) {
      udpOverTcpMode = uot.version === 1 ? "v1" : "v2";
    }
  }

  const tlsRaw = (obj.tls && typeof obj.tls === "object" ? obj.tls : {}) as Record<string, unknown>;
  const echRaw = (tlsRaw.ech && typeof tlsRaw.ech === "object" ? tlsRaw.ech : {}) as Record<string, unknown>;
  const certValue = Array.isArray(tlsRaw.certificate)
    ? tlsRaw.certificate.map(String).join("\n")
    : typeof tlsRaw.certificate === "string"
      ? tlsRaw.certificate
      : "";

  const dial = createDefaultDial();
  if (typeof obj.detour === "string") dial.detour = obj.detour;
  if (typeof obj.bind_interface === "string") dial.bindInterface = obj.bind_interface;
  if (typeof obj.inet4_bind_address === "string") dial.inet4BindAddress = obj.inet4_bind_address;
  if (typeof obj.inet6_bind_address === "string") dial.inet6BindAddress = obj.inet6_bind_address;
  if (typeof obj.bind_address_no_port === "boolean") dial.bindAddressNoPort = obj.bind_address_no_port;
  if (obj.routing_mark !== undefined && obj.routing_mark !== null) dial.routingMark = String(obj.routing_mark);
  if (typeof obj.reuse_addr === "boolean") dial.reuseAddr = obj.reuse_addr;
  if (typeof obj.netns === "string") dial.netns = obj.netns;
  if (typeof obj.connect_timeout === "string") dial.connectTimeout = obj.connect_timeout;
  if (typeof obj.tcp_fast_open === "boolean") dial.tcpFastOpen = obj.tcp_fast_open;
  if (typeof obj.tcp_multi_path === "boolean") dial.tcpMultiPath = obj.tcp_multi_path;
  if (typeof obj.disable_tcp_keep_alive === "boolean") dial.disableTcpKeepAlive = obj.disable_tcp_keep_alive;
  if (typeof obj.tcp_keep_alive === "string") dial.tcpKeepAlive = obj.tcp_keep_alive;
  if (typeof obj.tcp_keep_alive_interval === "string") dial.tcpKeepAliveInterval = obj.tcp_keep_alive_interval;
  if (typeof obj.udp_fragment === "boolean") dial.udpFragment = obj.udp_fragment;
  if (typeof obj.domain_resolver === "string") {
    dial.domainResolver = obj.domain_resolver;
  } else if (obj.domain_resolver && typeof obj.domain_resolver === "object") {
    const dr = obj.domain_resolver as Record<string, unknown>;
    dial.domainResolver = typeof dr.server === "string" ? dr.server : "dns-local";
    if (typeof dr.strategy === "string") dial.domainResolverStrategy = dr.strategy as DomainStrategy;
  } else {
    dial.domainResolver = "";
  }
  if (typeof obj.network_strategy === "string") dial.networkStrategy = obj.network_strategy as NetworkStrategy;
  dial.networkType = asStringArray(obj.network_type).filter((x): x is NetworkType =>
    NETWORK_TYPE_OPTIONS.includes(x as NetworkType),
  );
  dial.fallbackNetworkType = asStringArray(obj.fallback_network_type).filter((x): x is NetworkType =>
    NETWORK_TYPE_OPTIONS.includes(x as NetworkType),
  );
  if (typeof obj.fallback_delay === "string") dial.fallbackDelay = obj.fallback_delay;
  if (typeof obj.domain_strategy === "string") dial.domainStrategy = obj.domain_strategy as DomainStrategy;

  const server = typeof obj.server === "string" ? obj.server : "";
  const tag = typeof obj.tag === "string" && obj.tag.trim() ? obj.tag.trim() : "naive-out";
  const rawSni = typeof tlsRaw.server_name === "string" ? tlsRaw.server_name.trim() : "";

  return createDefaultNaiveProfile({
    name: tag,
    tag,
    server,
    serverPort: typeof obj.server_port === "number" ? obj.server_port : 443,
    username: typeof obj.username === "string" ? obj.username : "",
    password: typeof obj.password === "string" ? obj.password : "",
    insecureConcurrency: typeof obj.insecure_concurrency === "number" ? obj.insecure_concurrency : 0,
    extraHeaders,
    streamReceiveWindow: typeof obj.stream_receive_window === "string" ? obj.stream_receive_window : "",
    udpOverTcpMode,
    quic: obj.quic === true,
    quicCongestionControl:
      typeof obj.quic_congestion_control === "string"
        ? (obj.quic_congestion_control as QuicCongestionControl)
        : "",
    quicSessionReceiveWindow:
      typeof obj.quic_session_receive_window === "string" ? obj.quic_session_receive_window : "",
    tls: {
      serverName: rawSni === server.trim() ? "" : rawSni,
      certificateText: certValue,
      certificatePath: typeof tlsRaw.certificate_path === "string" ? tlsRaw.certificate_path : "",
      ech: {
        enabled: echRaw.enabled === true,
        configText: asStringArray(echRaw.config).join("\n"),
        configPath: typeof echRaw.config_path === "string" ? echRaw.config_path : "",
        queryServerName: typeof echRaw.query_server_name === "string" ? echRaw.query_server_name : "",
      },
    },
    dial,
  });
}

export function importNaiveProfilesFromInput(input: string): NaiveProfile[] {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("请输入 NaiveProxy URI 或 sing-box JSON 配置。");
  }
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) {
      const results = parsed
        .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
        .filter((item) => item.type === "naive")
        .map(parseNaiveFromJsonObject);
      if (results.length === 0) throw new Error("JSON 数组中未找到 type 为 naive 的出站。");
      return results;
    }
    if (parsed && typeof parsed === "object") {
      const obj = parsed as Record<string, unknown>;
      if (Array.isArray(obj.outbounds)) {
        const results = obj.outbounds
          .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
          .filter((item) => item.type === "naive")
          .map(parseNaiveFromJsonObject);
        if (results.length === 0) throw new Error("sing-box 配置中未找到 type 为 naive 的出站。");
        return results;
      }
      return [parseNaiveFromJsonObject(obj)];
    }
    throw new Error("无法识别的 JSON 结构。");
  }

  const lines = trimmed
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  return lines.map(parseNaiveFromUri);
}
