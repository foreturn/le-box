import type { AppSettings, NodeProfile, RouteRuleItem } from "../types/singbox";
import { isIpLiteral } from "./naiveSchema";
import { buildNodeOutbound } from "./nodeProtocols";
import {
  buildRuleSetUrl,
  createDefaultRoutingSettings,
  isDomainRuleSetTag,
} from "./routePresets";

export const LISTEN_ADDRESS_OPTIONS: { value: string; title: string }[] = [
  { value: "127.0.0.1", title: "127.0.0.1 (仅本机 · 安全推荐)" },
  { value: "0.0.0.0", title: "0.0.0.0 (允许局域网共享)" },
  { value: "::1", title: "::1 (IPv6 本机)" },
];

export const COMMON_MIXED_PORTS: number[] = [20808, 7890, 10808, 1080];

export const COMMON_CLASH_PORTS: number[] = [19090, 9090, 9097];

export const TUN_MTU_OPTIONS: { value: string; title: string }[] = [
  { value: "9000", title: "9000 (高速大帧 · 推荐)" },
  { value: "1500", title: "1500 (标准以太网)" },
  { value: "1400", title: "1400 (高兼容 / 移动网络)" },
  { value: "1280", title: "1280 (最小 IPv6 兼容)" },
];

export const TUN_IPV4_OPTIONS: { value: string; title: string }[] = [
  { value: "172.19.0.1/30", title: "172.19.0.1/30 (默认)" },
  { value: "172.18.0.1/30", title: "172.18.0.1/30" },
  { value: "10.0.85.1/30", title: "10.0.85.1/30" },
];

export const TUN_IPV6_OPTIONS: { value: string; title: string }[] = [
  { value: "fdfe:dcba:9876::1/126", title: "fdfe:dcba:9876::1/126 (默认)" },
  { value: "fd00:1234::1/126", title: "fd00:1234::1/126" },
  { value: "", title: "关闭 IPv6 地址" },
];

export const REMOTE_DNS_DOH_OPTIONS: { value: string; title: string }[] = [
  { value: "1.1.1.1", title: "1.1.1.1 (Cloudflare · 推荐)" },
  { value: "8.8.8.8", title: "8.8.8.8 (Google Public DNS)" },
  { value: "9.9.9.9", title: "9.9.9.9 (Quad9)" },
  { value: "dns.google", title: "dns.google (Google DoH 域名)" },
  { value: "cloudflare-dns.com", title: "cloudflare-dns.com (Cloudflare 域名)" },
  { value: "dns.quad9.net", title: "dns.quad9.net (Quad9 域名)" },
];

export const REMOTE_DNS_PLAIN_OPTIONS: { value: string; title: string }[] = [
  { value: "1.1.1.1", title: "1.1.1.1 (Cloudflare · 推荐)" },
  { value: "8.8.8.8", title: "8.8.8.8 (Google Public DNS)" },
  { value: "9.9.9.9", title: "9.9.9.9 (Quad9)" },
  { value: "208.67.222.222", title: "208.67.222.222 (OpenDNS)" },
];

export const LOCAL_UDP_DNS_OPTIONS: { value: string; title: string }[] = [
  { value: "223.5.5.5", title: "223.5.5.5 (阿里公共 DNS · 推荐)" },
  { value: "119.29.29.29", title: "119.29.29.29 (腾讯 DNSPod)" },
  { value: "114.114.114.114", title: "114.114.114.114 (114 DNS)" },
  { value: "180.76.76.76", title: "180.76.76.76 (百度公共 DNS)" },
];

