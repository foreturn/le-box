import { Clipboard, Scroll, signal, Text, View } from "nsh";
import { Button, Dialog, Input } from "nsh/base";
import { isCompactLayout } from "../core/layout";
import {
  buildNodeOutbound,
  createDefaultNodeProfile,
  exportNodeUri,
  generateUniqueNodeTag,
  getProtocolMeta,
  importNodeProfilesFromInput,
  validateNodeProfile,
} from "../core/nodeProtocols";
import { CLS } from "../styles";
import type { NodeProfile } from "../types/singbox";
import { NodeEditorModal } from "./NodeEditorModal";

export function NodesPage(props: {
  profiles: () => NodeProfile[];
  activeProfileId: () => string | null;
  coreRunning: () => boolean;
  delays: () => Record<string, number | "testing" | "error">;
  onSelectActive: (id: string) => void;
  onUpsertProfile: (profile: NodeProfile) => void;
  onDeleteProfile: (id: string) => void;
  onImportProfiles: (profiles: NodeProfile[]) => void;
  onTestDelay: (profile: NodeProfile) => void;
  onTestAllDelays?: () => void;
  onToast: (msg: string, tone?: "info" | "success" | "warning" | "error") => void;
}) {
  const editorOpen = signal(false);
  const editingProfile = signal<NodeProfile | null>(null);
  const importOpen = signal(false);
  const importText = signal("");
  const importError = signal<string | null>(null);
  const compact = () => isCompactLayout();

  const openCreate = () => {
    editingProfile.set(null);
    editorOpen.set(true);
  };

  const openEdit = (profile: NodeProfile) => {
    editingProfile.set(profile);
    editorOpen.set(true);
  };

  const duplicateNode = (profile: NodeProfile) => {
    const clonedRaw = JSON.parse(JSON.stringify(profile)) as NodeProfile;
    const copy = createDefaultNodeProfile(profile.protocol ?? "naive", {
      ...clonedRaw,
      id: `node-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      name: `${profile.name} (副本)`,
      tag: generateUniqueNodeTag(props.profiles(), `${profile.tag}-copy`),
    });
    props.onUpsertProfile(copy);
    props.onToast(`已复制节点 ${profile.name}`, "success");
  };

  const copyUri = async (profile: NodeProfile) => {
    try {
      await Clipboard.writeText(exportNodeUri(profile));
      props.onToast(`已复制 ${profile.name} 的节点 URI`, "success");
    } catch (err) {
      props.onToast(`复制失败: ${String(err)}`, "error");
    }
  };

  const copyOutboundJson = async (profile: NodeProfile) => {
    try {
      const json = JSON.stringify(buildNodeOutbound(profile), null, 2);
      await Clipboard.writeText(json);
      props.onToast(`已复制 ${profile.name} 的 sing-box 出站 JSON`, "success");
    } catch (err) {
      props.onToast(`复制失败: ${String(err)}`, "error");
    }
  };

  const handleImportSubmit = () => {
    try {
      importError.set(null);
      const parsed = importNodeProfilesFromInput(importText());
      props.onImportProfiles(parsed);
      importOpen.set(false);
      importText.set("");
      props.onToast(`成功导入 ${parsed.length} 个节点`, "success");
    } catch (err) {
      importError.set(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <View class="flex-1 gap-4">
      <View class={compact() ? "gap-2.5" : "flex-row flex-wrap items-center justify-between gap-3"}>
        <View class="min-w-0 flex-1 gap-0.5">
          <Text class="text-sm font-semibold text-foreground">节点管理</Text>
          <Text class="text-xs text-muted-foreground">
            统一管理多协议出站节点；新建节点时可选择协议（当前支持 NaiveProxy，后续将支持更多协议）
          </Text>
        </View>
        <View class="flex-row flex-wrap items-center gap-2">
          <If when={props.onTestAllDelays}>
            {(fn) => (
              <Button
                testID="test-all-delays-btn"
                accessibilityLabel="全部测速"
                disabled={!props.coreRunning() || props.profiles().length === 0}
                onPress={fn()}
                class={`${CLS.btnBase} ${CLS.btnMd} ${CLS.btnOutline}`}
              >
                <Text class={`text-sm font-medium ${CLS.btnTextFg}`}>全部测速</Text>
              </Button>
            )}
          </If>
          <Button
            testID="open-import-btn"
            accessibilityLabel="导入 URI / JSON"
            onPress={() => importOpen.set(true)}
            class={`${CLS.btnBase} ${CLS.btnMd} ${CLS.btnOutline}`}
          >
            <Text class={`text-sm font-medium ${CLS.btnTextFg}`}>导入 URI / JSON</Text>
          </Button>
          <Button
            testID="create-node-btn"
            accessibilityLabel="新建节点"
            onPress={openCreate}
            class={`${CLS.btnBase} ${CLS.btnMd} ${CLS.btnPrimary}`}
          >
            <Text class={`text-sm font-medium ${CLS.btnTextPrimary}`}>+ 新建节点</Text>
          </Button>
        </View>
      </View>

      <Scroll class="flex-1">
        <View class="gap-3 pb-4">
          <If when={props.profiles().length === 0}>
            <View class="items-center justify-center gap-2 rounded-(--radius) border border-border bg-muted/40 px-6 py-10">
              <Text class="text-sm font-semibold text-foreground">尚未添加节点</Text>
              <Text class="text-center text-xs text-muted-foreground">
                点击右上角“新建节点”选择协议并配置，或导入节点链接 / sing-box JSON。
              </Text>
              <Button
                accessibilityLabel="新建节点"
                onPress={openCreate}
                class={`${CLS.btnBase} ${CLS.btnMd} ${CLS.btnPrimary} mt-2`}
              >
                <Text class={`text-sm font-medium ${CLS.btnTextPrimary}`}>+ 新建节点</Text>
              </Button>
            </View>
          </If>

          <Each of={props.profiles()} key={(item) => item.id}>
            {(item) => {
              const isActive = () => props.activeProfileId() === item().id;
              const issues = () => validateNodeProfile(item());
              const hasErrors = () => issues().some((i) => i.severity === "error");
              const delayState = () => props.delays()[item().id];

              return (
                <View class={`${isActive() ? `${CLS.cardElevated} border-primary` : CLS.card}`}>
                  <View class="gap-3">
                    <Button
                      testID={`select-node-${item().id}`}
                      accessibilityLabel={`切换为主出站 ${item().name}`}
                      onPress={() => props.onSelectActive(item().id)}
                      class="w-full items-stretch justify-start rounded-[8px] bg-transparent p-0 text-left hover:opacity-90"
                    >
                      <View class="w-full gap-1.5">
                        <View class="flex-row flex-wrap items-center gap-2">
                          <Text class="text-sm font-semibold text-foreground">{item().name}</Text>
                          <View class={CLS.badgePrimary}>
                            <Text class="text-[11px] font-medium text-primary">
                              {getProtocolMeta(item().protocol ?? "naive").badge}
                            </Text>
                          </View>
                          <If when={isActive()}>
                            <View class={CLS.badgeSuccess}>
                              <Text class="text-[11px] font-medium text-success">当前主出站</Text>
                            </View>
                          </If>
                          <View class={item().quic ? CLS.badgeInfo : CLS.badgeNeutral}>
                            <Text
                              class={`text-[11px] font-medium ${item().quic ? "text-info" : "text-muted-foreground"}`}
                            >
                              {item().quic ? `QUIC · ${item().quicCongestionControl || "cubic"}` : "HTTP/2"}
                            </Text>
                          </View>
                          <If when={item().udpOverTcpMode !== "off"}>
                            <View class={CLS.badgeSuccess}>
                              <Text class="text-[11px] font-medium text-success">
                                {item().udpOverTcpMode === "boolean" ? "UoT" : `UoT ${item().udpOverTcpMode}`}
                              </Text>
                            </View>
                          </If>
                          <If when={item().tls.ech.enabled}>
                            <View class={CLS.badgeInfo}>
                              <Text class="text-[11px] font-medium text-info">ECH</Text>
                            </View>
                          </If>
                          <If when={item().insecureConcurrency > 0}>
                            <View class={CLS.badgeWarning}>
                              <Text class="text-[11px] font-medium text-warning">
                                {`并发 x${item().insecureConcurrency}`}
                              </Text>
                            </View>
                          </If>
                          <If when={hasErrors()}>
                            <View class={CLS.badgeDanger}>
                              <Text class="text-[11px] font-medium text-destructive">配置待修正</Text>
                            </View>
                          </If>
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
                                class={`text-[11px] font-medium ${
                                  delayState() === "testing"
                                    ? "text-muted-foreground"
                                    : delayState() === "error"
                                      ? "text-destructive"
                                      : "text-success"
                                }`}
                              >
                                {delayState() === "testing"
                                  ? "测速中..."
                                  : delayState() === "error"
                                    ? "超时/不可达"
                                    : `${String(delayState())} ms`}
                              </Text>
                            </View>
                          </If>
                        </View>

                        <Text class="font-mono text-xs text-muted-foreground">
                          {`${item().server}:${item().serverPort}  ·  tag: ${item().tag}  ·  SNI: ${item().tls.serverName || item().server}`}
                        </Text>
                      </View>
                    </Button>

                    <View class="flex-row flex-wrap items-center justify-between gap-2 border-t border-border pt-2.5">
                      <View class="flex-row flex-wrap items-center gap-2">
                        <Text class="text-[11px] text-muted-foreground">
                          {`窗口: ${item().streamReceiveWindow || (item().quic ? "默认 6 MB" : "默认 128 MB")}`}
                        </Text>
                        <If when={item().extraHeaders.length > 0}>
                          <Text class="text-[11px] text-muted-foreground">
                            {`· Extra Headers: ${item().extraHeaders.length}`}
                          </Text>
                        </If>
                        <If when={item().dial.detour}>
                          {(d) => <Text class="text-[11px] text-muted-foreground">{`· Detour: ${d()}`}</Text>}
                        </If>
                      </View>

                      <View class={`flex-row flex-wrap items-center ${compact() ? "gap-1" : "gap-1.5"}`}>
                        <Button
                          testID={`edit-node-${item().id}`}
                          accessibilityLabel="编辑"
                          onPress={() => openEdit(item())}
                          class={`${CLS.btnBase} ${compact() ? "h-7 px-2 rounded-[7px]" : CLS.btnSm} ${CLS.btnOutline}`}
                        >
                          <Text class={`text-xs font-medium ${CLS.btnTextFg}`}>编辑</Text>
                        </Button>
                        <Button
                          accessibilityLabel="测速"
                          disabled={!props.coreRunning()}
                          onPress={() => props.onTestDelay(item())}
                          class={`${CLS.btnBase} ${compact() ? "h-7 px-2 rounded-[7px]" : CLS.btnSm} ${CLS.btnGhost}`}
                        >
                          <Text class={`text-xs font-medium ${CLS.btnTextFg}`}>测速</Text>
                        </Button>
                        <Button
                          accessibilityLabel="复制 URI"
                          onPress={() => void copyUri(item())}
                          class={`${CLS.btnBase} ${compact() ? "h-7 px-2 rounded-[7px]" : CLS.btnSm} ${CLS.btnGhost}`}
                        >
                          <Text class={`text-xs font-medium ${CLS.btnTextFg}`}>复制 URI</Text>
                        </Button>
                        <Button
                          accessibilityLabel="复制 JSON"
                          onPress={() => void copyOutboundJson(item())}
                          class={`${CLS.btnBase} ${compact() ? "h-7 px-2 rounded-[7px]" : CLS.btnSm} ${CLS.btnGhost}`}
                        >
                          <Text class={`text-xs font-medium ${CLS.btnTextFg}`}>复制 JSON</Text>
                        </Button>
                        <Button
                          accessibilityLabel="克隆"
                          onPress={() => duplicateNode(item())}
                          class={`${CLS.btnBase} ${compact() ? "h-7 px-2 rounded-[7px]" : CLS.btnSm} ${CLS.btnGhost}`}
                        >
                          <Text class={`text-xs font-medium ${CLS.btnTextFg}`}>克隆</Text>
                        </Button>
                        <Button
                          testID={`delete-node-${item().id}`}
                          accessibilityLabel="删除"
                          disabled={props.profiles().length <= 1}
                          onPress={() => props.onDeleteProfile(item().id)}
                          class={`${CLS.btnBase} ${compact() ? "h-7 px-2 rounded-[7px]" : CLS.btnSm} ${CLS.btnGhost}`}
                        >
                          <Text class={`text-xs font-medium ${CLS.btnTextFg}`}>删除</Text>
                        </Button>
                      </View>
                    </View>
                  </View>
                </View>
              );
            }}
          </Each>
        </View>
      </Scroll>

      <NodeEditorModal
        open={editorOpen()}
        profile={editingProfile()}
        allProfiles={props.profiles()}
        onClose={() => editorOpen.set(false)}
        onSave={(saved) => {
          props.onUpsertProfile(saved);
          editorOpen.set(false);
          props.onToast(`已保存节点 ${saved.name}`, "success");
        }}
      />

      <Dialog
        testID="import-node-dialog"
        open={importOpen()}
        onOpenChange={({ open }) => importOpen.set(open)}
        presentation="formSheet"
        closeOnEscape
        closeOnBackdropPress
        backdropClass={compact() ? "bg-foreground/30 items-center justify-end p-0" : CLS.dialogBackdrop}
        class={compact() ? `${CLS.sheetCard}` : `${CLS.dialogCard} h-[380px] max-h-[90%] max-w-[640px]`}
      >
        <View class="min-h-0 flex-1">
          <View class="shrink-0 flex-row items-center justify-between gap-3 border-b border-border px-5 py-3.5">
            <View class="flex-1 gap-0.5">
              <Text class="text-base font-semibold text-foreground">导入节点</Text>
              <Text class="text-xs text-muted-foreground">
                当前支持 naive+https:// / naive+quic:// 分享链接（每行一条），或 sing-box outbound / 完整配置文件 JSON
              </Text>
            </View>
            <Button
              accessibilityLabel="关闭"
              onPress={() => importOpen.set(false)}
              class={`${CLS.btnBase} ${CLS.btnSm} ${CLS.btnGhost}`}
            >
              <Text class={`text-xs font-medium ${CLS.btnTextFg}`}>关闭</Text>
            </Button>
          </View>

          <Scroll class="min-h-0 flex-1 px-5 py-4">
            <View class="gap-1.5">
              <Text class="text-xs font-medium text-foreground">粘贴 URI 或 JSON</Text>
              <Input
                testID="import-textarea"
                accessibilityLabel="粘贴 URI 或 JSON"
                multiline
                value={importText()}
                onChange={({ value }) => {
                  importText.set(value);
                  if (importError()) importError.set(null);
                }}
                placeholder="naive+https://user:pass@host:443#Node"
                class={`${CLS.textareaMono} min-h-40`}
              />
              <If when={importError()}>
                {(err) => <Text class="text-[11px] text-destructive">{err()}</Text>}
              </If>
              <If when={!importError()}>
                <Text class="text-[11px] text-muted-foreground">
                  示例: naive+quic://alice:secret@example.com:443?congestion_control=bbr2&amp;uot=v2&amp;ech=1#Tokyo
                </Text>
              </If>
            </View>
          </Scroll>

          <View class="shrink-0 flex-row items-center justify-end gap-2 border-t border-border bg-muted/40 px-5 py-3">
            <Button
              accessibilityLabel="取消"
              onPress={() => importOpen.set(false)}
              class={`${CLS.btnBase} ${CLS.btnMd} ${CLS.btnOutline}`}
            >
              <Text class={`text-sm font-medium ${CLS.btnTextFg}`}>取消</Text>
            </Button>
            <Button
              testID="confirm-import-btn"
              accessibilityLabel="解析并导入"
              onPress={handleImportSubmit}
              class={`${CLS.btnBase} ${CLS.btnMd} ${CLS.btnPrimary}`}
            >
              <Text class={`text-sm font-medium ${CLS.btnTextPrimary}`}>解析并导入</Text>
            </Button>
          </View>
        </View>
      </Dialog>
    </View>
  );
}
