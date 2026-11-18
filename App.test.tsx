import { expect, open, test } from "nsh/test";

test("LeBox manages multi-protocol nodes, official sing-box rule_set routing, and full config", async () => {
  const app = await open("./App.tsx", {
    width: 1200,
    height: 800,
    platform: "windows",
  });

  expect(app.texts()).toContain("LeBox");
  expect(app.texts()).toContain("sing-box 核心引擎");

  // Switch to Nodes page
  await app.press("id:nav-nodes");
  await app.waitFor("text:节点管理");
  expect(app.texts()).not.toContain("启用");
  expect(app.texts()).not.toContain("已启用");

  // Create a new node and select NaiveProxy protocol in editor modal
  await app.press("id:create-node-btn");
  await app.waitFor("id:node-editor-dialog");
  await app.waitFor("id:field-protocol");
  await app.press("id:field-protocol");
  await app.press("id:protocol-opt-naive");

  await app.clear("id:field-name");
  await app.type("id:field-name", "Singapore BBR2");
  await app.clear("id:field-tag");
  await app.type("id:field-tag", "naive-sg");
  await app.clear("id:field-server");
  await app.type("id:field-server", "sg.example.com");
  await app.type("id:field-username", "sguser");
  await app.type("id:field-password", "sgpass");

  // Transport tab: enable QUIC + BBRv2 + UoT v2 + Extra Header
  await app.press("id:editor-tab-transport");
  await app.press("id:field-quic");
  await app.waitFor("id:field-quic-cc");
  await app.press("id:field-quic-cc");
  await app.press("text:BBRv2");
  await app.press("id:field-uot");
  await app.press("text:版本 2 (v2 · 推荐)");
  await app.press("id:add-header-btn");
  await app.type("id:header-key-0", "X-Client");
  await app.type("id:header-val-0", "LeBox");

  // TLS & ECH tab: enable ECH
  await app.press("id:editor-tab-tls");
  await app.press("id:field-ech-enabled");
  await app.type("id:field-ech-query", "cloudflare-ech.com");

  // Dial tab: set connect_timeout & TFO
  await app.press("id:editor-tab-dial");
  await app.type("id:field-dial-timeout", "5s");
  await app.press("id:field-dial-tfo");

  // Save node
  await app.press("id:save-node-btn");
  await app.waitFor("text:Singapore BBR2");
  expect(app.texts()).toContain("QUIC · bbr2");
  expect(app.texts()).toContain("UoT v2");
  expect(app.texts()).toContain("ECH");

  // Import a naive+https URI
  await app.press("id:open-import-btn");
  await app.waitFor("id:import-node-dialog");
  await app.type(
    "id:import-textarea",
    "naive+https://alice:secret@us.example.com:443?sni=us.cdn.com&uot=v1#US%20Edge",
  );
  await app.press("id:confirm-import-btn");
  await app.waitFor("text:US Edge");

  // Switch to Routing page and select official mirror & preset rule without manual typing
  await app.press("id:nav-routing");
  await app.waitFor("text:路由规则管理");
  await app.press("id:field-ruleset-mirror");
  await app.press("text:GitHub 官方源 (raw.githubusercontent.com)");
  await app.press("id:field-ruleset-mirror");
  await app.press("text:jsDelivr CDN 镜像 (cdn.jsdelivr.net)");

  await app.press("id:open-add-rule-btn");
  await app.waitFor("id:add-rule-dialog");
  await app.press("id:add-preset-openai");
  await app.press("text:关闭");

  // Inspect generated sing-box JSON on Config page
  await app.press("id:nav-config");
  await app.waitFor("text:sing-box 配置生成与验证");
  const fullText = app.texts().join("\n");
  expect(fullText).toContain('"type": "naive"');
  expect(fullText).toContain('"tag": "naive-sg"');
  expect(fullText).toContain('"quic_congestion_control": "bbr2"');
  expect(fullText).toContain('"X-Client": "LeBox"');
  expect(fullText).toContain('"query_server_name": "cloudflare-ech.com"');
  expect(fullText).toContain('"connect_timeout": "5s"');
  expect(fullText).toContain('"tcp_fast_open": true');
  expect(fullText).toContain('"rule_set"');
  expect(fullText).toContain('"geosite-openai"');
  expect(fullText).toContain("https://cdn.jsdelivr.net/gh/SagerNet/sing-geosite@rule-set/geosite-cn.srs");
  expect(fullText).not.toContain('"geosite":');
  expect(fullText).not.toContain('"geoip":');

  // Switch to Settings & Logs tabs
  await app.press("id:nav-settings");
  await app.waitFor("text:客户端与内核设置");
  await app.waitFor("id:check-singbox-update-btn");
  await app.waitFor("id:check-app-update-btn");
  expect(app.texts()).toContain("LeBox 程序版本与热更新");
  await app.press("id:nav-logs");
  await app.waitFor("text:运行日志");
});

