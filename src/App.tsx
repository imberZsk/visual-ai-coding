// 应用根组件：负责初始化全局状态、应用主题、渲染顶部导航与当前页面
import { useEffect } from "react";
import { useAppStore } from "./store";
import { useTheme } from "./hooks/useTheme";
import Sidebar from "./components/Sidebar";
import Dashboard from "./pages/Dashboard";
import ClaudePage from "./pages/ClaudePage";
import CodexPage from "./pages/CodexPage";
import PluginsPage from "./pages/PluginsPage";
import SkillsPage from "./pages/SkillsPage";
import SettingsPage from "./pages/SettingsPage";
import { LoadingIcon } from "./components/ui";

// 根据当前激活页签渲染对应页面组件
function renderPage(tab: string) {
  switch (tab) {
    // 概览页：工具安装状态与快速入口
    case "dashboard":
      return <Dashboard />;
    // Claude Code 配置页
    case "claude":
      return <ClaudePage />;
    // Codex 配置页
    case "codex":
      return <CodexPage />;
    // 插件管理页
    case "plugins":
      return <PluginsPage />;
    // Skill 清单页
    case "skills":
      return <SkillsPage />;
    // 应用设置页
    case "settings":
      return <SettingsPage />;
    // 默认回退到概览
    default:
      return <Dashboard />;
  }
}

// 应用主组件
export default function App() {
  // init 为全局状态初始化方法
  const init = useAppStore((s) => s.init);
  // loaded 标记偏好是否加载完成
  const loaded = useAppStore((s) => s.loaded);
  // activeTab 为当前激活页签，来源于偏好的 last_active_tab
  const activeTab = useAppStore((s) => s.prefs?.last_active_tab || "dashboard");

  // 应用主题（监听偏好与系统变化）
  useTheme();

  // 启动时初始化一次全局状态
  useEffect(() => {
    init().catch((e) => console.error("初始化失败:", e));
  }, [init]);

  // 偏好加载完成前显示占位，避免主题闪烁与空数据渲染
  if (!loaded) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-text-muted">
        <LoadingIcon className="text-accent" />
        <span>加载中…</span>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-surface">
      {/* 顶部导航栏 */}
      <Sidebar />
      {/* 下方内容区：可滚动 */}
      <main className="relative flex-1 overflow-y-auto bg-surface">
        <div key={activeTab} data-testid="tab-content" className="tab-content-enter">
          {renderPage(activeTab)}
        </div>
      </main>
    </div>
  );
}
