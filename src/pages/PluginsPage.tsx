// 插件管理页：展示 Claude 与 Codex 插件版本状态，支持检查和拉取更新
import { Alert, Switch } from "antd";
import { useEffect } from "react";
import { revealInFinder } from "../api";
import { PageHeader, Card, Badge, Button, EmptyState, PageShell } from "../components/ui";
import { useAppStore } from "../store";
import type {
  PluginUpdateCheckResult,
  PluginUpdateStatus,
  ToolPluginInfo,
} from "../types";

// ToolSectionState 描述单个工具区块的检查结果。
interface ToolSectionState {
  loading: boolean; // loading 标记该工具插件检查是否进行中。
  result: PluginUpdateCheckResult | null; // result 存储该工具最新一次检查结果。
  error: string; // error 存储该工具检查失败的原因文本。
}

// PluginCheckFeedback 描述卡片内展示的单插件检查结果。
interface PluginCheckFeedback {
  phase: "ok" | "warning" | "err"; // phase 存储结果语义，用于选择提示颜色。
  text: string; // text 存储检查结果文案。
}

// PluginToolSectionProps 定义单个工具插件区块需要的渲染参数。
interface PluginToolSectionProps {
  title: string; // title 存储工具区块标题。
  state: ToolSectionState; // state 存储工具区块的加载、结果与错误状态。
  onRefresh: () => void; // onRefresh 用于重新检查当前工具插件状态。
  onCheckPlugin: (plugin: ToolPluginInfo) => void; // onCheckPlugin 用于只读检查单个插件是否有新版本。
  onUpdate: (plugin: ToolPluginInfo) => void; // onUpdate 用于触发单个插件更新。
  onToggleEnabled: (plugin: ToolPluginInfo, enabled: boolean) => void; // onToggleEnabled 用于启用或禁用单个插件。
  isPluginUpdating: (plugin: ToolPluginInfo) => boolean; // isPluginUpdating 判断指定插件按钮是否进入 loading。
  isPluginChecking: (plugin: ToolPluginInfo) => boolean; // isPluginChecking 判断指定插件检查按钮是否进入 loading。
  getPluginCheckResult: (plugin: ToolPluginInfo) => PluginCheckFeedback | undefined; // getPluginCheckResult 获取指定插件最近一次检查结果。
  isPluginToggling: (plugin: ToolPluginInfo) => boolean; // isPluginToggling 判断指定插件开关是否进入 loading。
}

// PluginsPageProps 描述插件页当前所属的一级工具。
interface PluginsPageProps {
  tool?: "claude" | "codex"; // tool 存储需要展示和检查插件的工具作用域，省略时保留汇总视图兼容性。
}

// INITIAL_PLUGIN_CHECK_DELAY_MS 存储插件页首次检查延迟时间，用于先让 tab 切换动画完成再启动 CLI 检查。
const INITIAL_PLUGIN_CHECK_DELAY_MS = 220;

// 根据插件更新状态返回界面文案。
// status 为后端计算出的更新状态。
function updateStatusLabel(status: PluginUpdateStatus): string {
  if (status === "newer") {
    return "可更新";
  }
  if (status === "same") {
    return "已最新";
  }
  if (status === "different") {
    return "版本不同";
  }
  return "未知";
}

// 根据插件更新状态返回徽章色调。
// status 为后端计算出的更新状态。
function updateStatusTone(
  status: PluginUpdateStatus
): "neutral" | "success" | "warning" | "info" {
  if (status === "newer") {
    return "warning";
  }
  if (status === "same") {
    return "success";
  }
  if (status === "different") {
    return "info";
  }
  return "neutral";
}

// pluginUpdateKey 生成单插件更新任务 key，用工具和安装信息区分同名插件。
// tool 为插件所属工具，plugin 为后端返回的插件信息。
function pluginUpdateKey(tool: "claude" | "codex", plugin: ToolPluginInfo): string {
  return [tool, plugin.id, plugin.scope, plugin.install_path].join("::");
}

