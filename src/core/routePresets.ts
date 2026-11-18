import type {
  RoutePresetSchemeId,
  RouteRuleItem,
  RoutingSettings,
  RuleActionTarget,
  RuleSetDownloadDetour,
  RuleSetMirror,
  RuleSetUpdateInterval,
} from "../types/singbox";

export interface OfficialRuleSetMeta {
  tag: string;
  repo: "sing-geosite" | "sing-geoip";
  title: string;
  category: "region" | "ads" | "service" | "private";
  description: string;
  isDomainSet: boolean;
}

export interface OfficialRulePreset {
  presetId: string;
  name: string;
  description: string;
  category: RouteRuleItem["category"];
  matchType: RouteRuleItem["matchType"];
  ruleSets?: string[];
  protocols?: string[];
  defaultTarget: RuleActionTarget;
  syncDnsRule?: boolean;
}

export interface RoutePresetScheme {
  id: RoutePresetSchemeId;
  title: string;
  description: string;
  finalTarget: "proxy" | "direct";
  rules: Omit<RouteRuleItem, "id">[];
}

export const RULE_SET_MIRROR_OPTIONS: { value: RuleSetMirror; title: string }[] = [
  { value: "github", title: "GitHub 官方源 (raw.githubusercontent.com)" },
  { value: "jsdelivr", title: "jsDelivr CDN 镜像 (cdn.jsdelivr.net)" },
];

export const RULE_SET_DOWNLOAD_DETOUR_OPTIONS: { value: RuleSetDownloadDetour; title: string }[] = [
  { value: "auto", title: "自动（jsDelivr 直连，GitHub 走代理）" },
  { value: "proxy", title: "通过当前代理下载 (proxy)" },
  { value: "direct", title: "直连下载 (direct)" },
];

export const RULE_SET_UPDATE_INTERVAL_OPTIONS: { value: RuleSetUpdateInterval; title: string }[] = [
  { value: "1d", title: "每天更新 (1d)" },
  { value: "3d", title: "每 3 天更新 (3d)" },
  { value: "7d", title: "每周更新 (7d)" },
];

export const RULE_ACTION_TARGET_OPTIONS: { value: RuleActionTarget; title: string }[] = [
  { value: "proxy", title: "走代理 (proxy)" },
  { value: "direct", title: "直连 (direct)" },
  { value: "reject", title: "拦截 (reject)" },
];

export const ROUTE_FINAL_TARGET_OPTIONS: { value: "proxy" | "direct"; title: string }[] = [
  { value: "proxy", title: "默认走代理 (proxy)" },
  { value: "direct", title: "默认直连 (direct)" },
];

export const OFFICIAL_RULE_SET_CATALOG: OfficialRuleSetMeta[] = [
  {
    tag: "geosite-cn",
    repo: "sing-geosite",
    title: "中国大陆常用域名",
    category: "region",
    description: "SagerNet 官方维护的中国大陆常见网站与服务域名集",
    isDomainSet: true,
  },
  {
    tag: "geoip-cn",
    repo: "sing-geoip",
    title: "中国大陆 IP 段",
    category: "region",
    description: "SagerNet 官方维护的中国大陆 IPv4/IPv6 CIDR 规则集",
    isDomainSet: false,
  },
  {
    tag: "geosite-geolocation-!cn",
    repo: "sing-geosite",
    title: "非中国大陆域名",
    category: "region",
    description: "海外常见站点与非大陆地区服务域名集",
    isDomainSet: true,
  },
  {
    tag: "geosite-category-ads-all",
    repo: "sing-geosite",
    title: "广告与追踪域名",
    category: "ads",
    description: "常见广告、埋点统计与恶意追踪域名规则集",
    isDomainSet: true,
  },
  {
    tag: "geosite-private",
    repo: "sing-geosite",
    title: "私有/局域网域名",
    category: "private",
    description: "localhost、local 及内网保留域名",
    isDomainSet: true,
  },
  {
    tag: "geoip-private",
    repo: "sing-geoip",
    title: "私有/局域网 IP",
    category: "private",
    description: "RFC1918 / RFC4193 等局域网保留 IP 段",
    isDomainSet: false,
  },
  {
    tag: "geosite-openai",
    repo: "sing-geosite",
    title: "OpenAI / ChatGPT",
    category: "service",
    description: "OpenAI、ChatGPT 及相关 API 域名",
    isDomainSet: true,
  },
  {
    tag: "geosite-anthropic",
    repo: "sing-geosite",
    title: "Anthropic / Claude",
    category: "service",
    description: "Anthropic 与 Claude 相关服务域名",
    isDomainSet: true,
  },
  {
    tag: "geosite-google",
    repo: "sing-geosite",
    title: "Google 服务",
    category: "service",
    description: "Google 搜索、Gmail、Drive 等域名集",
    isDomainSet: true,
  },
  {
    tag: "geosite-youtube",
    repo: "sing-geosite",
    title: "YouTube",
    category: "service",
    description: "YouTube 视频流与静态资源域名",
    isDomainSet: true,
  },
  {
    tag: "geosite-github",
    repo: "sing-geosite",
    title: "GitHub",
    category: "service",
    description: "GitHub 仓库、Release 与 Raw 资源域名",
    isDomainSet: true,
  },
  {
    tag: "geosite-telegram",
    repo: "sing-geosite",
    title: "Telegram",
    category: "service",
    description: "Telegram 即时通讯与媒体域名",
    isDomainSet: true,
  },
  {
    tag: "geosite-apple",
    repo: "sing-geosite",
    title: "Apple 服务",
    category: "service",
    description: "Apple iCloud、App Store 与系统更新域名",
    isDomainSet: true,
  },
  {
    tag: "geosite-microsoft",
    repo: "sing-geosite",
    title: "Microsoft 服务",
    category: "service",
    description: "Windows 更新、OneDrive 与微软服务域名",
    isDomainSet: true,
  },
  {
    tag: "geosite-netflix",
    repo: "sing-geosite",
    title: "Netflix",
    category: "service",
    description: "Netflix 流媒体服务域名",
    isDomainSet: true,
  },
  {
    tag: "geosite-steam",
    repo: "sing-geosite",
    title: "Steam",
    category: "service",
    description: "Steam 商店、社区与游戏下载域名",
    isDomainSet: true,
  },
];

