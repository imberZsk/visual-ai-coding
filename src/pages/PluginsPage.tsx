// 插件管理页：展示 Claude 与 Codex 插件版本状态，支持检查和拉取更新
import { useEffect } from "react";
import { revealInFinder } from "../api";
import { PageHeader, Card, Badge, Button, EmptyState } from "../components/ui";
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

// PluginToolSectionProps 定义单个工具插件区块需要的渲染参数。
interface PluginToolSectionProps {
  title: string; // title 存储工具区块标题。
  state: ToolSectionState; // state 存储工具区块的加载、结果与错误状态。
  onRefresh: () => void; // onRefresh 用于重新检查当前工具插件状态。
  onUpdate: (plugin: ToolPluginInfo) => void; // onUpdate 用于触发单个插件更新。
  isPluginUpdating: (plugin: ToolPluginInfo) => boolean; // isPluginUpdating 判断指定插件按钮是否进入 loading。
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

// 渲染单个工具的插件更新区块。
// title 为区块标题，state 为该工具的检查结果，onRefresh / onUpdate 为交互回调。
function PluginToolSection({
  title,
  state,
  onRefresh,
  onUpdate,
  isPluginUpdating,
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
        <div className="mb-3 rounded-lg border border-red-500/40 p-3 text-xs text-red-500">
          <div className="font-medium">{title}检查失败</div>
          <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap font-mono">
            {state.error}
          </pre>
        </div>
      )}

      {state.result?.diagnostics && !state.error && state.result.plugins.length === 0 && (
        <div className="mb-3 rounded-lg border border-amber-500/40 p-3 text-xs text-amber-500">
          <div className="font-medium">{title}诊断</div>
          <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap font-mono">
            {state.result.diagnostics}
          </pre>
        </div>
      )}

      {state.error ? (
        <div className="py-6 text-sm text-text-muted">该工具插件检查失败，请查看上方错误信息。</div>
      ) : !state.result || state.result.plugins.length === 0 ? (
        <EmptyState text="未发现已安装插件" />
      ) : (
        <div className="space-y-3">
          {state.result.plugins.map((plugin) => (
            <Card
              key={`${state.result?.tool}-${plugin.id}-${plugin.scope}-${plugin.install_path}`}
            >
              <div className="flex items-start justify-between gap-3">
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
                    <div>最近更新：{plugin.last_updated || "—"}</div>
                    <div className="truncate" title={plugin.install_path}>
                      路径：{plugin.install_path || "—"}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
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
                    onClick={() => onUpdate(plugin)}
                    variant="primary"
                    disabled={plugin.update_status === "same"}
                    loading={isPluginUpdating(plugin)}
                  >
                    拉取更新
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}

// 插件管理页组件
export default function PluginsPage() {
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
  // updatePlugin 存储更新指定工具插件的 store action。
  const updatePlugin = useAppStore((state) => state.updatePlugin);

  useEffect(() => {
    // timer 存储首轮插件检查的延迟句柄，避免切到插件 tab 时同步启动 CLI 检查造成卡顿。
    const timer = window.setTimeout(() => {
      void checkAllPluginUpdates();
    }, INITIAL_PLUGIN_CHECK_DELAY_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [checkAllPluginUpdates, claudeHome, codexHome]);

  return (
    <div className="p-6">
      <PageHeader
        title="插件"
        subtitle="管理 Claude Code 与 Codex 插件，检查可用版本并拉取更新"
        actions={
          <Button
            onClick={() => {
              void checkAllPluginUpdates();
            }}
            variant="default"
            loading={pluginPage.refreshingAll}
          >
            刷新全部
          </Button>
        }
      />

      {pluginPage.update && (
        <div
          className={`mb-4 rounded-lg border p-3 text-xs ${
            pluginPage.update.phase === "err"
              ? "border-red-500/40 text-red-500"
              : pluginPage.update.phase === "ok"
              ? "border-green-500/40 text-green-500"
              : "border-border text-text-muted"
          }`}
        >
          <div className="font-medium">
            {pluginPage.update.phase === "loading"
              ? `正在更新 ${pluginPage.update.target}…`
              : `${pluginPage.update.target} 更新${
                  pluginPage.update.phase === "ok" ? "成功" : "失败"
                }`}
          </div>
          {pluginPage.update.text && (
            <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap font-mono">
              {pluginPage.update.text}
            </pre>
          )}
        </div>
      )}

      <PluginToolSection
        title="Claude 插件"
        state={pluginPage.claude}
        onRefresh={() => {
          void checkPluginUpdates("claude");
        }}
        onUpdate={(plugin) => {
          void updatePlugin("claude", plugin);
        }}
        isPluginUpdating={(plugin) => {
          return Boolean(pluginPage.updating[pluginUpdateKey("claude", plugin)]);
        }}
      />
      <PluginToolSection
        title="Codex 插件"
        state={pluginPage.codex}
        onRefresh={() => {
          void checkPluginUpdates("codex");
        }}
        onUpdate={(plugin) => {
          void updatePlugin("codex", plugin);
        }}
        isPluginUpdating={(plugin) => {
          return Boolean(pluginPage.updating[pluginUpdateKey("codex", plugin)]);
        }}
      />
    </div>
  );
}