export function createDefaultSettings(): AppSettings {
  return {
    singBoxPath: "sing-box",
    routingMode: "rule",
    logLevel: "info",
    mixed: {
      enabled: true,
      tag: "mixed-in",
      listen: "127.0.0.1",
      listenPort: 20808,
      setSystemProxy: false,
      authEnabled: false,
      username: "",
      password: "",
    },
    tun: {
      enabled: false,
      tag: "tun-in",
      interfaceName: "LeBoxTun",
      address4: "172.19.0.1/30",
      address6: "fdfe:dcba:9876::1/126",
      mtu: 9000,
      stack: "mixed",
      autoRoute: true,
      strictRoute: true,
    },
    dns: {
      remoteServer: "1.1.1.1",
      remoteType: "https",
      localServer: "223.5.5.5",
      localType: "udp",
      strategy: "prefer_ipv4",
    },
    clashApi: {
      enabled: true,
      listen: "127.0.0.1",
      port: 19090,
      secret: "",
    },
    routing: createDefaultRoutingSettings(),
    settingsRevision: 2,
  };
}

function resolveRuleAction(
  target: RouteRuleItem["target"],
  hasProxyNodes: boolean,
): Record<string, unknown> {
  if (target === "reject") {
    return { action: "reject" };
  }
  if (target === "proxy") {
    return { outbound: hasProxyNodes ? "proxy" : "direct" };
  }
  return { outbound: "direct" };
}

function normalizePort(port: number, fallback: number): number {
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : fallback;
}

function buildRemoteDnsServer(
  rawServer: string,
  remoteType: AppSettings["dns"]["remoteType"],
): { server: string; path?: string; needsResolver: boolean } {
  const trimmed = rawServer.trim() || "1.1.1.1";
  let host = trimmed;
  let path = "";
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      host = parsed.hostname.replace(/^\[|\]$/g, "") || "1.1.1.1";
      if (remoteType === "https" && parsed.pathname && parsed.pathname !== "/") {
        path = parsed.pathname;
      }
    } catch {
      host = trimmed.replace(/^[a-zA-Z]+:\/\//, "").split("/")[0] || "1.1.1.1";
    }
  } else if (trimmed.includes("/") && remoteType === "https") {
    const slashIdx = trimmed.indexOf("/");
    host = trimmed.slice(0, slashIdx).trim() || "1.1.1.1";
    const rest = trimmed.slice(slashIdx).trim();
    if (rest.length > 1) path = rest;
  }
  const needsResolver = !isIpLiteral(host);
  return path ? { server: host, path, needsResolver } : { server: host, needsResolver };
}

export function resolveNodeOutboundTags(profiles: NodeProfile[]): Map<string, string> {
  const usedTags = new Set<string>(["direct", "block", "proxy"]);
  const result = new Map<string, string>();
  for (const item of profiles) {
    const baseTag = item.tag.trim() || "node-out";
    let tag = baseTag;
    let suffix = 2;
    while (usedTags.has(tag)) {
      tag = `${baseTag}-${suffix}`;
      suffix += 1;
    }
    usedTags.add(tag);
    result.set(item.id, tag);
  }
  return result;
}

export interface BuildSingBoxOptions {
  platform?: string;
}

