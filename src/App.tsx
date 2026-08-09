// 应用根组件：负责初始化全局状态、应用主题、渲染侧边导航与当前页面
import { useEffect } from 'react'
import { useAppStore } from './store'
import { useTheme } from './hooks/useTheme'
import Sidebar from './components/Sidebar'
import Dashboard from './pages/Dashboard'
import ClaudePage from './pages/ClaudePage'
import CodexPage from './pages/CodexPage'
import HooksPage from './pages/HooksPage'
import McpPage from './pages/McpPage'
import AgentsPage from './pages/AgentsPage'
import PluginsPage from './pages/PluginsPage'
import MarketplacePage from './pages/MarketplacePage'
import SkillsPage from './pages/SkillsPage'
import SettingsPage from './pages/SettingsPage'
import UnifiedPage from './pages/UnifiedPage'
import QuotaPage from './pages/QuotaPage'
import { LoadingIcon } from './components/ui'
import AppUpdateButton from './components/AppUpdateButton'

// IS_MACOS 标记当前渲染进程是否运行于 macOS，用于给系统交通灯保留安全区域。
const IS_MACOS = navigator.userAgent.includes('Macintosh')

// 根据当前激活页签渲染对应页面组件
function renderPage(tab: string) {
  switch (tab) {
    // 概览页：工具安装状态与快速入口
    case 'dashboard':
      return <Dashboard />
    // Claude Code 配置页
    case 'claude':
      return <ClaudePage />
    // Codex 配置页
    case 'codex':
      return <CodexPage />
    // 历史能力页签回退到 Codex 分组，兼容升级前保存的偏好值
    case 'hooks':
    case 'codex-hooks':
      return <HooksPage tool="codex" />
    case 'claude-hooks':
      return <HooksPage tool="claude" />
    case 'mcp':
    case 'codex-mcp':
      return <McpPage tool="codex" />
    case 'claude-mcp':
      return <McpPage tool="claude" />
    case 'agents':
    case 'codex-agents':
      return <AgentsPage tool="codex" />
    case 'claude-agents':
      return <AgentsPage tool="claude" />
    case 'plugins':
    case 'codex-plugins':
      return <PluginsPage tool="codex" />
    case 'claude-plugins':
      return <PluginsPage tool="claude" />
    case 'codex-marketplace':
      return <MarketplacePage tool="codex" />
    case 'claude-marketplace':
      return <MarketplacePage tool="claude" />
    case 'skills':
    case 'codex-skills':
      return <SkillsPage tool="codex" />
    case 'claude-skills':
      return <SkillsPage tool="claude" />
    // 统一配置页：一次编写 MCP / Skills，同步到两端
    case 'unified':
      return <UnifiedPage />
    // 模型额度管理页：维护供应商账户并查询剩余额度
    case 'quota':
      return <QuotaPage />
    // 应用设置页
    case 'settings':
      return <SettingsPage />
    // 默认回退到概览
    default:
      return <Dashboard />
  }
}

// 应用主组件
export default function App() {
  // init 为全局状态初始化方法
  const init = useAppStore((s) => s.init)
  // loaded 标记偏好是否加载完成
  const loaded = useAppStore((s) => s.loaded)
  // activeTab 为当前激活页签，来源于偏好的 last_active_tab
  const activeTab = useAppStore((s) => s.prefs?.last_active_tab || 'dashboard')

  // 应用主题（监听偏好与系统变化）
  useTheme()

  // 启动时初始化一次全局状态
  useEffect(() => {
    init().catch((e) => console.error('初始化失败:', e))
  }, [init])

  // 偏好加载完成前显示占位，避免主题闪烁与空数据渲染
  if (!loaded) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-text-muted">
        <LoadingIcon className="text-text-muted" />
        <span>加载中…</span>
      </div>
    )
  }

  return (
    <div
      data-testid="app-shell"
      className={`app-shell flex h-full w-full flex-row overflow-hidden bg-surface text-text-main${IS_MACOS ? ' app-shell--macos' : ''}`}
    >
      {/* 左侧控制台导航栏 */}
      <AppUpdateButton />
      <Sidebar />
      {/* 右侧内容区：可滚动。scrollbar-gutter:stable 预留滚动条宽度，内容高度变化导致滚动条出现/消失时避免内容区横向跳动（CLS） */}
      <main className="app-main relative min-w-0 flex-1 overflow-y-auto bg-surface [scrollbar-gutter:stable]">
        <div
          key={activeTab}
          data-testid="tab-content"
          className="tab-content-enter"
        >
          {renderPage(activeTab)}
        </div>
      </main>
    </div>
  )
}
