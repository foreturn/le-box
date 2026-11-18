import { describe, expect, test } from "nsh/test";
import {
  buildNaiveOutbound,
  createDefaultNaiveProfile,
  exportNaiveUri,
  importNaiveProfilesFromInput,
  parseNaiveFromUri,
  sanitizeNodeProfileForSave,
  validateNaiveProfile,
} from "./src/core/naiveSchema";
import {
  buildNodeOutbound,
  createDefaultNodeProfile,
  generateUniqueNodeTag,
  NODE_PROTOCOL_OPTIONS,
} from "./src/core/nodeProtocols";
import {
  applyRoutePresetScheme,
  instantiatePresetRule,
  OFFICIAL_RULE_PRESETS,
  sanitizeDomainSuffixes,
} from "./src/core/routePresets";
import {
  buildSingBoxConfig,
  createDefaultSettings,
  resolveNodeOutboundTags,
} from "./src/core/singboxConfig";

describe("NaiveProxy protocol schema", () => {
  test("builds full naive outbound with HTTP/2, extra_headers, UoT, TLS, ECH and Dial fields", () => {
    const profile = createDefaultNaiveProfile({
      name: "HK Naive",
      tag: "naive-hk",
      server: "hk.example.com",
      serverPort: 8443,
      username: "user1",
      password: "pw1",
      insecureConcurrency: 2,
      extraHeaders: [
        { key: "X-Custom", value: "alpha" },
        { key: "X-Custom", value: "beta" },
        { key: "User-Agent", value: "Mozilla/5.0" },
      ],
      streamReceiveWindow: "128 MB",
      udpOverTcpMode: "v2",
      quic: false,
      tls: {
        serverName: "cdn.example.com",
        certificateText: "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----",
        certificatePath: "/etc/ssl/naive.pem",
        ech: {
          enabled: true,
          configText: "line1\nline2",
          configPath: "/etc/ssl/ech.pem",
          queryServerName: "cloudflare-ech.com",
        },
      },
      dial: {
        ...createDefaultNaiveProfile().dial,
        connectTimeout: "5s",
        tcpFastOpen: true,
        tcpMultiPath: true,
        disableTcpKeepAlive: true,
        tcpKeepAlive: "10m",
        tcpKeepAliveInterval: "60s",
        udpFragment: true,
        reuseAddr: true,
        bindAddressNoPort: true,
        routingMark: "0x1234",
        bindInterface: "eth0",
        inet4BindAddress: "0.0.0.0",
        inet6BindAddress: "::",
        netns: "vpnns",
        domainResolver: "dns-local",
        domainResolverStrategy: "prefer_ipv4",
      },
    });

    const out = buildNaiveOutbound(profile);
    expect(out.type).toBe("naive");
    expect(out.tag).toBe("naive-hk");
    expect(out.server).toBe("hk.example.com");
    expect(out.server_port).toBe(8443);
    expect(out.username).toBe("user1");
    expect(out.password).toBe("pw1");
    expect(out.insecure_concurrency).toBe(2);
    expect(out.extra_headers).toEqual({
      "X-Custom": ["alpha", "beta"],
      "User-Agent": "Mozilla/5.0",
    });
    expect(out.stream_receive_window).toBe("128 MB");
    expect(out.udp_over_tcp).toEqual({ enabled: true, version: 2 });
    expect(out.quic).toBe(undefined);
    expect(out.tls).toEqual({
      enabled: true,
      server_name: "cdn.example.com",
      certificate: "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----",
      certificate_path: "/etc/ssl/naive.pem",
      ech: {
        enabled: true,
        config: ["line1", "line2"],
        config_path: "/etc/ssl/ech.pem",
        query_server_name: "cloudflare-ech.com",
      },
    });
    expect(out.connect_timeout).toBe("5s");
    expect(out.tcp_fast_open).toBe(true);
    expect(out.tcp_multi_path).toBe(true);
    expect(out.disable_tcp_keep_alive).toBe(true);
    expect(out.routing_mark).toBe("0x1234");
    expect(out.domain_resolver).toEqual({ server: "dns-local", strategy: "prefer_ipv4" });
  });

  test("builds QUIC naive outbound with congestion control and session window", () => {
    const profile = createDefaultNaiveProfile({
      tag: "naive-quic",
      server: "quic.example.com",
      quic: true,
      quicCongestionControl: "bbr2",
      quicSessionReceiveWindow: "15 MB",
      streamReceiveWindow: "6 MB",
      udpOverTcpMode: "boolean",
    });

    const out = buildNaiveOutbound(profile);
    expect(out.quic).toBe(true);
    expect(out.quic_congestion_control).toBe("bbr2");
    expect(out.quic_session_receive_window).toBe("15 MB");
    expect(out.stream_receive_window).toBe("6 MB");
    expect(out.udp_over_tcp).toBe(true);
  });

  test("validates errors and security warnings accurately", () => {
    const bad = createDefaultNaiveProfile({
      tag: "",
      server: "",
      serverPort: 70000,
      insecureConcurrency: 3,
      streamReceiveWindow: "invalid-size",
      tls: {
        serverName: "",
        certificateText: "CERT",
        certificatePath: "",
        ech: { enabled: false, configText: "", configPath: "", queryServerName: "" },
      },
    });
    bad.dial.connectTimeout = "bad";
    bad.dial.networkStrategy = "fallback";
    bad.dial.bindInterface = "eth0";

    const issues = validateNaiveProfile(bad);
    const errorFields = issues.filter((i) => i.severity === "error").map((i) => i.field);
    const warnFields = issues.filter((i) => i.severity === "warning").map((i) => i.field);

    expect(errorFields).toContain("tag");
    expect(errorFields).toContain("server");
    expect(errorFields).toContain("serverPort");
    expect(errorFields).toContain("streamReceiveWindow");
    expect(errorFields).toContain("dial.connectTimeout");
    expect(errorFields).toContain("dial.networkStrategy");
    expect(warnFields).toContain("insecureConcurrency");
    expect(warnFields).toContain("tls.certificate");
  });

  test("parses and exports naive+quic and naive+https URIs", () => {
    const uri =
      "naive+quic://alice:sec%40ret@jp.example.com:443?sni=edge.example.com&congestion_control=bbr2&uot=v2&ech=1&ech_query=cloudflare-ech.com&insecure-concurrency=1#Tokyo%20Node";
    const parsed = parseNaiveFromUri(uri);
    expect(parsed.name).toBe("Tokyo Node");
    expect(parsed.server).toBe("jp.example.com");
    expect(parsed.serverPort).toBe(443);
    expect(parsed.username).toBe("alice");
    expect(parsed.password).toBe("sec@ret");
    expect(parsed.quic).toBe(true);
    expect(parsed.quicCongestionControl).toBe("bbr2");
    expect(parsed.udpOverTcpMode).toBe("v2");
    expect(parsed.tls.serverName).toBe("edge.example.com");
    expect(parsed.tls.ech.enabled).toBe(true);
    expect(parsed.tls.ech.queryServerName).toBe("cloudflare-ech.com");
    expect(parsed.insecureConcurrency).toBe(1);

    const exported = exportNaiveUri(parsed);
    expect(exported).toContain("naive+quic://");
    expect(exported).toContain("congestion_control=bbr2");
    expect(exported).toContain("uot=v2");
  });

  test("imports sing-box full JSON and generates complete runnable sing-box config", () => {
    const raw = JSON.stringify({
      outbounds: [
        { type: "direct", tag: "direct" },
        {
          type: "naive",
          tag: "my-naive",
          server: "n.example.com",
          server_port: 443,
          username: "u",
          password: "p",
          quic: true,
          quic_congestion_control: "bbr",
          udp_over_tcp: { enabled: true, version: 1 },
          tls: { enabled: true, server_name: "n.example.com" },
        },
      ],
    });
    const imported = importNaiveProfilesFromInput(raw);
    expect(imported.length).toBe(1);
    expect(imported[0]!.tag).toBe("my-naive");
    expect(imported[0]!.udpOverTcpMode).toBe("v1");

    const settings = createDefaultSettings();
    settings.tun.enabled = true;
    const cfg = buildSingBoxConfig(imported, imported[0]!.id, settings);
    expect(Array.isArray(cfg.inbounds)).toBe(true);
    expect((cfg.inbounds as unknown[]).length).toBe(2);
    expect((cfg.route as Record<string, unknown>).default_domain_resolver).toBe("dns-local");
    expect((cfg.experimental as Record<string, unknown>).clash_api).toBeTruthy();
  });

  test("supports protocol registry and generates official sing-box rule_set routing without deprecated geoip/geosite", () => {
    expect(NODE_PROTOCOL_OPTIONS.map((p) => p.value)).toContain("naive");
    const node = createDefaultNodeProfile("naive", {
      tag: "naive-jp",
      server: "jp.example.com",
    });
    expect(node.protocol).toBe("naive");
    expect(buildNodeOutbound(node).type).toBe("naive");

    const settings = createDefaultSettings();
    settings.routing = applyRoutePresetScheme(settings.routing, "bypass-cn");
    settings.routing.ruleSetMirror = "jsdelivr";
    const adsPreset = OFFICIAL_RULE_PRESETS.find((p) => p.presetId === "ads-block")!;
    const openaiPreset = OFFICIAL_RULE_PRESETS.find((p) => p.presetId === "openai")!;
    settings.routing.rules.push(instantiatePresetRule(adsPreset));
    settings.routing.rules.push(instantiatePresetRule(openaiPreset));

    const cfg = buildSingBoxConfig([node], node.id, settings);
    const route = cfg.route as Record<string, unknown>;
    const dns = cfg.dns as Record<string, unknown>;

    expect(route.geoip).toBe(undefined);
    expect(route.geosite).toBe(undefined);
    expect(Array.isArray(route.rule_set)).toBe(true);
    const ruleSets = route.rule_set as Array<Record<string, unknown>>;
    expect(ruleSets.some((rs) => rs.tag === "geosite-cn" && rs.download_detour === "direct" && String(rs.url).includes("cdn.jsdelivr.net/gh/SagerNet/sing-geosite@rule-set/geosite-cn.srs"))).toBe(true);
    expect(((cfg.experimental as Record<string, unknown>).cache_file as Record<string, unknown>).enabled).toBe(true);

    settings.routing.ruleSetMirror = "github";
    const githubCfg = buildSingBoxConfig([node], node.id, settings);
    const githubRuleSets = (githubCfg.route as Record<string, unknown>).rule_set as Array<Record<string, unknown>>;
    expect(githubRuleSets.some((rs) => rs.tag === "geosite-cn" && rs.download_detour === "proxy")).toBe(true);
    expect(ruleSets.some((rs) => rs.tag === "geoip-cn" && String(rs.url).includes("cdn.jsdelivr.net/gh/SagerNet/sing-geoip@rule-set/geoip-cn.srs"))).toBe(true);
    expect(ruleSets.some((rs) => rs.tag === "geosite-openai")).toBe(true);
    expect(ruleSets.some((rs) => rs.tag === "geosite-category-ads-all")).toBe(true);

    const routeRules = route.rules as Array<Record<string, unknown>>;
    expect(routeRules.some((r) => r.ip_is_private === true && r.outbound === "direct")).toBe(true);
    expect(routeRules.some((r) => r.rule_set === "geosite-category-ads-all" && r.action === "reject")).toBe(true);
    expect(routeRules.some((r) => r.rule_set === "geosite-openai" && r.outbound === "proxy")).toBe(true);

    const dnsRules = dns.rules as Array<Record<string, unknown>>;
    expect(dnsRules.some((r) => r.rule_set === "geosite-cn" && r.server === "dns-local")).toBe(true);
    expect(dnsRules.some((r) => r.rule_set === "geosite-category-ads-all" && r.action === "reject")).toBe(true);
  });

  test("fills safe defaults when fields are omitted and normalizes DNS / global selector routing", () => {
    const existing = createDefaultNodeProfile("naive", {
      id: "node-1",
      name: "节点一",
      tag: "naive-out",
      server: "one.example.com",
    });
    const dirtyDraft = createDefaultNodeProfile("naive", {
      id: "node-2",
      name: "",
      tag: "",
      server: "two.example.com",
      serverPort: 0,
      extraHeaders: [
        { key: "", value: "" },
        { key: "X-Test", value: "1" },
      ],
    });
    dirtyDraft.dial.detour = generateUniqueNodeTag([existing]);

    const saved = sanitizeNodeProfileForSave(dirtyDraft, [existing]);
    expect(saved.name).toBe("two.example.com");
    expect(saved.tag).toBe("naive-out-2");
    expect(saved.serverPort).toBe(443);
    expect(saved.extraHeaders.length).toBe(1);
    expect(saved.dial.detour).toBe("");

    const outbound = buildNaiveOutbound(saved);
    expect((outbound.tls as Record<string, unknown>).server_name).toBe("two.example.com");

    const settings = createDefaultSettings();
    expect(settings.dns.localServer).toBe("223.5.5.5");
    settings.routingMode = "global";
    settings.dns.localType = "udp";
    settings.dns.localServer = "local";
    settings.dns.remoteType = "https";
    settings.dns.remoteServer = "https://dns.google/dns-query";

    const cfg = buildSingBoxConfig([existing, saved], saved.id, settings);
    const dns = cfg.dns as { servers: Array<Record<string, unknown>> };
    const localDns = dns.servers.find((item) => item.tag === "dns-local")!;
    const remoteDns = dns.servers.find((item) => item.tag === "dns-remote")!;
    expect(localDns.server).toBe("223.5.5.5");
    expect(remoteDns.server).toBe("dns.google");
    expect(remoteDns.path).toBe("/dns-query");
    expect(remoteDns.domain_resolver).toBe("dns-local");
    expect(remoteDns.detour).toBe("proxy");

    const route = cfg.route as Record<string, unknown>;
    expect(route.final).toBe("proxy");

    const tagMap = resolveNodeOutboundTags([existing, saved]);
    expect(tagMap.get("node-1")).toBe("naive-out");
    expect(tagMap.get("node-2")).toBe("naive-out-2");

    expect(sanitizeDomainSuffixes("https://api.openai.com/v1\n*.anthropic.com")).toEqual([
      "api.openai.com",
      "anthropic.com",
    ]);
  });

  test("builds Android libbox config with auto tun inbound and without desktop interface_name", () => {
    const node = createDefaultNodeProfile("naive", {
      server: "edge.example.com",
      serverPort: 443,
      username: "u",
      password: "p",
    });
    const settings = createDefaultSettings();
    settings.tun.enabled = false;
    const cfg = buildSingBoxConfig([node], node.id, settings, { platform: "android" });
    const inbounds = cfg.inbounds as Array<Record<string, unknown>>;
    const tun = inbounds.find((item) => item.type === "tun");
    expect(tun).toBeDefined();
    expect(tun?.auto_route).toBe(true);
    expect(tun?.strict_route).toBe(true);
    expect(tun?.interface_name).toBeUndefined();
  });
});
