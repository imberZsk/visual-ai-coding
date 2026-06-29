// 概览页：展示本机 AI 工具安装状态、配置目录、快速入口
import { useAppStore } from "../store";
import { PageHeader, Card, Badge, Button } from "../components/ui";
import { revealInFinder, openInVscode } from "../api";

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

  // 在 Finder 打开指定目录
  const reveal = (p: string) => revealInFinder(p).catch((e) => console.error(e));
  // 在 VSCode 打开指定目录
  const openVscode = (p: string) =>
    openInVscode(prefs?.vscode_path || "code", p).catch((e) => console.error(e));

  return (
    <div className="p-6">
      <PageHeader
        title="概览"
        subtitle="本机 AI 编码工具状态与配置入口"
        actions={
          <Button onClick={() => refreshTools()} variant="default">
            重新探测
          </Button>
        }
      />

      {/* 工具安装状态卡片 */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {tools.map((tool) => (
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
                </div>
              </div>
            </div>
            {/* 快速跳转到对应配置页 */}
            <div className="mt-3 flex gap-2">
              <Button
                onClick={() =>
                  updatePrefs({ last_active_tab: tool.id === "claude" ? "claude" : "codex" })
                }
                variant="primary"
              >
                管理配置
              </Button>
            </div>
          </Card>
        ))}
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
