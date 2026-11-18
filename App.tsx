import { cleanup, mount, Overlay, platform, signal, Text, View } from "nsh";
import { Button, Toast, ToastManager, ToastStack } from "nsh/base";
import type { ToastEntry } from "nsh/base";
import { isAvailable as isDesktopAvailable } from "nsh/desktop";
import { BackHandler, Haptics, isAvailable as isMobileAvailable } from "nsh/mobile";
import { getSafeInsets, isCompactLayout } from "./src/core/layout";
import { createDefaultNodeProfile } from "./src/core/nodeProtocols";
import { createDefaultSettings, resolveNodeOutboundTags } from "./src/core/singboxConfig";
import { ConfigPage } from "./src/pages/ConfigPage";
import { DashboardPage } from "./src/pages/DashboardPage";
import { LogsPage } from "./src/pages/LogsPage";
import { NodesPage } from "./src/pages/NodesPage";
import { RoutingPage } from "./src/pages/RoutingPage";
import { SettingsPage } from "./src/pages/SettingsPage";
import {
  getHostVpnInfo,
  getHostVpnStats,
  isNativeHostAvailable,
  selectHostOutbound,
  startHostVpn,
  stopHostVpn,
  subscribeHostVpnEvents,
  testHostOutboundDelay,
} from "./src/services/nativeHost";
import {
  bootstrapBundledSingBox,
  closeAllClashConnections,
  fetchClashConnections,
  loadPersistedState,
  probeSingBoxVersion,
  saveProfiles,
  saveSettings,
  SingBoxController,
  switchClashSelector,
  testNaiveDelay,
} from "./src/services/runtime";
import { CLS } from "./src/styles";
import type {
  AppSettings,
  ClashConnectionItem,
  CoreBinaryOrigin,
  CoreRunState,
  LogEntry,
  NodeProfile,
  RoutingMode,
  TrafficStats,
} from "./src/types/singbox";

type NavPageId = "dashboard" | "nodes" | "routing" | "config" | "logs" | "settings";
type ToastTone = "info" | "success" | "warning" | "error";

interface ToastPayload {
  title: string;
  tone: ToastTone;
}

const DESKTOP_NAV_ITEMS: { id: NavPageId; label: string; testID: string }[] = [
  { id: "dashboard", label: "概览控制", testID: "nav-dashboard" },
  { id: "nodes", label: "节点", testID: "nav-nodes" },
  { id: "routing", label: "路由规则", testID: "nav-routing" },
  { id: "config", label: "配置与校验", testID: "nav-config" },
  { id: "logs", label: "运行日志", testID: "nav-logs" },
  { id: "settings", label: "系统设置", testID: "nav-settings" },
];

const MOBILE_LEFT_TABS: {
  id: "dashboard" | "nodes";
  label: string;
  glyph: string;
  testID: string;
}[] = [
  { id: "dashboard", label: "首页", glyph: "◉", testID: "nav-dashboard" },
  { id: "nodes", label: "节点", glyph: "◈", testID: "nav-nodes" },
];

const MOBILE_RIGHT_TABS: {
  id: "routing" | "settings";
  label: string;
  glyph: string;
  testID: string;
}[] = [
  { id: "routing", label: "路由", glyph: "⇄", testID: "nav-routing" },
  { id: "settings", label: "设置", glyph: "⚙", testID: "nav-settings" },
];

const PAGE_TITLES: Record<NavPageId, string> = {
  dashboard: "连接总览",
  nodes: "节点管理",
  routing: "路由规则",
  config: "配置与校验",
  logs: "运行日志",
  settings: "系统设置",
};

const TOAST_BORDER: Record<ToastTone, string> = {
  info: "border-info/50",
  success: "border-success/50",
  warning: "border-warning/50",
  error: "border-destructive/50",
};

const TOAST_DOT: Record<ToastTone, string> = {
  info: "bg-info",
  success: "bg-success",
  warning: "bg-warning",
  error: "bg-destructive",
};