test("LeBox adapts to compact mobile-app layout with bottom tabs and responsive sheets", async () => {
  const app = await open("./App.tsx", {
    width: 390,
    height: 844,
    platform: "ios",
    safeArea: { top: 47, bottom: 34 },
  });

  await app.waitFor("id:mobile-bottom-toggle-btn");
  await app.waitFor("id:nav-tools");
  expect(app.texts()).toContain("连接总览");
  expect(app.texts()).not.toContain("sing-box 核心引擎");
  expect(app.texts()).not.toContain("一键启动连接");
  expect(app.texts()).toContain("规则分流");

  // Navigate to Nodes via bottom bar and open mobile modal sheet
  await app.press("id:nav-nodes");
  await app.waitFor("text:节点管理");
  await app.press("id:create-node-btn");
  await app.waitFor("id:node-editor-dialog");
  await app.press("id:editor-tab-transport");
  await app.waitFor("id:field-quic");
  await app.press("text:取消");

  // Navigate to Routing via bottom bar
  await app.press("id:nav-routing");
  await app.waitFor("text:路由规则管理");

  // Navigate to Tools (Config + Logs segmented switcher)
  await app.press("id:nav-tools");
  await app.waitFor("id:nav-config");
  await app.waitFor("id:nav-logs");
  await app.waitFor("text:sing-box 配置生成与验证");
  await app.press("id:nav-logs");
  await app.waitFor("text:暂无匹配日志");

  // Navigate to Settings via bottom bar and verify mobile capability notice
  await app.press("id:nav-settings");
  await app.waitFor("text:客户端与内核设置");
  await app.waitFor("id:check-app-update-btn");
  expect(app.texts().join("\n")).toContain("移动端平台（ios）");

  // Return to Dashboard and confirm bottom-center connect button remains present
  await app.press("id:nav-dashboard");
  await app.waitFor("id:mobile-bottom-toggle-btn");
});

test("LeBox supports Android viewport and narrow desktop window switching", async () => {
  const androidApp = await open("./App.tsx", {
    width: 412,
    height: 915,
    platform: "android",
  });
  await androidApp.waitFor("id:mobile-bottom-toggle-btn");
  await androidApp.press("id:nav-settings");
  await androidApp.waitFor("text:客户端与内核设置");
  expect(androidApp.texts().join("\n")).toContain("移动端平台（android）");

  const narrowDesktop = await open("./App.tsx", {
    width: 440,
    height: 780,
    platform: "windows",
  });
  await narrowDesktop.waitFor("id:mobile-bottom-toggle-btn");
  await narrowDesktop.waitFor("id:nav-tools");
});

