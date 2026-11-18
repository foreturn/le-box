import { Picker, Scroll, signal, Text, View } from "nsh";
import { Button, Dialog, Input, Select, Switch, Tab, Tabs, Toggle } from "nsh/base";
import { getSafeInsets, isCompactLayout, isNarrowPhone, rowStackClass } from "../core/layout";
import {
  createDefaultNodeProfile,
  generateUniqueNodeName,
  generateUniqueNodeTag,
  getProtocolMeta,
  NODE_PROTOCOL_OPTIONS,
  prepareNodeProfileForSave,
  validateNodeProfile,
} from "../core/nodeProtocols";
import {
  COMMON_HEADER_TEMPLATES,
  COMMON_SERVER_PORTS,
  CONCURRENCY_OPTIONS,
  CONNECT_TIMEOUT_PRESETS,
  DOMAIN_RESOLVER_OPTIONS,
  DOMAIN_STRATEGY_OPTIONS,
  ECH_QUERY_SERVER_PRESETS,
  FALLBACK_DELAY_OPTIONS,
  isCustomOption,
  KEEP_ALIVE_OPTIONS,
  NETWORK_STRATEGY_OPTIONS,
  NETWORK_TYPE_OPTIONS,
  QUIC_CONGESTION_OPTIONS,
  QUIC_WINDOW_OPTIONS,
  STREAM_WINDOW_OPTIONS,
  UOT_MODE_OPTIONS,
} from "../core/naiveSchema";
import { CLS } from "../styles";
import type {
  DomainStrategy,
  HeaderEntry,
  NodeProfile,
  NodeProtocol,
  NetworkStrategy,
  NetworkType,
  QuicCongestionControl,
  UdpOverTcpMode,
} from "../types/singbox";

type EditorTab = "basic" | "transport" | "tls" | "dial";

const CUSTOM_SENTINEL = "__custom__";

const EDITOR_TABS: { value: EditorTab; label: string; shortLabel: string; testID: string }[] = [
  { value: "basic", label: "基础与认证", shortLabel: "基础", testID: "editor-tab-basic" },
  { value: "transport", label: "传输与流控", shortLabel: "传输", testID: "editor-tab-transport" },
  { value: "tls", label: "TLS 与 ECH", shortLabel: "TLS/ECH", testID: "editor-tab-tls" },
  { value: "dial", label: "拨号字段 (Dial)", shortLabel: "拨号", testID: "editor-tab-dial" },
];

function cloneProfile(profile: NodeProfile): NodeProfile {
  return JSON.parse(JSON.stringify(profile)) as NodeProfile;
}

function titleFor(items: { value: string; title: string }[], value: string) {
  return items.find((item) => item.value === value)?.title ?? "请选择";
}

function withCustomOption(
  options: { value: string; title: string }[],
  customLabel = "自定义...",
): { value: string; title: string }[] {
  return [...options, { value: CUSTOM_SENTINEL, title: customLabel }];
}