export const OFFICIAL_RULE_PRESETS: OfficialRulePreset[] = [
  {
    presetId: "private-ip",
    name: "局域网与私有 IP 直连",
    description: "使用 sing-box 内置 ip_is_private，保障本地设备与内网地址直接连通",
    category: "private",
    matchType: "ip_is_private",
    defaultTarget: "direct",
  },
  {
    presetId: "cn-all",
    name: "中国大陆域名与 IP",
    description: "匹配官方 geosite-cn 与 geoip-cn 规则集（同步优化本地 DNS 解析）",
    category: "region",
    matchType: "rule_set",
    ruleSets: ["geosite-cn", "geoip-cn"],
    defaultTarget: "direct",
    syncDnsRule: true,
  },
  {
    presetId: "non-cn-domains",
    name: "非中国大陆域名",
    description: "匹配官方 geosite-geolocation-!cn 规则集，适合白名单代理方案",
    category: "region",
    matchType: "rule_set",
    ruleSets: ["geosite-geolocation-!cn"],
    defaultTarget: "proxy",
    syncDnsRule: true,
  },
  {
    presetId: "ads-block",
    name: "广告与追踪拦截",
    description: "使用官方 geosite-category-ads-all，通过 action: reject 拦截广告请求",
    category: "ads",
    matchType: "rule_set",
    ruleSets: ["geosite-category-ads-all"],
    defaultTarget: "reject",
    syncDnsRule: true,
  },
  {
    presetId: "openai",
    name: "OpenAI / ChatGPT",
    description: "官方 geosite-openai 规则集，可指定走代理或独立分流",
    category: "service",
    matchType: "rule_set",
    ruleSets: ["geosite-openai"],
    defaultTarget: "proxy",
    syncDnsRule: true,
  },
  {
    presetId: "anthropic",
    name: "Anthropic / Claude",
    description: "官方 geosite-anthropic 规则集",
    category: "service",
    matchType: "rule_set",
    ruleSets: ["geosite-anthropic"],
    defaultTarget: "proxy",
    syncDnsRule: true,
  },
  {
    presetId: "github",
    name: "GitHub 开发资源",
    description: "官方 geosite-github 规则集",
    category: "service",
    matchType: "rule_set",
    ruleSets: ["geosite-github"],
    defaultTarget: "proxy",
    syncDnsRule: true,
  },
  {
    presetId: "google",
    name: "Google 服务",
    description: "官方 geosite-google 规则集",
    category: "service",
    matchType: "rule_set",
    ruleSets: ["geosite-google"],
    defaultTarget: "proxy",
    syncDnsRule: true,
  },
  {
    presetId: "youtube",
    name: "YouTube 视频",
    description: "官方 geosite-youtube 规则集",
    category: "service",
    matchType: "rule_set",
    ruleSets: ["geosite-youtube"],
    defaultTarget: "proxy",
    syncDnsRule: true,
  },
  {
    presetId: "telegram",
    name: "Telegram 通讯",
    description: "官方 geosite-telegram 规则集",
    category: "service",
    matchType: "rule_set",
    ruleSets: ["geosite-telegram"],
    defaultTarget: "proxy",
    syncDnsRule: true,
  },
  {
    presetId: "apple",
    name: "Apple 服务",
    description: "官方 geosite-apple 规则集（通常建议直连加速）",
    category: "service",
    matchType: "rule_set",
    ruleSets: ["geosite-apple"],
    defaultTarget: "direct",
    syncDnsRule: true,
  },
  {
    presetId: "microsoft",
    name: "Microsoft 服务",
    description: "官方 geosite-microsoft 规则集",
    category: "service",
    matchType: "rule_set",
    ruleSets: ["geosite-microsoft"],
    defaultTarget: "direct",
    syncDnsRule: true,
  },
  {
    presetId: "netflix",
    name: "Netflix 流媒体",
    description: "官方 geosite-netflix 规则集",
    category: "service",
    matchType: "rule_set",
    ruleSets: ["geosite-netflix"],
    defaultTarget: "proxy",
    syncDnsRule: true,
  },
  {
    presetId: "steam",
    name: "Steam 游戏平台",
    description: "官方 geosite-steam 规则集",
    category: "service",
    matchType: "rule_set",
    ruleSets: ["geosite-steam"],
    defaultTarget: "direct",
    syncDnsRule: true,
  },
  {
    presetId: "block-quic",
    name: "屏蔽 HTTP/3 QUIC",
    description: "拦截 UDP 443 QUIC 流量以回退至 TCP，改善弱网或 UDP 限速体验",
    category: "protocol",
    matchType: "protocol",
    protocols: ["quic"],
    defaultTarget: "reject",
  },
  {
    presetId: "bt-direct",
    name: "BitTorrent 流量直连",
    description: "识别 BitTorrent 协议并直连，避免占用代理带宽",
    category: "protocol",
    matchType: "protocol",
    protocols: ["bittorrent"],
    defaultTarget: "direct",
  },
];

