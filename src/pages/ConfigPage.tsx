import { Clipboard, Scroll, signal, Text, View } from "nsh";
import { Button } from "nsh/base";
import { isCompactLayout } from "../core/layout";
import { buildSingBoxConfig } from "../core/singboxConfig";
import { checkSingBoxConfig, formatProcessError, writeRuntimeConfigFile } from "../services/runtime";
import { CLS } from "../styles";
import type { AppSettings, NodeProfile } from "../types/singbox";

export function ConfigPage(props: {
  profiles: () => NodeProfile[];
  activeProfileId: () => string | null;
  settings: () => AppSettings;
  onToast: (msg: string, tone?: "info" | "success" | "warning" | "error") => void;
}) {
  const checking = signal(false);
  const compact = () => isCompactLayout();
  const checkResult = signal<{ ok: boolean; output: string; path: string } | null>(null);

  const generatedJson = () =>
    JSON.stringify(buildSingBoxConfig(props.profiles(), props.activeProfileId(), props.settings()), null, 2);

  const copyConfig = async () => {
    try {
      await Clipboard.writeText(generatedJson());
      props.onToast("已复制完整 sing-box JSON 配置", "success");
    } catch (err) {
      props.onToast(`复制失败: ${String(err)}`, "error");
    }
  };

  const writeConfigOnly = async () => {
    try {
      const { path } = await writeRuntimeConfigFile(props.profiles(), props.activeProfileId(), props.settings());
      props.onToast(`已写入配置文件: ${path}`, "success");
    } catch (err) {
      props.onToast(`写入失败: ${formatProcessError(err)}`, "error");
    }
  };

  const runCheck = async () => {
    checking.set(true);
    try {
      const res = await checkSingBoxConfig(
        props.settings().singBoxPath,
        props.profiles(),
        props.activeProfileId(),
        props.settings(),
      );
      checkResult.set({ ok: res.ok, output: res.output, path: res.configPath });
      props.onToast(res.ok ? "sing-box check 校验通过" : "sing-box check 返回错误", res.ok ? "success" : "error");
    } catch (err) {
      const msg = formatProcessError(err);
      checkResult.set({ ok: false, output: msg, path: "" });
      props.onToast(`校验执行失败: ${msg}`, "error");
    } finally {
      checking.set(false);
    }
  };

  return (
    <View class="flex-1 gap-4">
      <View class={compact() ? "gap-2.5" : "flex-row flex-wrap items-center justify-between gap-3"}>
        <View class="min-w-0 flex-1 gap-0.5">
          <Text class="text-sm font-semibold text-foreground">sing-box 配置生成与验证</Text>
          <Text class="text-xs text-muted-foreground">
            实时生成的 1.14+ 完整 JSON；支持调用本地 sing-box check 进行节点协议与官方 rule_set 路由配置核验
          </Text>
        </View>
        <View class="flex-row flex-wrap items-center gap-2">
          <Button
            accessibilityLabel="复制 JSON"
            onPress={() => void copyConfig()}
            class={`${CLS.btnBase} ${CLS.btnMd} ${CLS.btnOutline}`}
          >
            <Text class={`text-sm font-medium ${CLS.btnTextFg}`}>复制 JSON</Text>
          </Button>
          <Button
            accessibilityLabel="写入数据目录"
            onPress={() => void writeConfigOnly()}
            class={`${CLS.btnBase} ${CLS.btnMd} ${CLS.btnOutline}`}
          >
            <Text class={`text-sm font-medium ${CLS.btnTextFg}`}>写入数据目录</Text>
          </Button>
          <Button
            testID="run-singbox-check-btn"
            accessibilityLabel="执行 sing-box check"
            disabled={checking()}
            onPress={() => void runCheck()}
            class={`${CLS.btnBase} ${CLS.btnMd} ${CLS.btnPrimary}`}
          >
            <Text class={`text-sm font-medium ${CLS.btnTextPrimary}`}>
              {checking() ? "校验中..." : "执行 sing-box check"}
            </Text>
          </Button>
        </View>
      </View>

      <If when={checkResult()}>
        {(res) => (
          <View
            class={`gap-1 rounded-(--radius) border px-3 py-2.5 ${res().ok ? "border-success/40 bg-success/10" : "border-destructive/40 bg-destructive/10"}`}
          >
            <Text class={`text-xs font-semibold ${res().ok ? "text-success" : "text-destructive"}`}>
              {res().ok ? `校验通过 (${res().path})` : "sing-box check 失败"}
            </Text>
            <Text class="text-xs text-foreground">{res().output}</Text>
          </View>
        )}
      </If>

      <View class={`${CLS.card} flex-1 overflow-hidden p-0`}>
        <Scroll class="flex-1 p-4">
          <View selectable>
            <Text class="font-mono text-xs text-foreground">{generatedJson()}</Text>
          </View>
        </Scroll>
      </View>
    </View>
  );
}
