import { platform, Scroll, signal, Text, View } from "nsh";
import { Button, Input, Select, Switch } from "nsh/base";
import { isCompactLayout, rowStackClass } from "../core/layout";
import {
  COMMON_CLASH_PORTS,
  COMMON_MIXED_PORTS,
  LISTEN_ADDRESS_OPTIONS,
  LOCAL_UDP_DNS_OPTIONS,
  REMOTE_DNS_DOH_OPTIONS,
  REMOTE_DNS_PLAIN_OPTIONS,
  TUN_IPV4_OPTIONS,
  TUN_IPV6_OPTIONS,
  TUN_MTU_OPTIONS,
} from "../core/singboxConfig";
import type { SingBoxReleaseInfo } from "../core/updater";
import { formatBytes, probeSingBoxVersion } from "../services/runtime";
import {
  applyAppPackageHotUpdate,
  applyAppShellUpdate,
  checkAppUpdates,
  checkSingBoxUpdate,
  getAppUpdateStatus,
  hotUpdateSingBox,
  openExternalUrl,
} from "../services/updater";
import type { AppUpdateCheckResult } from "../services/updater";
import { CLS } from "../styles";
import type { AppSettings, CoreBinaryOrigin, DomainStrategy, LogLevel } from "../types/singbox";

const LOG_LEVEL_OPTIONS: { value: LogLevel; title: string }[] = [
  { value: "trace", title: "trace" },
  { value: "debug", title: "debug" },
  { value: "info", title: "info (默认)" },
  { value: "warn", title: "warn" },
  { value: "error", title: "error" },
  { value: "fatal", title: "fatal" },
];

const DNS_REMOTE_TYPES: { value: AppSettings["dns"]["remoteType"]; title: string }[] = [
  { value: "https", title: "DoH (https)" },
  { value: "tls", title: "DoT (tls)" },
  { value: "udp", title: "UDP" },
  { value: "tcp", title: "TCP" },
];

const DNS_LOCAL_TYPES: { value: AppSettings["dns"]["localType"]; title: string }[] = [
  { value: "local", title: "系统本地解析 (local)" },
  { value: "udp", title: "指定 UDP DNS" },
];

const TUN_STACKS: { value: AppSettings["tun"]["stack"]; title: string }[] = [
  { value: "mixed", title: "mixed (推荐)" },
  { value: "system", title: "system" },
  { value: "gvisor", title: "gvisor" },
];

const DNS_STRATEGIES: { value: DomainStrategy; title: string }[] = [
  { value: "", title: "默认" },
  { value: "prefer_ipv4", title: "prefer_ipv4" },
  { value: "prefer_ipv6", title: "prefer_ipv6" },
  { value: "ipv4_only", title: "ipv4_only" },
  { value: "ipv6_only", title: "ipv6_only" },
];

const ORIGIN_LABEL: Record<CoreBinaryOrigin, string> = {
  bundled: "内置核心",
  "hot-updated": "热更新核心",
  path: "系统 PATH",
  custom: "自定义路径",
};

const CUSTOM_SENTINEL = "__custom__";

function withCustomOption(
  options: { value: string; title: string }[],
  customLabel = "自定义...",
): { value: string; title: string }[] {
  return [...options, { value: CUSTOM_SENTINEL, title: customLabel }];
}

function matchesPreset(options: { value: string }[], current: string): boolean {
  return options.some((item) => item.value === current);
}

