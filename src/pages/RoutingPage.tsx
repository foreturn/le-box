import { Scroll, signal, Text, View } from "nsh";
import { Button, Dialog, Input, Select, Switch, Tab, Tabs } from "nsh/base";
import { isCompactLayout, rowStackClass } from "../core/layout";
import {
  applyRoutePresetScheme,
  describeRouteRuleMatch,
  instantiatePresetRule,
  OFFICIAL_RULE_PRESETS,
  ROUTE_FINAL_TARGET_OPTIONS,
  ROUTE_PRESET_SCHEMES,
  RULE_ACTION_TARGET_OPTIONS,
  RULE_SET_DOWNLOAD_DETOUR_OPTIONS,
  RULE_SET_MIRROR_OPTIONS,
  RULE_SET_UPDATE_INTERVAL_OPTIONS,
  sanitizeDomainSuffixes,
} from "../core/routePresets";
import { CLS } from "../styles";
import type {
  AppSettings,
  RoutePresetSchemeId,
  RouteRuleItem,
  RoutingMode,
  RoutingSettings,
  RuleActionTarget,
  RuleSetDownloadDetour,
  RuleSetMirror,
  RuleSetUpdateInterval,
} from "../types/singbox";

type AddModalTab = "presets" | "custom";
type PresetCategoryFilter = "all" | RouteRuleItem["category"];

const CATEGORY_LABELS: Record<RouteRuleItem["category"], string> = {
  region: "地区分流",
  ads: "广告拦截",
  service: "常用服务",
  protocol: "协议策略",
  private: "私有网络",
  custom: "自定义",
};

const CATEGORY_BADGE_CLS: Record<RouteRuleItem["category"], string> = {
  region: CLS.badgeInfo,
  ads: CLS.badgeDanger,
  service: CLS.badgePrimary,
  protocol: CLS.badgeWarning,
  private: CLS.badgeSuccess,
  custom: CLS.badgeNeutral,
};

const CATEGORY_TEXT_CLS: Record<RouteRuleItem["category"], string> = {
  region: "text-info",
  ads: "text-destructive",
  service: "text-primary",
  protocol: "text-warning",
  private: "text-success",
  custom: "text-muted-foreground",
};

const PRESET_FILTERS: { value: PresetCategoryFilter; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "region", label: "地区" },
  { value: "ads", label: "广告" },
  { value: "service", label: "常用服务" },
  { value: "protocol", label: "协议" },
  { value: "private", label: "私有网络" },
];

const ROUTING_MODE_LABELS: Record<RoutingMode, string> = {
  rule: "规则分流 (Rule)",
  global: "全局代理 (Global)",
  direct: "直连模式 (Direct)",
};

function titleFor(items: { value: string; title: string }[], value: string) {
  return items.find((i) => i.value === value)?.title ?? "请选择";
}

