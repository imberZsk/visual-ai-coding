// 插件管理页：展示 Claude 已安装插件与市场，支持手动点击更新
import { useEffect, useState } from "react";
import type { PluginInfo, MarketplaceInfo } from "../types";
import {
  listClaudePlugins,
  listClaudeMarketplaces,
  updateClaudePlugin,
  updateClaudeMarketplace,
  revealInFinder,
} from "../api";
import { useAppStore } from "../store";
import { PageHeader, Card, Badge, Button, EmptyState } from "../components/ui";

// 单条更新操作的结果状态：标识哪条记录正在更新或更新结果
interface UpdateState {
  // 正在更新的目标名称
  target: string;
  // 更新阶段：loading 进行中 / ok 成功 / err 失败
  phase: "loading" | "ok" | "err";
  // 结果文本（CLI 输出或错误信息）
  text: string;
}

// 插件管理页组件
export default function PluginsPage() {
  // claudeHome 为 Claude 配置根目录
  const claudeHome = useAppStore((s) => s.prefs?.claude_home || "");
  // plugins 为已安装插件列表
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  // marketplaces 为已知市场列表
  const [marketplaces, setMarketplaces] = useState<MarketplaceInfo[]>([]);
  // loading 标记列表加载中
  const [loading, setLoading] = useState(true);
  // update 为当前更新操作状态；null 表示无进行中的更新
  const [update, setUpdate] = useState<UpdateState | null>(null);

  // 加载插件与市场列表
  const load = async () => {
    if (!claudeHome) return;
    setLoading(true);
    try {
      // 并行拉取插件与市场列表
      const [p, m] = await Promise.all([
        listClaudePlugins(claudeHome),
        listClaudeMarketplaces(claudeHome),
      ]);
      setPlugins(p);
      setMarketplaces(m);
    } catch (e) {
      console.error("加载插件列表失败:", e);
    } finally {
      setLoading(false);
    }
  };

  // claudeHome 就绪后加载
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claudeHome]);

  // 手动更新单个插件
  // name 为插件全名，scope 为安装作用域（user / project），需透传给后端以更新到正确位置
  const handleUpdatePlugin = async (name: string, scope: string) => {
    // label 为提示用标识，带上 scope 以区分同名插件的不同作用域
    const label = scope ? `${name} (${scope})` : name;
    setUpdate({ target: label, phase: "loading", text: "" });
    try {
      // out 为 CLI 更新输出
      const out = await updateClaudePlugin(name, scope);
      setUpdate({ target: label, phase: "ok", text: out || "更新完成" });
      // 更新后刷新列表以反映新版本
      await load();
    } catch (e) {
      setUpdate({ target: label, phase: "err", text: String(e) });
    }
  };

  // 手动更新单个市场
  const handleUpdateMarketplace = async (name: string) => {
    setUpdate({ target: name, phase: "loading", text: "" });
    try {
      // out 为 CLI 更新输出
      const out = await updateClaudeMarketplace(name);
      setUpdate({ target: name, phase: "ok", text: out || "更新完成" });
      await load();
    } catch (e) {
      setUpdate({ target: name, phase: "err", text: String(e) });
    }
  };

  return (
    <div className="p-6">
      <PageHeader
        title="插件"
        subtitle="管理 Claude Code 插件与市场，可手动触发更新"
        actions={
          <Button onClick={load} variant="default">
            刷新列表
          </Button>
        }
      />

      {/* 更新结果提示条 */}
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

      {loading ? (
        <div className="py-8 text-center text-sm text-text-muted">加载中…</div>
      ) : (
        <>
          {/* 已安装插件区块 */}
          <h2 className="mb-3 text-sm font-medium text-text-main">
            已安装插件（{plugins.length}）
          </h2>
          {plugins.length === 0 ? (
            <EmptyState text="未发现已安装插件" />
          ) : (
            <div className="space-y-3">
              {plugins.map((p) => (
                <Card key={`${p.name}-${p.scope}-${p.install_path}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-text-main">{p.name}</span>
                        <Badge tone="info">v{p.version}</Badge>
                        <Badge tone="neutral">{p.scope}</Badge>
                      </div>
                      <div className="mt-1 space-y-0.5 text-xs text-text-muted">
                        <div>市场：{p.marketplace || "—"}</div>
                        <div className="truncate" title={p.git_commit_sha}>
                          commit：{p.git_commit_sha ? p.git_commit_sha.slice(0, 10) : "—"}
                        </div>
                        <div>最近更新：{p.last_updated || "—"}</div>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Button
                        onClick={() => revealInFinder(p.install_path).catch(console.error)}
                        variant="ghost"
                      >
                        Finder
                      </Button>
                      <Button
                        onClick={() => handleUpdatePlugin(p.name, p.scope)}
                        variant="primary"
                        disabled={update?.phase === "loading"}
                      >
                        更新
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {/* 插件市场区块 */}
          <h2 className="mb-3 mt-6 text-sm font-medium text-text-main">
            插件市场（{marketplaces.length}）
          </h2>
          {marketplaces.length === 0 ? (
            <EmptyState text="未发现插件市场" />
          ) : (
            <div className="space-y-3">
              {marketplaces.map((m) => (
                <Card key={m.name}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-text-main">{m.name}</span>
                        <Badge tone="neutral">{m.source_type || "—"}</Badge>
                      </div>
                      <div className="mt-1 space-y-0.5 text-xs text-text-muted">
                        <div className="truncate" title={m.source}>
                          来源：{m.source || "—"}
                        </div>
                        <div>最近更新：{m.last_updated || "—"}</div>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Button
                        onClick={() => handleUpdateMarketplace(m.name)}
                        variant="primary"
                        disabled={update?.phase === "loading"}
                      >
                        更新市场
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
