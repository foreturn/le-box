import { Clipboard, Scroll, signal, Text, View } from "nsh";
import { Button, Input, Tab, Tabs } from "nsh/base";
import { isCompactLayout } from "../core/layout";
import { CLS } from "../styles";
import type { LogEntry } from "../types/singbox";

type LevelFilter = "all" | "info" | "warn" | "error" | "debug";

const LEVEL_TABS: { value: LevelFilter; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "info", label: "Info" },
  { value: "warn", label: "Warn" },
  { value: "error", label: "Error" },
  { value: "debug", label: "Debug" },
];

const LEVEL_BADGE_BOX: Record<LogEntry["level"], string> = {
  error: CLS.badgeDanger,
  warn: CLS.badgeWarning,
  debug: CLS.badgeNeutral,
  info: CLS.badgeInfo,
};

const LEVEL_BADGE_TEXT: Record<LogEntry["level"], string> = {
  error: "text-destructive",
  warn: "text-warning",
  debug: "text-muted-foreground",
  info: "text-info",
};

export function LogsPage(props: {
  logs: () => LogEntry[];
  onClear: () => void;
  onToast: (msg: string, tone?: "info" | "success" | "warning" | "error") => void;
}) {
  const filter = signal<LevelFilter>("all");
  const keyword = signal("");
  const compact = () => isCompactLayout();

  const filteredLogs = () => {
    const lvl = filter();
    const q = keyword().trim().toLowerCase();
    return props
      .logs()
      .filter((entry) => {
        if (lvl !== "all" && entry.level !== lvl) return false;
        if (q && !entry.message.toLowerCase().includes(q)) return false;
        return true;
      })
      .reverse();
  };

  const copyAll = async () => {
    try {
      const text = filteredLogs()
        .map((e) => `[${e.timestamp}] [${e.level.toUpperCase()}] ${e.message}`)
        .join("\n");
      await Clipboard.writeText(text);
      props.onToast("已复制当前日志", "success");
    } catch (err) {
      props.onToast(`复制失败: ${String(err)}`, "error");
    }
  };

  return (
    <View class="flex-1 gap-4">
      <View class={compact() ? "gap-2.5" : "flex-row flex-wrap items-center justify-between gap-3"}>
        <View class="min-w-0 flex-1 gap-0.5">
          <Text class="text-sm font-semibold text-foreground">运行日志</Text>
          <Text class="text-xs text-muted-foreground">{`共记录 ${props.logs().length} 条 sing-box 与调度器输出（按时间倒序，最新在前）`}</Text>
        </View>
        <View class="flex-row items-center gap-2">
          <Button
            accessibilityLabel="复制日志"
            onPress={() => void copyAll()}
            class={`${CLS.btnBase} ${CLS.btnMd} ${CLS.btnOutline}`}
          >
            <Text class={`text-sm font-medium ${CLS.btnTextFg}`}>复制日志</Text>
          </Button>
          <Button
            accessibilityLabel="清空"
            onPress={props.onClear}
            class={`${CLS.btnBase} ${CLS.btnMd} ${CLS.btnGhost}`}
          >
            <Text class={`text-sm font-medium ${CLS.btnTextFg}`}>清空</Text>
          </Button>
        </View>
      </View>

      <View class={compact() ? "gap-2.5" : "flex-row flex-wrap items-center justify-between gap-3"}>
        <Tabs class={compact() ? `${CLS.tabsRoot} w-full` : CLS.tabsRoot} indicatorClass={CLS.tabsIndicator}>
          <Each of={LEVEL_TABS} key={(item) => item.value}>
            {(item) => (
              <Tab
                selected={filter() === item().value}
                onPress={() => filter.set(item().value)}
                class={compact() ? `${CLS.tabItem} flex-1 items-center px-1` : CLS.tabItem}
              >
                <Text class={CLS.tabText}>{item().label}</Text>
              </Tab>
            )}
          </Each>
        </Tabs>

        <View class={compact() ? "w-full" : "w-64"}>
          <Input
            accessibilityLabel="过滤日志关键词"
            value={keyword()}
            onChange={({ value }) => keyword.set(value)}
            placeholder="过滤日志关键词..."
            class={CLS.input}
          />
        </View>
      </View>

      <View class={`${CLS.card} flex-1 overflow-hidden p-0`}>
        <Scroll class="flex-1 p-3">
          <If when={filteredLogs().length === 0}>
            <View class="items-center justify-center gap-2 rounded-(--radius) border border-border bg-muted/40 px-6 py-10">
              <Text class="text-sm font-semibold text-foreground">暂无匹配日志</Text>
              <Text class="text-center text-xs text-muted-foreground">
                启动 sing-box 或调整过滤条件后在此查看日志。
              </Text>
            </View>
          </If>

          <View class="gap-1.5">
            <Each of={filteredLogs()} key={(item) => item.id}>
              {(item) => (
                <View class={compact() ? "gap-1 rounded-[10px] border border-border/60 bg-muted/20 px-3 py-2" : "flex-row items-start gap-2 rounded-[8px] border border-border/60 bg-muted/20 px-2.5 py-1.5"}>
                  <View class="flex-row items-center gap-2">
                    <Text class="font-mono text-[11px] text-muted-foreground">{item().timestamp}</Text>
                    <View class={LEVEL_BADGE_BOX[item().level]}>
                      <Text class={`text-[10px] font-medium ${LEVEL_BADGE_TEXT[item().level]}`}>
                        {item().level.toUpperCase()}
                      </Text>
                    </View>
                  </View>
                  <View selectable class={compact() ? "w-full" : "flex-1"}>
                    <Text class="font-mono text-xs text-foreground">{item().message}</Text>
                  </View>
                </View>
              )}
            </Each>
          </View>
        </Scroll>
      </View>
    </View>
  );
}