export const ROUTE_PRESET_SCHEMES: RoutePresetScheme[] = [
  {
    id: "bypass-cn",
    title: "绕过局域网与大陆",
    description: "私有 IP、中国大陆域名与 IP 直连，其余海外流量默认走代理（推荐）",
    finalTarget: "proxy",
    rules: [
      {
        presetId: "private-ip",
        name: "局域网与私有 IP 直连",
        description: "内置 ip_is_private 规则，内网及回环地址直连",
        enabled: true,
        category: "private",
        matchType: "ip_is_private",
        target: "direct",
      },
      {
        presetId: "ads-block",
        name: "广告与追踪拦截",
        description: "官方 geosite-category-ads-all 规则集（action: reject）",
        enabled: false,
        category: "ads",
        matchType: "rule_set",
        ruleSets: ["geosite-category-ads-all"],
        target: "reject",
        syncDnsRule: true,
      },
      {
        presetId: "cn-all",
        name: "中国大陆域名与 IP",
        description: "官方 geosite-cn + geoip-cn 规则集，国内网站直连并走本地 DNS",
        enabled: true,
        category: "region",
        matchType: "rule_set",
        ruleSets: ["geosite-cn", "geoip-cn"],
        target: "direct",
        syncDnsRule: true,
      },
    ],
  },
  {
    id: "gfw-proxy",
    title: "海外常见服务代理",
    description: "仅非大陆域名与精选海外服务走代理，其余默认直连",
    finalTarget: "direct",
    rules: [
      {
        presetId: "private-ip",
        name: "局域网与私有 IP 直连",
        description: "内置 ip_is_private 规则",
        enabled: true,
        category: "private",
        matchType: "ip_is_private",
        target: "direct",
      },
      {
        presetId: "cn-all",
        name: "中国大陆域名与 IP",
        description: "官方 geosite-cn + geoip-cn 规则集",
        enabled: true,
        category: "region",
        matchType: "rule_set",
        ruleSets: ["geosite-cn", "geoip-cn"],
        target: "direct",
        syncDnsRule: true,
      },
      {
        presetId: "non-cn-domains",
        name: "非中国大陆域名",
        description: "官方 geosite-geolocation-!cn 规则集走代理",
        enabled: true,
        category: "region",
        matchType: "rule_set",
        ruleSets: ["geosite-geolocation-!cn"],
        target: "proxy",
        syncDnsRule: true,
      },
    ],
  },
  {
    id: "global-proxy",
    title: "全局代理 (保留内网)",
    description: "仅局域网私有 IP 直连，其余全部走代理",
    finalTarget: "proxy",
    rules: [
      {
        presetId: "private-ip",
        name: "局域网与私有 IP 直连",
        description: "内置 ip_is_private 规则",
        enabled: true,
        category: "private",
        matchType: "ip_is_private",
        target: "direct",
      },
    ],
  },
  {
    id: "direct-all",
    title: "全部直连",
    description: "所有流量直接出站，不经过代理节点",
    finalTarget: "direct",
    rules: [],
  },
];

