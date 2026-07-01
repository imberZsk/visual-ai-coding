// 概览页：展示本机 AI 工具安装状态、配置目录、快速入口
import { useState } from "react";
import { useAppStore } from "../store";
import { PageHeader, Card, Badge, Button } from "../components/ui";
import { revealInFinder, openInVscode } from "../api";
import type { ToolStatus } from "../types";
import { comparePluginVersions } from "../utils/versionCompare";

// IDLE_VERSION_CHECK 存储工具版本查询的空闲态兜底值，避免未查询工具访问 undefined。
const IDLE_VERSION_CHECK = {
  loading: false,
  updating: false,
  latestVersion: "",
  error: "",
  updateMessage: "",
};

// extractVersionNumber 从工具版本文本中提取 semver 主体，versionText 参数存储命令行探测到的原始版本输出。
function extractVersionNumber(versionText: string): string {
  // match 存储从版本文本中匹配到的 semver 片段。
  const match = versionText.match(/\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?/);

  return match?.[0] ?? versionText.trim();
}

// getVersionBadge 根据本地版本与最新版本返回展示徽章，currentVersion 参数存储本地版本文本，latestVersion 参数存储 npm 最新版本。
function getVersionBadge(currentVersion: string, latestVersion: string) {
  // currentSemver 存储可比较的本地 semver 版本号。
  const currentSemver = extractVersionNumber(currentVersion);
  // updateStatus 存储本地版本相对最新版本的比较结果。
  const updateStatus = comparePluginVersions(currentSemver, latestVersion);

  if (updateStatus === "newer") {
    return <Badge tone="warning">可更新</Badge>;
  }

  if (updateStatus === "same") {
    return <Badge tone="success">已最新</Badge>;
  }

  return <Badge tone="neutral">需确认</Badge>;
}

// getToolUpdateStatus 根据本地版本与最新版本返回可更新状态。
// currentVersion 参数存储本地版本文本，latestVersion 参数存储 npm 最新版本。
function getToolUpdateStatus(currentVersion: string, latestVersion: string) {
  // currentSemver 存储可比较的本地 semver 版本号。
  const currentSemver = extractVersionNumber(currentVersion);

  return comparePluginVersions(currentSemver, latestVersion);
}

// DashboardContentProps 定义概览内容在页面或抽屉中的布局参数。
interface DashboardContentProps {
  compact?: boolean; // compact 标记是否在抽屉内用更紧凑的间距与两列策略。
}