export function NodeEditorModal(props: {
  open: boolean;
  profile: NodeProfile | null;
  allProfiles?: NodeProfile[];
  onClose: () => void;
  onSave: (profile: NodeProfile) => void;
}) {
  const tab = signal<EditorTab>("basic");
  const draft = signal<NodeProfile>(createDefaultNodeProfile("naive"));
  const lastInitKey = signal<string>("");
  const portText = signal<string>("443");
  const customSni = signal(false);
  const customQuicWindow = signal(false);
  const customStreamWindow = signal(false);
  const customDetour = signal(false);
  const customKeepAlive = signal(false);
  const customKeepAliveInterval = signal(false);
  const customFallbackDelay = signal(false);
  const showCertAdvanced = signal(false);
  const showDialBindAdvanced = signal(false);
  const compact = () => isCompactLayout();
  const narrow = () => isNarrowPhone();

  const existingList = () => props.allProfiles ?? [];

  const syncFromProps = () => {
    if (!props.open) {
      if (lastInitKey() !== "") lastInitKey.set("");
      return draft();
    }
    const key = props.profile ? `${props.profile.id}:${props.profile.updatedAt}` : "new";
    if (lastInitKey() !== key) {
      lastInitKey.set(key);
      tab.set("basic");
      const initial = props.profile
        ? cloneProfile(props.profile)
        : createDefaultNodeProfile("naive", {
            name: generateUniqueNodeName(existingList()),
            tag: generateUniqueNodeTag(existingList()),
          });
      draft.set(initial);
      portText.set(String(initial.serverPort || 443));
      customSni.set(initial.tls.serverName.trim().length > 0);
      customQuicWindow.set(isCustomOption(QUIC_WINDOW_OPTIONS, initial.quicSessionReceiveWindow));
      customStreamWindow.set(isCustomOption(STREAM_WINDOW_OPTIONS, initial.streamReceiveWindow));
      const otherTags = existingList()
        .filter((item) => item.id !== initial.id)
        .map((item) => item.tag.trim());
      customDetour.set(
        initial.dial.detour.trim().length > 0 && !otherTags.includes(initial.dial.detour.trim()),
      );
      customKeepAlive.set(isCustomOption(KEEP_ALIVE_OPTIONS, initial.dial.tcpKeepAlive));
      customKeepAliveInterval.set(
        isCustomOption(KEEP_ALIVE_OPTIONS, initial.dial.tcpKeepAliveInterval),
      );
      customFallbackDelay.set(
        isCustomOption(FALLBACK_DELAY_OPTIONS, initial.dial.fallbackDelay),
      );
      showCertAdvanced.set(
        initial.tls.certificateText.trim().length > 0 ||
          initial.tls.certificatePath.trim().length > 0,
      );
      showDialBindAdvanced.set(
        Boolean(
          initial.dial.bindInterface.trim() ||
            initial.dial.inet4BindAddress.trim() ||
            initial.dial.inet6BindAddress.trim() ||
            initial.dial.routingMark.trim() ||
            initial.dial.netns.trim(),
        ),
      );
    }
    return draft();
  };

  const updateDraft = (updater: (cur: NodeProfile) => NodeProfile) => {
    draft.set(updater(cloneProfile(draft())));
  };

  const issues = () => {
    const current = syncFromProps();
    const previewProfile = current.tag.trim()
      ? current
      : { ...current, tag: "auto-tag-preview" };
    return validateNodeProfile(previewProfile);
  };
  const errors = () => issues().filter((item) => item.severity === "error");
  const warnings = () => issues().filter((item) => item.severity === "warning");

  const detourOptions = () => {
    const currentId = syncFromProps().id;
    const options: { value: string; title: string }[] = [
      { value: "", title: "无 (直接连接 · 默认)" },
    ];
    for (const node of existingList()) {
      if (node.id === currentId) continue;
      const nodeTag = node.tag.trim();
      if (!nodeTag) continue;
      options.push({
        value: nodeTag,
        title: `${node.name} (${nodeTag})`,
      });
    }
    return withCustomOption(options, "自定义出站 tag...");
  };

  const concurrencySelectValue = () => {
    const raw = String(syncFromProps().insecureConcurrency);
    return CONCURRENCY_OPTIONS.some((item) => item.value === raw) ? raw : "0";
  };

  const handlePickFile = async (target: "cert" | "ech") => {
    try {
      const files = await Picker.pickFiles({
        multiple: false,
        filters: [{ name: "PEM / Config", extensions: ["pem", "crt", "cer", "txt", "ech", "conf"] }],
      });
      const first = files[0];
      if (!first?.file) return;
      const content = await first.file.text();
      updateDraft((cur) => {
        if (target === "cert") {
          cur.tls.certificateText = content;
        } else {
          cur.tls.ech.enabled = true;
          cur.tls.ech.configText = content;
        }
        return cur;
      });
    } catch {
      // Picker cancelled or unavailable in headless test
    }
  };

  const setNetworkType = (
    field: "networkType" | "fallbackNetworkType",
    netType: NetworkType,
    pressed: boolean,
  ) => {
    updateDraft((cur) => {
      const list = cur.dial[field];
      cur.dial[field] = pressed
        ? (list.includes(netType) ? list : [...list, netType])
        : list.filter((x) => x !== netType);
      return cur;
    });
  };

  const addHeader = () => {
    updateDraft((cur) => {
      cur.extraHeaders.push({ key: "", value: "" });
      return cur;
    });
  };

  const updateHeader = (index: number, patch: Partial<HeaderEntry>) => {
    updateDraft((cur) => {
      const item = cur.extraHeaders[index];
      if (item) {
        cur.extraHeaders[index] = { ...item, ...patch };
      }
      return cur;
    });
  };

  const removeHeader = (index: number) => {
    updateDraft((cur) => {
      cur.extraHeaders.splice(index, 1);
      return cur;
    });
  };

  return (
    <Dialog
      testID="node-editor-dialog"
      open={props.open}
      onOpenChange={({ open }) => {
        if (!open) props.onClose();
      }}
      presentation="formSheet"
      closeOnEscape
      closeOnBackdropPress
      backdropClass={compact() ? "bg-foreground/30 items-center justify-end p-0" : CLS.dialogBackdrop}
      class={compact() ? CLS.sheetCard : `${CLS.dialogCard} h-[680px] max-h-[90%] max-w-[820px]`}
    >
      <View class="min-h-0 flex-1">
        <View class="shrink-0 flex-row items-center justify-between gap-3 border-b border-border px-5 py-3.5">
          <View class="flex-1 gap-0.5">
            <Text class="text-base font-semibold text-foreground">
              {props.profile ? `编辑节点 · ${props.profile.name}` : "新建节点"}
            </Text>
            <Text class="text-xs text-muted-foreground">
              {getProtocolMeta(syncFromProps().protocol).summary}
            </Text>
          </View>
          <Button
            accessibilityLabel="关闭"
            onPress={props.onClose}
            class={`${CLS.btnBase} ${CLS.btnSm} ${CLS.btnGhost}`}
          >
            <Text class={`text-xs font-medium ${CLS.btnTextFg}`}>关闭</Text>
          </Button>
        </View>

        <Scroll class="min-h-0 flex-1 px-5 py-4">
          <View class="gap-4">
            <View class={`${CLS.cardMuted} gap-2`}>
              <View class={rowStackClass()}>
                <View class="min-w-0 flex-1 gap-0.5">
                  <Text class="text-xs font-semibold text-foreground">出站协议 (type)</Text>
                  <Text class="text-[11px] text-muted-foreground">
                    {props.profile
                      ? "已创建节点协议已锁定，如需切换协议请新建节点"
                      : "添加节点时选择所需协议（当前支持 NaiveProxy，后续将扩展更多协议）"}
                  </Text>
                </View>
                <View class={compact() ? "w-full" : "w-56"}>
                  <Select
                    accessibilityLabel="选择节点协议"
                    disabled={Boolean(props.profile)}
                    items={NODE_PROTOCOL_OPTIONS}
                    value={syncFromProps().protocol}
                    onChange={({ value }) => {
                      const nextProto = (value ?? "naive") as NodeProtocol;
                      const current = draft();
                      const fresh = createDefaultNodeProfile(nextProto, {
                        id: current.id,
                        name: current.name,
                        tag: current.tag,
                      });
                      draft.set(fresh);
                    }}
                    trigger={
                      <View testID="field-protocol" class={CLS.selectTrigger}>
                        <Text class="text-xs font-medium text-foreground">
                          {getProtocolMeta(syncFromProps().protocol).title}
                        </Text>
                        <Text class="text-[10px] text-muted-foreground">▾</Text>
                      </View>
                    }
                    popupClass={CLS.selectPopup}
                    listClass={CLS.selectList}
                    itemClass={CLS.selectItem}
                    renderItem={(item) => <Text testID={`protocol-opt-${item.value}`} class={CLS.selectItemText}>{item.title}</Text>}
                  />
                </View>
              </View>
            </View>

            <Tabs class={compact() ? `${CLS.tabsRoot} w-full` : CLS.tabsRoot} indicatorClass={CLS.tabsIndicator}>
              <Each of={EDITOR_TABS} key={(item) => item.value}>
                {(item) => (
                  <Tab
                    testID={item().testID}
                    selected={tab() === item().value}
                    onPress={() => tab.set(item().value)}
                    class={compact() ? `${CLS.tabItem} flex-1 items-center px-1.5` : CLS.tabItem}
                  >
                    <Text class={CLS.tabText}>{narrow() ? item().shortLabel : item().label}</Text>
                  </Tab>
                )}
              </Each>
            </Tabs>

            <If when={errors().length > 0}>
              <View class="gap-1 rounded-(--radius) border border-destructive/40 bg-destructive/10 px-3 py-2.5">
                <Text class="text-xs font-semibold text-destructive">字段校验未通过</Text>
                <Text class="text-xs text-foreground">{errors().map((e) => `• ${e.message}`).join("\n")}</Text>
              </View>
            </If>
            <If when={warnings().length > 0}>
              <View class="gap-1 rounded-(--radius) border border-warning/40 bg-warning/10 px-3 py-2.5">
                <Text class="text-xs font-semibold text-warning">NaiveProxy 安全与兼容提示</Text>
                <Text class="text-xs text-foreground">{warnings().map((w) => `• ${w.message}`).join("\n")}</Text>
              </View>
            </If>

            <If when={tab() === "basic"}>
              <View class="gap-3">
                <View class={rowStackClass()}>
                  <View class="flex-1 gap-1.5">
                    <Text class="text-xs font-medium text-foreground">节点名称 (留空自动使用服务器域名)</Text>
                    <Input
                      testID="field-name"
                      accessibilityLabel="节点名称"
                      value={syncFromProps().name}
                      onChange={({ value }) => updateDraft((cur) => ({ ...cur, name: value }))}
                      placeholder="例如：东京 Naive QUIC"
                      class={CLS.input}
                    />
                  </View>
                  <View class={compact() ? "gap-1.5" : "w-56 gap-1.5"}>
                    <View class="flex-row items-center justify-between gap-2">
                      <Text class="text-xs font-medium text-foreground">出站标签 (自动生成)</Text>
                      <Button
                        accessibilityLabel="自动生成标签"
                        onPress={() =>
                          updateDraft((cur) => ({
                            ...cur,
                            tag: generateUniqueNodeTag(
                              existingList().filter((item) => item.id !== cur.id),
                            ),
                          }))
                        }
                        class={`${CLS.btnBase} h-6 rounded-[6px] px-2 ${CLS.btnGhost}`}
                      >
                        <Text class="text-[11px] font-medium text-primary">自动生成</Text>
                      </Button>
                    </View>
                    <Input
                      testID="field-tag"
                      accessibilityLabel="出站标签"
                      value={syncFromProps().tag}
                      onChange={({ value }) => updateDraft((cur) => ({ ...cur, tag: value }))}
                      placeholder="留空保存时自动补全"
                      class={CLS.inputMono}
                    />
                  </View>
                </View>

                <View class={rowStackClass()}>
                  <View class="flex-1 gap-1.5">
                    <View class="flex-row items-center gap-1">
                      <Text class="text-xs font-medium text-foreground">服务器地址 (server)</Text>
                      <Text class="text-xs font-semibold text-destructive">*</Text>
                    </View>
                    <Input
                      testID="field-server"
                      accessibilityLabel="服务器地址"
                      value={syncFromProps().server}
                      onChange={({ value }) => updateDraft((cur) => ({ ...cur, server: value }))}
                      placeholder="example.com 或 IP 地址"
                      class={CLS.inputMono}
                    />
                  </View>
                  <View class={compact() ? "gap-1.5" : "w-64 gap-1.5"}>
                    <Text class="text-xs font-medium text-foreground">端口 (server_port · 默认 443)</Text>
                    <View class="flex-row flex-wrap gap-1.5">
                      <Each of={COMMON_SERVER_PORTS} key={(portVal) => portVal}>
                        {(portVal) => (
                          <Button
                            accessibilityLabel={`选择端口 ${portVal()}`}
                            onPress={() => {
                              portText.set(String(portVal()));
                              updateDraft((cur) => ({ ...cur, serverPort: portVal() }));
                            }}
                            class={`${CLS.btnBase} h-7 rounded-[7px] px-2 ${
                              syncFromProps().serverPort === portVal() ? CLS.btnPrimary : CLS.btnOutline
                            }`}
                          >
                            <Text
                              class={`font-mono text-[11px] font-medium ${
                                syncFromProps().serverPort === portVal()
                                  ? CLS.btnTextPrimary
                                  : CLS.btnTextFg
                              }`}
                            >
                              {String(portVal())}
                            </Text>
                          </Button>
                        )}
                      </Each>
                    </View>
                    <Input
                      testID="field-port"
                      accessibilityLabel="端口"
                      value={portText()}
                      onChange={({ value }) => {
                        const digits = value.replace(/[^\d]/g, "");
                        portText.set(digits);
                        if (!digits) {
                          updateDraft((cur) => ({ ...cur, serverPort: 443 }));
                          return;
                        }
                        const num = Number.parseInt(digits, 10);
                        updateDraft((cur) => ({ ...cur, serverPort: Number.isFinite(num) ? num : 443 }));
                      }}
                      placeholder="443 (默认)"
                      class={CLS.inputMono}
                    />
                  </View>
                </View>

                <View class={rowStackClass()}>
                  <View class="flex-1 gap-1.5">
                    <Text class="text-xs font-medium text-foreground">认证用户名 (username)</Text>
                    <Input
                      testID="field-username"
                      accessibilityLabel="认证用户名"
                      value={syncFromProps().username}
                      onChange={({ value }) => updateDraft((cur) => ({ ...cur, username: value }))}
                      placeholder="可选（服务端未设认证可留空）"
                      class={CLS.inputMono}
                    />
                  </View>
                  <View class="flex-1 gap-1.5">
                    <Text class="text-xs font-medium text-foreground">认证密码 (password)</Text>
                    <Input
                      testID="field-password"
                      accessibilityLabel="认证密码"
                      masked
                      value={syncFromProps().password}
                      onChange={({ value }) => updateDraft((cur) => ({ ...cur, password: value }))}
                      placeholder="可选"
                      class={CLS.input}
                    />
                  </View>
                </View>

                <View class="gap-1.5">
                  <Text class="text-xs font-medium text-foreground">并发隧道数 (insecure_concurrency)</Text>
                  <Select
                    accessibilityLabel="并发隧道数"
                    items={CONCURRENCY_OPTIONS}
                    value={concurrencySelectValue()}
                    onChange={({ value }) => {
                      const parsed = Number.parseInt(value ?? "0", 10);
                      updateDraft((cur) => ({
                        ...cur,
                        insecureConcurrency: Number.isFinite(parsed) ? parsed : 0,
                      }));
                    }}
                    trigger={
                      <View testID="field-concurrency" class={CLS.selectTrigger}>
                        <Text class="text-xs text-foreground">
                          {titleFor(CONCURRENCY_OPTIONS, concurrencySelectValue())}
                        </Text>
                        <Text class="text-[10px] text-muted-foreground">▾</Text>
                      </View>
                    }
                    popupClass={CLS.selectPopup}
                    listClass={CLS.selectList}
                    itemClass={CLS.selectItem}
                    renderItem={(item) => <Text class={CLS.selectItemText}>{item.title}</Text>}
                  />
                  <Text class="text-[11px] text-muted-foreground">
                    默认 0（单连接抗流量分析最佳），直接选择即可，无需手动输入。
                  </Text>
                </View>
              </View>
            </If>

            <If when={tab() === "transport"}>
              <View class="gap-3.5">
                <View class="flex-row items-center justify-between gap-3">
                  <View class="flex-1 gap-0.5">
                    <Text class="text-xs font-medium text-foreground">启用 QUIC 传输 (quic)</Text>
                    <Text class="text-[11px] text-muted-foreground">
                      开启后使用 HTTP/3 (QUIC) 替代默认 HTTP/2；高丢包环境下表现更佳。
                    </Text>
                  </View>
                  <Switch
                    testID="field-quic"
                    accessibilityLabel="启用 QUIC 传输"
                    checked={syncFromProps().quic}
                    onChange={({ checked }) => updateDraft((cur) => ({ ...cur, quic: checked }))}
                    class={CLS.switchRoot}
                    trackClass={CLS.switchTrack}
                    thumbClass={CLS.switchThumb}
                  />
                </View>

                <If when={syncFromProps().quic}>
                  <View class={`${rowStackClass()} rounded-[12px] border border-border bg-muted/40 p-3`}>
                    <View class="flex-1 gap-1.5">
                      <Text class="text-xs font-medium text-foreground">QUIC 拥塞控制 (quic_congestion_control)</Text>
                      <Select
                        accessibilityLabel="QUIC 拥塞控制"
                        items={QUIC_CONGESTION_OPTIONS}
                        value={syncFromProps().quicCongestionControl}
                        onChange={({ value }) =>
                          updateDraft((cur) => ({
                            ...cur,
                            quicCongestionControl: (value ?? "") as QuicCongestionControl,
                          }))
                        }
                        trigger={
                          <View testID="field-quic-cc" class={CLS.selectTrigger}>
                            <Text class="text-xs text-foreground">
                              {titleFor(QUIC_CONGESTION_OPTIONS, syncFromProps().quicCongestionControl)}
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
                      <Text class="text-xs font-medium text-foreground">
                        QUIC 会话接收窗口 (quic_session_receive_window)
                      </Text>
                      <Select
                        accessibilityLabel="QUIC 会话接收窗口"
                        items={withCustomOption(QUIC_WINDOW_OPTIONS)}
                        value={
                          customQuicWindow() ? CUSTOM_SENTINEL : syncFromProps().quicSessionReceiveWindow
                        }
                        onChange={({ value }) => {
                          if (value === CUSTOM_SENTINEL) {
                            customQuicWindow.set(true);
                            if (!syncFromProps().quicSessionReceiveWindow) {
                              updateDraft((cur) => ({ ...cur, quicSessionReceiveWindow: "15 MB" }));
                            }
                          } else {
                            customQuicWindow.set(false);
                            updateDraft((cur) => ({ ...cur, quicSessionReceiveWindow: value ?? "" }));
                          }
                        }}
                        trigger={
                          <View class={CLS.selectTrigger}>
                            <Text class="text-xs text-foreground">
                              {customQuicWindow()
                                ? `自定义 (${syncFromProps().quicSessionReceiveWindow || "未填"})`
                                : titleFor(QUIC_WINDOW_OPTIONS, syncFromProps().quicSessionReceiveWindow)}
                            </Text>
                            <Text class="text-[10px] text-muted-foreground">▾</Text>
                          </View>
                        }
                        popupClass={CLS.selectPopup}
                        listClass={CLS.selectList}
                        itemClass={CLS.selectItem}
                        renderItem={(item) => <Text class={CLS.selectItemText}>{item.title}</Text>}
                      />
                      <If when={customQuicWindow()}>
                        <Input
                          testID="field-quic-window"
                          accessibilityLabel="自定义 QUIC 会话接收窗口"
                          value={syncFromProps().quicSessionReceiveWindow}
                          onChange={({ value }) =>
                            updateDraft((cur) => ({ ...cur, quicSessionReceiveWindow: value }))
                          }
                          placeholder="15 MB"
                          class={CLS.inputMono}
                        />
                      </If>
                    </View>
                  </View>
                </If>

                <View class={rowStackClass()}>
                  <View class="flex-1 gap-1.5">
                    <Text class="text-xs font-medium text-foreground">流接收窗口 (stream_receive_window)</Text>
                    <Select
                      accessibilityLabel="流接收窗口"
                      items={withCustomOption(STREAM_WINDOW_OPTIONS)}
                      value={
                        customStreamWindow() ? CUSTOM_SENTINEL : syncFromProps().streamReceiveWindow
                      }
                      onChange={({ value }) => {
                        if (value === CUSTOM_SENTINEL) {
                          customStreamWindow.set(true);
                          if (!syncFromProps().streamReceiveWindow) {
                            updateDraft((cur) => ({
                              ...cur,
                              streamReceiveWindow: cur.quic ? "6 MB" : "64 MB",
                            }));
                          }
                        } else {
                          customStreamWindow.set(false);
                          updateDraft((cur) => ({ ...cur, streamReceiveWindow: value ?? "" }));
                        }
                      }}
                      trigger={
                        <View class={CLS.selectTrigger}>
                          <Text class="text-xs text-foreground">
                            {customStreamWindow()
                              ? `自定义 (${syncFromProps().streamReceiveWindow || "未填"})`
                              : titleFor(STREAM_WINDOW_OPTIONS, syncFromProps().streamReceiveWindow)}
                          </Text>
                          <Text class="text-[10px] text-muted-foreground">▾</Text>
                        </View>
                      }
                      popupClass={CLS.selectPopup}
                      listClass={CLS.selectList}
                      itemClass={CLS.selectItem}
                      renderItem={(item) => <Text class={CLS.selectItemText}>{item.title}</Text>}
                    />
                    <If when={customStreamWindow()}>
                      <Input
                        testID="field-stream-window"
                        accessibilityLabel="自定义流接收窗口"
                        value={syncFromProps().streamReceiveWindow}
                        onChange={({ value }) =>
                          updateDraft((cur) => ({ ...cur, streamReceiveWindow: value }))
                        }
                        placeholder={syncFromProps().quic ? "6 MB" : "128 MB"}
                        class={CLS.inputMono}
                      />
                    </If>
                  </View>
                  <View class="flex-1 gap-1.5">
                    <Text class="text-xs font-medium text-foreground">UDP over TCP (udp_over_tcp)</Text>
                    <Select
                      accessibilityLabel="UDP over TCP"
                      items={UOT_MODE_OPTIONS}
                      value={syncFromProps().udpOverTcpMode}
                      onChange={({ value }) =>
                        updateDraft((c) => ({ ...c, udpOverTcpMode: (value ?? "off") as UdpOverTcpMode }))
                      }
                      trigger={
                        <View testID="field-uot" class={CLS.selectTrigger}>
                          <Text class="text-xs text-foreground">
                            {titleFor(UOT_MODE_OPTIONS, syncFromProps().udpOverTcpMode)}
                          </Text>
                          <Text class="text-[10px] text-muted-foreground">▾</Text>
                        </View>
                      }
                      popupClass={CLS.selectPopup}
                      listClass={CLS.selectList}
                      itemClass={CLS.selectItem}
                      renderItem={(item) => <Text class={CLS.selectItemText}>{item.title}</Text>}
                    />
                    <Text class="text-[11px] text-muted-foreground">通过 TCP 隧道封装 UDP 流量</Text>
                  </View>
                </View>

                <View class={CLS.separatorH} />

                <View class="gap-2">
                  <View class="flex-row flex-wrap items-center justify-between gap-2">
                    <View class="min-w-0 flex-1 gap-0.5">
                      <Text class="text-xs font-medium text-foreground">额外 HTTP 请求头 (extra_headers)</Text>
                      <Text class="text-[11px] text-muted-foreground">
                        在隧道 HTTP 握手请求中附加自定义 Header（相同 Key 会自动合并为数组）。
                      </Text>
                    </View>
                    <View class="flex-row flex-wrap items-center gap-1.5">
                      <View class="w-40">
                        <Select
                          accessibilityLabel="插入常用 Header"
                          items={COMMON_HEADER_TEMPLATES}
                          value=""
                          onChange={({ value }) => {
                            const template = COMMON_HEADER_TEMPLATES.find((item) => item.value === value);
                            if (!template) return;
                            updateDraft((cur) => {
                              cur.extraHeaders.push({
                                key: template.key,
                                value: template.headerValue,
                              });
                              return cur;
                            });
                          }}
                          trigger={
                            <View class={`${CLS.selectTrigger} h-8 px-2.5`}>
                              <Text class="text-xs text-foreground">+ 常用 Header</Text>
                              <Text class="text-[10px] text-muted-foreground">▾</Text>
                            </View>
                          }
                          popupClass={CLS.selectPopup}
                          listClass={CLS.selectList}
                          itemClass={CLS.selectItem}
                          renderItem={(item) => <Text class={CLS.selectItemText}>{item.title}</Text>}
                        />
                      </View>
                      <Button
                        testID="add-header-btn"
                        accessibilityLabel="添加 Header"
                        onPress={addHeader}
                        class={`${CLS.btnBase} ${CLS.btnSm} ${CLS.btnOutline}`}
                      >
                        <Text class={`text-xs font-medium ${CLS.btnTextFg}`}>+ 自定义</Text>
                      </Button>
                    </View>
                  </View>

                  <If when={syncFromProps().extraHeaders.length === 0}>
                    <Text class="text-xs text-muted-foreground">暂无自定义 Header。</Text>
                  </If>

                  <Each of={syncFromProps().extraHeaders} key={(_, idx) => idx}>
                    {(entry, idx) => (
                      <View class={compact() ? "gap-2 rounded-[10px] border border-border/70 bg-muted/20 p-2.5" : "flex-row items-center gap-2"}>
                        <Input
                          testID={`header-key-${idx()}`}
                          accessibilityLabel={`Header 名称 ${idx() + 1}`}
                          value={entry().key}
                          onChange={({ value }) => updateHeader(idx(), { key: value })}
                          placeholder="Header 名称，如 User-Agent"
                          class={compact() ? CLS.inputMono : `${CLS.inputMono} flex-1`}
                        />
                        <Input
                          testID={`header-val-${idx()}`}
                          accessibilityLabel={`Header 值 ${idx() + 1}`}
                          value={entry().value}
                          onChange={({ value }) => updateHeader(idx(), { value: value })}
                          placeholder="Header 值"
                          class={compact() ? CLS.inputMono : `${CLS.inputMono} flex-1`}
                        />
                        <Button
                          accessibilityLabel="移除"
                          onPress={() => removeHeader(idx())}
                          class={`${CLS.btnBase} ${CLS.btnSm} ${CLS.btnGhost}`}
                        >
                          <Text class={`text-xs font-medium ${CLS.btnTextFg}`}>移除</Text>
                        </Button>
                      </View>
                    )}
                  </Each>
                </View>
              </View>
            </If>

            <If when={tab() === "tls"}>
              <View class="gap-3.5">
                <View class="gap-1 rounded-(--radius) border border-info/40 bg-info/10 px-3 py-2.5">
                  <Text class="text-xs font-semibold text-info">NaiveProxy TLS 约束说明</Text>
                  <Text class="text-xs text-foreground">
                    sing-box 的 naive 出站仅支持 tls.server_name、tls.certificate、tls.certificate_path 与 tls.ech；为保持 Chromium 级 TLS 指纹一致性，其余 TLS 选项不可配置。
                  </Text>
                </View>

                <View class="gap-2 rounded-(--radius) border border-border bg-muted/30 p-3">
                  <View class="flex-row items-center justify-between gap-3">
                    <View class="flex-1 gap-0.5">
                      <Text class="text-xs font-medium text-foreground">TLS 服务器名称 SNI (tls.server_name)</Text>
                      <Text class="text-[11px] text-muted-foreground">
                        {customSni()
                          ? "已启用自定义 SNI（仅 CDN/域名伪装或 IP 直连需要）"
                          : `当前自动跟随服务器域名 (${syncFromProps().server || "未设置"})`}
                      </Text>
                    </View>
                    <Button
                      accessibilityLabel="切换 SNI 模式"
                      onPress={() => {
                        if (customSni()) {
                          customSni.set(false);
                          updateDraft((cur) => {
                            cur.tls.serverName = "";
                            return cur;
                          });
                        } else {
                          customSni.set(true);
                        }
                      }}
                      class={`${CLS.btnBase} ${CLS.btnSm} ${customSni() ? CLS.btnPrimary : CLS.btnOutline}`}
                    >
                      <Text class={`text-xs font-medium ${customSni() ? CLS.btnTextPrimary : CLS.btnTextFg}`}>
                        {customSni() ? "切回自动跟随" : "指定自定义 SNI"}
                      </Text>
                    </Button>
                  </View>
                  <If when={customSni()}>
                    <Input
                      testID="field-sni"
                      accessibilityLabel="TLS 服务器名称"
                      value={syncFromProps().tls.serverName}
                      onChange={({ value }) =>
                        updateDraft((cur) => {
                          cur.tls.serverName = value;
                          return cur;
                        })
                      }
                      placeholder="输入伪装域名或证书 CN"
                      class={CLS.inputMono}
                    />
                  </If>
                </View>

                <View class={CLS.separatorH} />

                <View class="flex-row items-center justify-between gap-3">
                  <View class="flex-1 gap-0.5">
                    <Text class="text-xs font-medium text-foreground">
                      启用 Encrypted Client Hello (tls.ech.enabled)
                    </Text>
                    <Text class="text-[11px] text-muted-foreground">
                      隐藏握手阶段的真实 SNI；支持快捷选择 ECH 查询域名或导入配置。
                    </Text>
                  </View>
                  <Switch
                    testID="field-ech-enabled"
                    accessibilityLabel="启用 ECH"
                    checked={syncFromProps().tls.ech.enabled}
                    onChange={({ checked }) =>
                      updateDraft((cur) => {
                        cur.tls.ech.enabled = checked;
                        return cur;
                      })
                    }
                    class={CLS.switchRoot}
                    trackClass={CLS.switchTrack}
                    thumbClass={CLS.switchThumb}
                  />
                </View>

                <View class={rowStackClass()}>
                  <View class="flex-1 gap-1.5">
                    <Text class="text-xs font-medium text-foreground">ECH DNS 查询域名 (query_server_name)</Text>
                    <View class="flex-row flex-wrap gap-1.5">
                      <Each of={ECH_QUERY_SERVER_PRESETS} key={(preset) => preset || "auto"}>
                        {(preset) => (
                          <Button
                            accessibilityLabel={`ECH 预设 ${preset() || "自动"}`}
                            onPress={() =>
                              updateDraft((cur) => {
                                cur.tls.ech.queryServerName = preset();
                                return cur;
                              })
                            }
                            class={`${CLS.btnBase} h-7 rounded-[7px] px-2 ${
                              syncFromProps().tls.ech.queryServerName === preset()
                                ? CLS.btnPrimary
                                : CLS.btnOutline
                            }`}
                          >
                            <Text
                              class={`text-[11px] font-medium ${
                                syncFromProps().tls.ech.queryServerName === preset()
                                  ? CLS.btnTextPrimary
                                  : CLS.btnTextFg
                              }`}
                            >
                              {preset() || "自动 (默认)"}
                            </Text>
                          </Button>
                        )}
                      </Each>
                    </View>
                    <Input
                      testID="field-ech-query"
                      accessibilityLabel="ECH 查询域名"
                      value={syncFromProps().tls.ech.queryServerName}
                      onChange={({ value }) =>
                        updateDraft((cur) => {
                          cur.tls.ech.queryServerName = value;
                          return cur;
                        })
                      }
                      placeholder="留空自动使用服务器域名，或点选上方预设"
                      class={CLS.inputMono}
                    />
                  </View>
                  <View class="flex-1 gap-1.5">
                    <Text class="text-xs font-medium text-foreground">ECH 配置文件路径 (config_path)</Text>
                    <Input
                      testID="field-ech-path"
                      accessibilityLabel="ECH 配置文件路径"
                      value={syncFromProps().tls.ech.configPath}
                      onChange={({ value }) =>
                        updateDraft((cur) => {
                          cur.tls.ech.configPath = value;
                          return cur;
                        })
                      }
                      placeholder="/path/to/ech.pem"
                      class={CLS.inputMono}
                    />
                  </View>
                </View>

                <View class="gap-1.5">
                  <Text class="text-xs font-medium text-foreground">内联 ECH 配置 (tls.ech.config)</Text>
                  <Input
                    testID="field-ech-config"
                    accessibilityLabel="内联 ECH 配置"
                    multiline
                    value={syncFromProps().tls.ech.configText}
                    onChange={({ value }) =>
                      updateDraft((cur) => {
                        cur.tls.ech.configText = value;
                        return cur;
                      })
                    }
                    placeholder="-----BEGIN ECH CONFIGS-----"
                    class={CLS.textareaMono}
                  />
                  <View class="flex-row items-center justify-between gap-2">
                    <Text class="text-[11px] text-muted-foreground">
                      每行一条 PEM / Base64 ECHConfig；点击右侧可从本地读取。
                    </Text>
                    <Button
                      accessibilityLabel="读取 ECH 文件"
                      onPress={() => void handlePickFile("ech")}
                      class={`${CLS.btnBase} ${CLS.btnSm} ${CLS.btnOutline}`}
                    >
                      <Text class={`text-xs font-medium ${CLS.btnTextFg}`}>读取 ECH 文件</Text>
                    </Button>
                  </View>
                </View>

                <View class="gap-2.5 rounded-(--radius) border border-border bg-muted/30 p-3">
                  <View class="flex-row items-center justify-between gap-2">
                    <View class="flex-1 gap-0.5">
                      <Text class="text-xs font-medium text-foreground">自定义/自签证书选项（仅特殊测试环境）</Text>
                      <Text class="text-[11px] text-muted-foreground">常规受信任 HTTPS 节点无需填写证书字段</Text>
                    </View>
                    <Button
                      accessibilityLabel="展开自签证书设置"
                      onPress={() => showCertAdvanced.set(!showCertAdvanced())}
                      class={`${CLS.btnBase} ${CLS.btnSm} ${CLS.btnGhost}`}
                    >
                      <Text class="text-xs font-medium text-primary">
                        {showCertAdvanced() ? "收起" : "展开"}
                      </Text>
                    </Button>
                  </View>
                  <If when={showCertAdvanced()}>
                    <View class="gap-3">
                      <View class={rowStackClass()}>
                        <View class="flex-1 gap-1.5">
                          <Text class="text-xs font-medium text-foreground">证书文件路径 (tls.certificate_path)</Text>
                          <Input
                            testID="field-cert-path"
                            accessibilityLabel="证书文件路径"
                            value={syncFromProps().tls.certificatePath}
                            onChange={({ value }) =>
                              updateDraft((cur) => {
                                cur.tls.certificatePath = value;
                                return cur;
                              })
                            }
                            placeholder="/path/to/cert.pem"
                            class={CLS.inputMono}
                          />
                        </View>
                        <View class="justify-end pb-0.5">
                          <Button
                            accessibilityLabel="从文件导入 PEM"
                            onPress={() => void handlePickFile("cert")}
                            class={`${CLS.btnBase} ${CLS.btnMd} ${CLS.btnOutline}`}
                          >
                            <Text class={`text-sm font-medium ${CLS.btnTextFg}`}>从文件导入 PEM</Text>
                          </Button>
                        </View>
                      </View>

                      <View class="gap-1.5">
                        <Text class="text-xs font-medium text-foreground">内联证书内容 (tls.certificate)</Text>
                        <Input
                          testID="field-cert-text"
                          accessibilityLabel="内联证书内容"
                          multiline
                          value={syncFromProps().tls.certificateText}
                          onChange={({ value }) =>
                            updateDraft((cur) => {
                              cur.tls.certificateText = value;
                              return cur;
                            })
                          }
                          placeholder="-----BEGIN CERTIFICATE-----"
                          class={CLS.textareaMono}
                        />
                      </View>
                    </View>
                  </If>
                </View>
              </View>
            </If>

            <If when={tab() === "dial"}>
              <View class="gap-3.5">
                <View class={rowStackClass()}>
                  <View class="flex-1 gap-1.5">
                    <Text class="text-xs font-medium text-foreground">上游出站 detour</Text>
                    <Select
                      accessibilityLabel="上游出站 detour"
                      items={detourOptions()}
                      value={customDetour() ? CUSTOM_SENTINEL : syncFromProps().dial.detour}
                      onChange={({ value }) => {
                        if (value === CUSTOM_SENTINEL) {
                          customDetour.set(true);
                        } else {
                          customDetour.set(false);
                          updateDraft((cur) => {
                            cur.dial.detour = value ?? "";
                            return cur;
                          });
                        }
                      }}
                      trigger={
                        <View testID="field-dial-detour-select" class={CLS.selectTrigger}>
                          <Text class="text-xs text-foreground">
                            {customDetour()
                              ? `自定义 (${syncFromProps().dial.detour || "未填"})`
                              : titleFor(detourOptions(), syncFromProps().dial.detour)}
                          </Text>
                          <Text class="text-[10px] text-muted-foreground">▾</Text>
                        </View>
                      }
                      popupClass={CLS.selectPopup}
                      listClass={CLS.selectList}
                      itemClass={CLS.selectItem}
                      renderItem={(item) => <Text class={CLS.selectItemText}>{item.title}</Text>}
                    />
                    <If when={customDetour()}>
                      <Input
                        testID="field-dial-detour"
                        accessibilityLabel="自定义上游出站 detour"
                        value={syncFromProps().dial.detour}
                        onChange={({ value }) =>
                          updateDraft((cur) => {
                            cur.dial.detour = value;
                            return cur;
                          })
                        }
                        placeholder="输入出站 tag"
                        class={CLS.inputMono}
                      />
                    </If>
                    <Text class="text-[11px] text-muted-foreground">直接从已有节点中选择前置跳板</Text>
                  </View>
                  <View class="flex-1 gap-1.5">
                    <Text class="text-xs font-medium text-foreground">连接超时 (connect_timeout)</Text>
                    <View class="flex-row flex-wrap gap-1.5">
                      <Each of={CONNECT_TIMEOUT_PRESETS} key={(preset) => preset || "default"}>
                        {(preset) => (
                          <Button
                            accessibilityLabel={`超时预设 ${preset() || "默认"}`}
                            onPress={() =>
                              updateDraft((cur) => {
                                cur.dial.connectTimeout = preset();
                                return cur;
                              })
                            }
                            class={`${CLS.btnBase} h-7 rounded-[7px] px-2 ${
                              syncFromProps().dial.connectTimeout === preset()
                                ? CLS.btnPrimary
                                : CLS.btnOutline
                            }`}
                          >
                            <Text
                              class={`font-mono text-[11px] font-medium ${
                                syncFromProps().dial.connectTimeout === preset()
                                  ? CLS.btnTextPrimary
                                  : CLS.btnTextFg
                              }`}
                            >
                              {preset() || "默认"}
                            </Text>
                          </Button>
                        )}
                      </Each>
                    </View>
                    <Input
                      testID="field-dial-timeout"
                      accessibilityLabel="连接超时"
                      value={syncFromProps().dial.connectTimeout}
                      onChange={({ value }) =>
                        updateDraft((cur) => {
                          cur.dial.connectTimeout = value;
                          return cur;
                        })
                      }
                      placeholder="留空为系统默认，或点选上方预设"
                      class={CLS.inputMono}
                    />
                  </View>
                </View>

                <View class={rowStackClass()}>
                  <View class="flex-1 gap-1.5">
                    <Text class="text-xs font-medium text-foreground">域名解析器 (domain_resolver)</Text>
                    <Select
                      accessibilityLabel="域名解析器"
                      items={DOMAIN_RESOLVER_OPTIONS}
                      value={syncFromProps().dial.domainResolver}
                      onChange={({ value }) =>
                        updateDraft((cur) => {
                          cur.dial.domainResolver = value ?? "dns-local";
                          return cur;
                        })
                      }
                      trigger={
                        <View testID="field-dial-resolver" class={CLS.selectTrigger}>
                          <Text class="text-xs text-foreground">
                            {titleFor(DOMAIN_RESOLVER_OPTIONS, syncFromProps().dial.domainResolver)}
                          </Text>
                          <Text class="text-[10px] text-muted-foreground">▾</Text>
                        </View>
                      }
                      popupClass={CLS.selectPopup}
                      listClass={CLS.selectList}
                      itemClass={CLS.selectItem}
                      renderItem={(item) => <Text class={CLS.selectItemText}>{item.title}</Text>}
                    />
                    <Text class="text-[11px] text-muted-foreground">默认 dns-local，已配置为可用解析器</Text>
                  </View>
                  <View class="flex-1 gap-1.5">
                    <Text class="text-xs font-medium text-foreground">解析策略 (domain_resolver.strategy)</Text>
                    <Select
                      accessibilityLabel="解析策略"
                      items={DOMAIN_STRATEGY_OPTIONS}
                      value={syncFromProps().dial.domainResolverStrategy}
                      onChange={({ value }) =>
                        updateDraft((c) => {
                          c.dial.domainResolverStrategy = (value ?? "") as DomainStrategy;
                          return c;
                        })
                      }
                      trigger={
                        <View class={CLS.selectTrigger}>
                          <Text class="text-xs text-foreground">
                            {titleFor(DOMAIN_STRATEGY_OPTIONS, syncFromProps().dial.domainResolverStrategy)}
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
                    <Text class="text-xs font-medium text-foreground">域名策略 (domain_strategy)</Text>
                    <Select
                      accessibilityLabel="域名策略"
                      items={DOMAIN_STRATEGY_OPTIONS}
                      value={syncFromProps().dial.domainStrategy}
                      onChange={({ value }) =>
                        updateDraft((c) => {
                          c.dial.domainStrategy = (value ?? "") as DomainStrategy;
                          return c;
                        })
                      }
                      trigger={
                        <View class={CLS.selectTrigger}>
                          <Text class="text-xs text-foreground">
                            {titleFor(DOMAIN_STRATEGY_OPTIONS, syncFromProps().dial.domainStrategy)}
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
                  <View class="flex-1 gap-1.5">
                    <Text class="text-xs font-medium text-foreground">TCP Keep-Alive 周期</Text>
                    <Select
                      accessibilityLabel="TCP Keep-Alive 周期"
                      items={withCustomOption(KEEP_ALIVE_OPTIONS)}
                      value={customKeepAlive() ? CUSTOM_SENTINEL : syncFromProps().dial.tcpKeepAlive}
                      onChange={({ value }) => {
                        if (value === CUSTOM_SENTINEL) {
                          customKeepAlive.set(true);
                          if (!syncFromProps().dial.tcpKeepAlive) {
                            updateDraft((cur) => {
                              cur.dial.tcpKeepAlive = "5m";
                              return cur;
                            });
                          }
                        } else {
                          customKeepAlive.set(false);
                          updateDraft((cur) => {
                            cur.dial.tcpKeepAlive = value ?? "";
                            return cur;
                          });
                        }
                      }}
                      trigger={
                        <View class={CLS.selectTrigger}>
                          <Text class="text-xs text-foreground">
                            {customKeepAlive()
                              ? `自定义 (${syncFromProps().dial.tcpKeepAlive || "未填"})`
                              : titleFor(KEEP_ALIVE_OPTIONS, syncFromProps().dial.tcpKeepAlive)}
                          </Text>
                          <Text class="text-[10px] text-muted-foreground">▾</Text>
                        </View>
                      }
                      popupClass={CLS.selectPopup}
                      listClass={CLS.selectList}
                      itemClass={CLS.selectItem}
                      renderItem={(item) => <Text class={CLS.selectItemText}>{item.title}</Text>}
                    />
                    <If when={customKeepAlive()}>
                      <Input
                        accessibilityLabel="自定义 TCP Keep-Alive 周期"
                        value={syncFromProps().dial.tcpKeepAlive}
                        onChange={({ value }) =>
                          updateDraft((cur) => {
                            cur.dial.tcpKeepAlive = value;
                            return cur;
                          })
                        }
                        placeholder="5m"
                        class={CLS.inputMono}
                      />
                    </If>
                  </View>
                  <View class="flex-1 gap-1.5">
                    <Text class="text-xs font-medium text-foreground">TCP Keep-Alive 间隔</Text>
                    <Select
                      accessibilityLabel="TCP Keep-Alive 间隔"
                      items={withCustomOption(KEEP_ALIVE_OPTIONS)}
                      value={
                        customKeepAliveInterval()
                          ? CUSTOM_SENTINEL
                          : syncFromProps().dial.tcpKeepAliveInterval
                      }
                      onChange={({ value }) => {
                        if (value === CUSTOM_SENTINEL) {
                          customKeepAliveInterval.set(true);
                          if (!syncFromProps().dial.tcpKeepAliveInterval) {
                            updateDraft((cur) => {
                              cur.dial.tcpKeepAliveInterval = "75s";
                              return cur;
                            });
                          }
                        } else {
                          customKeepAliveInterval.set(false);
                          updateDraft((cur) => {
                            cur.dial.tcpKeepAliveInterval = value ?? "";
                            return cur;
                          });
                        }
                      }}
                      trigger={
                        <View class={CLS.selectTrigger}>
                          <Text class="text-xs text-foreground">
                            {customKeepAliveInterval()
                              ? `自定义 (${syncFromProps().dial.tcpKeepAliveInterval || "未填"})`
                              : titleFor(KEEP_ALIVE_OPTIONS, syncFromProps().dial.tcpKeepAliveInterval)}
                          </Text>
                          <Text class="text-[10px] text-muted-foreground">▾</Text>
                        </View>
                      }
                      popupClass={CLS.selectPopup}
                      listClass={CLS.selectList}
                      itemClass={CLS.selectItem}
                      renderItem={(item) => <Text class={CLS.selectItemText}>{item.title}</Text>}
                    />
                    <If when={customKeepAliveInterval()}>
                      <Input
                        accessibilityLabel="自定义 TCP Keep-Alive 间隔"
                        value={syncFromProps().dial.tcpKeepAliveInterval}
                        onChange={({ value }) =>
                          updateDraft((cur) => {
                            cur.dial.tcpKeepAliveInterval = value;
                            return cur;
                          })
                        }
                        placeholder="75s"
                        class={CLS.inputMono}
                      />
                    </If>
                  </View>
                  <View class="flex-1 gap-1.5">
                    <Text class="text-xs font-medium text-foreground">回退延迟 (fallback_delay)</Text>
                    <Select
                      accessibilityLabel="回退延迟"
                      items={withCustomOption(FALLBACK_DELAY_OPTIONS)}
                      value={
                        customFallbackDelay()
                          ? CUSTOM_SENTINEL
                          : syncFromProps().dial.fallbackDelay
                      }
                      onChange={({ value }) => {
                        if (value === CUSTOM_SENTINEL) {
                          customFallbackDelay.set(true);
                          if (!syncFromProps().dial.fallbackDelay) {
                            updateDraft((cur) => {
                              cur.dial.fallbackDelay = "300ms";
                              return cur;
                            });
                          }
                        } else {
                          customFallbackDelay.set(false);
                          updateDraft((cur) => {
                            cur.dial.fallbackDelay = value ?? "";
                            return cur;
                          });
                        }
                      }}
                      trigger={
                        <View class={CLS.selectTrigger}>
                          <Text class="text-xs text-foreground">
                            {customFallbackDelay()
                              ? `自定义 (${syncFromProps().dial.fallbackDelay || "未填"})`
                              : titleFor(FALLBACK_DELAY_OPTIONS, syncFromProps().dial.fallbackDelay)}
                          </Text>
                          <Text class="text-[10px] text-muted-foreground">▾</Text>
                        </View>
                      }
                      popupClass={CLS.selectPopup}
                      listClass={CLS.selectList}
                      itemClass={CLS.selectItem}
                      renderItem={(item) => <Text class={CLS.selectItemText}>{item.title}</Text>}
                    />
                    <If when={customFallbackDelay()}>
                      <Input
                        accessibilityLabel="自定义回退延迟"
                        value={syncFromProps().dial.fallbackDelay}
                        onChange={({ value }) =>
                          updateDraft((cur) => {
                            cur.dial.fallbackDelay = value;
                            return cur;
                          })
                        }
                        placeholder="300ms"
                        class={CLS.inputMono}
                      />
                    </If>
                  </View>
                </View>

                <View class={rowStackClass()}>
                  <View class="flex-1 gap-1.5">
                    <Text class="text-xs font-medium text-foreground">网络策略 (network_strategy · 移动端)</Text>
                    <Select
                      accessibilityLabel="网络策略"
                      items={NETWORK_STRATEGY_OPTIONS}
                      value={syncFromProps().dial.networkStrategy}
                      onChange={({ value }) =>
                        updateDraft((cur) => {
                          cur.dial.networkStrategy = (value ?? "") as NetworkStrategy;
                          return cur;
                        })
                      }
                      trigger={
                        <View class={CLS.selectTrigger}>
                          <Text class="text-xs text-foreground">
                            {titleFor(NETWORK_STRATEGY_OPTIONS, syncFromProps().dial.networkStrategy)}
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

                <View class="gap-2.5 rounded-(--radius) border border-border bg-muted/30 p-3">
                  <View class="flex-row items-center justify-between gap-2">
                    <View class="flex-1 gap-0.5">
                      <Text class="text-xs font-medium text-foreground">高级底层网络绑定（多网卡 / Linux 路由）</Text>
                      <Text class="text-[11px] text-muted-foreground">普通用户留空即可，默认由系统自动路由</Text>
                    </View>
                    <Button
                      accessibilityLabel="展开高级网络绑定"
                      onPress={() => showDialBindAdvanced.set(!showDialBindAdvanced())}
                      class={`${CLS.btnBase} ${CLS.btnSm} ${CLS.btnGhost}`}
                    >
                      <Text class="text-xs font-medium text-primary">
                        {showDialBindAdvanced() ? "收起" : "展开"}
                      </Text>
                    </Button>
                  </View>
                  <If when={showDialBindAdvanced()}>
                    <View class="gap-3">
                      <View class={rowStackClass()}>
                        <View class="flex-1 gap-1.5">
                          <Text class="text-xs font-medium text-foreground">绑定网卡 (bind_interface)</Text>
                          <Input
                            accessibilityLabel="绑定网卡"
                            value={syncFromProps().dial.bindInterface}
                            onChange={({ value }) =>
                              updateDraft((cur) => {
                                cur.dial.bindInterface = value;
                                return cur;
                              })
                            }
                            placeholder="eth0 / WLAN"
                            class={CLS.inputMono}
                          />
                        </View>
                        <View class="flex-1 gap-1.5">
                          <Text class="text-xs font-medium text-foreground">IPv4 绑定地址 (inet4_bind_address)</Text>
                          <Input
                            accessibilityLabel="IPv4 绑定地址"
                            value={syncFromProps().dial.inet4BindAddress}
                            onChange={({ value }) =>
                              updateDraft((cur) => {
                                cur.dial.inet4BindAddress = value;
                                return cur;
                              })
                            }
                            placeholder="0.0.0.0"
                            class={CLS.inputMono}
                          />
                        </View>
                        <View class="flex-1 gap-1.5">
                          <Text class="text-xs font-medium text-foreground">IPv6 绑定地址 (inet6_bind_address)</Text>
                          <Input
                            accessibilityLabel="IPv6 绑定地址"
                            value={syncFromProps().dial.inet6BindAddress}
                            onChange={({ value }) =>
                              updateDraft((cur) => {
                                cur.dial.inet6BindAddress = value;
                                return cur;
                              })
                            }
                            placeholder="::"
                            class={CLS.inputMono}
                          />
                        </View>
                      </View>
                      <View class={rowStackClass()}>
                        <View class="flex-1 gap-1.5">
                          <Text class="text-xs font-medium text-foreground">路由标记 (routing_mark · Linux)</Text>
                          <Input
                            accessibilityLabel="路由标记"
                            value={syncFromProps().dial.routingMark}
                            onChange={({ value }) =>
                              updateDraft((cur) => {
                                cur.dial.routingMark = value;
                                return cur;
                              })
                            }
                            placeholder="1234 或 0x1234"
                            class={CLS.inputMono}
                          />
                        </View>
                        <View class="flex-1 gap-1.5">
                          <Text class="text-xs font-medium text-foreground">网络命名空间 (netns · Linux)</Text>
                          <Input
                            accessibilityLabel="网络命名空间"
                            value={syncFromProps().dial.netns}
                            onChange={({ value }) =>
                              updateDraft((cur) => {
                                cur.dial.netns = value;
                                return cur;
                              })
                            }
                            placeholder="ns-name"
                            class={CLS.inputMono}
                          />
                        </View>
                      </View>
                    </View>
                  </If>
                </View>

                <View class="gap-2 rounded-(--radius) border border-border bg-muted/30 p-3">
                  <Text class="text-xs font-medium text-foreground">
                    首选 / 回退网络类型 (network_type / fallback_network_type)
                  </Text>
                  <View class="flex-row flex-wrap items-center gap-2">
                    <Text class="w-16 text-[11px] text-muted-foreground">首选:</Text>
                    <Each of={NETWORK_TYPE_OPTIONS} key={(t) => t}>
                      {(t) => (
                        <Toggle
                          accessibilityLabel={`首选网络 ${t()}`}
                          pressed={syncFromProps().dial.networkType.includes(t())}
                          onChange={({ pressed }) => setNetworkType("networkType", t(), pressed)}
                          class={CLS.togglePill}
                        >
                          <Text class={CLS.togglePillText}>{t()}</Text>
                        </Toggle>
                      )}
                    </Each>
                  </View>
                  <View class="flex-row flex-wrap items-center gap-2">
                    <Text class="w-16 text-[11px] text-muted-foreground">回退:</Text>
                    <Each of={NETWORK_TYPE_OPTIONS} key={(t) => t}>
                      {(t) => (
                        <Toggle
                          accessibilityLabel={`回退网络 ${t()}`}
                          pressed={syncFromProps().dial.fallbackNetworkType.includes(t())}
                          onChange={({ pressed }) => setNetworkType("fallbackNetworkType", t(), pressed)}
                          class={CLS.togglePill}
                        >
                          <Text class={CLS.togglePillText}>{t()}</Text>
                        </Toggle>
                      )}
                    </Each>
                  </View>
                </View>

                <View class="gap-2.5 rounded-(--radius) border border-border p-3">
                  <View class="flex-row items-center justify-between gap-3">
                    <Text class="flex-1 text-xs font-medium text-foreground">TCP Fast Open (tcp_fast_open)</Text>
                    <Switch
                      testID="field-dial-tfo"
                      accessibilityLabel="TCP Fast Open"
                      checked={syncFromProps().dial.tcpFastOpen}
                      onChange={({ checked }) =>
                        updateDraft((c) => {
                          c.dial.tcpFastOpen = checked;
                          return c;
                        })
                      }
                      class={CLS.switchRoot}
                      trackClass={CLS.switchTrack}
                      thumbClass={CLS.switchThumb}
                    />
                  </View>
                  <View class="flex-row items-center justify-between gap-3">
                    <Text class="flex-1 text-xs font-medium text-foreground">TCP Multi Path (tcp_multi_path)</Text>
                    <Switch
                      accessibilityLabel="TCP Multi Path"
                      checked={syncFromProps().dial.tcpMultiPath}
                      onChange={({ checked }) =>
                        updateDraft((c) => {
                          c.dial.tcpMultiPath = checked;
                          return c;
                        })
                      }
                      class={CLS.switchRoot}
                      trackClass={CLS.switchTrack}
                      thumbClass={CLS.switchThumb}
                    />
                  </View>
                  <View class="flex-row items-center justify-between gap-3">
                    <Text class="flex-1 text-xs font-medium text-foreground">重用监听地址 (reuse_addr)</Text>
                    <Switch
                      accessibilityLabel="重用监听地址"
                      checked={syncFromProps().dial.reuseAddr}
                      onChange={({ checked }) =>
                        updateDraft((c) => {
                          c.dial.reuseAddr = checked;
                          return c;
                        })
                      }
                      class={CLS.switchRoot}
                      trackClass={CLS.switchTrack}
                      thumbClass={CLS.switchThumb}
                    />
                  </View>
                  <View class="flex-row items-center justify-between gap-3">
                    <Text class="flex-1 text-xs font-medium text-foreground">
                      禁用 TCP Keep-Alive (disable_tcp_keep_alive)
                    </Text>
                    <Switch
                      accessibilityLabel="禁用 TCP Keep-Alive"
                      checked={syncFromProps().dial.disableTcpKeepAlive}
                      onChange={({ checked }) =>
                        updateDraft((c) => {
                          c.dial.disableTcpKeepAlive = checked;
                          return c;
                        })
                      }
                      class={CLS.switchRoot}
                      trackClass={CLS.switchTrack}
                      thumbClass={CLS.switchThumb}
                    />
                  </View>
                  <View class="flex-row items-center justify-between gap-3">
                    <Text class="flex-1 text-xs font-medium text-foreground">UDP 分段 (udp_fragment)</Text>
                    <Switch
                      accessibilityLabel="UDP 分段"
                      checked={syncFromProps().dial.udpFragment}
                      onChange={({ checked }) =>
                        updateDraft((c) => {
                          c.dial.udpFragment = checked;
                          return c;
                        })
                      }
                      class={CLS.switchRoot}
                      trackClass={CLS.switchTrack}
                      thumbClass={CLS.switchThumb}
                    />
                  </View>
                  <View class="flex-row items-center justify-between gap-3">
                    <Text class="flex-1 text-xs font-medium text-foreground">
                      IP_BIND_ADDRESS_NO_PORT (bind_address_no_port · Linux)
                    </Text>
                    <Switch
                      accessibilityLabel="IP_BIND_ADDRESS_NO_PORT"
                      checked={syncFromProps().dial.bindAddressNoPort}
                      onChange={({ checked }) =>
                        updateDraft((c) => {
                          c.dial.bindAddressNoPort = checked;
                          return c;
                        })
                      }
                      class={CLS.switchRoot}
                      trackClass={CLS.switchTrack}
                      thumbClass={CLS.switchThumb}
                    />
                  </View>
                </View>
              </View>
            </If>
          </View>
        </Scroll>

        <View style={{ paddingBottom: compact() ? Math.max(getSafeInsets().bottom, 12) : 12 }} class="shrink-0 flex-row flex-wrap items-center justify-between gap-2 border-t border-border bg-muted/40 px-4 pt-3">
          <Text class="text-xs text-muted-foreground">
            {errors().length > 0
              ? `尚有 ${errors().length} 项校验错误`
              : warnings().length > 0
                ? `校验通过，含 ${warnings().length} 条安全提示`
                : "协议配置校验通过"}
          </Text>
          <View class="flex-row items-center gap-2">
            <Button
              accessibilityLabel="取消"
              onPress={props.onClose}
              class={`${CLS.btnBase} ${CLS.btnMd} ${CLS.btnOutline}`}
            >
              <Text class={`text-sm font-medium ${CLS.btnTextFg}`}>取消</Text>
            </Button>
            <Button
              testID="save-node-btn"
              accessibilityLabel="保存节点"
              disabled={errors().length > 0}
              onPress={() => {
                const prepared = prepareNodeProfileForSave(cloneProfile(draft()), existingList());
                props.onSave(prepared);
              }}
              class={`${CLS.btnBase} ${CLS.btnMd} ${CLS.btnPrimary}`}
            >
              <Text class={`text-sm font-medium ${CLS.btnTextPrimary}`}>保存节点</Text>
            </Button>
          </View>
        </View>
      </View>
    </Dialog>
  );
}
