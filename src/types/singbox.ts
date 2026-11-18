export type NodeProtocol = "naive";

export interface ProtocolDescriptor {
  value: NodeProtocol;
  title: string;
  badge: string;
  summary: string;
  supported: boolean;
}

export type QuicCongestionControl = "" | "bbr" | "bbr2" | "cubic" | "reno";

export type UdpOverTcpMode = "off" | "boolean" | "v1" | "v2";

export type NetworkStrategy = "" | "default" | "hybrid" | "fallback";

export type NetworkType = "wifi" | "cellular" | "ethernet" | "other";

export type DomainStrategy = "" | "prefer_ipv4" | "prefer_ipv6" | "ipv4_only" | "ipv6_only";

export type RoutingMode = "rule" | "global" | "direct";

export type RuleActionTarget = "proxy" | "direct" | "reject";

export type RuleSetMirror = "github" | "jsdelivr";

export type RuleSetDownloadDetour = "auto" | "direct" | "proxy";

export type RuleSetUpdateInterval = "1d" | "3d" | "7d";

export type RoutePresetSchemeId = "bypass-cn" | "gfw-proxy" | "global-proxy" | "direct-all";

export type RouteRuleMatchType = "ip_is_private" | "rule_set" | "protocol" | "domain_suffix";

export interface RouteRuleItem {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  category: "region" | "ads" | "service" | "protocol" | "private" | "custom";
  matchType: RouteRuleMatchType;
  ruleSets?: string[];
  protocols?: string[];
  domainSuffixes?: string[];
  target: RuleActionTarget;
  syncDnsRule?: boolean;
  presetId?: string;
}

export interface RoutingSettings {
  activeScheme: RoutePresetSchemeId | "custom";
  ruleSetMirror: RuleSetMirror;
  downloadDetour: RuleSetDownloadDetour;
  updateInterval: RuleSetUpdateInterval;
  finalTarget: "proxy" | "direct";
  rules: RouteRuleItem[];
}

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal" | "panic";

export interface HeaderEntry {
  key: string;
  value: string;
}

export interface NaiveEchConfig {
  enabled: boolean;
  configText: string;
  configPath: string;
  queryServerName: string;
}

export interface NaiveTlsConfig {
  serverName: string;
  certificateText: string;
  certificatePath: string;
  ech: NaiveEchConfig;
}

export interface NaiveDialConfig {
  detour: string;
  bindInterface: string;
  inet4BindAddress: string;
  inet6BindAddress: string;
  bindAddressNoPort: boolean;
  routingMark: string;
  reuseAddr: boolean;
  netns: string;
  connectTimeout: string;
  tcpFastOpen: boolean;
  tcpMultiPath: boolean;
  disableTcpKeepAlive: boolean;
  tcpKeepAlive: string;
  tcpKeepAliveInterval: string;
  udpFragment: boolean;
  domainResolver: string;
  domainResolverStrategy: DomainStrategy;
  networkStrategy: NetworkStrategy;
  networkType: NetworkType[];
  fallbackNetworkType: NetworkType[];
  fallbackDelay: string;
  domainStrategy: DomainStrategy;
}

export interface NaiveProfile {
  id: string;
  protocol: "naive";
  name: string;
  tag: string;
  server: string;
  serverPort: number;
  username: string;
  password: string;
  insecureConcurrency: number;
  extraHeaders: HeaderEntry[];
  streamReceiveWindow: string;
  udpOverTcpMode: UdpOverTcpMode;
  quic: boolean;
  quicCongestionControl: QuicCongestionControl;
  quicSessionReceiveWindow: string;
  tls: NaiveTlsConfig;
  dial: NaiveDialConfig;
  createdAt: string;
  updatedAt: string;
}

export type NodeProfile = NaiveProfile;

export interface MixedInboundSettings {
  enabled: boolean;
  tag: string;
  listen: string;
  listenPort: number;
  setSystemProxy: boolean;
  authEnabled: boolean;
  username: string;
  password: string;
}

export interface TunInboundSettings {
  enabled: boolean;
  tag: string;
  interfaceName: string;
  address4: string;
  address6: string;
  mtu: number;
  stack: "system" | "gvisor" | "mixed";
  autoRoute: boolean;
  strictRoute: boolean;
}

export interface DnsSettings {
  remoteServer: string;
  remoteType: "https" | "udp" | "tcp" | "tls";
  localServer: string;
  localType: "local" | "udp";
  strategy: DomainStrategy;
}

export interface ClashApiSettings {
  enabled: boolean;
  listen: string;
  port: number;
  secret: string;
}

export interface AppSettings {
  singBoxPath: string;
  routingMode: RoutingMode;
  logLevel: LogLevel;
  mixed: MixedInboundSettings;
  tun: TunInboundSettings;
  dns: DnsSettings;
  clashApi: ClashApiSettings;
  routing: RoutingSettings;
  settingsRevision?: number;
  appManifestUrl?: string;
  bypassPrivateIp?: boolean;
  bypassChinaDomain?: boolean;
}

export interface ValidationIssue {
  field: string;
  severity: "error" | "warning";
  message: string;
}

export type CoreRunState = "stopped" | "checking" | "starting" | "running" | "stopping" | "error";

export interface LogEntry {
  id: number;
  timestamp: string;
  stream: "stdout" | "stderr" | "system";
  level: "debug" | "info" | "warn" | "error";
  message: string;
}

export interface TrafficStats {
  up: number;
  down: number;
  connections: number;
  memoryBytes: number;
}

export interface ClashConnectionItem {
  id: string;
  host: string;
  network: string;
  rule: string;
  chains: string[];
  upload: number;
  download: number;
  start: string;
}

export type CoreBinaryOrigin = "bundled" | "hot-updated" | "path" | "custom";