// formatPluginLastUpdated 将 CLI 返回的原始更新时间转换为中国时区的中文展示文本。
// lastUpdated 为后端透传的最近更新时间，通常是 ISO 字符串。
function formatPluginLastUpdated(lastUpdated: string): string {
  // trimmed 存储去除首尾空白后的原始更新时间。
  const trimmed = lastUpdated.trim();

  if (!trimmed) {
    return "—";
  }

  // date 存储根据 CLI 原始时间解析出的绝对时间。
  const date = new Date(trimmed);

  if (Number.isNaN(date.getTime())) {
    return trimmed;
  }

  // parts 存储中国时区拆分后的时间片段，避免不同浏览器直接 format 时标点不一致。
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  // values 存储时间片段类型到展示值的映射。
  const values = parts.reduce<Record<string, string>>((accumulator, part) => {
    accumulator[part.type] = part.value;
    return accumulator;
  }, {});

  return `${values.year}年${values.month}月${values.day}日 ${values.hour}:${values.minute}:${values.second}`;
}

// 渲染单个工具的插件更新区块。
// title 为区块标题，state 为该工具的检查结果，onRefresh / onUpdate 为交互回调。
function PluginToolSection({
  title,
  state,
  onRefresh,
  onCheckPlugin,
  onUpdate,
  onToggleEnabled,
  isPluginUpdating,
  isPluginChecking,
  getPluginCheckResult,
  isPluginToggling,
}: PluginToolSectionProps) {
  return (
    <section className="mb-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-text-main">{title}</h2>
        <Button onClick={onRefresh} variant="default" loading={state.loading}>
          检查更新
        </Button>
      </div>

      {state.error && (
        <Alert
          className="mb-3"
          description={<pre className="m-0 max-h-32 overflow-auto whitespace-pre-wrap font-mono">{state.error}</pre>}
          message={`${title}检查失败`}
          showIcon
          type="error"
        />
      )}

      {state.result?.diagnostics && !state.error && state.result.plugins.length === 0 && (
        <Alert
          className="mb-3"
          description={
            <pre className="m-0 max-h-32 overflow-auto whitespace-pre-wrap font-mono">
              {state.result.diagnostics}
            </pre>
          }
          message={`${title}诊断`}
          showIcon
          type="warning"
        />
      )}

      {/* min-h 常驻基准：让检查中 / 尚未检查 / 空 / 列表各态共用同一最小高度，避免检查完成后从空态跳到插件卡片列表造成的布局跳动（CLS） */}
      <div className="min-h-[160px]">
        {state.error ? (
          <div className="py-6 text-sm text-text-muted">该工具插件检查失败，请查看上方错误信息。</div>
        ) : !state.result ? (
          // 尚未检查（result 为 null）：用与检查中一致的占位高度，不展示语义不准的「未发现已安装插件」空态
          <div className="flex min-h-[160px] items-center justify-center text-sm text-text-muted">
            {state.loading ? "正在检查插件…" : "点击上方按钮检查插件"}
          </div>
        ) : state.result.plugins.length === 0 ? (
          <EmptyState text="未发现已安装插件" />
        ) : (
          <div className="space-y-3">
            {state.result.plugins.map((plugin) => {
              // lastUpdatedText 存储最近更新时间的中国时区中文展示结果。
              const lastUpdatedText = formatPluginLastUpdated(plugin.last_updated);
              // toggling 存储当前插件是否正在执行启停操作。
              const toggling = isPluginToggling(plugin);
              // checkResult 存储当前插件最近一次明确的版本检查结果。
              const checkResult = getPluginCheckResult(plugin);

            return (
              <Card
                key={`${state.result?.tool}-${plugin.id}-${plugin.scope}-${plugin.install_path}`}
              >
                <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-text-main">{plugin.id}</span>
                      <Badge tone="info">v{plugin.current_version || "—"}</Badge>
                      <Badge tone={updateStatusTone(plugin.update_status)}>
                        {updateStatusLabel(plugin.update_status)}
                      </Badge>
                      {plugin.scope && <Badge tone="neutral">{plugin.scope}</Badge>}
                      <Badge tone={plugin.enabled ? "success" : "neutral"}>
                        {plugin.enabled ? "已启用" : "已禁用"}
                      </Badge>
                    </div>
                    <div className="mt-1 space-y-0.5 text-xs text-text-muted">
                      <div>市场：{plugin.marketplace || "—"}</div>
                      <div>最新版本：{plugin.available_version || "—"}</div>
                      <div>最近更新：{lastUpdatedText}</div>
                      <div className="truncate" title={plugin.install_path}>
                        路径：{plugin.install_path || "—"}
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2 xl:justify-end">
                    <div className="flex items-center gap-2 text-xs text-text-muted">
                      <span>启用</span>
                      <Switch
                        aria-label={`启用 ${plugin.id}`}
                        checked={plugin.enabled}
                        disabled={toggling}
                        loading={toggling}
                        onChange={(checked) => onToggleEnabled(plugin, checked)}
                      />
                    </div>
                    <Button
                      onClick={() => {
                        void revealInFinder(plugin.install_path).catch(console.error);
                      }}
                      variant="ghost"
                      disabled={!plugin.install_path}
                    >
                      Finder
                    </Button>
                    <Button
                      onClick={() => onCheckPlugin(plugin)}
                      variant="default"
                      loading={isPluginChecking(plugin)}
                    >
                      检查更新
                    </Button>
                    <Button
                      onClick={() => onUpdate(plugin)}
                      variant="primary"
                      disabled={plugin.update_status === "same"}
                      loading={isPluginUpdating(plugin)}
                    >
                      拉取更新
                    </Button>
                  </div>
                </div>
                {checkResult && (
                  <Alert
                    className="mt-3"
                    message={checkResult.text}
                    showIcon
                    type={
                      checkResult.phase === "err"
                        ? "error"
                        : checkResult.phase === "ok"
                        ? "success"
                        : "warning"
                    }
                  />
                )}
              </Card>
            );
          })}
          </div>
        )}
      </div>
    </section>
  );
}

