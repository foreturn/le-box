import { List, Scroll, signal, Text, View } from "nsh";
import {
  Button,
  Dialog,
  Input,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
} from "nsh/base";
import { getSafeInsets, isCompactLayout, isNarrowPhone } from "../core/layout";
import { getProtocolMeta, validateNodeProfile } from "../core/nodeProtocols";
import {
  filterAndSortQuickSwitchNodes,
  selectQuickPillNodes,
  type QuickSwitchSort,
  type QuickSwitchTransportFilter,
} from "../core/nodeSwitching";
import { formatBytes } from "../services/runtime";
import { CLS } from "../styles";
import type {
  AppSettings,
  ClashConnectionItem,
  CoreRunState,
  NodeProfile,
  RoutingMode,
  TrafficStats,
} from "../types/singbox";

const ROUTING_MODES: { value: RoutingMode; label: string; shortLabel: string; testID: string }[] = [
  { value: "rule", label: "规则分流 (Rule)", shortLabel: "规则分流", testID: "mode-rule" },
  { value: "global", label: "全局代理 (Global)", shortLabel: "全局代理", testID: "mode-global" },
  { value: "direct", label: "直连模式 (Direct)", shortLabel: "直连模式", testID: "mode-direct" },
];

const STATE_LABEL: Record<
  CoreRunState,
  { label: string; boxCls: string; textCls: string }
> = {
  stopped: { label: "未运行", boxCls: CLS.badgeNeutral, textCls: "text-muted-foreground" },
  checking: { label: "校验配置中...", boxCls: CLS.badgeInfo, textCls: "text-info" },
  starting: { label: "正在启动...", boxCls: CLS.badgeInfo, textCls: "text-info" },
  running: { label: "运行中", boxCls: CLS.badgeSuccess, textCls: "text-success" },
  stopping: { label: "停止中...", boxCls: CLS.badgeWarning, textCls: "text-warning" },
  error: { label: "启动异常", boxCls: CLS.badgeDanger, textCls: "text-destructive" },
};

function KvRow(props: { label: string; value: string; mono?: boolean }) {
  return (
    <View class="flex-row items-center justify-between gap-3 py-1.5">
      <Text class="text-xs text-muted-foreground">{props.label}</Text>
      <Text class={`text-right text-xs font-medium text-foreground ${props.mono ? "font-mono" : ""}`}>
        {props.value}
      </Text>
    </View>
  );
}

function MetricTile(props: { label: string; value: string }) {
  return (
    <View class="flex-1 rounded-[12px] border border-border/70 bg-muted/40 px-3 py-2.5">
      <Text class="text-[11px] text-muted-foreground">{props.label}</Text>
      <Text class="mt-0.5 font-mono text-sm font-semibold text-foreground">{props.value}</Text>
    </View>
  );
}