function generateRandomSecret(): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let idx = 0; idx < 16; idx += 1) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function SettingsPage(props: {
  settings: () => AppSettings;
  coreVersion: () => string;
  coreOrigin: () => CoreBinaryOrigin;
  coreResolvedPath: () => string;
  coreRunning: () => boolean;
  onUpdateSettings: (updater: (cur: AppSettings) => AppSettings) => void;
  onResetDefaults: () => void;
  onVersionDetected: (info: { version: string; origin: CoreBinaryOrigin; resolvedPath: string }) => void;
  onStopCore: () => Promise<void>;
  onStartCore: () => Promise<void>;
  onGoRouting: () => void;
  onGoConfig?: () => void;
  onGoLogs?: () => void;
  onToast: (msg: string, tone?: "info" | "success" | "warning" | "error") => void;
}) {
  const compact = () => isCompactLayout();
  const probing = signal(false);
  const probeOutput = signal<{ ok: boolean; text: string } | null>(null);

  const checkingCoreUpdate = signal(false);
  const coreRelease = signal<SingBoxReleaseInfo | null>(null);
  const coreUpdateError = signal<string | null>(null);
  const updatingCore = signal(false);
  const coreUpdateStage = signal<string>("");
  const preferProxyDownload = signal(true);

  const appStatus = signal(getAppUpdateStatus());
  const checkingAppUpdate = signal(false);
  const appUpdateResult = signal<AppUpdateCheckResult | null>(null);
  const appCheckedOnce = signal(false);
  const applyingAppUpdate = signal(false);
  const appProgressText = signal<string>("");
  const customMixedListen = signal(false);
  const customTunMtu = signal(false);
  const customTunIpv4 = signal(false);
  const customTunIpv6 = signal(false);
  const customRemoteDns = signal(false);
  const customLocalDns = signal(false);
  const customClashListen = signal(false);

  const remoteDnsOptions = () =>
    props.settings().dns.remoteType === "https"
      ? REMOTE_DNS_DOH_OPTIONS
      : REMOTE_DNS_PLAIN_OPTIONS;

  const cloneSettings = (): AppSettings => JSON.parse(JSON.stringify(props.settings())) as AppSettings;

  const update = (fn: (draft: AppSettings) => void) => {
    props.onUpdateSettings(() => {
      const next = cloneSettings();
      fn(next);
      return next;
    });
  };

  const handleProbe = async () => {
    probing.set(true);
    try {
      const res = await probeSingBoxVersion(props.settings().singBoxPath);
      probeOutput.set({ ok: res.ok, text: res.raw });
      if (res.ok) {
        props.onVersionDetected({
          version: res.version,
          origin: res.origin,
          resolvedPath: res.resolvedPath,
        });
        props.onToast(`检测到 ${res.version}`, "success");
      } else {
        props.onToast(`检测失败: ${res.version}`, "error");
      }
    } finally {
      probing.set(false);
    }
  };

  const handleCheckCoreUpdate = async () => {
    checkingCoreUpdate.set(true);
    coreUpdateError.set(null);
    try {
      const info = await checkSingBoxUpdate(props.settings().singBoxPath);
      coreRelease.set(info);
      if (info.hasUpdate) {
        props.onToast(`发现新版 sing-box v${info.latestVersion}`, "info");
      } else {
        props.onToast(`sing-box 已是最新版本 (v${info.latestVersion})`, "success");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      coreUpdateError.set(msg);
      props.onToast(`检查内核更新失败: ${msg}`, "error");
    } finally {
      checkingCoreUpdate.set(false);
    }
  };

  const handleHotUpdateCore = async () => {
    const release = coreRelease();
    if (!release) return;
    updatingCore.set(true);
    coreUpdateError.set(null);
    coreUpdateStage.set("准备下载 sing-box 更新...");
    try {
      const s = props.settings();
      const listenHost = s.mixed.listen.trim() === "0.0.0.0" || !s.mixed.listen.trim()
        ? "127.0.0.1"
        : s.mixed.listen.trim();
      const canUseProxy = preferProxyDownload() && props.coreRunning() && s.mixed.enabled;
      const proxyUrl = canUseProxy ? `http://${listenHost}:${s.mixed.listenPort}` : undefined;

      const res = await hotUpdateSingBox({
        release,
        useActiveProxy: canUseProxy,
        proxyUrl,
        isCoreRunning: props.coreRunning(),
        stopCore: props.onStopCore,
        startCore: props.onStartCore,
        onStage: (stage) => coreUpdateStage.set(stage),
      });

      const probe = await probeSingBoxVersion(props.settings().singBoxPath);
      if (probe.ok) {
        props.onVersionDetected({
          version: probe.version,
          origin: probe.origin,
          resolvedPath: probe.resolvedPath,
        });
      }
      coreRelease.set({
        ...release,
        currentVersion: res.version,
        hasUpdate: false,
      });
      coreUpdateStage.set("");
      props.onToast(
        res.restarted
          ? `sing-box 已热更新至 v${res.version} 并自动重启`
          : `sing-box 已热更新至 v${res.version}`,
        "success",
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      coreUpdateError.set(msg);
      coreUpdateStage.set("");
      props.onToast(`热更新失败: ${msg}`, "error");
    } finally {
      updatingCore.set(false);
    }
  };

  const handleCheckAppUpdate = async () => {
    checkingAppUpdate.set(true);
    appStatus.set(getAppUpdateStatus());
    try {
      const result = await checkAppUpdates(props.settings().appManifestUrl);
      appUpdateResult.set(result);
      appCheckedOnce.set(true);
      if (result.packageUpdate) {
        props.onToast(
          `发现程序热更新包 v${result.packageUpdate.version} (build ${result.packageUpdate.build})`,
          "info",
        );
      } else if (result.shellUpdate) {
        props.onToast(`发现客户端新版 v${result.shellUpdate.version}`, "info");
      } else if (result.fallbackUpdate) {
        props.onToast(`发现清单新版 v${result.fallbackUpdate.version}`, "info");
      } else if (result.errors.length > 0) {
        props.onToast(result.errors[0]!, "warning");
      } else {
        props.onToast("当前程序已是最新版本", "success");
      }
    } finally {
      checkingAppUpdate.set(false);
    }
  };

  const handleApplyPackageUpdate = async () => {
    applyingAppUpdate.set(true);
    appProgressText.set("正在下载程序热更新包...");
    try {
      await applyAppPackageHotUpdate((p) => {
        if (p.total && p.total > 0) {
          const pct = Math.min(100, Math.round((p.received / p.total) * 100));
          appProgressText.set(`正在下载热更新包 ${pct}% (${formatBytes(p.received)} / ${formatBytes(p.total)})`);
        } else {
          appProgressText.set(`已接收 ${formatBytes(p.received)}`);
        }
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      appProgressText.set("");
      props.onToast(`程序热更新失败: ${msg}`, "error");
      applyingAppUpdate.set(false);
    }
  };

  const handleApplyShellUpdate = async () => {
    applyingAppUpdate.set(true);
    appProgressText.set("正在下载客户端安装包...");
    try {
      await applyAppShellUpdate((p) => {
        if (p.total && p.total > 0) {
          const pct = Math.min(100, Math.round((p.received / p.total) * 100));
          appProgressText.set(`正在下载安装包 ${pct}% (${formatBytes(p.received)} / ${formatBytes(p.total)})`);
        } else {
          appProgressText.set(`已接收 ${formatBytes(p.received)}`);
        }
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      appProgressText.set("");
      props.onToast(`客户端更新失败: ${msg}`, "error");
      applyingAppUpdate.set(false);
    }
  };

  const titleFor = (items: { value: string; title: string }[], value: string) =>
    items.find((i) => i.value === value)?.title ?? "请选择";

  return (
    <Scroll class="flex-1">
      <View class="gap-4 pb-6">
        <View class={compact() ? "gap-2.5" : "flex-row flex-wrap items-center justify-between gap-3"}>
          <View class="min-w-0 flex-1 gap-0.5">
            <Text class="text-sm font-semibold text-foreground">客户端与内核设置</Text>
            <Text class="text-xs text-muted-foreground">
              配置 sing-box 可执行文件、Mixed/TUN 入站、DNS、Clash API 与日志级别
            </Text>
          </View>
          <Button
            accessibilityLabel="恢复默认设置"
            onPress={props.onResetDefaults}
            class={`${CLS.btnBase} ${CLS.btnSm} ${CLS.btnOutline}`}
          >
            <Text class={`text-xs font-medium ${CLS.btnTextFg}`}>恢复默认设置</Text>
          </Button>
        </View>

        <View class={`${CLS.card} gap-3`}>
          <View class="flex-row flex-wrap items-center justify-between gap-3">
            <View class="min-w-0 flex-1 gap-1">
              <View class="flex-row flex-wrap items-center gap-2">
                <Text class="text-sm font-semibold text-foreground">sing-box 内核</Text>
                <View class={props.coreOrigin() === "hot-updated" ? CLS.badgeSuccess : CLS.badgePrimary}>
                  <Text class={`text-[11px] font-medium ${props.coreOrigin() === "hot-updated" ? "text-success" : "text-primary"}`}>
                    {ORIGIN_LABEL[props.coreOrigin()]}
                  </Text>
                </View>
              </View>
              <Text class="text-xs text-muted-foreground">
                当前版本：{props.coreVersion()} {props.coreResolvedPath() ? `· ${props.coreResolvedPath()}` : ""}
              </Text>
            </View>
            <View class="flex-row flex-wrap gap-2">
              <Button
                testID="probe-singbox-btn"
                accessibilityLabel="检测内核版本"
                disabled={!platform.desktop || probing() || updatingCore()}
                onPress={() => void handleProbe()}
                class={`${CLS.btnBase} ${CLS.btnSm} ${CLS.btnOutline}`}
              >
                <Text class={`text-xs font-medium ${CLS.btnTextFg}`}>
                  {probing() ? "探测中..." : "检测本地版本"}
                </Text>
              </Button>
              <Button
                testID="check-singbox-update-btn"
                accessibilityLabel="检查内核更新"
                disabled={!platform.desktop || checkingCoreUpdate() || updatingCore()}
                onPress={() => void handleCheckCoreUpdate()}
                class={`${CLS.btnBase} ${CLS.btnSm} ${CLS.btnPrimary}`}
              >
                <Text class={`text-xs font-medium ${CLS.btnTextPrimary}`}>
                  {checkingCoreUpdate() ? "检查中..." : "检查内核更新"}
                </Text>
              </Button>
            </View>
          </View>

          <If when={!platform.desktop}>
            <View class="rounded-[10px] border border-info/40 bg-info/10 px-3 py-2">
              <Text class="text-xs text-foreground">
                当前运行在移动端平台（{platform.os}）；本地节点、路由规则与 sing-box 配置均会持久化保存，实际启动隧道与内核替换需通过原生 libbox 扩展集成。
              </Text>
            </View>
          </If>

          <View class={rowStackClass()}>
            <View class="flex-1 gap-1.5">
              <View class="flex-row items-center justify-between gap-2">
                <Text class="text-xs font-medium text-foreground">可执行命令或路径（默认自动使用内置核心）</Text>
                <If when={props.settings().singBoxPath !== "sing-box"}>
                  <Button
                    accessibilityLabel="恢复自动路径"
                    onPress={() => update((draft) => { draft.singBoxPath = "sing-box"; })}
                    class={`${CLS.btnBase} h-6 rounded-[6px] px-2 ${CLS.btnGhost}`}
                  >
                    <Text class="text-[11px] font-medium text-primary">恢复自动</Text>
                  </Button>
                </If>
              </View>
              <Input
                testID="setting-singbox-path"
                accessibilityLabel="可执行命令或路径"
                value={props.settings().singBoxPath}
                onChange={({ value }) => update((draft) => { draft.singBoxPath = value; })}
                placeholder="sing-box"
                class={CLS.inputMono}
              />
            </View>

            <View class={compact() ? "gap-1.5" : "w-48 gap-1.5"}>
              <Text class="text-xs font-medium text-foreground">日志级别 (log.level)</Text>
              <Select
                accessibilityLabel="日志级别"
                items={LOG_LEVEL_OPTIONS}
                value={props.settings().logLevel}
                onChange={({ value }) => update((s) => { s.logLevel = (value ?? "info") as LogLevel; })}
                trigger={
                  <View class={CLS.selectTrigger}>
                    <Text class="text-xs text-foreground">
                      {titleFor(LOG_LEVEL_OPTIONS, props.settings().logLevel)}
                    </Text>
                    <Text class="text-[10px] text-muted-foreground">▾</Text>
                  </View>
                }
                popupClass={CLS.selectPopup}
                listClass={CLS.selectList}
                itemClass={CLS.selectItem}
                renderItem={(item) => <Text class={CLS.selectItemText}>{item.title}</Text>}
              />
            </View>
          </View>

          <If when={coreRelease()}>
            {(rel) => (
              <View class={`gap-2.5 rounded-(--radius) border px-3 py-2.5 ${rel().hasUpdate ? "border-primary/40 bg-primary/5" : "border-success/40 bg-success/10"}`}>
                <View class="flex-row flex-wrap items-center justify-between gap-2">
                  <View class="min-w-0 flex-1 gap-0.5">
                    <Text class="text-xs font-semibold text-foreground">
                      {rel().hasUpdate
                        ? `发现新版 sing-box v${rel().latestVersion}（当前 ${rel().currentVersion ? `v${rel().currentVersion}` : "未检测到"}）`
                        : `sing-box 已是最新 v${rel().latestVersion}`}
                    </Text>
                    <Text class="text-[11px] text-muted-foreground">
                      适配包：{rel().assetName} · {formatBytes(rel().sizeBytes)}
                    </Text>
                  </View>
                  <View class="flex-row flex-wrap gap-2">
                    <Button
                      accessibilityLabel="打开发布页"
                      onPress={() => void openExternalUrl(rel().releaseUrl)}
                      class={`${CLS.btnBase} ${CLS.btnSm} ${CLS.btnOutline}`}
                    >
                      <Text class={`text-xs font-medium ${CLS.btnTextFg}`}>发布说明</Text>
                    </Button>
                    <Button
                      testID="hot-update-singbox-btn"
                      accessibilityLabel="热更新 sing-box"
                      disabled={updatingCore()}
                      onPress={() => void handleHotUpdateCore()}
                      class={`${CLS.btnBase} ${CLS.btnSm} ${rel().hasUpdate ? CLS.btnPrimary : CLS.btnSecondary}`}
                    >
                      <Text class={`text-xs font-medium ${rel().hasUpdate ? CLS.btnTextPrimary : CLS.btnTextSecondary}`}>
                        {updatingCore()
                          ? "热更新中..."
                          : rel().hasUpdate
                            ? "下载并热更新"
                            : "重新安装此版本"}
                      </Text>
                    </Button>
                  </View>
                </View>

                <If when={props.coreRunning() && props.settings().mixed.enabled}>
                  <View class="flex-row items-center justify-between gap-3">
                    <Text class="flex-1 text-[11px] text-muted-foreground">
                      下载时通过当前 Mixed 代理 (127.0.0.1:{props.settings().mixed.listenPort}) 加速 GitHub 下载
                    </Text>
                    <Switch
                      accessibilityLabel="通过当前代理下载"
                      checked={preferProxyDownload()}
                      onChange={({ checked }) => preferProxyDownload.set(checked)}
                      class={CLS.switchRoot}
                      trackClass={CLS.switchTrack}
                      thumbClass={CLS.switchThumb}
                    />
                  </View>
                </If>

                <If when={coreUpdateStage()}>
                  {(stage) => (
                    <Text class="text-xs font-medium text-primary">{stage()}</Text>
                  )}
                </If>
              </View>
            )}
          </If>

          <If when={coreUpdateError()}>
            {(errText) => (
              <View class="gap-1 rounded-(--radius) border border-destructive/40 bg-destructive/10 px-3 py-2">
                <Text class="text-xs font-semibold text-destructive">内核更新异常</Text>
                <Text class="text-xs text-foreground">{errText()}</Text>
              </View>
            )}
          </If>

          <If when={probeOutput()}>
            {(out) => (
              <View
                class={`gap-1 rounded-(--radius) border px-3 py-2.5 ${out().ok ? "border-success/40 bg-success/10" : "border-destructive/40 bg-destructive/10"}`}
              >
                <Text class={`text-xs font-semibold ${out().ok ? "text-success" : "text-destructive"}`}>
                  {out().ok ? "内核探测成功" : "内核探测失败"}
                </Text>
                <Text class="text-xs text-foreground">{out().text}</Text>
              </View>
            )}
          </If>
        </View>

        <View class={`${CLS.card} gap-3`}>
          <View class="flex-row flex-wrap items-center justify-between gap-3">
            <View class="min-w-0 flex-1 gap-1">
              <View class="flex-row flex-wrap items-center gap-2">
                <Text class="text-sm font-semibold text-foreground">LeBox 程序版本与热更新</Text>
                <View class={appStatus().runningPackage ? CLS.badgeSuccess : CLS.badgeNeutral}>
                  <Text class={`text-[11px] font-medium ${appStatus().runningPackage ? "text-success" : "text-muted-foreground"}`}>
                    {appStatus().runningPackage ? "已启用代码热更新包" : "基础发行包"}
                  </Text>
                </View>
              </View>
              <Text class="text-xs text-muted-foreground">
                当前版本：v{appStatus().version} (build {appStatus().build}) · NSH Runtime {appStatus().nshVersion}
                {appStatus().development ? " · 开发调试模式" : ""}
              </Text>
            </View>
            <Button
              testID="check-app-update-btn"
              accessibilityLabel="检查程序更新"
              disabled={checkingAppUpdate() || applyingAppUpdate()}
              onPress={() => void handleCheckAppUpdate()}
              class={`${CLS.btnBase} ${CLS.btnSm} ${CLS.btnPrimary}`}
            >
              <Text class={`text-xs font-medium ${CLS.btnTextPrimary}`}>
                {checkingAppUpdate() ? "检查中..." : "检查程序更新"}
              </Text>
            </Button>
          </View>

          <View class="gap-1.5">
            <View class="flex-row items-center justify-between gap-2">
              <Text class="text-xs font-medium text-foreground">
                自托管更新清单 URL (可选，留空默认使用内置发布源)
              </Text>
              <If when={Boolean(props.settings().appManifestUrl?.trim())}>
                <Button
                  accessibilityLabel="清空更新清单覆写"
                  onPress={() => update((draft) => { draft.appManifestUrl = ""; })}
                  class={`${CLS.btnBase} h-6 rounded-[6px] px-2 ${CLS.btnGhost}`}
                >
                  <Text class="text-[11px] font-medium text-primary">恢复内置源</Text>
                </Button>
              </If>
            </View>
            <Input
              testID="setting-app-manifest-url"
              accessibilityLabel="自托管更新清单 URL"
              value={props.settings().appManifestUrl ?? ""}
              onChange={({ value }) => update((draft) => { draft.appManifestUrl = value; })}
              placeholder="https://github.com/<owner>/<repo>/releases/latest/download/latest.json"
              class={CLS.inputMono}
            />
          </View>

          <If when={appProgressText()}>
            {(txt) => (
              <Text class="text-xs font-medium text-primary">{txt()}</Text>
            )}
          </If>

          <If when={appUpdateResult()}>
            {(res) => (
              <View class="gap-2">
                <If when={res().packageUpdate}>
                  {(pkg) => (
                    <View class="flex-row flex-wrap items-center justify-between gap-2 rounded-(--radius) border border-success/40 bg-success/10 px-3 py-2.5">
                      <View class="min-w-0 flex-1 gap-0.5">
                        <Text class="text-xs font-semibold text-success">
                          发现签名代码热更新包 v{pkg().version} (build {pkg().build})
                        </Text>
                        <Text class="text-[11px] text-muted-foreground">
                          {pkg().notes || "无需重新安装整包，下载签名 .nshpkg 后即可热更新重启生效"}
                          {pkg().size ? ` · ${formatBytes(pkg().size!)}` : ""}
                        </Text>
                      </View>
                      <Button
                        accessibilityLabel="热更新并重启程序"
                        disabled={applyingAppUpdate()}
                        onPress={() => void handleApplyPackageUpdate()}
                        class={`${CLS.btnBase} ${CLS.btnSm} ${CLS.btnSuccess}`}
                      >
                        <Text class={`text-xs font-medium ${CLS.btnTextSuccess}`}>
                          {applyingAppUpdate() ? "更新中..." : "热更新并重启"}
                        </Text>
                      </Button>
                    </View>
                  )}
                </If>

                <If when={res().shellUpdate}>
                  {(shell) => (
                    <View class="flex-row flex-wrap items-center justify-between gap-2 rounded-(--radius) border border-primary/40 bg-primary/5 px-3 py-2.5">
                      <View class="min-w-0 flex-1 gap-0.5">
                        <Text class="text-xs font-semibold text-foreground">
                          发现客户端整包新版 v{shell().version}
                        </Text>
                        <Text class="text-[11px] text-muted-foreground">
                          {shell().notes || "包含原生外壳或运行时更新"}
                        </Text>
                      </View>
                      <If
                        when={shell().canInstall}
                        else={
                          <Button
                            accessibilityLabel="前往下载页面"
                            onPress={() => void openExternalUrl(shell().url)}
                            class={`${CLS.btnBase} ${CLS.btnSm} ${CLS.btnOutline}`}
                          >
                            <Text class={`text-xs font-medium ${CLS.btnTextFg}`}>打开下载页</Text>
                          </Button>
                        }
                      >
                        <Button
                          accessibilityLabel="下载并安装整包更新"
                          disabled={applyingAppUpdate()}
                          onPress={() => void handleApplyShellUpdate()}
                          class={`${CLS.btnBase} ${CLS.btnSm} ${CLS.btnPrimary}`}
                        >
                          <Text class={`text-xs font-medium ${CLS.btnTextPrimary}`}>
                            {applyingAppUpdate() ? "下载中..." : "安装更新并重启"}
                          </Text>
                        </Button>
                      </If>
                    </View>
                  )}
                </If>

                <If when={res().fallbackUpdate}>
                  {(fb) => (
                    <View class="flex-row flex-wrap items-center justify-between gap-2 rounded-(--radius) border border-info/40 bg-info/10 px-3 py-2.5">
                      <View class="min-w-0 flex-1 gap-0.5">
                        <Text class="text-xs font-semibold text-foreground">
                          发现清单新版 v{fb().version}{fb().build ? ` (build ${fb().build})` : ""}
                        </Text>
                        <Text class="text-[11px] text-muted-foreground">
                          {fb().notes || fb().url || "点击打开链接获取新版发布包"}
                        </Text>
                      </View>
                      <If when={fb().url}>
                        {(u) => (
                          <Button
                            accessibilityLabel="打开更新链接"
                            onPress={() => void openExternalUrl(u())}
                            class={`${CLS.btnBase} ${CLS.btnSm} ${CLS.btnOutline}`}
                          >
                            <Text class={`text-xs font-medium ${CLS.btnTextFg}`}>打开下载</Text>
                          </Button>
                        )}
                      </If>
                    </View>
                  )}
                </If>

                <If when={!res().packageUpdate && !res().shellUpdate && !res().fallbackUpdate && res().errors.length === 0 && appCheckedOnce()}>
                  <View class="rounded-(--radius) border border-success/40 bg-success/10 px-3 py-2">
                    <Text class="text-xs text-success">
                      {appStatus().development
                        ? "当前运行在开发模式或未在 nsh.json 配置 updater 签名源，未发现可安装的远端更新。"
                        : "当前程序已是最新版本，无需更新。"}
                    </Text>
                  </View>
                </If>

                <If when={res().errors.length > 0}>
                  <View class="gap-1 rounded-(--radius) border border-warning/40 bg-warning/10 px-3 py-2">
                    <Text class="text-xs font-semibold text-warning">检查更新提示</Text>
                    <Text class="text-xs text-foreground">{res().errors.join("\n")}</Text>
                  </View>
                </If>
              </View>
            )}
          </If>
        </View>

        <View class={`${CLS.card} gap-3`}>
          <Text class="text-sm font-semibold text-foreground">Mixed 入站 (SOCKS4/4a/5 + HTTP)</Text>
          <If when={!props.settings().mixed.enabled && !props.settings().tun.enabled}>
            <View class="flex-row flex-wrap items-center justify-between gap-2 rounded-(--radius) border border-warning/40 bg-warning/10 px-3 py-2.5">
              <Text class="flex-1 text-xs text-foreground">
                当前未启用任何本地代理入站，开启后本机流量才能进入 sing-box。
              </Text>
              <Button
                accessibilityLabel="立即启用 Mixed 入站"
                onPress={() => update((draft) => { draft.mixed.enabled = true; })}
                class={`${CLS.btnBase} ${CLS.btnSm} ${CLS.btnPrimary}`}
              >
                <Text class={`text-xs font-medium ${CLS.btnTextPrimary}`}>启用 Mixed</Text>
              </Button>
            </View>
          </If>
          <View class="flex-row items-center justify-between gap-3">
            <Text class="flex-1 text-xs font-medium text-foreground">启用 Mixed 本地代理入站</Text>
            <Switch
              accessibilityLabel="启用 Mixed 本地代理入站"
              checked={props.settings().mixed.enabled}
              onChange={({ checked }) => update((draft) => { draft.mixed.enabled = checked; })}
              class={CLS.switchRoot}
              trackClass={CLS.switchTrack}
              thumbClass={CLS.switchThumb}
            />
          </View>

          <View class={rowStackClass()}>
            <View class="flex-1 gap-1.5">
              <Text class="text-xs font-medium text-foreground">监听地址 (listen)</Text>
              <Select
                accessibilityLabel="监听地址"
                items={withCustomOption(LISTEN_ADDRESS_OPTIONS)}
                value={
                  customMixedListen() || !matchesPreset(LISTEN_ADDRESS_OPTIONS, props.settings().mixed.listen)
                    ? CUSTOM_SENTINEL
                    : props.settings().mixed.listen
                }
                onChange={({ value }) => {
                  if (value === CUSTOM_SENTINEL) {
                    customMixedListen.set(true);
                  } else {
                    customMixedListen.set(false);
                    update((draft) => {
                      draft.mixed.listen = value ?? "127.0.0.1";
                    });
                  }
                }}
                trigger={
                  <View class={CLS.selectTrigger}>
                    <Text class="text-xs text-foreground">
                      {customMixedListen() || !matchesPreset(LISTEN_ADDRESS_OPTIONS, props.settings().mixed.listen)
                        ? `自定义 (${props.settings().mixed.listen})`
                        : titleFor(LISTEN_ADDRESS_OPTIONS, props.settings().mixed.listen)}
                    </Text>
                    <Text class="text-[10px] text-muted-foreground">▾</Text>
                  </View>
                }
                popupClass={CLS.selectPopup}
                listClass={CLS.selectList}
                itemClass={CLS.selectItem}
                renderItem={(item) => <Text class={CLS.selectItemText}>{item.title}</Text>}
              />
              <If when={customMixedListen() || !matchesPreset(LISTEN_ADDRESS_OPTIONS, props.settings().mixed.listen)}>
                <Input
                  testID="setting-mixed-listen"
                  accessibilityLabel="自定义 Mixed 监听地址"
                  value={props.settings().mixed.listen}
                  onChange={({ value }) => update((draft) => { draft.mixed.listen = value; })}
                  placeholder="127.0.0.1"
                  class={CLS.inputMono}
                />
              </If>
            </View>
            <View class={compact() ? "gap-1.5" : "w-64 gap-1.5"}>
              <Text class="text-xs font-medium text-foreground">监听端口 (listen_port)</Text>
              <View class="flex-row flex-wrap gap-1.5">
                <Each of={COMMON_MIXED_PORTS} key={(portVal) => portVal}>
                  {(portVal) => (
                    <Button
                      accessibilityLabel={`Mixed 端口 ${portVal()}`}
                      onPress={() => update((draft) => { draft.mixed.listenPort = portVal(); })}
                      class={`${CLS.btnBase} h-7 rounded-[7px] px-2 ${
                        props.settings().mixed.listenPort === portVal() ? CLS.btnPrimary : CLS.btnOutline
                      }`}
                    >
                      <Text
                        class={`font-mono text-[11px] font-medium ${
                          props.settings().mixed.listenPort === portVal() ? CLS.btnTextPrimary : CLS.btnTextFg
                        }`}
                      >
                        {String(portVal())}
                      </Text>
                    </Button>
                  )}
                </Each>
              </View>
              <Input
                testID="setting-mixed-port"
                accessibilityLabel="监听端口"
                value={String(props.settings().mixed.listenPort)}
                onChange={({ value }) => {
                  const parsed = Number.parseInt(value.replace(/[^\d]/g, ""), 10);
                  const safePort =
                    Number.isFinite(parsed) && parsed >= 1 && parsed <= 65535
                      ? parsed
                      : parsed > 65535
                        ? 65535
                        : 20808;
                  update((draft) => { draft.mixed.listenPort = safePort; });
                }}
                class={CLS.inputMono}
              />
            </View>
          </View>

          <View class="flex-row items-center justify-between gap-3">
            <View class="flex-1 gap-0.5">
              <Text class="text-xs font-medium text-foreground">自动设置系统代理 (set_system_proxy)</Text>
              <Text class="text-[11px] text-muted-foreground">启动时自动配置系统 HTTP/SOCKS 代理，停止时清理</Text>
            </View>
            <Switch
              testID="setting-system-proxy"
              accessibilityLabel="自动设置系统代理"
              checked={props.settings().mixed.setSystemProxy}
              onChange={({ checked }) => update((s) => { s.mixed.setSystemProxy = checked; })}
              class={CLS.switchRoot}
              trackClass={CLS.switchTrack}
              thumbClass={CLS.switchThumb}
            />
          </View>

          <View class="flex-row items-center justify-between gap-3">
            <Text class="flex-1 text-xs font-medium text-foreground">启用本地入站认证</Text>
            <Switch
              accessibilityLabel="启用本地入站认证"
              checked={props.settings().mixed.authEnabled}
              onChange={({ checked }) => update((s) => { s.mixed.authEnabled = checked; })}
              class={CLS.switchRoot}
              trackClass={CLS.switchTrack}
              thumbClass={CLS.switchThumb}
            />
          </View>

          <If when={props.settings().mixed.authEnabled}>
            <View class={rowStackClass()}>
              <View class="flex-1 gap-1.5">
                <Text class="text-xs font-medium text-foreground">入站用户名</Text>
                <Input
                  accessibilityLabel="入站用户名"
                  value={props.settings().mixed.username}
                  onChange={({ value }) => update((s) => { s.mixed.username = value; })}
                  class={CLS.inputMono}
                />
              </View>
              <View class="flex-1 gap-1.5">
                <Text class="text-xs font-medium text-foreground">入站密码</Text>
                <Input
                  accessibilityLabel="入站密码"
                  masked
                  value={props.settings().mixed.password}
                  onChange={({ value }) => update((s) => { s.mixed.password = value; })}
                  class={CLS.input}
                />
              </View>
            </View>
          </If>
        </View>

        <View class={`${CLS.card} gap-3`}>
          <View class="gap-0.5">
            <Text class="text-sm font-semibold text-foreground">TUN 虚拟网卡入站</Text>
            <Text class="text-xs text-muted-foreground">
              Windows / macOS / Linux 下启用系统级接管通常需要管理员权限
            </Text>
          </View>
          <View class="flex-row items-center justify-between gap-3">
            <Text class="flex-1 text-xs font-medium text-foreground">启用 TUN 入站</Text>
            <Switch
              testID="setting-tun-enabled"
              accessibilityLabel="启用 TUN 入站"
              checked={props.settings().tun.enabled}
              onChange={({ checked }) => update((s) => { s.tun.enabled = checked; })}
              class={CLS.switchRoot}
              trackClass={CLS.switchTrack}
              thumbClass={CLS.switchThumb}
            />
          </View>
          <If when={props.settings().tun.enabled}>
            <View class="gap-3">
              <View class={rowStackClass()}>
                <View class="flex-1 gap-1.5">
                  <View class="flex-row items-center justify-between gap-2">
                    <Text class="text-xs font-medium text-foreground">网卡名称 (interface_name)</Text>
                    <If when={props.settings().tun.interfaceName !== "LeBoxTun"}>
                      <Button
                        accessibilityLabel="恢复默认网卡名称"
                        onPress={() => update((draft) => { draft.tun.interfaceName = "LeBoxTun"; })}
                        class={`${CLS.btnBase} h-6 rounded-[6px] px-2 ${CLS.btnGhost}`}
                      >
                        <Text class="text-[11px] font-medium text-primary">默认 LeBoxTun</Text>
                      </Button>
                    </If>
                  </View>
                  <Input
                    accessibilityLabel="网卡名称"
                    value={props.settings().tun.interfaceName}
                    onChange={({ value }) => update((draft) => { draft.tun.interfaceName = value; })}
                    placeholder="LeBoxTun"
                    class={CLS.inputMono}
                  />
                </View>
                <View class={compact() ? "gap-1.5" : "w-48 gap-1.5"}>
                  <Text class="text-xs font-medium text-foreground">协议栈 (stack)</Text>
                  <Select
                    accessibilityLabel="协议栈"
                    items={TUN_STACKS}
                    value={props.settings().tun.stack}
                    onChange={({ value }) =>
                      update((draft) => {
                        draft.tun.stack = (value ?? "mixed") as AppSettings["tun"]["stack"];
                      })
                    }
                    trigger={
                      <View class={CLS.selectTrigger}>
                        <Text class="text-xs text-foreground">
                          {titleFor(TUN_STACKS, props.settings().tun.stack)}
                        </Text>
                        <Text class="text-[10px] text-muted-foreground">▾</Text>
                      </View>
                    }
                    popupClass={CLS.selectPopup}
                    listClass={CLS.selectList}
                    itemClass={CLS.selectItem}
                    renderItem={(item) => <Text class={CLS.selectItemText}>{item.title}</Text>}
                  />
                </View>
                <View class={compact() ? "gap-1.5" : "w-48 gap-1.5"}>
                  <Text class="text-xs font-medium text-foreground">MTU</Text>
                  <Select
                    accessibilityLabel="MTU"
                    items={withCustomOption(TUN_MTU_OPTIONS)}
                    value={
                      customTunMtu() || !matchesPreset(TUN_MTU_OPTIONS, String(props.settings().tun.mtu))
                        ? CUSTOM_SENTINEL
                        : String(props.settings().tun.mtu)
                    }
                    onChange={({ value }) => {
                      if (value === CUSTOM_SENTINEL) {
                        customTunMtu.set(true);
                      } else {
                        customTunMtu.set(false);
                        const parsed = Number.parseInt(value ?? "9000", 10);
                        update((draft) => { draft.tun.mtu = Number.isFinite(parsed) ? parsed : 9000; });
                      }
                    }}
                    trigger={
                      <View class={CLS.selectTrigger}>
                        <Text class="text-xs text-foreground">
                          {customTunMtu() || !matchesPreset(TUN_MTU_OPTIONS, String(props.settings().tun.mtu))
                            ? `自定义 (${props.settings().tun.mtu})`
                            : titleFor(TUN_MTU_OPTIONS, String(props.settings().tun.mtu))}
                        </Text>
                        <Text class="text-[10px] text-muted-foreground">▾</Text>
                      </View>
                    }
                    popupClass={CLS.selectPopup}
                    listClass={CLS.selectList}
                    itemClass={CLS.selectItem}
                    renderItem={(item) => <Text class={CLS.selectItemText}>{item.title}</Text>}
                  />
                  <If when={customTunMtu() || !matchesPreset(TUN_MTU_OPTIONS, String(props.settings().tun.mtu))}>
                    <Input
                      accessibilityLabel="自定义 MTU"
                      value={String(props.settings().tun.mtu)}
                      onChange={({ value }) => {
                        const parsed = Number.parseInt(value.replace(/[^\d]/g, ""), 10);
                        update((draft) => {
                          draft.tun.mtu = Number.isFinite(parsed) && parsed >= 576 ? Math.min(parsed, 65535) : 9000;
                        });
                      }}
                      class={CLS.inputMono}
                    />
                  </If>
                </View>
              </View>
              <View class={rowStackClass()}>
                <View class="flex-1 gap-1.5">
                  <Text class="text-xs font-medium text-foreground">IPv4 网段 (address)</Text>
                  <Select
                    accessibilityLabel="IPv4 网段"
                    items={withCustomOption(TUN_IPV4_OPTIONS)}
                    value={
                      customTunIpv4() || !matchesPreset(TUN_IPV4_OPTIONS, props.settings().tun.address4)
                        ? CUSTOM_SENTINEL
                        : props.settings().tun.address4
                    }
                    onChange={({ value }) => {
                      if (value === CUSTOM_SENTINEL) {
                        customTunIpv4.set(true);
                      } else {
                        customTunIpv4.set(false);
                        update((draft) => { draft.tun.address4 = value ?? "172.19.0.1/30"; });
                      }
                    }}
                    trigger={
                      <View class={CLS.selectTrigger}>
                        <Text class="text-xs text-foreground">
                          {customTunIpv4() || !matchesPreset(TUN_IPV4_OPTIONS, props.settings().tun.address4)
                            ? `自定义 (${props.settings().tun.address4})`
                            : titleFor(TUN_IPV4_OPTIONS, props.settings().tun.address4)}
                        </Text>
                        <Text class="text-[10px] text-muted-foreground">▾</Text>
                      </View>
                    }
                    popupClass={CLS.selectPopup}
                    listClass={CLS.selectList}
                    itemClass={CLS.selectItem}
                    renderItem={(item) => <Text class={CLS.selectItemText}>{item.title}</Text>}
                  />
                  <If when={customTunIpv4() || !matchesPreset(TUN_IPV4_OPTIONS, props.settings().tun.address4)}>
                    <Input
                      accessibilityLabel="自定义 IPv4 网段"
                      value={props.settings().tun.address4}
                      onChange={({ value }) => update((draft) => { draft.tun.address4 = value; })}
                      placeholder="172.19.0.1/30"
                      class={CLS.inputMono}
                    />
                  </If>
                </View>
                <View class="flex-1 gap-1.5">
                  <Text class="text-xs font-medium text-foreground">IPv6 网段 (address)</Text>
                  <Select
                    accessibilityLabel="IPv6 网段"
                    items={withCustomOption(TUN_IPV6_OPTIONS)}
                    value={
                      customTunIpv6() || !matchesPreset(TUN_IPV6_OPTIONS, props.settings().tun.address6)
                        ? CUSTOM_SENTINEL
                        : props.settings().tun.address6
                    }
                    onChange={({ value }) => {
                      if (value === CUSTOM_SENTINEL) {
                        customTunIpv6.set(true);
                      } else {
                        customTunIpv6.set(false);
                        update((draft) => { draft.tun.address6 = value ?? ""; });
                      }
                    }}
                    trigger={
                      <View class={CLS.selectTrigger}>
                        <Text class="text-xs text-foreground">
                          {customTunIpv6() || !matchesPreset(TUN_IPV6_OPTIONS, props.settings().tun.address6)
                            ? `自定义 (${props.settings().tun.address6})`
                            : titleFor(TUN_IPV6_OPTIONS, props.settings().tun.address6)}
                        </Text>
                        <Text class="text-[10px] text-muted-foreground">▾</Text>
                      </View>
                    }
                    popupClass={CLS.selectPopup}
                    listClass={CLS.selectList}
                    itemClass={CLS.selectItem}
                    renderItem={(item) => <Text class={CLS.selectItemText}>{item.title}</Text>}
                  />
                  <If when={customTunIpv6() || !matchesPreset(TUN_IPV6_OPTIONS, props.settings().tun.address6)}>
                    <Input
                      accessibilityLabel="自定义 IPv6 网段"
                      value={props.settings().tun.address6}
                      onChange={({ value }) => update((draft) => { draft.tun.address6 = value; })}
                      placeholder="fdfe:dcba:9876::1/126"
                      class={CLS.inputMono}
                    />
                  </If>
                </View>
              </View>
              <View class="flex-row items-center justify-between gap-3">
                <Text class="flex-1 text-xs font-medium text-foreground">auto_route（自动配置系统路由）</Text>
                <Switch
                  accessibilityLabel="auto_route"
                  checked={props.settings().tun.autoRoute}
                  onChange={({ checked }) => update((s) => { s.tun.autoRoute = checked; })}
                  class={CLS.switchRoot}
                  trackClass={CLS.switchTrack}
                  thumbClass={CLS.switchThumb}
                />
              </View>
              <View class="flex-row items-center justify-between gap-3">
                <Text class="flex-1 text-xs font-medium text-foreground">strict_route（严格防泄露路由）</Text>
                <Switch
                  accessibilityLabel="strict_route"
                  checked={props.settings().tun.strictRoute}
                  onChange={({ checked }) => update((s) => { s.tun.strictRoute = checked; })}
                  class={CLS.switchRoot}
                  trackClass={CLS.switchTrack}
                  thumbClass={CLS.switchThumb}
                />
              </View>
            </View>
          </If>
        </View>

        <View class={`${CLS.card} gap-3`}>
          <Text class="text-sm font-semibold text-foreground">DNS 与分流策略</Text>
          <View class={rowStackClass()}>
            <View class={compact() ? "gap-1.5" : "w-44 gap-1.5"}>
              <Text class="text-xs font-medium text-foreground">远程 DNS 类型</Text>
              <Select
                accessibilityLabel="远程 DNS 类型"
                items={DNS_REMOTE_TYPES}
                value={props.settings().dns.remoteType}
                onChange={({ value }) =>
                  update((draft) => {
                    const nextType = (value ?? "https") as AppSettings["dns"]["remoteType"];
                    draft.dns.remoteType = nextType;
                    if (nextType !== "https") {
                      const validPlain = REMOTE_DNS_PLAIN_OPTIONS.some(
                        (opt) => opt.value === draft.dns.remoteServer,
                      );
                      if (!validPlain) {
                        draft.dns.remoteServer = "1.1.1.1";
                        customRemoteDns.set(false);
                      }
                    }
                  })
                }
                trigger={
                  <View class={CLS.selectTrigger}>
                    <Text class="text-xs text-foreground">
                      {titleFor(DNS_REMOTE_TYPES, props.settings().dns.remoteType)}
                    </Text>
                    <Text class="text-[10px] text-muted-foreground">▾</Text>
                  </View>
                }
                popupClass={CLS.selectPopup}
                listClass={CLS.selectList}
                itemClass={CLS.selectItem}
                renderItem={(item) => <Text class={CLS.selectItemText}>{item.title}</Text>}
              />
            </View>
            <View class="flex-1 gap-1.5">
              <Text class="text-xs font-medium text-foreground">远程 DNS 地址</Text>
              <Select
                accessibilityLabel="远程 DNS 地址"
                items={withCustomOption(remoteDnsOptions())}
                value={
                  customRemoteDns() || !matchesPreset(remoteDnsOptions(), props.settings().dns.remoteServer)
                    ? CUSTOM_SENTINEL
                    : props.settings().dns.remoteServer
                }
                onChange={({ value }) => {
                  if (value === CUSTOM_SENTINEL) {
                    customRemoteDns.set(true);
                  } else {
                    customRemoteDns.set(false);
                    update((draft) => { draft.dns.remoteServer = value ?? "1.1.1.1"; });
                  }
                }}
                trigger={
                  <View class={CLS.selectTrigger}>
                    <Text class="text-xs text-foreground">
                      {customRemoteDns() || !matchesPreset(remoteDnsOptions(), props.settings().dns.remoteServer)
                        ? `自定义 (${props.settings().dns.remoteServer || "未填"})`
                        : titleFor(remoteDnsOptions(), props.settings().dns.remoteServer)}
                    </Text>
                    <Text class="text-[10px] text-muted-foreground">▾</Text>
                  </View>
                }
                popupClass={CLS.selectPopup}
                listClass={CLS.selectList}
                itemClass={CLS.selectItem}
                renderItem={(item) => <Text class={CLS.selectItemText}>{item.title}</Text>}
              />
              <If when={customRemoteDns() || !matchesPreset(remoteDnsOptions(), props.settings().dns.remoteServer)}>
                <Input
                  accessibilityLabel="自定义远程 DNS 地址"
                  value={props.settings().dns.remoteServer}
                  onChange={({ value }) => update((draft) => { draft.dns.remoteServer = value; })}
                  placeholder="1.1.1.1 或 dns.google"
                  class={CLS.inputMono}
                />
              </If>
            </View>
            <View class={compact() ? "gap-1.5" : "w-44 gap-1.5"}>
              <Text class="text-xs font-medium text-foreground">解析策略</Text>
              <Select
                accessibilityLabel="解析策略"
                items={DNS_STRATEGIES}
                value={props.settings().dns.strategy}
                onChange={({ value }) => update((s) => { s.dns.strategy = (value ?? "") as DomainStrategy; })}
                trigger={
                  <View class={CLS.selectTrigger}>
                    <Text class="text-xs text-foreground">
                      {titleFor(DNS_STRATEGIES, props.settings().dns.strategy)}
                    </Text>
                    <Text class="text-[10px] text-muted-foreground">▾</Text>
                  </View>
                }
                popupClass={CLS.selectPopup}
                listClass={CLS.selectList}
                itemClass={CLS.selectItem}
                renderItem={(item) => <Text class={CLS.selectItemText}>{item.title}</Text>}
              />
            </View>
          </View>
          <View class={rowStackClass()}>
            <View class={compact() ? "gap-1.5" : "w-56 gap-1.5"}>
              <Text class="text-xs font-medium text-foreground">本地解析器 (domain_resolver)</Text>
              <Select
                accessibilityLabel="本地解析器"
                items={DNS_LOCAL_TYPES}
                value={props.settings().dns.localType}
                onChange={({ value }) =>
                  update((draft) => {
                    const nextLocal = (value ?? "local") as AppSettings["dns"]["localType"];
                    draft.dns.localType = nextLocal;
                    if (
                      nextLocal === "udp" &&
                      (!draft.dns.localServer.trim() ||
                        draft.dns.localServer.trim().toLowerCase() === "local")
                    ) {
                      draft.dns.localServer = "223.5.5.5";
                      customLocalDns.set(false);
                    }
                  })
                }
                trigger={
                  <View class={CLS.selectTrigger}>
                    <Text class="text-xs text-foreground">
                      {titleFor(DNS_LOCAL_TYPES, props.settings().dns.localType)}
                    </Text>
                    <Text class="text-[10px] text-muted-foreground">▾</Text>
                  </View>
                }
                popupClass={CLS.selectPopup}
                listClass={CLS.selectList}
                itemClass={CLS.selectItem}
                renderItem={(item) => <Text class={CLS.selectItemText}>{item.title}</Text>}
              />
            </View>
            <If when={props.settings().dns.localType === "udp"}>
              <View class="flex-1 gap-1.5">
                <Text class="text-xs font-medium text-foreground">本地 UDP DNS 地址</Text>
                <Select
                  accessibilityLabel="本地 UDP DNS 地址"
                  items={withCustomOption(LOCAL_UDP_DNS_OPTIONS)}
                  value={
                    customLocalDns() || !matchesPreset(LOCAL_UDP_DNS_OPTIONS, props.settings().dns.localServer)
                      ? CUSTOM_SENTINEL
                      : props.settings().dns.localServer
                  }
                  onChange={({ value }) => {
                    if (value === CUSTOM_SENTINEL) {
                      customLocalDns.set(true);
                    } else {
                      customLocalDns.set(false);
                      update((draft) => { draft.dns.localServer = value ?? "223.5.5.5"; });
                    }
                  }}
                  trigger={
                    <View testID="setting-local-udp-dns" class={CLS.selectTrigger}>
                      <Text class="text-xs text-foreground">
                        {customLocalDns() || !matchesPreset(LOCAL_UDP_DNS_OPTIONS, props.settings().dns.localServer)
                          ? `自定义 (${props.settings().dns.localServer || "223.5.5.5"})`
                          : titleFor(LOCAL_UDP_DNS_OPTIONS, props.settings().dns.localServer)}
                      </Text>
                      <Text class="text-[10px] text-muted-foreground">▾</Text>
                    </View>
                  }
                  popupClass={CLS.selectPopup}
                  listClass={CLS.selectList}
                  itemClass={CLS.selectItem}
                  renderItem={(item) => <Text class={CLS.selectItemText}>{item.title}</Text>}
                />
                <If when={customLocalDns() || !matchesPreset(LOCAL_UDP_DNS_OPTIONS, props.settings().dns.localServer)}>
                  <Input
                    accessibilityLabel="自定义本地 UDP DNS 地址"
                    value={props.settings().dns.localServer}
                    onChange={({ value }) => update((draft) => { draft.dns.localServer = value; })}
                    placeholder="223.5.5.5"
                    class={CLS.inputMono}
                  />
                </If>
              </View>
            </If>
          </View>
          <View class="flex-row flex-wrap items-center justify-between gap-3 rounded-(--radius) border border-border bg-muted/40 px-3 py-2.5">
            <Text class="flex-1 text-xs text-muted-foreground">
              分流规则与官方 rule_set 规则集（替代旧版 geoip/geosite）已独立至「路由规则」页面管理
            </Text>
            <Button
              accessibilityLabel="前往路由规则"
              onPress={props.onGoRouting}
              class={`${CLS.btnBase} ${CLS.btnSm} ${CLS.btnOutline}`}
            >
              <Text class={`text-xs font-medium ${CLS.btnTextFg}`}>前往路由规则</Text>
            </Button>
          </View>
        </View>

        <View class={`${CLS.card} gap-3`}>
          <Text class="text-sm font-semibold text-foreground">Clash API 控制接口</Text>
          <View class="flex-row items-center justify-between gap-3">
            <Text class="flex-1 text-xs font-medium text-foreground">启用 Clash API（用于测速、流量与连接监控）</Text>
            <Switch
              accessibilityLabel="启用 Clash API"
              checked={props.settings().clashApi.enabled}
              onChange={({ checked }) => update((s) => { s.clashApi.enabled = checked; })}
              class={CLS.switchRoot}
              trackClass={CLS.switchTrack}
              thumbClass={CLS.switchThumb}
            />
          </View>
          <If when={props.settings().clashApi.enabled}>
            <View class={rowStackClass()}>
              <View class="flex-1 gap-1.5">
                <Text class="text-xs font-medium text-foreground">监听地址</Text>
                <Select
                  accessibilityLabel="Clash API 监听地址"
                  items={withCustomOption(LISTEN_ADDRESS_OPTIONS)}
                  value={
                    customClashListen() || !matchesPreset(LISTEN_ADDRESS_OPTIONS, props.settings().clashApi.listen)
                      ? CUSTOM_SENTINEL
                      : props.settings().clashApi.listen
                  }
                  onChange={({ value }) => {
                    if (value === CUSTOM_SENTINEL) {
                      customClashListen.set(true);
                    } else {
                      customClashListen.set(false);
                      update((draft) => { draft.clashApi.listen = value ?? "127.0.0.1"; });
                    }
                  }}
                  trigger={
                    <View class={CLS.selectTrigger}>
                      <Text class="text-xs text-foreground">
                        {customClashListen() || !matchesPreset(LISTEN_ADDRESS_OPTIONS, props.settings().clashApi.listen)
                          ? `自定义 (${props.settings().clashApi.listen})`
                          : titleFor(LISTEN_ADDRESS_OPTIONS, props.settings().clashApi.listen)}
                      </Text>
                      <Text class="text-[10px] text-muted-foreground">▾</Text>
                    </View>
                  }
                  popupClass={CLS.selectPopup}
                  listClass={CLS.selectList}
                  itemClass={CLS.selectItem}
                  renderItem={(item) => <Text class={CLS.selectItemText}>{item.title}</Text>}
                />
                <If when={customClashListen() || !matchesPreset(LISTEN_ADDRESS_OPTIONS, props.settings().clashApi.listen)}>
                  <Input
                    accessibilityLabel="自定义 Clash API 监听地址"
                    value={props.settings().clashApi.listen}
                    onChange={({ value }) => update((draft) => { draft.clashApi.listen = value; })}
                    placeholder="127.0.0.1"
                    class={CLS.inputMono}
                  />
                </If>
              </View>
              <View class={compact() ? "gap-1.5" : "w-52 gap-1.5"}>
                <Text class="text-xs font-medium text-foreground">端口</Text>
                <View class="flex-row flex-wrap gap-1.5">
                  <Each of={COMMON_CLASH_PORTS} key={(portVal) => portVal}>
                    {(portVal) => (
                      <Button
                        accessibilityLabel={`Clash API 端口 ${portVal()}`}
                        onPress={() => update((draft) => { draft.clashApi.port = portVal(); })}
                        class={`${CLS.btnBase} h-7 rounded-[7px] px-2 ${
                          props.settings().clashApi.port === portVal() ? CLS.btnPrimary : CLS.btnOutline
                        }`}
                      >
                        <Text
                          class={`font-mono text-[11px] font-medium ${
                            props.settings().clashApi.port === portVal() ? CLS.btnTextPrimary : CLS.btnTextFg
                          }`}
                        >
                          {String(portVal())}
                        </Text>
                      </Button>
                    )}
                  </Each>
                </View>
                <Input
                  accessibilityLabel="Clash API 端口"
                  value={String(props.settings().clashApi.port)}
                  onChange={({ value }) => {
                    const parsed = Number.parseInt(value.replace(/[^\d]/g, ""), 10);
                    const safePort =
                      Number.isFinite(parsed) && parsed >= 1 && parsed <= 65535
                        ? parsed
                        : parsed > 65535
                          ? 65535
                          : 19090;
                    update((draft) => { draft.clashApi.port = safePort; });
                  }}
                  class={CLS.inputMono}
                />
              </View>
              <View class="flex-1 gap-1.5">
                <View class="flex-row items-center justify-between gap-2">
                  <Text class="text-xs font-medium text-foreground">Secret (可选)</Text>
                  <Button
                    accessibilityLabel="随机生成 Secret"
                    onPress={() => update((draft) => { draft.clashApi.secret = generateRandomSecret(); })}
                    class={`${CLS.btnBase} h-6 rounded-[6px] px-2 ${CLS.btnGhost}`}
                  >
                    <Text class="text-[11px] font-medium text-primary">随机生成</Text>
                  </Button>
                </View>
                <Input
                  accessibilityLabel="Clash API Secret"
                  masked
                  value={props.settings().clashApi.secret}
                  onChange={({ value }) => update((draft) => { draft.clashApi.secret = value; })}
                  class={CLS.input}
                />
              </View>
            </View>
          </If>
        </View>
      </View>
    </Scroll>
  );
}
