// 概览页：展示本机 AI 工具安装状态、配置目录、快速入口
import { useState } from "react";
import { useAppStore } from "../store";
import { PageHeader, Card, Badge, Button } from "../components/ui";
import {
  revealInFinder,
  openInVscode,
  checkToolLatestVersion,
  updateToolCli,
} from "../api";
import type { ToolLatestVersion, ToolStatus } from "../types";
import { comparePluginVersions } from "../utils/versionCompare";

// ToolVersionCheckState 存储单个工具最新版本查询的 UI 状态。
interface ToolVersionCheckState {
  loading: boolean; // loading 表示该工具是否正在查询最新版本。
  updating: boolean; // updating 表示该工具是否正在执行 CLI 更新。
  latestVersion: string; // latestVersion 存储 npm registry 返回的最新版本号。
  error: string; // error 存储最新版本查询失败时的错误信息。
  updateMessage: string; // updateMessage 存储 CLI 更新完成后的结果提示。
}

// ToolVersionCheckMap 按工具 ID 存储每个工具的版本查询状态。
type ToolVersionCheckMap = Record<string, ToolVersionCheckState>;

// createIdleVersionCheck 创建空闲态版本查询状态，用于初始化或重置错误信息。
function createIdleVersionCheck(): ToolVersionCheckState {
  return {
    loading: false,
    updating: false,
    latestVersion: "",
    error: "",
    updateMessage: "",
  };
}

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

// 概览页组件
export default function Dashboard() {
  // tools 为本机工具探测结果
  const tools = useAppStore((s) => s.tools);
  // prefs 为应用偏好，用于取配置目录
  const prefs = useAppStore((s) => s.prefs);
  // refreshTools 用于重新探测工具状态
  const refreshTools = useAppStore((s) => s.refreshTools);
  // updatePrefs 用于切换页签跳转
  const updatePrefs = useAppStore((s) => s.updatePrefs);
  // refreshingTools 标记重新探测是否正在执行，用于控制按钮 loading。
  const [refreshingTools, setRefreshingTools] = useState(false);
  // versionChecks 存储每个工具最新版本查询的加载、结果与错误状态。
  const [versionChecks, setVersionChecks] = useState<ToolVersionCheckMap>({});

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

  // handleCheckLatestVersion 查询指定工具的 npm 最新版本，并把结果写入版本状态表。
  // toolId 参数存储要查询的工具标识，例如 claude 或 codex。
  async function handleCheckLatestVersion(toolId: string) {
    // currentCheck 存储当前工具已有的查询状态，用于阻止重复点击。
    const currentCheck = versionChecks[toolId] ?? createIdleVersionCheck();

    if (currentCheck.loading) {
      // 同一工具已有查询在执行时直接返回，避免重复请求 npm registry。
      return;
    }

    setVersionChecks((checks) => ({
      ...checks,
      [toolId]: {
        ...createIdleVersionCheck(),
        loading: true,
      },
    }));

    try {
      // result 存储后端查询 npm registry 后返回的最新版本信息。
      const result: ToolLatestVersion = await checkToolLatestVersion(toolId);

      setVersionChecks((checks) => ({
        ...checks,
        [toolId]: {
          loading: false,
          updating: false,
          latestVersion: result.latest_version,
          error: "",
          updateMessage: "",
        },
      }));
    } catch (error) {
      // message 存储错误对象转换后的可展示文案，避免 UI 直接渲染非字符串。
      const message = error instanceof Error ? error.message : String(error);

      setVersionChecks((checks) => ({
        ...checks,
        [toolId]: {
          loading: false,
          updating: false,
          latestVersion: "",
          error: message,
          updateMessage: "",
        },
      }));
    }
  }

  // handleUpdateToolCli 更新指定工具 CLI 到最新版，并在完成后重新探测本机工具状态。
  // toolId 参数存储要更新的工具标识，例如 claude 或 codex。
  async function handleUpdateToolCli(toolId: string) {
    // currentCheck 存储当前工具已有的查询/更新状态，用于阻止重复触发。
    const currentCheck = versionChecks[toolId] ?? createIdleVersionCheck();

    if (currentCheck.updating) {
      // 同一工具已有更新在执行时直接返回，避免重复 npm install。
      return;
    }

    setVersionChecks((checks) => ({
      ...checks,
      [toolId]: {
        ...currentCheck,
        updating: true,
        error: "",
        updateMessage: "",
      },
    }));

    try {
      await updateToolCli(toolId);
      setVersionChecks((checks) => ({
        ...checks,
        [toolId]: {
          ...(checks[toolId] ?? createIdleVersionCheck()),
          updating: false,
          updateMessage: "更新完成",
          error: "",
        },
      }));
      await refreshTools();
    } catch (error) {
      // message 存储错误对象转换后的可展示文案，避免 UI 直接渲染非字符串。
      const message = error instanceof Error ? error.message : String(error);

      setVersionChecks((checks) => ({
        ...checks,
        [toolId]: {
          ...(checks[toolId] ?? createIdleVersionCheck()),
          updating: false,
          error: message,
          updateMessage: "",
        },
      }));
    }
  }

  // renderToolCard 渲染单个 AI 工具状态卡片。
  // tool 参数存储当前工具的安装、版本与可执行路径探测结果。
  function renderToolCard(tool: ToolStatus) {
    // versionCheck 存储当前工具最新版本查询的 UI 状态。
    const versionCheck = versionChecks[tool.id] ?? createIdleVersionCheck();
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
                void handleCheckLatestVersion(tool.id);
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
                void handleUpdateToolCli(tool.id);
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
    <div className="p-6">
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

      {/* 工具安装状态卡片 */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {tools.map(renderToolCard)}
      </div>

      {/* 配置目录快速入口 */}
      <div className="mt-6">
        <h2 className="mb-3 text-sm font-medium text-text-main">配置目录</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