export function DashboardPage(props: {
  runState: () => CoreRunState;
  coreError: () => string | null;
  coreVersion: () => string;
  corePid: () => number | null;
  profiles: () => NodeProfile[];
  activeProfileId: () => string | null;
  activeProfile: () => NodeProfile | null;
  settings: () => AppSettings;
  stats: () => TrafficStats;
  connections: () => ClashConnectionItem[];
  delays: () => Record<string, number | "testing" | "error">;
  activeDelay: () => number | "testing" | "error" | undefined;
  onStart: () => void;
  onStop: () => void;
  onRestart: () => void;
  onSelectActive: (id: string) => void;
  onChangeRoutingMode: (mode: RoutingMode) => void;
  onTestActiveDelay: () => void;
  onTestAllDelays?: () => void;
  onCloseConnections: () => void;
  onGoNodes: () => void;
  onGoRouting: () => void;
  onGoConfig?: () => void;
  onGoLogs?: () => void;
}) {
  const switchDialogOpen = signal(false);
  const nodeSearch = signal("");
  const transportFilter = signal<QuickSwitchTransportFilter>("all");
  const onlyAvailable = signal(false);
  const sortBy = signal<QuickSwitchSort>("default");
  const statusMeta = () => STATE_LABEL[props.runState()];
  const isBusy = () =>
    props.runState() === "checking" || props.runState() === "starting" || props.runState() === "stopping";
  const isRunning = () => props.runState() === "running";
  const compact = () => isCompactLayout();
  const narrow = () => isNarrowPhone();

  const activeIssues = () => {
    const p = props.activeProfile();
    return p ? validateNodeProfile(p) : [];
  };
  const hasErrors = () => activeIssues().some((i) => i.severity === "error");

  const openSwitchDialog = () => {
    nodeSearch.set("");
    transportFilter.set("all");
    onlyAvailable.set(false);
    sortBy.set("default");
    switchDialogOpen.set(true);
  };

  const resetDialogFilters = () => {
    nodeSearch.set("");
    transportFilter.set("all");
    onlyAvailable.set(false);
  };

  const quickPills = () =>
    selectQuickPillNodes(props.profiles(), props.activeProfileId(), props.delays(), 8);

  const hasMixedTransport = () =>
    props.profiles().some((p) => p.quic) && props.profiles().some((p) => !p.quic);

  const testedOkCount = () =>
    props.profiles().filter((p) => typeof props.delays()[p.id] === "number").length;

  const filteredDialogNodes = () => {
    return filterAndSortQuickSwitchNodes(props.profiles(), {
      query: nodeSearch(),
      transport: transportFilter(),
      onlyAvailable: onlyAvailable(),
      sortBy: sortBy(),
      delays: props.delays(),
    });
  };

  const renderQuickNodeItem = (item: () => NodeProfile) => {
    const selected = () => props.activeProfileId() === item().id;
    const delayState = () => props.delays()[item().id];
    return (
      <Button
        testID={`quick-node-item-${item().id}`}
        accessibilityLabel={`选择节点 ${item().name}`}
        onPress={() => {
          props.onSelectActive(item().id);
          switchDialogOpen.set(false);
        }}
        class={`w-full flex-row items-center justify-between gap-2 rounded-[10px] border px-3 py-2 transition-colors ${
          selected()
            ? "border-primary bg-primary/10"
            : "border-border bg-card hover:bg-muted/50"
        }`}
      >
        <View class="min-w-0 flex-1 gap-0.5">
          <Text
            class={`line-clamp-1 text-[13px] font-semibold ${selected() ? "text-primary" : "text-foreground"}`}
          >
            {item().name}
          </Text>
          <Text class="line-clamp-1 font-mono text-[11px] text-muted-foreground">
            {`${getProtocolMeta(item().protocol ?? "naive").badge} · ${item().quic ? "QUIC" : "H2"} · ${item().server}:${item().serverPort}`}
          </Text>
        </View>

        <View class="shrink-0 flex-row items-center gap-1.5">
          <If when={delayState() !== undefined}>
            <View
              class={
                delayState() === "testing"
                  ? CLS.badgeNeutral
                  : delayState() === "error"
                    ? CLS.badgeDanger
                    : CLS.badgeSuccess
              }
            >
              <Text
                class={`font-mono text-[10px] font-medium ${
                  delayState() === "testing"
                    ? "text-muted-foreground"
                    : delayState() === "error"
                      ? "text-destructive"
                      : "text-success"
                }`}
              >
                {delayState() === "testing"
                  ? "测速中"
                  : delayState() === "error"
                    ? "超时"
                    : `${String(delayState())}ms`}
              </Text>
            </View>
          </If>
          <If when={selected()}>
            <View class={CLS.badgeSuccess}>
              <Text class="text-[10px] font-semibold text-success">使用中</Text>
            </View>
          </If>
        </View>
      </Button>
    );
  };

  const renderEmptyNodes = () => (
    <View class="items-center justify-center gap-2 rounded-[12px] border border-border bg-muted/40 py-8">
      <Text class="text-xs text-muted-foreground">没有匹配的节点</Text>
      <If when={Boolean(nodeSearch().trim()) || transportFilter() !== "all" || onlyAvailable()}>
        <Button
          testID="reset-quick-filter-btn"
          accessibilityLabel="重置筛选条件"
          onPress={resetDialogFilters}
          class={`${CLS.btnBase} ${CLS.btnSm} ${CLS.btnOutline}`}
        >
          <Text class={`text-xs font-medium ${CLS.btnTextFg}`}>重置筛选</Text>
        </Button>
      </If>
    </View>
  );

  return (
    <View class="flex-1">
      <Scroll class="flex-1">
      <View class="gap-3.5 pb-6">
        <View class={`${CLS.heroCard} gap-3.5`}>
          <If when={!compact()}>
            <View class="flex-row items-center justify-between gap-4">
              <View class="min-w-0 flex-1 gap-1">
                <View class="flex-row flex-wrap items-center gap-2">
                  <Text class="text-base font-semibold text-foreground">sing-box 核心引擎</Text>
                  <View class={statusMeta().boxCls}>
                    <Text class={`text-[11px] font-medium ${statusMeta().textCls}`}>{statusMeta().label}</Text>
                  </View>
                  <If when={props.corePid() !== null}>
                    <View class={CLS.badgeNeutral}>
                      <Text class="text-[11px] font-medium text-muted-foreground">
                        {`PID ${String(props.corePid())}`}
                      </Text>
                    </View>
                  </If>
                </View>
                <Text class="text-xs text-muted-foreground">
                  {`内核状态: ${props.coreVersion() || "尚未探测，点击启动或进入设置检测"}`}
                </Text>
              </View>

              <View class="flex-row items-center gap-2">
                <If when={isRunning()}>
                  <Button
                    testID="restart-core-btn"
                    accessibilityLabel="重启内核"
                    disabled={isBusy()}
                    onPress={props.onRestart}
                    class={`${CLS.btnBase} ${CLS.btnLg} ${CLS.btnOutline}`}
                  >
                    <Text class={`text-sm font-medium ${CLS.btnTextFg}`}>重启</Text>
                  </Button>
                  <Button
                    testID="stop-core-btn"
                    accessibilityLabel="停止运行"
                    disabled={isBusy()}
                    onPress={props.onStop}
                    class={`${CLS.btnBase} ${CLS.btnLg} ${CLS.btnDanger}`}
                  >
                    <Text class={`text-sm font-semibold ${CLS.btnTextDanger}`}>断开连接</Text>
                  </Button>
                </If>
                <If when={!isRunning()}>
                  <Button
                    testID="start-core-btn"
                    accessibilityLabel="启动连接"
                    disabled={isBusy() || !props.activeProfile() || hasErrors()}
                    onPress={props.onStart}
                    class={`${CLS.btnBase} ${CLS.btnLg} ${CLS.btnPrimary} min-w-[148px]`}
                  >
                    <Text class={`text-sm font-semibold ${CLS.btnTextPrimary}`}>
                      {isBusy() ? "处理中..." : "一键启动连接"}
                    </Text>
                  </Button>
                </If>
              </View>
            </View>
          </If>

          <If when={props.activeProfile()}>
            {(node) => (
              <View class="rounded-[12px] border border-border bg-muted/40 px-3 py-2.5">
                <View class="flex-row flex-wrap items-center justify-between gap-2">
                  <View class="min-w-0 flex-1 gap-0.5">
                    <View class="flex-row flex-wrap items-center gap-1.5">
                      <Text class="text-xs font-semibold text-foreground">{node().name}</Text>
                      <View class={CLS.badgePrimary}>
                        <Text class="text-[10px] font-medium text-primary">
                          {getProtocolMeta(node().protocol ?? "naive").badge}
                        </Text>
                      </View>
                    </View>
                    <Text class="font-mono text-[11px] text-muted-foreground">
                      {`${node().server}:${node().serverPort} · ${node().quic ? "QUIC" : "HTTP/2"}`}
                    </Text>
                  </View>

                  <View class="flex-row items-center gap-1.5">
                    <If when={props.activeDelay() !== undefined}>
                      <View class={props.activeDelay() === "error" ? CLS.badgeDanger : CLS.badgeSuccess}>
                        <Text
                          class={`text-[11px] font-medium ${props.activeDelay() === "error" ? "text-destructive" : "text-success"}`}
                        >
                          {props.activeDelay() === "testing"
                            ? "测速中..."
                            : props.activeDelay() === "error"
                              ? "超时"
                              : `${String(props.activeDelay())} ms`}
                        </Text>
                      </View>
                    </If>
                    <Button
                      accessibilityLabel="测速"
                      disabled={!isRunning() || !props.activeProfile()}
                      onPress={props.onTestActiveDelay}
                      class={`${CLS.btnBase} ${CLS.btnSm} ${CLS.btnOutline}`}
                    >
                      <Text class={`text-xs font-medium ${CLS.btnTextFg}`}>测速</Text>
                    </Button>
                    <Button
                      testID="quick-switch-node-btn"
                      accessibilityLabel="切换节点"
                      onPress={openSwitchDialog}
                      class={`${CLS.btnBase} ${CLS.btnSm} ${CLS.btnSecondary}`}
                    >
                      <Text class={`text-xs font-medium ${CLS.btnTextSecondary}`}>
                        {props.profiles().length > 1 ? `切换 (${props.profiles().length})` : "切换"}
                      </Text>
                    </Button>
                  </View>
                </View>

                <If when={props.profiles().length > 1}>
                  <View class="mt-2.5 gap-1.5 border-t border-border/60 pt-2.5">
                    <View class="flex-row items-center justify-between gap-2">
                      <Text class="text-[11px] font-medium text-muted-foreground">
                        {props.profiles().length > 8
                          ? `常用 / 快速切换（展示 ${quickPills().length} / ${props.profiles().length}）`
                          : `快速切换出站 (${props.profiles().length})`}
                      </Text>
                      <If when={props.profiles().length > 8}>
                        <Button
                          testID="quick-switch-more-btn"
                          accessibilityLabel="查看全部节点"
                          onPress={openSwitchDialog}
                          class={`${CLS.btnBase} h-6 rounded-[6px] px-1.5 ${CLS.btnGhost}`}
                        >
                          <Text class="text-[11px] font-medium text-primary">
                            {`全部 ${props.profiles().length} 个 ›`}
                          </Text>
                        </Button>
                      </If>
                    </View>
                    <Scroll horizontal scrollbar={false}>
                      <View class="flex-row items-center gap-1.5 py-0.5">
                        <Each of={quickPills()} key={(item) => item.id}>
                          {(item) => {
                            const selected = () => props.activeProfileId() === item().id;
                            const delayVal = () => props.delays()[item().id];
                            return (
                              <Button
                                testID={`quick-pill-${item().id}`}
                                accessibilityLabel={`快速切换至 ${item().name}`}
                                onPress={() => props.onSelectActive(item().id)}
                                class={`${CLS.btnBase} h-7 shrink-0 rounded-full px-2.5 ${
                                  selected()
                                    ? "border border-primary bg-primary/15"
                                    : "border border-border bg-card hover:bg-muted"
                                }`}
                              >
                                <View
                                  class={`size-1.5 shrink-0 rounded-full ${selected() ? "bg-primary" : "bg-muted-foreground/40"}`}
                                />
                                <Text
                                  class={`line-clamp-1 max-w-[160px] text-[11px] ${
                                    selected() ? "font-semibold text-primary" : "font-medium text-foreground"
                                  }`}
                                >
                                  {item().name}
                                </Text>
                                <If when={typeof delayVal() === "number"}>
                                  <Text class="shrink-0 font-mono text-[10px] text-success">
                                    {`${String(delayVal())}ms`}
                                  </Text>
                                </If>
                              </Button>
                            );
                          }}
                        </Each>
                      </View>
                    </Scroll>
                  </View>
                </If>
              </View>
            )}
          </If>

          <If when={props.coreError()}>
            {(err) => (
              <View class="gap-1 rounded-[12px] border border-destructive/40 bg-destructive/10 px-3 py-2.5">
                <Text class="text-xs font-semibold text-destructive">内核返回错误</Text>
                <Text class="text-xs text-foreground">{err()}</Text>
              </View>
            )}
          </If>

          <If
            when={compact()}
            else={
              <View class="flex-row gap-2.5">
                <MetricTile label="总上行" value={formatBytes(props.stats().up)} />
                <MetricTile label="总下行" value={formatBytes(props.stats().down)} />
                <MetricTile label="活跃连接" value={String(props.stats().connections)} />
                <MetricTile label="内存占用" value={formatBytes(props.stats().memoryBytes)} />
              </View>
            }
          >
            <View class="gap-2">
              <View class="flex-row gap-2">
                <MetricTile label="↑ 总上行" value={formatBytes(props.stats().up)} />
                <MetricTile label="↓ 总下行" value={formatBytes(props.stats().down)} />
              </View>
              <View class="flex-row gap-2">
                <MetricTile label="活跃连接" value={String(props.stats().connections)} />
                <MetricTile label="内存占用" value={formatBytes(props.stats().memoryBytes)} />
              </View>
            </View>
          </If>
        </View>

        <View class={`${CLS.card} gap-2.5`}>
          <View class="flex-row items-center justify-between gap-2">
            <Text class="text-sm font-semibold text-foreground">代理路由模式</Text>
            <Button
              accessibilityLabel="管理路由规则"
              onPress={props.onGoRouting}
              class={`${CLS.btnBase} ${CLS.btnSm} ${CLS.btnGhost}`}
            >
              <Text class="text-xs font-medium text-primary">管理规则 ›</Text>
            </Button>
          </View>
          <Tabs class={`${CLS.tabsRoot} w-full`} indicatorClass={CLS.tabsIndicator}>
            <Each of={ROUTING_MODES} key={(item) => item.value}>
              {(item) => (
                <Tab
                  testID={item().testID}
                  selected={props.settings().routingMode === item().value}
                  onPress={() => props.onChangeRoutingMode(item().value)}
                  class={`${CLS.tabItem} flex-1 items-center`}
                >
                  <Text class={CLS.tabText}>{narrow() ? item().shortLabel : item().label}</Text>
                </Tab>
              )}
            </Each>
          </Tabs>
        </View>

        <View class={compact() ? "gap-3.5" : "flex-row gap-4"}>
          <View class={`${CLS.card} ${compact() ? "w-full" : "min-w-0 flex-1"} gap-2.5`}>
            <View class="flex-row items-center justify-between gap-2">
              <Text class="text-sm font-semibold text-foreground">当前主出站详情</Text>
              <Button
                accessibilityLabel="管理节点"
                onPress={props.onGoNodes}
                class={`${CLS.btnBase} ${CLS.btnSm} ${CLS.btnGhost}`}
              >
                <Text class="text-xs font-medium text-primary">全部节点 ›</Text>
              </Button>
            </View>

            <If when={props.activeProfile()}>
              {(node) => (
                <View class="gap-0.5">
                  <KvRow label="节点名称" value={node().name} />
                  <KvRow label="出站协议" value={getProtocolMeta(node().protocol ?? "naive").title} />
                  <KvRow label="服务器" value={`${node().server}:${node().serverPort}`} mono />
                  <KvRow label="SNI (server_name)" value={node().tls.serverName || node().server} mono />
                  <KvRow
                    label="传输协议"
                    value={
                      node().quic
                        ? `QUIC · ${node().quicCongestionControl || "cubic"}`
                        : "HTTP/2 (Chromium TLS)"
                    }
                  />
                  <KvRow
                    label="UDP over TCP"
                    value={node().udpOverTcpMode === "off" ? "关闭" : `开启 (${node().udpOverTcpMode})`}
                  />
                  <KvRow
                    label="ECH"
                    value={
                      node().tls.ech.enabled
                        ? `开启 (${node().tls.ech.queryServerName || "默认/内联"})`
                        : "关闭"
                    }
                  />
                  <KvRow
                    label="并发连接"
                    value={
                      node().insecureConcurrency > 0
                        ? `${node().insecureConcurrency} (不安全并发)`
                        : "0 (单连接抗特征)"
                    }
                  />
                </View>
              )}
            </If>
          </View>

          <View class={`${CLS.card} ${compact() ? "w-full" : "min-w-0 flex-1"} gap-2.5`}>
            <View class="gap-0.5">
              <Text class="text-sm font-semibold text-foreground">入站与控制平面</Text>
              <Text class="text-xs text-muted-foreground">本地监听端点、官方 rule_set 与 DNS 摘要</Text>
            </View>
            <View class="gap-0.5">
              <KvRow
                label="Mixed 入站"
                value={
                  props.settings().mixed.enabled
                    ? `${props.settings().mixed.listen}:${props.settings().mixed.listenPort}`
                    : "已禁用"
                }
                mono
              />
              <KvRow
                label="系统代理"
                value={props.settings().mixed.setSystemProxy ? "启动时自动接管" : "手动配置"}
              />
              <KvRow
                label="TUN 虚拟网卡"
                value={
                  props.settings().tun.enabled
                    ? `${props.settings().tun.interfaceName} (${props.settings().tun.stack})`
                    : "未启用"
                }
                mono={props.settings().tun.enabled}
              />
              <KvRow
                label="DNS 远端"
                value={`${props.settings().dns.remoteType}://${props.settings().dns.remoteServer}`}
                mono
              />
              <KvRow
                label="rule_set 规则"
                value={`${props.settings().routing.rules.filter((r) => r.enabled).length} 条启用 · ${props.settings().routing.ruleSetMirror}`}
              />
              <KvRow
                label="Clash API"
                value={
                  props.settings().clashApi.enabled
                    ? `${props.settings().clashApi.listen}:${props.settings().clashApi.port}`
                    : "已禁用"
                }
                mono
              />
            </View>

            <View class="mt-1 flex-row flex-wrap gap-2">
              <If when={props.onGoConfig}>
                {(fn) => (
                  <Button
                    accessibilityLabel="查看完整配置"
                    onPress={fn()}
                    class={`${CLS.btnBase} ${CLS.btnSm} ${CLS.btnOutline} flex-1`}
                  >
                    <Text class={`text-xs font-medium ${CLS.btnTextFg}`}>查看配置 JSON</Text>
                  </Button>
                )}
              </If>
              <If when={props.onGoLogs}>
                {(fn) => (
                  <Button
                    accessibilityLabel="查看运行日志"
                    onPress={fn()}
                    class={`${CLS.btnBase} ${CLS.btnSm} ${CLS.btnOutline} flex-1`}
                  >
                    <Text class={`text-xs font-medium ${CLS.btnTextFg}`}>运行日志</Text>
                  </Button>
                )}
              </If>
            </View>
          </View>
        </View>

        <View class={`${CLS.card} gap-3`}>
          <View class="flex-row items-center justify-between gap-2">
            <View class="gap-0.5">
              <Text class="text-sm font-semibold text-foreground">活跃连接监控</Text>
              <Text class="text-xs text-muted-foreground">通过 Clash API 实时获取当前穿透的连接</Text>
            </View>
            <Button
              accessibilityLabel="全部断开"
              disabled={!isRunning() || props.connections().length === 0}
              onPress={props.onCloseConnections}
              class={`${CLS.btnBase} ${CLS.btnSm} ${CLS.btnOutline}`}
            >
              <Text class={`text-xs font-medium ${CLS.btnTextFg}`}>全部断开</Text>
            </Button>
          </View>

          <If when={props.connections().length === 0}>
            <View class="items-center justify-center rounded-[12px] border border-border bg-muted/40 px-4 py-6">
              <Text class="text-xs text-muted-foreground">
                {isRunning() ? "暂无活跃连接" : "启动内核后将实时展示活跃连接与规则命中链路"}
              </Text>
            </View>
          </If>

          <If when={props.connections().length > 0 && compact()}>
            <View class="gap-2">
              <Each of={props.connections()} key={(c) => c.id}>
                {(c) => (
                  <View class="gap-1.5 rounded-[12px] border border-border bg-muted/30 p-3">
                    <View class="flex-row items-center justify-between gap-2">
                      <Text class="flex-1 font-mono text-xs font-semibold text-foreground">{c().host}</Text>
                      <View class={CLS.badgeNeutral}>
                        <Text class="text-[10px] font-medium text-muted-foreground">{c().network}</Text>
                      </View>
                    </View>
                    <View class="flex-row flex-wrap items-center justify-between gap-2">
                      <Text class="text-[11px] text-muted-foreground">
                        {`${c().rule || "-"} · ${c().chains.join(" → ") || "-"}`}
                      </Text>
                      <Text class="font-mono text-[11px] text-foreground">
                        {`↑ ${formatBytes(c().upload)}  ↓ ${formatBytes(c().download)}`}
                      </Text>
                    </View>
                  </View>
                )}
              </Each>
            </View>
          </If>

          <If when={props.connections().length > 0 && !compact()}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>目标地址</TableHead>
                  <TableHead>网络</TableHead>
                  <TableHead>规则</TableHead>
                  <TableHead>出站链路</TableHead>
                  <TableHead>流量</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <Each of={props.connections()} key={(c) => c.id}>
                  {(c) => (
                    <TableRow>
                      <TableCell>
                        <Text class="font-mono text-xs text-foreground">{c().host}</Text>
                      </TableCell>
                      <TableCell>
                        <Text class="text-xs text-muted-foreground">{c().network}</Text>
                      </TableCell>
                      <TableCell>
                        <Text class="text-xs text-muted-foreground">{c().rule || "-"}</Text>
                      </TableCell>
                      <TableCell>
                        <Text class="text-xs text-foreground">{c().chains.join(" → ") || "-"}</Text>
                      </TableCell>
                      <TableCell>
                        <Text class="font-mono text-xs text-muted-foreground">
                          {`↑ ${formatBytes(c().upload)} / ↓ ${formatBytes(c().download)}`}
                        </Text>
                      </TableCell>
                    </TableRow>
                  )}
                </Each>
              </TableBody>
            </Table>
          </If>
        </View>
      </View>
      </Scroll>

      <Dialog
        testID="quick-switch-dialog"
        open={switchDialogOpen()}
        onOpenChange={({ open }) => switchDialogOpen.set(open)}
        presentation="formSheet"
        closeOnEscape
        closeOnBackdropPress
        backdropClass={CLS.dialogBackdrop}
        class={compact() ? CLS.sheetCard : `${CLS.dialogCard} h-[600px] max-h-[86%] max-w-[780px]`}
      >
        <View class="min-h-0 flex-1">
          <View class="shrink-0 flex-row items-center justify-between gap-3 border-b border-border px-5 py-3.5">
            <View class="min-w-0 flex-1 gap-0.5">
              <Text class="text-base font-semibold text-foreground">快速切换主出站节点</Text>
              <Text class="text-xs text-muted-foreground">
                共 {props.profiles().length} 个节点 · 点击即可切换，运行中自动实时生效
              </Text>
            </View>
            <View class="flex-row items-center gap-1.5">
              <If when={props.onTestAllDelays}>
                {(fn) => (
                  <Button
                    accessibilityLabel="全部测速"
                    disabled={!isRunning() || props.profiles().length === 0}
                    onPress={fn()}
                    class={`${CLS.btnBase} ${CLS.btnSm} ${CLS.btnOutline}`}
                  >
                    <Text class={`text-xs font-medium ${CLS.btnTextFg}`}>全部测速</Text>
                  </Button>
                )}
              </If>
              <Button
                accessibilityLabel="关闭"
                onPress={() => switchDialogOpen.set(false)}
                class={`${CLS.btnBase} ${CLS.btnSm} ${CLS.btnGhost}`}
              >
                <Text class={`text-xs font-medium ${CLS.btnTextFg}`}>关闭</Text>
              </Button>
            </View>
          </View>

          <If when={props.profiles().length > 3}>
            <View class="shrink-0 gap-2 border-b border-border/60 bg-muted/20 px-5 py-2.5">
              <View class="flex-row items-center gap-2">
                <Input
                  testID="quick-switch-search"
                  accessibilityLabel="搜索节点"
                  value={nodeSearch()}
                  onChange={({ value }) => nodeSearch.set(value)}
                  placeholder="搜索节点名、服务器、端口或 tag..."
                  class={`${CLS.input} flex-1`}
                />
                <If when={nodeSearch().length > 0}>
                  <Button
                    testID="clear-quick-search-btn"
                    accessibilityLabel="清空搜索"
                    onPress={() => nodeSearch.set("")}
                    class={`${CLS.btnBase} ${CLS.btnSm} ${CLS.btnOutline}`}
                  >
                    <Text class={`text-xs font-medium ${CLS.btnTextFg}`}>清空</Text>
                  </Button>
                </If>
              </View>

              <View class="flex-row flex-wrap items-center justify-between gap-2">
                <View class="flex-row flex-wrap items-center gap-1.5">
                  <Button
                    testID="filter-all-btn"
                    accessibilityLabel="显示全部节点"
                    onPress={() => {
                      transportFilter.set("all");
                      onlyAvailable.set(false);
                    }}
                    class={`${CLS.btnBase} h-7 rounded-[7px] px-2.5 ${
                      transportFilter() === "all" && !onlyAvailable() ? CLS.btnPrimary : CLS.btnOutline
                    }`}
                  >
                    <Text
                      class={`text-[11px] font-medium ${
                        transportFilter() === "all" && !onlyAvailable()
                          ? CLS.btnTextPrimary
                          : CLS.btnTextFg
                      }`}
                    >
                      {`全部 (${props.profiles().length})`}
                    </Text>
                  </Button>
                  <If when={hasMixedTransport()}>
                    <Button
                      testID="filter-h2-btn"
                      accessibilityLabel="筛选 HTTP/2 节点"
                      onPress={() =>
                        transportFilter.set(transportFilter() === "h2" ? "all" : "h2")
                      }
                      class={`${CLS.btnBase} h-7 rounded-[7px] px-2.5 ${
                        transportFilter() === "h2" ? CLS.btnPrimary : CLS.btnOutline
                      }`}
                    >
                      <Text
                        class={`text-[11px] font-medium ${
                          transportFilter() === "h2" ? CLS.btnTextPrimary : CLS.btnTextFg
                        }`}
                      >
                        HTTP/2
                      </Text>
                    </Button>
                    <Button
                      testID="filter-quic-btn"
                      accessibilityLabel="筛选 QUIC 节点"
                      onPress={() =>
                        transportFilter.set(transportFilter() === "quic" ? "all" : "quic")
                      }
                      class={`${CLS.btnBase} h-7 rounded-[7px] px-2.5 ${
                        transportFilter() === "quic" ? CLS.btnPrimary : CLS.btnOutline
                      }`}
                    >
                      <Text
                        class={`text-[11px] font-medium ${
                          transportFilter() === "quic" ? CLS.btnTextPrimary : CLS.btnTextFg
                        }`}
                      >
                        QUIC
                      </Text>
                    </Button>
                  </If>
                  <If when={testedOkCount() > 0}>
                    <Button
                      testID="filter-available-btn"
                      accessibilityLabel="仅看已测通节点"
                      onPress={() => onlyAvailable.set(!onlyAvailable())}
                      class={`${CLS.btnBase} h-7 rounded-[7px] px-2.5 ${
                        onlyAvailable() ? CLS.btnPrimary : CLS.btnOutline
                      }`}
                    >
                      <Text
                        class={`text-[11px] font-medium ${
                          onlyAvailable() ? CLS.btnTextPrimary : CLS.btnTextFg
                        }`}
                      >
                        {`已测通 (${testedOkCount()})`}
                      </Text>
                    </Button>
                  </If>
                </View>

                <View class="flex-row items-center gap-1">
                  <Button
                    testID="sort-default-btn"
                    accessibilityLabel="默认排序"
                    onPress={() => sortBy.set("default")}
                    class={`${CLS.btnBase} h-7 rounded-[7px] px-2 ${
                      sortBy() === "default" ? CLS.btnSecondary : CLS.btnGhost
                    }`}
                  >
                    <Text class="text-[11px] font-medium text-foreground">默认</Text>
                  </Button>
                  <Button
                    testID="sort-delay-btn"
                    accessibilityLabel="按延迟排序"
                    onPress={() => sortBy.set("delay")}
                    class={`${CLS.btnBase} h-7 rounded-[7px] px-2 ${
                      sortBy() === "delay" ? CLS.btnSecondary : CLS.btnGhost
                    }`}
                  >
                    <Text class="text-[11px] font-medium text-foreground">延迟</Text>
                  </Button>
                  <Button
                    testID="sort-name-btn"
                    accessibilityLabel="按名称排序"
                    onPress={() => sortBy.set("name")}
                    class={`${CLS.btnBase} h-7 rounded-[7px] px-2 ${
                      sortBy() === "name" ? CLS.btnSecondary : CLS.btnGhost
                    }`}
                  >
                    <Text class="text-[11px] font-medium text-foreground">名称</Text>
                  </Button>
                </View>
              </View>

              <If when={props.activeProfile()}>
                {(activeNode) => (
                  <View class="flex-row items-center justify-between gap-2 pt-0.5">
                    <Text class="line-clamp-1 min-w-0 flex-1 text-[11px] text-muted-foreground">
                      {`当前: ${activeNode().name} (${activeNode().server}:${activeNode().serverPort})`}
                    </Text>
                    <Text class="shrink-0 font-mono text-[11px] text-muted-foreground">
                      {`显示 ${filteredDialogNodes().length} / ${props.profiles().length}`}
                    </Text>
                  </View>
                )}
              </If>
            </View>
          </If>

          <View class="min-h-0 flex-1">
            <If
              when={compact()}
              else={
                <List
                  testID="quick-switch-list-desktop"
                  each={filteredDialogNodes()}
                  numColumns={2}
                  estimatedItemSize={62}
                  keyExtractor={(item) => item.id}
                  contentStyle={{ paddingHorizontal: 18, paddingVertical: 12, rowGap: 8, columnGap: 8 }}
                  empty={renderEmptyNodes}
                  class="flex-1"
                >
                  {(item) => renderQuickNodeItem(item)}
                </List>
              }
            >
              <List
                testID="quick-switch-list-mobile"
                each={filteredDialogNodes()}
                numColumns={1}
                estimatedItemSize={62}
                keyExtractor={(item) => item.id}
                contentStyle={{ paddingHorizontal: 16, paddingVertical: 10, rowGap: 8 }}
                empty={renderEmptyNodes}
                class="flex-1"
              >
                {(item) => renderQuickNodeItem(item)}
              </List>
            </If>
          </View>

          <View
            style={{ paddingBottom: compact() ? Math.max(getSafeInsets().bottom, 12) : 12 }}
            class="shrink-0 flex-row items-center justify-between gap-2 border-t border-border bg-muted/40 px-5 pt-3"
          >
            <Button
              accessibilityLabel="前往节点管理"
              onPress={() => {
                switchDialogOpen.set(false);
                props.onGoNodes();
              }}
              class={`${CLS.btnBase} ${CLS.btnSm} ${CLS.btnOutline}`}
            >
              <Text class={`text-xs font-medium ${CLS.btnTextFg}`}>新增 / 管理节点</Text>
            </Button>
            <Button
              accessibilityLabel="关闭弹窗"
              onPress={() => switchDialogOpen.set(false)}
              class={`${CLS.btnBase} ${CLS.btnSm} ${CLS.btnGhost}`}
            >
              <Text class={`text-xs font-medium ${CLS.btnTextFg}`}>完成</Text>
            </Button>
          </View>
        </View>
      </Dialog>
    </View>
  );
}