export function buildSingBoxConfig(
  profiles: NodeProfile[],
  activeProfileId: string | null,
  settings: AppSettings,
  options?: BuildSingBoxOptions,
): Record<string, unknown> {
  const active = profiles.find((p) => p.id === activeProfileId) ?? profiles[0] ?? null;
  const tagMap = resolveNodeOutboundTags(profiles);

  const nodeOutbounds: Record<string, unknown>[] = [];
  const nodeTags: string[] = [];
  let activeTag = "direct";

  for (const item of profiles) {
    const built = buildNodeOutbound(item, "dns-local");
    const tag = tagMap.get(item.id) ?? String(built.tag || "node-out");
    built.tag = tag;
    nodeOutbounds.push(built);
    nodeTags.push(tag);
    if (active && item.id === active.id) {
      activeTag = tag;
    }
  }

  const hasProxyNodes = nodeTags.length > 0;
  const outbounds: Record<string, unknown>[] = [];
  if (hasProxyNodes) {
    outbounds.push({
      type: "selector",
      tag: "proxy",
      outbounds: [...nodeTags, "direct"],
      default: activeTag,
    });
  }
  outbounds.push(...nodeOutbounds);
  outbounds.push({ type: "direct", tag: "direct" });

  const inbounds: Record<string, unknown>[] = [];
  if (settings.mixed.enabled) {
    const mixed: Record<string, unknown> = {
      type: "mixed",
      tag: settings.mixed.tag.trim() || "mixed-in",
      listen: settings.mixed.listen.trim() || "127.0.0.1",
      listen_port: normalizePort(settings.mixed.listenPort, 20808),
    };
    if (settings.mixed.setSystemProxy) {
      mixed.set_system_proxy = true;
    }
    if (settings.mixed.authEnabled && settings.mixed.username.trim()) {
      mixed.users = [
        {
          username: settings.mixed.username.trim(),
          password: settings.mixed.password,
        },
      ];
    }
    inbounds.push(mixed);
  }

  const isAndroidTarget = options?.platform === "android";
  if (settings.tun.enabled || isAndroidTarget) {
    const addrs = [settings.tun.address4.trim(), settings.tun.address6.trim()].filter(Boolean);
    const tunMtu =
      Number.isInteger(settings.tun.mtu) && settings.tun.mtu >= 576 && settings.tun.mtu <= 65535
        ? settings.tun.mtu
        : 9000;
    const tunInbound: Record<string, unknown> = {
      type: "tun",
      tag: settings.tun.tag.trim() || "tun-in",
      address: addrs.length > 0 ? addrs : ["172.19.0.1/30"],
      mtu: tunMtu,
      stack: settings.tun.stack,
      auto_route: isAndroidTarget ? true : settings.tun.autoRoute,
      strict_route: isAndroidTarget ? true : settings.tun.strictRoute,
    };
    if (!isAndroidTarget) {
      tunInbound.interface_name = settings.tun.interfaceName.trim() || "LeBoxTun";
    }
    inbounds.push(tunInbound);
  }

  const dnsServers: Record<string, unknown>[] = [];
  if (settings.dns.localType === "local") {
    dnsServers.push({ tag: "dns-local", type: "local" });
  } else {
    const rawLocal = settings.dns.localServer.trim();
    const safeLocal = rawLocal && rawLocal.toLowerCase() !== "local" ? rawLocal : "223.5.5.5";
    dnsServers.push({
      tag: "dns-local",
      type: "udp",
      server: safeLocal,
    });
  }

  const normalizedRemote = buildRemoteDnsServer(
    settings.dns.remoteServer,
    settings.dns.remoteType,
  );
  const remoteDns: Record<string, unknown> = {
    tag: "dns-remote",
    type: settings.dns.remoteType,
    server: normalizedRemote.server,
  };
  if (normalizedRemote.path) {
    remoteDns.path = normalizedRemote.path;
  }
  if (normalizedRemote.needsResolver) {
    remoteDns.domain_resolver = "dns-local";
  }
  if (settings.routingMode !== "direct" && hasProxyNodes) {
    remoteDns.detour = "proxy";
  }
  dnsServers.push(remoteDns);

  const routing = settings.routing ?? createDefaultRoutingSettings();
  const routeRules: Record<string, unknown>[] = [
    { action: "sniff" },
    { protocol: "dns", action: "hijack-dns" },
  ];
  const dnsRules: Record<string, unknown>[] = [];
  const activeRuleSetTags: string[] = [];
  const seenRuleSets = new Set<string>();

  if (settings.routingMode === "rule") {
    for (const rule of routing.rules) {
      if (!rule.enabled) continue;
      const actionPatch = resolveRuleAction(rule.target, hasProxyNodes);

      if (rule.matchType === "ip_is_private") {
        routeRules.push({ ip_is_private: true, ...actionPatch });
      } else if (rule.matchType === "rule_set") {
        const sets = (rule.ruleSets ?? []).map((s) => s.trim()).filter(Boolean);
        if (sets.length === 0) continue;
        for (const tag of sets) {
          if (!seenRuleSets.has(tag)) {
            seenRuleSets.add(tag);
            activeRuleSetTags.push(tag);
          }
        }
        routeRules.push({
          rule_set: sets.length === 1 ? sets[0] : sets,
          ...actionPatch,
        });

        if (rule.syncDnsRule) {
          const domainSets = sets.filter(isDomainRuleSetTag);
          if (domainSets.length > 0) {
            const ruleSetField = domainSets.length === 1 ? domainSets[0] : domainSets;
            if (rule.target === "reject") {
              dnsRules.push({ rule_set: ruleSetField, action: "reject" });
            } else if (rule.target === "direct") {
              dnsRules.push({ rule_set: ruleSetField, server: "dns-local" });
            } else if (rule.target === "proxy" && hasProxyNodes) {
              dnsRules.push({ rule_set: ruleSetField, server: "dns-remote" });
            }
          }
        }
      } else if (rule.matchType === "protocol") {
        const protos = (rule.protocols ?? []).map((p) => p.trim()).filter(Boolean);
        if (protos.length === 0) continue;
        routeRules.push({
          protocol: protos.length === 1 ? protos[0] : protos,
          ...actionPatch,
        });
      } else if (rule.matchType === "domain_suffix") {
        const suffixes = (rule.domainSuffixes ?? []).map((s) => s.trim()).filter(Boolean);
        if (suffixes.length === 0) continue;
        routeRules.push({
          domain_suffix: suffixes,
          ...actionPatch,
        });
        if (rule.syncDnsRule) {
          if (rule.target === "reject") {
            dnsRules.push({ domain_suffix: suffixes, action: "reject" });
          } else if (rule.target === "direct") {
            dnsRules.push({ domain_suffix: suffixes, server: "dns-local" });
          } else if (rule.target === "proxy" && hasProxyNodes) {
            dnsRules.push({ domain_suffix: suffixes, server: "dns-remote" });
          }
        }
      }
    }
  }

  const dns: Record<string, unknown> = {
    servers: dnsServers,
    final: settings.routingMode === "direct" ? "dns-local" : "dns-remote",
  };
  if (dnsRules.length > 0) {
    dns.rules = dnsRules;
  }
  if (settings.dns.strategy) {
    dns.strategy = settings.dns.strategy;
  }

  let routeFinal = "direct";
  if (settings.routingMode === "direct") {
    routeFinal = "direct";
  } else if (settings.routingMode === "global") {
    routeFinal = hasProxyNodes ? "proxy" : "direct";
  } else if (routing.finalTarget === "direct") {
    routeFinal = "direct";
  } else {
    routeFinal = hasProxyNodes ? "proxy" : "direct";
  }

  const route: Record<string, unknown> = {
    rules: routeRules,
    final: routeFinal,
    auto_detect_interface: true,
    default_domain_resolver: "dns-local",
  };

  if (settings.routingMode === "rule" && activeRuleSetTags.length > 0) {
    const resolvedDownloadDetour =
      routing.downloadDetour === "direct"
        ? "direct"
        : routing.downloadDetour === "proxy"
          ? hasProxyNodes
            ? "proxy"
            : "direct"
          : routing.ruleSetMirror === "jsdelivr" || !hasProxyNodes
            ? "direct"
            : "proxy";

    route.rule_set = activeRuleSetTags.map((tag) => ({
      tag,
      type: "remote",
      format: "binary",
      url: buildRuleSetUrl(tag, routing.ruleSetMirror),
      download_detour: resolvedDownloadDetour,
      update_interval: routing.updateInterval || "1d",
    }));
  }

  const config: Record<string, unknown> = {
    $schema: "https://sing-box.sagernet.org/schema.json",
    log: {
      disabled: false,
      level: settings.logLevel,
      timestamp: true,
    },
    dns,
    inbounds,
    outbounds,
    route,
  };

  const experimental: Record<string, unknown> = {
    cache_file: {
      enabled: true,
    },
  };
  if (settings.clashApi.enabled) {
    const clashApi: Record<string, unknown> = {
      external_controller: `${settings.clashApi.listen.trim() || "127.0.0.1"}:${normalizePort(settings.clashApi.port, 19090)}`,
    };
    if (settings.clashApi.secret.trim()) {
      clashApi.secret = settings.clashApi.secret.trim();
    }
    experimental.clash_api = clashApi;
  }
  config.experimental = experimental;

  return config;
}