// DashboardContent 渲染概览主体，可同时用于独立页面和设置抽屉。
export function DashboardContent({ compact = false }: DashboardContentProps) {
  // tools 为本机工具探测结果
  const tools = useAppStore((s) => s.tools);
  // prefs 为应用偏好，用于取配置目录
  const prefs = useAppStore((s) => s.prefs);
  // refreshTools 用于重新探测工具状态
  const refreshTools = useAppStore((s) => s.refreshTools);
  // updatePrefs 用于切换页签跳转
  const updatePrefs = useAppStore((s) => s.updatePrefs);
  // versionChecks 存储跨 tab 保留的每个工具最新版本查询状态。
  const versionChecks = useAppStore((s) => s.toolVersionChecks);
  // checkLatestToolVersion 用于查询指定工具 npm 最新版本，状态写入全局 store。
  const checkLatestToolVersion = useAppStore((s) => s.checkLatestToolVersion);
  // updateToolToLatest 用于更新指定工具 CLI，状态写入全局 store。
  const updateToolToLatest = useAppStore((s) => s.updateToolToLatest);
  // refreshingTools 标记重新探测是否正在执行，用于控制按钮 loading。
  const [refreshingTools, setRefreshingTools] = useState(false);

  // 在 Finder 打开指定目录
  const reveal = (p: string) => revealInFinder(p).catch((e) => console.error(e));
  // 在 VSCode 打开指定目录
  const openVscode = (p: string) =>
    openInVscode(prefs?.vscode_path || "code", p).catch((e) => console.error(e));

  // handleRefreshTools 触发工具重新探测，并在异步期间维持按钮 loading。
  async function handleRefreshTools() {
    if (refreshingTools) {
      // 已有探测在执行时直接返回，避免重复触发后端扫描。
      return;
    }

    setRefreshingTools(true);
    try {
      await refreshTools();
    } catch (error) {
      // error 存储重新探测失败原因，先输出到控制台保持页面可恢复。
      console.error(error);
    } finally {
      setRefreshingTools(false);
    }
  }

  // renderToolCard 渲染单个 AI 工具状态卡片。
  // tool 参数存储当前工具的安装、版本与可执行路径探测结果。
  function renderToolCard(tool: ToolStatus) {
    // versionCheck 存储当前工具最新版本查询的 UI 状态。
    const versionCheck = versionChecks[tool.id] ?? IDLE_VERSION_CHECK;
    // canCheckLatestVersion 标记当前工具是否支持查询 npm 最新版本。
    const canCheckLatestVersion =
      tool.installed && (tool.id === "claude" || tool.id === "codex");
    // updateStatus 存储当前工具是否落后于 npm 最新版本。
    const updateStatus = versionCheck.latestVersion
      ? getToolUpdateStatus(tool.version, versionCheck.latestVersion)
      : "unknown";

    return (
      <Card key={tool.id}>
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-base font-semibold text-text-main">
                {tool.name}
              </span>
              {/* 安装状态徽章 */}
              {tool.installed ? (
                <Badge tone="success">已安装</Badge>
              ) : (
                <Badge tone="warning">未检测到</Badge>
              )}
            </div>
            {/* 版本与路径信息 */}
            <div className="mt-2 space-y-1 text-xs text-text-muted">
              <div className="truncate" title={tool.version}>
                版本：{tool.version || "—"}
              </div>
              <div className="truncate" title={tool.path}>
                路径：{tool.path || "—"}
              </div>
              {versionCheck.latestVersion && (
                <div className="flex flex-wrap items-center gap-2">
                  <span>最新版本：{versionCheck.latestVersion}</span>
                  {getVersionBadge(tool.version, versionCheck.latestVersion)}
                </div>
              )}
              {versionCheck.error && (
                <div className="text-amber-500">
                  查询失败：{versionCheck.error}
                </div>
              )}
              {versionCheck.updateMessage && (
                <div className="text-green-500">{versionCheck.updateMessage}</div>
              )}
            </div>
          </div>
        </div>
        {/* 快速跳转到对应配置页 */}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            onClick={() =>
              updatePrefs({
                last_active_tab: tool.id === "claude" ? "claude" : "codex",
              })
            }
            variant="primary"
          >
            管理配置
          </Button>
          {canCheckLatestVersion && (
            <Button
              onClick={() => {
                void checkLatestToolVersion(tool.id);
              }}
              variant="default"
              loading={versionCheck.loading}
            >
              查询最新版本
            </Button>
          )}
          {updateStatus === "newer" && (
            <Button
              onClick={() => {
                void updateToolToLatest(tool.id);
              }}
              variant="primary"
              loading={versionCheck.updating}
            >
              更新到最新版
            </Button>
          )}
        </div>
      </Card>
    );
  }

  return (
    <div className={compact ? "space-y-4" : ""}>
      {compact ? (
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-medium text-text-main">概览</h3>
            <p className="mt-1 text-xs text-text-muted">本机 AI 编码工具状态与配置入口</p>
          </div>
          <Button
            onClick={() => {
              void handleRefreshTools();
            }}
            variant="default"
            loading={refreshingTools}
          >
            重新探测
          </Button>
        </div>
      ) : (
        <PageHeader
          title="概览"
          subtitle="本机 AI 编码工具状态与配置入口"
          actions={
            <Button
              onClick={() => {
                void handleRefreshTools();
              }}
              variant="default"
              loading={refreshingTools}
            >
              重新探测
            </Button>
          }
        />
      )}

      {/* 工具安装状态卡片 */}
      <div className={`grid grid-cols-1 gap-4 ${compact ? "xl:grid-cols-2" : "md:grid-cols-2"}`}>
        {tools.map(renderToolCard)}
      </div>

      {/* 配置目录快速入口 */}
      <div className={compact ? "" : "mt-6"}>
        <h2 className="mb-3 text-sm font-medium text-text-main">配置目录</h2>
        <div className={`grid grid-cols-1 gap-4 ${compact ? "xl:grid-cols-2" : "md:grid-cols-2"}`}>
          {/* Claude 配置目录 */}
          <Card>
            <div className="mb-2 text-sm font-medium text-text-main">
              Claude Code
            </div>
            <div
              className="mb-3 truncate text-xs text-text-muted"
              title={prefs?.claude_home}
            >
              {prefs?.claude_home || "—"}
            </div>
            <div className="flex gap-2">
              <Button onClick={() => reveal(prefs?.claude_home || "")} variant="ghost">
                Finder
              </Button>
              <Button onClick={() => openVscode(prefs?.claude_home || "")} variant="default">
                VSCode
              </Button>
            </div>
          </Card>
          {/* Codex 配置目录 */}
          <Card>
            <div className="mb-2 text-sm font-medium text-text-main">Codex</div>
            <div
              className="mb-3 truncate text-xs text-text-muted"
              title={prefs?.codex_home}
            >
              {prefs?.codex_home || "—"}
            </div>
            <div className="flex gap-2">
              <Button onClick={() => reveal(prefs?.codex_home || "")} variant="ghost">
                Finder
              </Button>
              <Button onClick={() => openVscode(prefs?.codex_home || "")} variant="default">
                VSCode
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

// 概览页组件
export default function Dashboard() {
  return (
    <div className="p-6">
      <DashboardContent />
    </div>
  );
}
