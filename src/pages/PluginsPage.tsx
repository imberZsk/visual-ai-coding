// 插件管理页：展示 Claude 与 Codex 插件版本状态，支持检查和拉取更新
import { useEffect, useState } from "react";
import {
  checkClaudePluginUpdates,
  checkCodexPluginUpdates,
  revealInFinder,
  updateClaudePlugin,
  updateCodexMarketplace,
  updateCodexPlugin,
} from "../api";
import { PageHeader, Card, Badge, Button, EmptyState } from "../components/ui";
import { useAppStore } from "../store";
import type {
  PluginUpdateCheckResult,
  PluginUpdateStatus,
  ToolPluginInfo,
} from "../types";

// UpdateState 描述单条插件更新操作的执行阶段与反馈文本。
interface UpdateState {
  target: string; // target 存储当前更新中的插件名称或最近更新完成的插件名称。
  phase: "loading" | "ok" | "err"; // phase 存储更新阶段，控制提示条颜色与文案。
  text: string; // text 存储 CLI 输出或错误信息。
}

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
}

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

// 渲染单个工具的插件更新区块。
// title 为区块标题，state 为该工具的检查结果，onRefresh / onUpdate 为交互回调。
function PluginToolSection({
  title,
  state,
  onRefresh,
  onUpdate,
}: PluginToolSectionProps) {
  return (
    <section className="mb-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-text-main">{title}</h2>
        <Button onClick={onRefresh} variant="default" disabled={state.loading}>
          {state.loading ? "检查中…" : "检查更新"}
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

      {state.loading ? (
        <div className="py-8 text-center text-sm text-text-muted">加载中…</div>
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
  // claudeState 存储 Claude 插件区块的检查状态。
  const [claudeState, setClaudeState] = useState<ToolSectionState>({
    loading: true,
    result: null,
    error: "",
  });
  // codexState 存储 Codex 插件区块的检查状态。
  const [codexState, setCodexState] = useState<ToolSectionState>({
    loading: true,
    result: null,
    error: "",
  });
  // update 存储当前插件更新操作的反馈信息。
  const [update, setUpdate] = useState<UpdateState | null>(null);

  // loadClaude 检查 Claude 插件更新状态。
  async function loadClaude() {
    if (!claudeHome) {
      setClaudeState({ loading: false, result: null, error: "" });
      return;
    }
    setClaudeState((state) => ({ ...state, loading: true, error: "" }));
    try {
      // result 存储 Claude 插件检查结果。
      const result = await checkClaudePluginUpdates(claudeHome);
      setClaudeState({ loading: false, result, error: "" });
    } catch (error) {
      setClaudeState({ loading: false, result: null, error: String(error) });
    }
  }

  // loadCodex 检查 Codex 插件更新状态。
  async function loadCodex() {
    if (!codexHome) {
      setCodexState({ loading: false, result: null, error: "" });
      return;
    }
    setCodexState((state) => ({ ...state, loading: true, error: "" }));
    try {
      // result 存储 Codex 插件检查结果。
      const result = await checkCodexPluginUpdates(codexHome);
      setCodexState({ loading: false, result, error: "" });
    } catch (error) {
      setCodexState({ loading: false, result: null, error: String(error) });
    }
  }

  // loadAll 并行检查两个工具的插件状态。
  async function loadAll() {
    await Promise.allSettled([loadClaude(), loadCodex()]);
  }

  useEffect(() => {
    void loadAll();
  }, [claudeHome, codexHome]);

  // handleUpdateClaude 更新 Claude 插件。
  // plugin 为需要执行更新的插件信息。
  async function handleUpdateClaude(plugin: ToolPluginInfo) {
    setUpdate({ target: plugin.id, phase: "loading", text: "" });
    try {
      // output 存储 Claude CLI 返回的更新输出。
      const output = await updateClaudePlugin(plugin.id, plugin.scope);
      setUpdate({ target: plugin.id, phase: "ok", text: output || "更新完成" });
      await loadClaude();
    } catch (error) {
      setUpdate({ target: plugin.id, phase: "err", text: String(error) });
    }
  }

  // handleUpdateCodex 更新 Codex 插件。
  // plugin 为需要执行更新的插件信息。
  async function handleUpdateCodex(plugin: ToolPluginInfo) {
    setUpdate({ target: plugin.id, phase: "loading", text: "" });
    try {
      // Codex 插件更新依赖 marketplace 先刷新，否则本地索引可能仍指向旧版本。
      const marketplaceOutput = await updateCodexMarketplace(plugin.marketplace);
      // pluginOutput 存储 Codex CLI 返回的插件更新输出。
      const pluginOutput = await updateCodexPlugin(plugin.id, plugin.marketplace);
      setUpdate({
        target: plugin.id,
        phase: "ok",
        text: [marketplaceOutput, pluginOutput].filter(Boolean).join("\n"),
      });
      await loadCodex();
    } catch (error) {
      setUpdate({ target: plugin.id, phase: "err", text: String(error) });
    }
  }

  return (
    <div className="p-6">
      <PageHeader
        title="插件"
        subtitle="管理 Claude Code 与 Codex 插件，检查可用版本并拉取更新"
        actions={
          <Button onClick={loadAll} variant="default">
            刷新全部
          </Button>
        }
      />

      {update && (
        <div
          className={`mb-4 rounded-lg border p-3 text-xs ${
            update.phase === "err"
              ? "border-red-500/40 text-red-500"
              : update.phase === "ok"
              ? "border-green-500/40 text-green-500"
              : "border-border text-text-muted"
          }`}
        >
          <div className="font-medium">
            {update.phase === "loading"
              ? `正在更新 ${update.target}…`
              : `${update.target} 更新${update.phase === "ok" ? "成功" : "失败"}`}
          </div>
          {update.text && (
            <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap font-mono">
              {update.text}
            </pre>
          )}
        </div>
      )}

      <PluginToolSection
        title="Claude 插件"
        state={claudeState}
        onRefresh={() => {
          void loadClaude();
        }}
        onUpdate={(plugin) => {
          void handleUpdateClaude(plugin);
        }}
      />
      <PluginToolSection
        title="Codex 插件"
        state={codexState}
        onRefresh={() => {
          void loadCodex();
        }}
        onUpdate={(plugin) => {
          void handleUpdateCodex(plugin);
        }}
      />
    </div>
  );
}