function App() {
  const page = signal<NavPageId>("dashboard");
  const profiles = signal<NodeProfile[]>([
    createDefaultNodeProfile("naive", {
      id: "naive-default-1",
      name: "NaiveProxy 示例节点",
      tag: "naive-out",
      server: "example.com",
      serverPort: 443,
      username: "alice",
      password: "password",
    }),
  ]);
  const activeProfileId = signal<string | null>("naive-default-1");
  const settings = signal<AppSettings>(createDefaultSettings());

  const runState = signal<CoreRunState>("stopped");
  const coreError = signal<string | null>(null);
  const hasHostCore = () => !isDesktopAvailable && isNativeHostAvailable();
  const coreVersion = signal<string>(
    isDesktopAvailable
      ? "等待探测"
      : hasHostCore()
        ? "等待探测 libbox"
        : "配置预览模式（需桌面内核或原生 libbox 宿主）",
  );
  const corePid = signal<number | null>(null);
  const coreOrigin = signal<CoreBinaryOrigin>("path");
  const coreResolvedPath = signal<string>("");
  const logs = signal<LogEntry[]>([]);
  const stats = signal<TrafficStats>({ up: 0, down: 0, connections: 0, memoryBytes: 0 });
  const connections = signal<ClashConnectionItem[]>([]);
  const delays = signal<Record<string, number | "testing" | "error">>({});

  const toastManager = new ToastManager();
  const toastEntries = signal<ToastEntry[]>([]);
  const toastExpanded = signal(false);
  let toastSeq = 1;
  let logSeq = 1;

  const syncToasts = () => {
    toastEntries.set(toastManager.visible(4));
  };

  const pushToast = (title: string, tone: ToastTone = "info") => {
    const id = `toast-${toastSeq++}`;
    toastManager.push(id, { title, tone } satisfies ToastPayload, { timeout: 3200 });
    syncToasts();
  };

  const dismissToast = (id: string) => {
    toastManager.dismiss(id);
    syncToasts();
  };

  const toastTimer = setInterval(() => {
    const res = toastManager.advance(toastExpanded());
    if (res.changed) syncToasts();
  }, 60);

  const appendLog = (entry: Omit<LogEntry, "id">) => {
    const next: LogEntry = { ...entry, id: logSeq++ };
    logs.update((prev) => {
      const merged = [...prev, next];
      return merged.length > 400 ? merged.slice(merged.length - 400) : merged;
    });
  };

  const controller = new SingBoxController({
    onStateChange: (state, errMsg) => {
      runState.set(state);
      coreError.set(errMsg ?? null);
      corePid.set(controller.getPid());
      if (state === "stopped") {
        stats.set({ up: 0, down: 0, connections: 0, memoryBytes: 0 });
        connections.set([]);
      }
    },
    onLog: appendLog,
  });

  const activeProfile = () =>
    profiles().find((p) => p.id === activeProfileId()) ?? profiles()[0] ?? null;

  const persistProfiles = (nextProfiles: NodeProfile[], nextActiveId: string | null) => {
    profiles.set(nextProfiles);
    activeProfileId.set(nextActiveId);
    void saveProfiles(nextProfiles, nextActiveId);
  };

  const persistSettings = (nextSettings: AppSettings) => {
    settings.set(nextSettings);
    void saveSettings(nextSettings);
  };

  const refreshCoreProbe = async (configuredPath: string) => {
    if (!isDesktopAvailable) return;
    const probe = await probeSingBoxVersion(configuredPath);
    coreOrigin.set(probe.origin);
    coreResolvedPath.set(probe.resolvedPath);
    if (probe.ok) {
      coreVersion.set(probe.version);
    } else {
      coreVersion.set(`未就绪 (${probe.version})`);
    }
  };

  const unsubscribeHostEvents = hasHostCore()
    ? subscribeHostVpnEvents({
        onState: (nextState, errMsg) => {
          runState.set(nextState);
          coreError.set(errMsg ?? null);
          if (nextState === "stopped") {
            stats.set({ up: 0, down: 0, connections: 0, memoryBytes: 0 });
            connections.set([]);
          }
        },
        onLog: appendLog,
        onStats: (payload) => {
          stats.set(payload.stats);
          connections.set(payload.connections);
        },
      })
    : () => {};

  void (async () => {
    const loaded = await loadPersistedState();
    profiles.set(loaded.profiles);
    activeProfileId.set(loaded.activeProfileId);
    settings.set(loaded.settings);
    if (isDesktopAvailable) {
      await bootstrapBundledSingBox();
      await refreshCoreProbe(loaded.settings.singBoxPath);
    } else if (hasHostCore()) {
      try {
        const info = await getHostVpnInfo();
        coreOrigin.set("bundled");
        coreResolvedPath.set(`native:${info.engine}`);
        coreVersion.set(info.version || "libbox");
        if (info.running) {
          runState.set("running");
        } else if (info.error) {
          coreError.set(info.error);
        }
      } catch {
        coreVersion.set("libbox 宿主待就绪");
      }
    }
  })();

  const pollTimer = setInterval(() => {
    if (runState() !== "running") return;
    if (hasHostCore()) {
      void getHostVpnStats()
        .then((res) => {
          stats.set(res.stats);
          connections.set(res.connections);
        })
        .catch(() => {
          // Host stats optional when event stream is active
        });
      return;
    }
    if (!settings().clashApi.enabled) return;
    void fetchClashConnections(settings())
      .then((res) => {
        stats.set(res.stats);
        connections.set(res.items);
      })
      .catch(() => {
        // Clash API may still be warming up
      });
  }, 1500);

  if (isMobileAvailable && platform.os === "android") {
    BackHandler.on("press", () => {
      if (page() !== "dashboard") {
        page.set("dashboard");
        return true;
      }
      return false;
    });
  }

  cleanup(() => {
    clearInterval(toastTimer);
    clearInterval(pollTimer);
    unsubscribeHostEvents();
    toastManager.dispose();
    void controller.stop();
  });

  const navigateTo = (next: NavPageId) => {
    if (isMobileAvailable) {
      try {
        Haptics.selection();
      } catch {
        // ignore if unsupported
      }
    }
    page.set(next);
  };

  const handleStart = async () => {
    if (hasHostCore()) {
      runState.set("starting");
      coreError.set(null);
      try {
        const res = await startHostVpn(profiles(), activeProfileId(), settings());
        if (res.version) {
          coreVersion.set(res.version);
        }
        if (res.ok) {
          runState.set("running");
          pushToast("已请求原生 VPN 隧道启动", "success");
        } else {
          const msg = res.error || "原生 libbox 启动失败";
          runState.set("error");
          coreError.set(msg);
          pushToast(msg, "error");
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        runState.set("error");
        coreError.set(msg);
        pushToast(`启动原生 VPN 失败: ${msg}`, "error");
      }
      return;
    }
    if (!isDesktopAvailable) {
      pushToast("当前环境未挂载桌面内核或原生 libbox 宿主，可先管理节点与导出配置", "warning");
      return;
    }
    await controller.start(profiles(), activeProfileId(), settings());
    corePid.set(controller.getPid());
  };

  const handleStop = async () => {
    if (hasHostCore()) {
      runState.set("stopping");
      try {
        await stopHostVpn();
        runState.set("stopped");
        stats.set({ up: 0, down: 0, connections: 0, memoryBytes: 0 });
        connections.set([]);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        runState.set("error");
        coreError.set(msg);
        pushToast(`停止原生 VPN 失败: ${msg}`, "error");
      }
      return;
    }
    await controller.stop();
    corePid.set(null);
  };

  const handleRestart = async () => {
    if (hasHostCore()) {
      await handleStop();
      await handleStart();
      return;
    }
    if (!isDesktopAvailable) return;
    await controller.stop();
    await controller.start(profiles(), activeProfileId(), settings());
    corePid.set(controller.getPid());
  };

  const handleSelectActive = async (id: string) => {
    const target = profiles().find((p) => p.id === id);
    if (!target) return;
    if (activeProfileId() === id) return;
    persistProfiles(profiles(), id);
    if (runState() !== "running") {
      pushToast(`已切换主出站为 ${target.name}`, "info");
      return;
    }
    if (settings().routingMode === "direct") {
      pushToast(`已设定默认节点为 ${target.name}（当前为直连模式）`, "info");
      return;
    }
    if (hasHostCore()) {
      const resolvedTag = resolveNodeOutboundTags(profiles()).get(id) ?? target.tag;
      try {
        const ok = await selectHostOutbound(resolvedTag);
        if (ok) {
          pushToast(`已实时切换主出站为 ${target.name}`, "success");
          return;
        }
      } catch {
        // Fallback to full VPN reload
      }
      pushToast(`正在重载原生隧道以应用节点 ${target.name}...`, "info");
      await handleRestart();
      return;
    }
    if (settings().clashApi.enabled) {
      const resolvedTag = resolveNodeOutboundTags(profiles()).get(id) ?? target.tag;
      try {
        await switchClashSelector(settings(), resolvedTag);
        pushToast(`已实时切换主出站为 ${target.name}`, "success");
        return;
      } catch {
        pushToast(`正在重载内核以应用节点 ${target.name}...`, "info");
        await handleRestart();
        return;
      }
    }
    pushToast(`正在重载内核以切换至 ${target.name}...`, "info");
    await handleRestart();
  };

  const handleUpsertProfile = (profile: NodeProfile) => {
    const existingIdx = profiles().findIndex((p) => p.id === profile.id);
    const next = [...profiles()];
    if (existingIdx >= 0) {
      next[existingIdx] = profile;
    } else {
      next.push(profile);
    }
    const nextActive = activeProfileId() ?? profile.id;
    persistProfiles(next, nextActive);
    if (existingIdx >= 0 && profile.id === nextActive && runState() === "running") {
      pushToast(`节点 ${profile.name} 已更新，正在重载内核生效...`, "info");
      void handleRestart();
    }
  };

  const handleDeleteProfile = (id: string) => {
    if (profiles().length <= 1) return;
    const next = profiles().filter((p) => p.id !== id);
    const nextActive = activeProfileId() === id ? (next[0]?.id ?? null) : activeProfileId();
    persistProfiles(next, nextActive);
    pushToast("已删除节点", "info");
  };

  const handleImportProfiles = (imported: NodeProfile[]) => {
    const next = [...profiles(), ...imported];
    const nextActive = activeProfileId() ?? imported[0]?.id ?? null;
    persistProfiles(next, nextActive);
  };

  const handleChangeRoutingMode = (mode: RoutingMode) => {
    const next: AppSettings = { ...settings(), routingMode: mode };
    persistSettings(next);
    if (runState() === "running") {
      pushToast(`路由模式已切换为 ${mode.toUpperCase()}，正在重载内核...`, "info");
      void handleRestart();
    } else {
      pushToast(`路由模式已切换为 ${mode.toUpperCase()}`, "info");
    }
  };

  const handleTestDelay = async (profile: NodeProfile) => {
    delays.update((d) => ({ ...d, [profile.id]: "testing" }));
    const resolvedTag = resolveNodeOutboundTags(profiles()).get(profile.id) ?? profile.tag;
    try {
      const ms = hasHostCore()
        ? await testHostOutboundDelay(resolvedTag)
        : await testNaiveDelay(settings(), resolvedTag);
      delays.update((d) => ({ ...d, [profile.id]: ms }));
      pushToast(`${profile.name}: ${ms} ms`, "success");
    } catch (err) {
      delays.update((d) => ({ ...d, [profile.id]: "error" }));
      pushToast(`${profile.name} 测速失败: ${String(err)}`, "error");
    }
  };

  const handleTestAllDelays = async () => {
    if (runState() !== "running") {
      pushToast("请先启动内核后再进行延迟测速", "warning");
      return;
    }
    const list = profiles();
    if (list.length === 0) return;
    const tagMap = resolveNodeOutboundTags(list);
    const pending: Record<string, number | "testing" | "error"> = { ...delays() };
    for (const node of list) {
      pending[node.id] = "testing";
    }
    delays.set(pending);
    let okCount = 0;
    await Promise.all(
      list.map(async (node) => {
        const outboundTag = tagMap.get(node.id) ?? node.tag;
        try {
          const ms = hasHostCore()
            ? await testHostOutboundDelay(outboundTag)
            : await testNaiveDelay(settings(), outboundTag);
          delays.update((prev) => ({ ...prev, [node.id]: ms }));
          okCount += 1;
        } catch {
          delays.update((prev) => ({ ...prev, [node.id]: "error" }));
        }
      }),
    );
    pushToast(`全部节点测速完成 (${okCount}/${list.length} 个可用)`, okCount > 0 ? "success" : "warning");
  };

  const handleCloseConnections = async () => {
    try {
      await closeAllClashConnections(settings());
      connections.set([]);
      pushToast("已断开所有活跃连接", "info");
    } catch (err) {
      pushToast(`操作失败: ${String(err)}`, "error");
    }
  };

  const compact = () => isCompactLayout();
  const activeTabGroup = () =>
    page() === "config" || page() === "logs" ? "tools" : page();

  const renderPageContent = () => (
    <View class="flex-1">
      <If when={page() === "dashboard"}>
        <DashboardPage
          runState={runState}
          coreError={coreError}
          coreVersion={coreVersion}
          corePid={corePid}
          profiles={profiles}
          activeProfileId={activeProfileId}
          activeProfile={activeProfile}
          settings={settings}
          stats={stats}
          connections={connections}
          delays={delays}
          activeDelay={() => {
            const p = activeProfile();
            return p ? delays()[p.id] : undefined;
          }}
          onStart={() => void handleStart()}
          onStop={() => void handleStop()}
          onRestart={() => void handleRestart()}
          onSelectActive={(id) => void handleSelectActive(id)}
          onChangeRoutingMode={handleChangeRoutingMode}
          onTestActiveDelay={() => {
            const p = activeProfile();
            if (p) void handleTestDelay(p);
          }}
          onTestAllDelays={() => void handleTestAllDelays()}
          onCloseConnections={() => void handleCloseConnections()}
          onGoNodes={() => navigateTo("nodes")}
          onGoRouting={() => navigateTo("routing")}
          onGoConfig={() => navigateTo("config")}
          onGoLogs={() => navigateTo("logs")}
        />
      </If>

      <If when={page() === "nodes"}>
        <NodesPage
          profiles={profiles}
          activeProfileId={activeProfileId}
          coreRunning={() => runState() === "running"}
          delays={delays}
          onSelectActive={(id) => void handleSelectActive(id)}
          onUpsertProfile={handleUpsertProfile}
          onDeleteProfile={handleDeleteProfile}
          onImportProfiles={handleImportProfiles}
          onTestDelay={(p) => void handleTestDelay(p)}
          onTestAllDelays={() => void handleTestAllDelays()}
          onToast={(msg, tone) => pushToast(msg, tone)}
        />
      </If>

      <If when={page() === "routing"}>
        <RoutingPage
          settings={settings}
          onUpdateSettings={(updater) => persistSettings(updater(settings()))}
          onToast={(msg, tone) => pushToast(msg, tone)}
        />
      </If>

      <If when={page() === "config"}>
        <ConfigPage
          profiles={profiles}
          activeProfileId={activeProfileId}
          settings={settings}
          onToast={(msg, tone) => pushToast(msg, tone)}
        />
      </If>

      <If when={page() === "logs"}>
        <LogsPage
          logs={logs}
          onClear={() => logs.set([])}
          onToast={(msg, tone) => pushToast(msg, tone)}
        />
      </If>

      <If when={page() === "settings"}>
        <SettingsPage
          settings={settings}
          coreVersion={coreVersion}
          coreOrigin={coreOrigin}
          coreResolvedPath={coreResolvedPath}
          coreRunning={() => runState() === "running"}
          onUpdateSettings={(updater) => persistSettings(updater(settings()))}
          onGoRouting={() => navigateTo("routing")}
          onGoConfig={() => navigateTo("config")}
          onGoLogs={() => navigateTo("logs")}
          onResetDefaults={() => {
            persistSettings(createDefaultSettings());
            pushToast("已恢复默认设置", "info");
          }}
          onVersionDetected={(info) => {
            coreVersion.set(info.version);
            coreOrigin.set(info.origin);
            coreResolvedPath.set(info.resolvedPath);
          }}
          onStopCore={handleStop}
          onStartCore={handleStart}
          onToast={(msg, tone) => pushToast(msg, tone)}
        />
      </If>
    </View>
  );

  return (
    <View class={compact() ? "flex-1 bg-background" : "flex-1 flex-row bg-background"}>
      <If when={!compact()}>
        <View class="w-56 justify-between border-r border-sidebar-border bg-sidebar p-3">
          <View class="gap-4">
            <View class="gap-1 px-2 pt-1">
              <View class="flex-row items-center justify-between">
                <Text class="text-base font-bold text-sidebar-foreground">LeBox</Text>
                <View class={CLS.badgePrimary}>
                  <Text class="text-[11px] font-medium text-primary">sing-box</Text>
                </View>
              </View>
              <Text class="text-[11px] text-muted-foreground">跨端代理客户端 · 桌面模式</Text>
            </View>

            <View class={CLS.separatorH} />

            <View class="gap-1">
              <Each of={DESKTOP_NAV_ITEMS} key={(item) => item.id}>
                {(item) => {
                  const selected = () => page() === item().id;
                  return (
                    <Button
                      testID={item().testID}
                      accessibilityLabel={item().label}
                      selected={selected()}
                      onPress={() => navigateTo(item().id)}
                      class={`${CLS.btnBase} ${CLS.btnMd} w-full justify-start px-3 ${selected() ? CLS.btnSecondary : CLS.btnGhost} ${selected() ? "border-primary bg-accent" : ""}`}
                    >
                      <Text class={`text-sm font-medium ${selected() ? "text-accent-foreground" : "text-foreground"}`}>
                        {item().label}
                      </Text>
                    </Button>
                  );
                }}
              </Each>
            </View>
          </View>

          <View class="gap-2 rounded-[14px] border border-sidebar-border bg-card p-3">
            <View class="flex-row items-center justify-between">
              <Text class="text-xs font-semibold text-card-foreground">
                {runState() === "running" ? "隧道运行中" : "隧道未启动"}
              </Text>
              <View
                class={`size-2 rounded-full ${runState() === "running" ? "bg-success" : runState() === "error" ? "bg-destructive" : "bg-muted-foreground"}`}
              />
            </View>
            <Text class="text-[11px] text-muted-foreground">
              {activeProfile() ? `${activeProfile()!.name}` : "未选择节点"}
            </Text>
            <Button
              testID="sidebar-toggle-btn"
              accessibilityLabel={runState() === "running" ? "停止内核" : "启动连接"}
              onPress={() => {
                if (runState() === "running") void handleStop();
                else void handleStart();
              }}
              class={`${CLS.btnBase} ${CLS.btnSm} w-full ${runState() === "running" ? CLS.btnDanger : CLS.btnPrimary}`}
            >
              <Text class={`text-xs font-medium ${runState() === "running" ? CLS.btnTextDanger : CLS.btnTextPrimary}`}>
                {runState() === "running" ? "停止内核" : "启动连接"}
              </Text>
            </Button>
          </View>
        </View>
      </If>

      <If when={compact()}>
        <View class="flex-1">
          <View
            style={{ paddingTop: Math.max(getSafeInsets().top, 8) }}
            class="border-b border-border bg-card px-4 pb-2.5"
          >
            <View class="flex-row items-center justify-between gap-2">
              <View class="flex-row items-center gap-2">
                <Text class="text-base font-bold text-foreground">LeBox</Text>
                <View class="h-3.5 w-px bg-border" />
                <Text class="text-sm font-semibold text-foreground">{PAGE_TITLES[page()]}</Text>
              </View>
              <View class="flex-row items-center gap-2">
                <View class="flex-row items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-1">
                  <View
                    class={`size-2 rounded-full ${
                      runState() === "running"
                        ? "bg-success"
                        : runState() === "error"
                          ? "bg-destructive"
                          : runState() === "checking" || runState() === "starting" || runState() === "stopping"
                            ? "bg-info"
                            : "bg-muted-foreground"
                    }`}
                  />
                  <Text class="text-[11px] font-medium text-foreground">
                    {runState() === "running"
                      ? "已连接"
                      : runState() === "error"
                        ? "启动异常"
                        : runState() === "checking" || runState() === "starting" || runState() === "stopping"
                          ? "处理中"
                          : "未连接"}
                  </Text>
                </View>
                <If when={runState() === "running"}>
                  <Button
                    testID="mobile-restart-btn"
                    accessibilityLabel="重启内核"
                    onPress={() => void handleRestart()}
                    class={`${CLS.btnBase} h-7 rounded-full px-2.5 ${CLS.btnOutline}`}
                  >
                    <Text class={`text-[11px] font-medium ${CLS.btnTextFg}`}>重启</Text>
                  </Button>
                </If>
                <Button
                  testID="nav-tools"
                  accessibilityLabel="工具"
                  selected={activeTabGroup() === "tools"}
                  onPress={() => navigateTo(page() === "logs" ? "logs" : "config")}
                  class={`${CLS.btnBase} h-7 rounded-full px-2.5 ${activeTabGroup() === "tools" ? "border-primary bg-primary/15" : CLS.btnOutline}`}
                >
                  <Text class={`text-[11px] font-medium ${activeTabGroup() === "tools" ? "text-primary" : CLS.btnTextFg}`}>
                    工具
                  </Text>
                </Button>
              </View>
            </View>

            <If when={page() === "config" || page() === "logs"}>
              <View class="mt-2.5 flex-row gap-2 rounded-[10px] border border-border bg-muted p-1">
                <Button
                  testID="nav-config"
                  accessibilityLabel="配置与校验"
                  onPress={() => navigateTo("config")}
                  class={`${CLS.btnBase} h-7 flex-1 rounded-[7px] ${page() === "config" ? "bg-card shadow-xs" : "bg-transparent"}`}
                >
                  <Text class={`text-xs ${page() === "config" ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                    配置与校验
                  </Text>
                </Button>
                <Button
                  testID="nav-logs"
                  accessibilityLabel="运行日志"
                  onPress={() => navigateTo("logs")}
                  class={`${CLS.btnBase} h-7 flex-1 rounded-[7px] ${page() === "logs" ? "bg-card shadow-xs" : "bg-transparent"}`}
                >
                  <Text class={`text-xs ${page() === "logs" ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                    运行日志
                  </Text>
                </Button>
              </View>
            </If>
          </View>

          <View class="flex-1 px-3.5 pt-3">
            {renderPageContent()}
          </View>

          <View
            style={{ paddingBottom: Math.max(getSafeInsets().bottom, 6) }}
            class="border-t border-border bg-card px-2 pt-1.5"
          >
            <View class="flex-row items-center justify-between gap-1">
              <Each of={MOBILE_LEFT_TABS} key={(tab) => tab.id}>
                {(tab) => {
                  const selected = () => activeTabGroup() === tab().id;
                  return (
                    <Button
                      testID={tab().testID}
                      accessibilityLabel={tab().label}
                      selected={selected()}
                      onPress={() => navigateTo(tab().id)}
                      class={`flex-1 items-center justify-center gap-0.5 rounded-[10px] py-1.5 ${selected() ? "bg-primary/10" : "bg-transparent"}`}
                    >
                      <Text class={`text-sm leading-4 ${selected() ? "text-primary" : "text-muted-foreground"}`}>
                        {tab().glyph}
                      </Text>
                      <Text class={`text-[11px] ${selected() ? "font-semibold text-primary" : "font-medium text-muted-foreground"}`}>
                        {tab().label}
                      </Text>
                    </Button>
                  );
                }}
              </Each>

              <Button
                testID="mobile-bottom-toggle-btn"
                accessibilityLabel={runState() === "running" ? "断开连接" : "启动连接"}
                disabled={
                  runState() === "checking" || runState() === "starting" || runState() === "stopping"
                }
                onPress={() => {
                  if (runState() === "running") void handleStop();
                  else void handleStart();
                }}
                class={`${CLS.btnBase} mx-1 h-10 min-w-[78px] shrink-0 rounded-full px-3.5 shadow-sm ${
                  runState() === "running"
                    ? CLS.btnDanger
                    : runState() === "checking" || runState() === "starting" || runState() === "stopping"
                      ? CLS.btnSecondary
                      : CLS.btnPrimary
                }`}
              >
                <Text
                  class={`text-xs font-semibold ${
                    runState() === "running"
                      ? CLS.btnTextDanger
                      : runState() === "checking" || runState() === "starting" || runState() === "stopping"
                        ? CLS.btnTextSecondary
                        : CLS.btnTextPrimary
                  }`}
                >
                  {runState() === "running"
                    ? "■ 断开"
                    : runState() === "checking" || runState() === "starting" || runState() === "stopping"
                      ? "处理中"
                      : "● 连接"}
                </Text>
              </Button>

              <Each of={MOBILE_RIGHT_TABS} key={(tab) => tab.id}>
                {(tab) => {
                  const selected = () => activeTabGroup() === tab().id;
                  return (
                    <Button
                      testID={tab().testID}
                      accessibilityLabel={tab().label}
                      selected={selected()}
                      onPress={() => navigateTo(tab().id)}
                      class={`flex-1 items-center justify-center gap-0.5 rounded-[10px] py-1.5 ${selected() ? "bg-primary/10" : "bg-transparent"}`}
                    >
                      <Text class={`text-sm leading-4 ${selected() ? "text-primary" : "text-muted-foreground"}`}>
                        {tab().glyph}
                      </Text>
                      <Text class={`text-[11px] ${selected() ? "font-semibold text-primary" : "font-medium text-muted-foreground"}`}>
                        {tab().label}
                      </Text>
                    </Button>
                  );
                }}
              </Each>
            </View>
          </View>
        </View>
      </If>

      <If when={!compact()}>
        <View class="flex-1 p-5">
          <View class="mx-auto w-full max-w-[960px] flex-1">
            {renderPageContent()}
          </View>
        </View>
      </If>

      <If when={toastEntries().length > 0}>
        <Overlay class={`right-0 items-end justify-end p-4 ${compact() ? "bottom-16" : "bottom-0"}`}>
          <ToastStack
            placement="bottomRight"
            onExpandedChange={({ expanded }) => toastExpanded.set(expanded)}
            class={compact() ? "w-[300px]" : "w-[340px]"}
          >
            <Each of={toastEntries()} key={(entry) => entry.id}>
              {(entry) => {
                const payload = () => (entry().value as ToastPayload) ?? { title: "", tone: "info" };
                return (
                  <Toast
                    transitionStatus={entry().status}
                    accessibilityLabel={payload().title}
                    onDismissRequest={() => dismissToast(entry().id)}
                    startingClass="opacity-0 translate-y-2"
                    endingClass="opacity-0 scale-95"
                    class={`flex-row items-center gap-2.5 rounded-[12px] border bg-card px-3.5 py-2.5 shadow-lg transition-all duration-200 ${TOAST_BORDER[payload().tone]}`}
                  >
                    <View class={`size-2 rounded-full ${TOAST_DOT[payload().tone]}`} />
                    <Text class="flex-1 text-xs font-medium text-card-foreground">{payload().title}</Text>
                  </Toast>
                );
              }}
            </Each>
          </ToastStack>
        </Overlay>
      </If>
    </View>
  );
}

mount(App);