export function instantiatePresetRule(
  preset: OfficialRulePreset,
  targetOverride?: RuleActionTarget,
): RouteRuleItem {
  return {
    id: `rule-${preset.presetId}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    presetId: preset.presetId,
    name: preset.name,
    description: preset.description,
    enabled: true,
    category: preset.category,
    matchType: preset.matchType,
    ruleSets: preset.ruleSets ? [...preset.ruleSets] : undefined,
    protocols: preset.protocols ? [...preset.protocols] : undefined,
    target: targetOverride ?? preset.defaultTarget,
    syncDnsRule: preset.syncDnsRule,
  };
}

export function applyRoutePresetScheme(
  current: RoutingSettings,
  schemeId: RoutePresetSchemeId,
): RoutingSettings {
  const scheme = ROUTE_PRESET_SCHEMES.find((s) => s.id === schemeId) ?? ROUTE_PRESET_SCHEMES[0]!;
  return {
    ...current,
    activeScheme: scheme.id,
    finalTarget: scheme.finalTarget,
    rules: scheme.rules.map((r, idx) => ({
      ...r,
      id: `rule-${scheme.id}-${idx + 1}`,
      ruleSets: r.ruleSets ? [...r.ruleSets] : undefined,
      protocols: r.protocols ? [...r.protocols] : undefined,
      domainSuffixes: r.domainSuffixes ? [...r.domainSuffixes] : undefined,
    })),
  };
}

export function createDefaultRoutingSettings(): RoutingSettings {
  return applyRoutePresetScheme(
    {
      activeScheme: "bypass-cn",
      ruleSetMirror: "jsdelivr",
      downloadDetour: "auto",
      updateInterval: "1d",
      finalTarget: "proxy",
      rules: [],
    },
    "bypass-cn",
  );
}

export function buildRuleSetUrl(tag: string, mirror: RuleSetMirror): string {
  const meta = OFFICIAL_RULE_SET_CATALOG.find((m) => m.tag === tag);
  const repo = meta?.repo ?? (tag.startsWith("geoip-") ? "sing-geoip" : "sing-geosite");
  if (mirror === "jsdelivr") {
    return `https://cdn.jsdelivr.net/gh/SagerNet/${repo}@rule-set/${tag}.srs`;
  }
  return `https://raw.githubusercontent.com/SagerNet/${repo}/rule-set/${tag}.srs`;
}

export function isDomainRuleSetTag(tag: string): boolean {
  const meta = OFFICIAL_RULE_SET_CATALOG.find((m) => m.tag === tag);
  if (meta) return meta.isDomainSet;
  return tag.startsWith("geosite-");
}

export function describeRouteRuleMatch(rule: RouteRuleItem): string {
  if (rule.matchType === "ip_is_private") {
    return "ip_is_private: true";
  }
  if (rule.matchType === "rule_set") {
    return `rule_set: ${(rule.ruleSets ?? []).join(", ") || "-"}`;
  }
  if (rule.matchType === "protocol") {
    return `protocol: ${(rule.protocols ?? []).join(", ") || "-"}`;
  }
  return `domain_suffix: ${(rule.domainSuffixes ?? []).join(", ") || "-"}`;
}

export function sanitizeDomainSuffixes(rawInput: string): string[] {
  const tokens = rawInput
    .split(/[\s,;\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const cleaned: string[] = [];
  const seen = new Set<string>();
  for (const token of tokens) {
    let host = token
      .replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, "")
      .split("/")[0]
      .split(":")[0]
      .replace(/^\*+\./, "")
      .replace(/^\.+|\.+$/g, "")
      .trim()
      .toLowerCase();
    if (host && !seen.has(host)) {
      seen.add(host);
      cleaned.push(host);
    }
  }
  return cleaned;
}