// 插件管理页组件
export default function PluginsPage({ tool }: PluginsPageProps) {
  // claudeHome 存储 Claude 配置根目录。
  const claudeHome = useAppStore((state) => state.prefs?.claude_home || "");
  // codexHome 存储 Codex 配置根目录。
  const codexHome = useAppStore((state) => state.prefs?.codex_home || "");
  // pluginPage 存储插件页跨 tab 保留的检查与更新状态。
  const pluginPage = useAppStore((state) => state.pluginPage);
  // checkPluginUpdates 存储检查指定工具插件更新的 store action。
  const checkPluginUpdates = useAppStore((state) => state.checkPluginUpdates);
  // checkAllPluginUpdates 存储并行检查全部工具插件更新的 store action。
  const checkAllPluginUpdates = useAppStore((state) => state.checkAllPluginUpdates);
  // checkSinglePluginUpdate 存储只读检查指定插件版本的 store action。
  const checkSinglePluginUpdate = useAppStore((state) => state.checkSinglePluginUpdate);
  // updatePlugin 存储更新指定工具插件的 store action。
  const updatePlugin = useAppStore((state) => state.updatePlugin);
  // setPluginEnabled 存储启用或禁用指定工具插件的 store action。
  const setPluginEnabled = useAppStore((state) => state.setPluginEnabled);

  useEffect(() => {
    // timer 存储首轮插件检查的延迟句柄，避免切到插件 tab 时同步启动 CLI 检查造成卡顿。
    const timer = window.setTimeout(() => {
      if (tool) {
        void checkPluginUpdates(tool);
      } else {
        void checkAllPluginUpdates();
      }
    }, INITIAL_PLUGIN_CHECK_DELAY_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [checkAllPluginUpdates, checkPluginUpdates, claudeHome, codexHome, tool]);

  return (
    <PageShell>
      <PageHeader
        title={tool ? `${tool === "codex" ? "Codex" : "Claude Code"} · 插件` : "插件"}
        subtitle={tool ? `管理 ${tool === "codex" ? "Codex" : "Claude Code"} 插件，检查可用版本并拉取更新` : "管理 Claude Code 与 Codex 插件，检查可用版本并拉取更新"}
        actions={
          <Button
            onClick={() => {
              if (tool) {
                void checkPluginUpdates(tool);
              } else {
                void checkAllPluginUpdates();
              }
            }}
            variant="default"
            loading={tool ? pluginPage[tool].loading : pluginPage.refreshingAll}
          >
            {tool ? "检查更新" : "检查全部更新"}
          </Button>
        }
      />

      {pluginPage.update && (
        <Alert
          className="mb-4"
          description={
            pluginPage.update.text ? (
            <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap font-mono">
              {pluginPage.update.text}
            </pre>
            ) : undefined
          }
          message={
            pluginPage.update.phase === "loading"
              ? `正在更新 ${pluginPage.update.target}…`
              : `${pluginPage.update.target} 更新${
                  pluginPage.update.phase === "ok" ? "成功" : "失败"
                }`
          }
          showIcon
          type={
            pluginPage.update.phase === "err"
              ? "error"
              : pluginPage.update.phase === "ok"
              ? "success"
              : "info"
          }
        />
      )}

      {pluginPage.toggle && (
        <Alert
          className="mb-4"
          description={
            pluginPage.toggle.text ? (
              <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap font-mono">
                {pluginPage.toggle.text}
              </pre>
            ) : undefined
          }
          message={
            pluginPage.toggle.phase === "loading"
              ? `正在切换 ${pluginPage.toggle.target}…`
              : `${pluginPage.toggle.target} 启停${
                  pluginPage.toggle.phase === "ok" ? "成功" : "失败"
                }`
          }
          showIcon
          type={
            pluginPage.toggle.phase === "err"
              ? "error"
              : pluginPage.toggle.phase === "ok"
              ? "success"
              : "info"
          }
        />
      )}

      {tool !== "codex" && <PluginToolSection
        title="Claude 插件"
        state={pluginPage.claude}
        onRefresh={() => {
          void checkPluginUpdates("claude");
        }}
        onUpdate={(plugin) => {
          void updatePlugin("claude", plugin);
        }}
        onCheckPlugin={(plugin) => {
          void checkSinglePluginUpdate("claude", plugin);
        }}
        onToggleEnabled={(plugin, enabled) => {
          void setPluginEnabled("claude", plugin, enabled);
        }}
        isPluginUpdating={(plugin) => {
          return Boolean(pluginPage.updating[pluginUpdateKey("claude", plugin)]);
        }}
        isPluginChecking={(plugin) => {
          return Boolean(pluginPage.checkingPlugins[pluginUpdateKey("claude", plugin)]);
        }}
        getPluginCheckResult={(plugin) => {
          return pluginPage.pluginCheckResults[pluginUpdateKey("claude", plugin)];
        }}
        isPluginToggling={(plugin) => {
          return Boolean(pluginPage.toggling[pluginUpdateKey("claude", plugin)]);
        }}
      />}
      {tool !== "claude" && <PluginToolSection
        title="Codex 插件"
        state={pluginPage.codex}
        onRefresh={() => {
          void checkPluginUpdates("codex");
        }}
        onUpdate={(plugin) => {
          void updatePlugin("codex", plugin);
        }}
        onCheckPlugin={(plugin) => {
          void checkSinglePluginUpdate("codex", plugin);
        }}
        onToggleEnabled={(plugin, enabled) => {
          void setPluginEnabled("codex", plugin, enabled);
        }}
        isPluginUpdating={(plugin) => {
          return Boolean(pluginPage.updating[pluginUpdateKey("codex", plugin)]);
        }}
        isPluginChecking={(plugin) => {
          return Boolean(pluginPage.checkingPlugins[pluginUpdateKey("codex", plugin)]);
        }}
        getPluginCheckResult={(plugin) => {
          return pluginPage.pluginCheckResults[pluginUpdateKey("codex", plugin)];
        }}
        isPluginToggling={(plugin) => {
          return Boolean(pluginPage.toggling[pluginUpdateKey("codex", plugin)]);
        }}
      />}
    </PageShell>
  );
}