test("LeBox supports quick node switching on Dashboard, select-first inputs, and safe defaults", async () => {
  const app = await open("./App.tsx", {
    width: 1200,
    height: 800,
    platform: "windows",
  });

  await app.press("id:nav-nodes");
  await app.waitFor("text:节点管理");
  await app.press("id:create-node-btn");
  await app.waitFor("id:node-editor-dialog");

  await app.clear("id:field-name");
  await app.clear("id:field-tag");
  await app.clear("id:field-port");
  await app.clear("id:field-server");
  await app.type("id:field-server", "hk.quick.example.com");
  await app.press("text:8443");

  await app.press("id:field-concurrency");
  await app.press("text:2 (双并发 · 不推荐)");

  await app.press("id:editor-tab-dial");
  await app.press("id:field-dial-resolver");
  await app.press("text:dns-remote (远程解析器)");
  await app.press("text:10s");

  await app.press("id:save-node-btn");
  await app.waitFor("text:hk.quick.example.com");

  await app.press("id:nav-dashboard");
  await app.waitFor("id:quick-switch-node-btn");
  await app.press("id:quick-switch-node-btn");
  await app.waitFor("id:quick-switch-dialog");
  await app.press("id:quick-switch-dialog >> text:hk.quick.example.com");
  await app.waitFor("text:hk.quick.example.com:8443 · HTTP/2");
  await app.press("id:quick-pill-naive-default-1");
  expect(app.texts()).toContain("example.com:443 · HTTP/2");

  await app.press("id:nav-settings");
  await app.waitFor("text:客户端与内核设置");
  await app.waitFor("id:setting-local-udp-dns");
  expect(app.texts().join("\n")).toContain("223.5.5.5");

  await app.press("id:nav-config");
  await app.waitFor("text:sing-box 配置生成与验证");
  const configText = app.texts().join("\n");
  expect(configText).toContain('"server": "hk.quick.example.com"');
  expect(configText).toContain('"server_port": 8443');
  expect(configText).toContain('"server_name": "hk.quick.example.com"');
  expect(configText).toContain('"insecure_concurrency": 2');
  expect(configText).toContain('"domain_resolver": "dns-remote"');
  expect(configText).toContain('"connect_timeout": "10s"');
  expect(configText).toContain('"server": "223.5.5.5"');
});

test("LeBox keeps Dashboard quick switching clean with many nodes, search, filters, and active pinning", async () => {
  const app = await open("./App.tsx", {
    width: 1280,
    height: 800,
    platform: "windows",
  });

  await app.press("id:nav-nodes");
  await app.waitFor("text:节点管理");
  await app.press("id:open-import-btn");
  await app.waitFor("id:import-node-dialog");

  const uris = Array.from({ length: 12 }, (_, idx) => {
    const num = String(idx + 1).padStart(2, "0");
    const scheme = idx % 2 === 0 ? "naive+https" : "naive+quic";
    return `${scheme}://u${num}:p${num}@node-${num}.example.com:${443 + idx}#专线节点 ${num}`;
  }).join("\n");

  await app.type("id:import-textarea", uris);
  await app.press("id:confirm-import-btn");
  await app.waitFor("text:专线节点 12");

  await app.press("id:nav-dashboard");
  await app.waitFor("id:quick-switch-more-btn");
  expect(app.texts()).toContain("切换 (13)");
  expect(app.texts()).toContain("全部 13 个 ›");
  expect(app.texts()).toContain("常用 / 快速切换（展示 8 / 13）");

  await app.press("id:quick-switch-more-btn");
  await app.waitFor("id:quick-switch-dialog");
  await app.waitFor("id:filter-quic-btn");
  await app.waitFor("id:sort-name-btn");

  await app.press("id:filter-quic-btn");
  await app.type("id:quick-switch-search", "no-such-node-xyz");
  await app.waitFor("id:reset-quick-filter-btn");
  await app.press("id:reset-quick-filter-btn");

  await app.type("id:quick-switch-search", "node-12");
  await app.waitFor("text:显示 1 / 13");
  await app.press("id:quick-switch-dialog >> text:专线节点 12");
  await app.waitFor("text:node-12.example.com:454 · QUIC");
  expect(app.texts()).toContain("专线节点 12");
});

test("LogsPage displays logs in reverse chronological order (newest first)", async () => {
  const app = await open("./App.tsx", {
    width: 1200,
    height: 800,
    platform: "windows",
  });

  await app.waitFor("id:start-core-btn");
  await app.press("id:start-core-btn");
  await app.press("id:nav-logs");
  await app.waitFor("text:共记录 2 条 sing-box 与调度器输出（按时间倒序，最新在前）");

  const texts = app.texts();
  const firstIdx = texts.findIndex((t) => t.includes("正在生成并校验 sing-box 配置"));
  const errorIdx = texts.findIndex((t) => t.includes("配置校验失败") || t.includes("启动失败"));
  expect(firstIdx).toBeGreaterThan(-1);
  expect(errorIdx).toBeGreaterThan(-1);
  expect(errorIdx).toBeLessThan(firstIdx);
});