export function RoutingPage(props: {
  settings: () => AppSettings;
  onUpdateSettings: (updater: (cur: AppSettings) => AppSettings) => void;
  onToast: (msg: string, tone?: "info" | "success" | "warning" | "error") => void;
}) {
  const addDialogOpen = signal(false);
  const addTab = signal<AddModalTab>("presets");
  const categoryFilter = signal<PresetCategoryFilter>("all");
  const customName = signal("");
  const customSuffixes = signal("");
  const customTarget = signal<RuleActionTarget>("proxy");
  const compact = () => isCompactLayout();

  const routing = () => props.settings().routing;

  const updateRouting = (fn: (draft: RoutingSettings) => void, markCustom = false) => {
    props.onUpdateSettings((cur) => {
      const next = JSON.parse(JSON.stringify(cur)) as AppSettings;
      fn(next.routing);
      if (markCustom) {
        next.routing.activeScheme = "custom";
      }
      return next;
    });
  };

  const handleApplyScheme = (schemeId: RoutePresetSchemeId) => {
    const scheme = ROUTE_PRESET_SCHEMES.find((s) => s.id === schemeId);
    props.onUpdateSettings((cur) => {
      const next = JSON.parse(JSON.stringify(cur)) as AppSettings;
      next.routing = applyRoutePresetScheme(next.routing, schemeId);
      if (schemeId === "direct-all") {
        next.routingMode = "direct";
      } else {
        next.routingMode = "rule";
      }
      return next;
    });
    if (scheme) {
      props.onToast(`已应用路由方案：${scheme.title}`, "success");
    }
  };

  const handleAddPreset = (presetId: string, targetOverride?: RuleActionTarget) => {
    const preset = OFFICIAL_RULE_PRESETS.find((p) => p.presetId === presetId);
    if (!preset) return;
    const rule = instantiatePresetRule(preset, targetOverride);
    updateRouting((draft) => {
      draft.rules.push(rule);
    }, true);
    props.onToast(`已添加官方规则：${preset.name}`, "success");
  };

  const handleAddCustomRule = () => {
    const suffixes = sanitizeDomainSuffixes(customSuffixes());
    if (suffixes.length === 0) {
      props.onToast("请填写至少一个域名后缀，如 openai.com", "warning");
      return;
    }
    const name = customName().trim() || `自定义域名 (${suffixes[0]})`;
    const newRule: RouteRuleItem = {
      id: `rule-custom-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      name,
      description: `匹配域名后缀: ${suffixes.join(", ")}`,
      enabled: true,
      category: "custom",
      matchType: "domain_suffix",
      domainSuffixes: suffixes,
      target: customTarget(),
      syncDnsRule: true,
    };
    updateRouting((draft) => {
      draft.rules.push(newRule);
    }, true);
    customName.set("");
    customSuffixes.set("");
    addDialogOpen.set(false);
    props.onToast(`已添加规则：${name}`, "success");
  };

  const moveRule = (index: number, delta: -1 | 1) => {
    updateRouting((draft) => {
      const targetIndex = index + delta;
      if (targetIndex < 0 || targetIndex >= draft.rules.length) return;
      const [item] = draft.rules.splice(index, 1);
      if (item) {
        draft.rules.splice(targetIndex, 0, item);
      }
    }, true);
  };

  const removeRule = (id: string) => {
    updateRouting((draft) => {
      draft.rules = draft.rules.filter((r) => r.id !== id);
    }, true);
    props.onToast("已移除路由规则", "info");
  };

  const filteredPresets = () => {
    const filter = categoryFilter();
    if (filter === "all") return OFFICIAL_RULE_PRESETS;
    return OFFICIAL_RULE_PRESETS.filter((p) => p.category === filter);
  };

  const addedPresetIds = () => new Set(routing().rules.map((r) => r.presetId).filter(Boolean));
  const enabledCount = () => routing().rules.filter((r) => r.enabled).length;

  return (
    <View class="flex-1 gap-4">
      <View class={compact() ? "gap-2.5" : "flex-row flex-wrap items-center justify-between gap-3"}>
        <View class="min-w-0 flex-1 gap-0.5">
          <Text class="text-sm font-semibold text-foreground">路由规则管理</Text>
          <Text class="text-xs text-muted-foreground">
            遵循 sing-box 官方 rule_set (.srs) 与路由动作规范（已弃用旧版 geoip / geosite 字段）
          </Text>
        </View>
        <View class="flex-row flex-wrap items-center gap-2">
          <View class={CLS.badgeInfo}>
            <Text class="text-[11px] font-medium text-info">
              {`当前模式: ${ROUTING_MODE_LABELS[props.settings().routingMode]}`}
            </Text>
          </View>
          <Button
            testID="open-add-rule-btn"
            accessibilityLabel="选择添加规则"
            onPress={() => {
              addTab.set("presets");
              addDialogOpen.set(true);
            }}
            class={`${CLS.btnBase} ${CLS.btnMd} ${CLS.btnPrimary}`}
          >
            <Text class={`text-sm font-medium ${CLS.btnTextPrimary}`}>+ 选择添加官方规则</Text>
          </Button>
        </View>
      </View>

      <If when={props.settings().routingMode !== "rule"}>
        <View class="flex-row flex-wrap items-center justify-between gap-3 rounded-(--radius) border border-warning/40 bg-warning/10 px-3.5 py-2.5">
          <Text class="flex-1 text-xs text-foreground">
            {`当前全局处于「${ROUTING_MODE_LABELS[props.settings().routingMode]}」，下方的分流规则集仅在切换回「规则分流 (Rule)」模式后生效。`}
          </Text>
          <Button
            accessibilityLabel="切换为规则分流模式"
            onPress={() => {
              props.onUpdateSettings((cur) => ({ ...cur, routingMode: "rule" }));
              props.onToast("已切换为规则分流模式", "success");
            }}
            class={`${CLS.btnBase} ${CLS.btnSm} ${CLS.btnOutline}`}
          >
            <Text class={`text-xs font-medium ${CLS.btnTextFg}`}>启用规则分流</Text>
          </Button>
        </View>
      </If>

      <Scroll class="flex-1">
        <View class="gap-4 pb-6">
          <View class={`${CLS.card} gap-3`}>
            <View class="flex-row flex-wrap items-center justify-between gap-2">
              <View class="gap-0.5">
                <Text class="text-sm font-semibold text-foreground">一键官方路由方案</Text>
                <Text class="text-xs text-muted-foreground">
                  直接选用网络预置的 SagerNet 官方规则组合，无需手动编写复杂规则
                </Text>
              </View>
            </View>

            <View class="flex-row flex-wrap gap-2.5">
              <Each of={ROUTE_PRESET_SCHEMES} key={(item) => item.id}>
                {(item) => {
                  const isCurrent = () => routing().activeScheme === item().id;
                  return (
                    <Button
                      testID={`scheme-${item().id}`}
                      accessibilityLabel={`应用方案 ${item().title}`}
                      onPress={() => handleApplyScheme(item().id)}
                      class={`${compact() ? "w-full" : "min-w-[200px] flex-1"} items-start rounded-[12px] border p-3 text-left transition-colors ${
                        isCurrent()
                          ? "border-primary bg-accent/60"
                          : "border-border bg-muted/30 hover:bg-muted/60"
                      }`}
                    >
                      <View class="w-full gap-1">
                        <View class="flex-row items-center justify-between gap-2">
                          <Text class={`text-xs font-semibold ${isCurrent() ? "text-primary" : "text-foreground"}`}>
                            {item().title}
                          </Text>
                          <If when={isCurrent()}>
                            <View class={CLS.badgePrimary}>
                              <Text class="text-[10px] font-medium text-primary">当前方案</Text>
                            </View>
                          </If>
                        </View>
                        <Text class="text-[11px] text-muted-foreground">{item().description}</Text>
                      </View>
                    </Button>
                  );
                }}
              </Each>
            </View>
          </View>

          <View class={`${CLS.card} gap-3`}>
            <Text class="text-sm font-semibold text-foreground">官方 Rule-Set 源与兜底策略</Text>
            <View class={rowStackClass()}>
              <View class="min-w-0 flex-1 gap-1.5">
                <Text class="text-xs font-medium text-foreground">Rule-Set 规则集镜像源</Text>
                <Select
                  accessibilityLabel="规则集镜像源"
                  items={RULE_SET_MIRROR_OPTIONS}
                  value={routing().ruleSetMirror}
                  onChange={({ value }) =>
                    updateRouting((d) => {
                      d.ruleSetMirror = (value ?? "github") as RuleSetMirror;
                    })
                  }
                  trigger={
                    <View testID="field-ruleset-mirror" class={CLS.selectTrigger}>
                      <Text class="text-xs text-foreground">
                        {titleFor(RULE_SET_MIRROR_OPTIONS, routing().ruleSetMirror)}
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

              <View class="min-w-0 flex-1 gap-1.5">
                <Text class="text-xs font-medium text-foreground">规则集下载通道 (download_detour)</Text>
                <Select
                  accessibilityLabel="规则集下载通道"
                  items={RULE_SET_DOWNLOAD_DETOUR_OPTIONS}
                  value={routing().downloadDetour}
                  onChange={({ value }) =>
                    updateRouting((d) => {
                      d.downloadDetour = (value ?? "auto") as RuleSetDownloadDetour;
                    })
                  }
                  trigger={
                    <View testID="field-ruleset-detour" class={CLS.selectTrigger}>
                      <Text class="text-xs text-foreground">
                        {titleFor(RULE_SET_DOWNLOAD_DETOUR_OPTIONS, routing().downloadDetour)}
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
              <View class="min-w-0 flex-1 gap-1.5">
                <Text class="text-xs font-medium text-foreground">自动更新频率 (update_interval)</Text>
                <Select
                  accessibilityLabel="自动更新频率"
                  items={RULE_SET_UPDATE_INTERVAL_OPTIONS}
                  value={routing().updateInterval}
                  onChange={({ value }) =>
                    updateRouting((d) => {
                      d.updateInterval = (value ?? "1d") as RuleSetUpdateInterval;
                    })
                  }
                  trigger={
                    <View class={CLS.selectTrigger}>
                      <Text class="text-xs text-foreground">
                        {titleFor(RULE_SET_UPDATE_INTERVAL_OPTIONS, routing().updateInterval)}
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

              <View class="min-w-0 flex-1 gap-1.5">
                <Text class="text-xs font-medium text-foreground">未命中规则兜底 (route.final)</Text>
                <Select
                  accessibilityLabel="未命中规则兜底"
                  items={ROUTE_FINAL_TARGET_OPTIONS}
                  value={routing().finalTarget}
                  onChange={({ value }) =>
                    updateRouting((d) => {
                      d.finalTarget = (value ?? "proxy") as "proxy" | "direct";
                    }, true)
                  }
                  trigger={
                    <View testID="field-route-final" class={CLS.selectTrigger}>
                      <Text class="text-xs text-foreground">
                        {titleFor(ROUTE_FINAL_TARGET_OPTIONS, routing().finalTarget)}
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
          </View>

          <View class="gap-2.5">
            <View class="flex-row flex-wrap items-center justify-between gap-1.5">
              <Text class="text-sm font-semibold text-foreground">
                {`分流规则列表 (${enabledCount()}/${routing().rules.length} 条已启用 · 按顺序匹配)`}
              </Text>
              <Text class="text-[11px] text-muted-foreground">
                已自动前置 sniff 协议嗅探与 DNS 劫持规则
              </Text>
            </View>

            <If when={routing().rules.length === 0}>
              <View class="items-center justify-center gap-2 rounded-(--radius) border border-border bg-muted/40 px-6 py-8">
                <Text class="text-sm font-semibold text-foreground">当前没有分流规则</Text>
                <Text class="text-center text-xs text-muted-foreground">
                  所有流量将直接按兜底策略 ({routing().finalTarget}) 出站，可点击上方方案或“选择添加官方规则”。
                </Text>
              </View>
            </If>

            <Each of={routing().rules} key={(item) => item.id}>
              {(item, idx) => (
                <View class={`${item().enabled ? CLS.card : `${CLS.card} opacity-70`} gap-2.5`}>
                  <View class="flex-row items-start justify-between gap-3">
                    <View class="min-w-0 flex-1 gap-1">
                      <View class="flex-row flex-wrap items-center gap-1.5">
                        <Text class="text-xs font-semibold text-foreground">{`${idx() + 1}. ${item().name}`}</Text>
                        <View class={CATEGORY_BADGE_CLS[item().category]}>
                          <Text class={`text-[10px] font-medium ${CATEGORY_TEXT_CLS[item().category]}`}>
                            {CATEGORY_LABELS[item().category]}
                          </Text>
                        </View>
                        <If when={item().syncDnsRule}>
                          <View class={CLS.badgeNeutral}>
                            <Text class="text-[10px] font-medium text-muted-foreground">联动 DNS</Text>
                          </View>
                        </If>
                      </View>
                      <Text class="font-mono text-[11px] text-muted-foreground">
                        {describeRouteRuleMatch(item())}
                      </Text>
                    </View>
                    <Switch
                      testID={`rule-toggle-${item().id}`}
                      accessibilityLabel={`启用规则 ${item().name}`}
                      checked={item().enabled}
                      onChange={({ checked }) =>
                        updateRouting((d) => {
                          const target = d.rules.find((r) => r.id === item().id);
                          if (target) target.enabled = checked;
                        }, true)
                      }
                      class={CLS.switchRoot}
                      trackClass={CLS.switchTrack}
                      thumbClass={CLS.switchThumb}
                    />
                  </View>

                  <View class="flex-row flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-2">
                    <View class={compact() ? "min-w-[140px] flex-1" : "w-36"}>
                        <Select
                          accessibilityLabel={`规则 ${item().name} 动作`}
                          items={RULE_ACTION_TARGET_OPTIONS}
                          value={item().target}
                          onChange={({ value }) =>
                            updateRouting((d) => {
                              const target = d.rules.find((r) => r.id === item().id);
                              if (target && value) target.target = value as RuleActionTarget;
                            }, true)
                          }
                          trigger={
                            <View class={CLS.selectTrigger}>
                              <Text class="text-xs font-medium text-foreground">
                                {titleFor(RULE_ACTION_TARGET_OPTIONS, item().target)}
                              </Text>
                              <Text class="text-[10px] text-muted-foreground">▾</Text>
                            </View>
                          }
                          popupClass={CLS.selectPopup}
                          listClass={CLS.selectList}
                          itemClass={CLS.selectItem}
                          renderItem={(opt) => <Text class={CLS.selectItemText}>{opt.title}</Text>}
                        />
                    </View>
                    <View class="flex-row items-center gap-1">
                      <Button
                        accessibilityLabel="上移"
                        disabled={idx() === 0}
                        onPress={() => moveRule(idx(), -1)}
                        class={`${CLS.btnBase} ${CLS.btnSm} ${CLS.btnGhost}`}
                      >
                        <Text class={`text-xs font-medium ${CLS.btnTextFg}`}>↑</Text>
                      </Button>
                      <Button
                        accessibilityLabel="下移"
                        disabled={idx() === routing().rules.length - 1}
                        onPress={() => moveRule(idx(), 1)}
                        class={`${CLS.btnBase} ${CLS.btnSm} ${CLS.btnGhost}`}
                      >
                        <Text class={`text-xs font-medium ${CLS.btnTextFg}`}>↓</Text>
                      </Button>
                      <Button
                        accessibilityLabel="移除规则"
                        onPress={() => removeRule(item().id)}
                        class={`${CLS.btnBase} ${CLS.btnSm} ${CLS.btnGhost}`}
                      >
                        <Text class={`text-xs font-medium ${CLS.btnTextFg}`}>移除</Text>
                      </Button>
                    </View>
                  </View>
                </View>
              )}
            </Each>
          </View>
        </View>
      </Scroll>

      <Dialog
        testID="add-rule-dialog"
        open={addDialogOpen()}
        onOpenChange={({ open }) => addDialogOpen.set(open)}
        presentation="formSheet"
        closeOnEscape
        closeOnBackdropPress
        backdropClass={compact() ? "bg-foreground/30 items-center justify-end p-0" : CLS.dialogBackdrop}
        class={compact() ? CLS.sheetCard : `${CLS.dialogCard} h-[620px] max-h-[90%] max-w-[760px]`}
      >
        <View class="min-h-0 flex-1">
          <View class="shrink-0 flex-row items-center justify-between gap-3 border-b border-border px-5 py-3.5">
            <View class="flex-1 gap-0.5">
              <Text class="text-base font-semibold text-foreground">选择官方路由规则</Text>
              <Text class="text-xs text-muted-foreground">
                直接挑选 SagerNet 官方 sing-geosite / sing-geoip 规则集或内置协议规则，避免手工录入出错
              </Text>
            </View>
            <Button
              accessibilityLabel="关闭"
              onPress={() => addDialogOpen.set(false)}
              class={`${CLS.btnBase} ${CLS.btnSm} ${CLS.btnGhost}`}
            >
              <Text class={`text-xs font-medium ${CLS.btnTextFg}`}>关闭</Text>
            </Button>
          </View>

          <View class="shrink-0 flex-row flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/20 px-5 py-2.5">
            <Tabs class={CLS.tabsRoot} indicatorClass={CLS.tabsIndicator}>
              <Tab
                testID="rule-modal-tab-presets"
                selected={addTab() === "presets"}
                onPress={() => addTab.set("presets")}
                class={CLS.tabItem}
              >
                <Text class={CLS.tabText}>官方规则库 (推荐)</Text>
              </Tab>
              <Tab
                testID="rule-modal-tab-custom"
                selected={addTab() === "custom"}
                onPress={() => addTab.set("custom")}
                class={CLS.tabItem}
              >
                <Text class={CLS.tabText}>自定义域名后缀</Text>
              </Tab>
            </Tabs>
          </View>

          <Scroll class="min-h-0 flex-1 px-5 py-4">
            <If when={addTab() === "presets"}>
              <View class="gap-3">
                <View class="flex-row flex-wrap gap-1.5">
                  <Each of={PRESET_FILTERS} key={(f) => f.value}>
                    {(f) => (
                      <Button
                        accessibilityLabel={f().label}
                        onPress={() => categoryFilter.set(f().value)}
                        class={`${CLS.btnBase} ${CLS.btnSm} ${
                          categoryFilter() === f().value ? CLS.btnPrimary : CLS.btnOutline
                        }`}
                      >
                        <Text
                          class={`text-xs font-medium ${
                            categoryFilter() === f().value ? CLS.btnTextPrimary : CLS.btnTextFg
                          }`}
                        >
                          {f().label}
                        </Text>
                      </Button>
                    )}
                  </Each>
                </View>

                <View class="gap-2">
                  <Each of={filteredPresets()} key={(preset) => preset.presetId}>
                    {(preset) => {
                      const alreadyAdded = () => addedPresetIds().has(preset().presetId);
                      const defaultTargetLabel = titleFor(
                        RULE_ACTION_TARGET_OPTIONS,
                        preset().defaultTarget,
                      );
                      return (
                        <View class={`${CLS.cardMuted} flex-row flex-wrap items-center justify-between gap-3`}>
                          <View class="min-w-0 flex-1 gap-1">
                            <View class="flex-row flex-wrap items-center gap-2">
                              <Text class="text-xs font-semibold text-foreground">{preset().name}</Text>
                              <View class={CATEGORY_BADGE_CLS[preset().category]}>
                                <Text class={`text-[10px] font-medium ${CATEGORY_TEXT_CLS[preset().category]}`}>
                                  {CATEGORY_LABELS[preset().category]}
                                </Text>
                              </View>
                              <View class={CLS.badgeNeutral}>
                                <Text class="text-[10px] font-medium text-muted-foreground">
                                  {`默认: ${defaultTargetLabel}`}
                                </Text>
                              </View>
                              <If when={alreadyAdded()}>
                                <View class={CLS.badgeSuccess}>
                                  <Text class="text-[10px] font-medium text-success">已在列表</Text>
                                </View>
                              </If>
                            </View>
                            <Text class="text-[11px] text-muted-foreground">{preset().description}</Text>
                            <Text class="font-mono text-[10px] text-muted-foreground">
                              {preset().ruleSets
                                ? `rule_set: ${preset().ruleSets!.join(", ")}`
                                : preset().protocols
                                  ? `protocol: ${preset().protocols!.join(", ")}`
                                  : "ip_is_private: true"}
                            </Text>
                          </View>

                          <Button
                            testID={`add-preset-${preset().presetId}`}
                            accessibilityLabel={`添加 ${preset().name}`}
                            onPress={() => handleAddPreset(preset().presetId)}
                            class={`${CLS.btnBase} ${CLS.btnSm} ${
                              alreadyAdded() ? CLS.btnOutline : CLS.btnPrimary
                            }`}
                          >
                            <Text
                              class={`text-xs font-medium ${
                                alreadyAdded() ? CLS.btnTextFg : CLS.btnTextPrimary
                              }`}
                            >
                              {alreadyAdded() ? "再次添加" : "+ 添加"}
                            </Text>
                          </Button>
                        </View>
                      );
                    }}
                  </Each>
                </View>
              </View>
            </If>

            <If when={addTab() === "custom"}>
              <View class="gap-3">
                <Text class="text-xs text-muted-foreground">
                  仅当官方规则库未覆盖特定域名时使用；支持填写多个域名后缀（换行或逗号分隔）。
                </Text>
                <View class="gap-1.5">
                  <Text class="text-xs font-medium text-foreground">规则名称</Text>
                  <Input
                    accessibilityLabel="自定义规则名称"
                    value={customName()}
                    onChange={({ value }) => customName.set(value)}
                    placeholder="例如：公司内网域名"
                    class={CLS.input}
                  />
                </View>
                <View class="gap-1.5">
                  <Text class="text-xs font-medium text-foreground">域名后缀 (domain_suffix)</Text>
                  <Input
                    accessibilityLabel="域名后缀列表"
                    multiline
                    value={customSuffixes()}
                    onChange={({ value }) => customSuffixes.set(value)}
                    placeholder="example.com, internal.corp"
                    class={CLS.textareaMono}
                  />
                </View>
                <View class="gap-1.5">
                  <Text class="text-xs font-medium text-foreground">命中动作</Text>
                  <Select
                    accessibilityLabel="自定义规则命中动作"
                    items={RULE_ACTION_TARGET_OPTIONS}
                    value={customTarget()}
                    onChange={({ value }) =>
                      customTarget.set((value ?? "proxy") as RuleActionTarget)
                    }
                    trigger={
                      <View class={CLS.selectTrigger}>
                        <Text class="text-xs text-foreground">
                          {titleFor(RULE_ACTION_TARGET_OPTIONS, customTarget())}
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
                <View class="flex-row justify-end pt-2">
                  <Button
                    accessibilityLabel="添加自定义规则"
                    onPress={handleAddCustomRule}
                    class={`${CLS.btnBase} ${CLS.btnMd} ${CLS.btnPrimary}`}
                  >
                    <Text class={`text-sm font-medium ${CLS.btnTextPrimary}`}>添加到规则列表</Text>
                  </Button>
                </View>
              </View>
            </If>
          </Scroll>
        </View>
      </Dialog>
    </View>
  );
}
