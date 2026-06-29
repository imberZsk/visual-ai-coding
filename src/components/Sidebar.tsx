// 左侧导航栏：页签切换 + 主题快速切换
import { useAppStore } from "../store";
import { NAV_ITEMS } from "../config";

// 主题模式循环顺序：light → dark → system
const THEME_CYCLE = ["light", "dark", "system"] as const;

// 主题模式对应的展示图标与文字
const THEME_LABEL: Record<string, string> = {
  light: "☀ 浅色",
  dark: "☾ 深色",
  system: "⊙ 跟随系统",
};

// 侧边导航组件
export default function Sidebar() {
  // activeTab 为当前激活页签
  const activeTab = useAppStore((s) => s.prefs?.last_active_tab || "dashboard");
  // theme 为当前主题模式
  const theme = useAppStore((s) => s.prefs?.theme || "system");
  // updatePrefs 用于切换页签与主题并持久化
  const updatePrefs = useAppStore((s) => s.updatePrefs);

  // 切换到指定页签
  const goTab = (id: string) => updatePrefs({ last_active_tab: id });

  // 循环切换主题模式
  const cycleTheme = () => {
    // idx 为当前主题在循环中的位置
    const idx = THEME_CYCLE.indexOf(theme as (typeof THEME_CYCLE)[number]);
    // next 为下一个主题模式（越界回环到 0）
    const next = THEME_CYCLE[(idx + 1) % THEME_CYCLE.length];
    updatePrefs({ theme: next });
  };

  return (
    <aside className="flex h-full w-52 flex-col border-r border-border bg-panel">
      {/* 应用标题 */}
      <div className="px-5 py-5">
        <div className="text-base font-semibold text-text-main">
          Visual AI Coding
        </div>
        <div className="mt-1 text-xs text-text-muted">AI 工具配置可视化</div>
      </div>

      {/* 页签列表 */}
      <nav className="flex-1 px-3">
        {NAV_ITEMS.map((item) => {
          // active 标记该页签是否为当前激活项
          const active = item.id === activeTab;
          return (
            <button
              key={item.id}
              onClick={() => goTab(item.id)}
              className={`mb-1 w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                active
                  ? "bg-accent text-white"
                  : "text-text-muted hover:bg-surface hover:text-text-main"
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* 底部主题切换按钮 */}
      <div className="px-3 pb-4">
        <button
          onClick={cycleTheme}
          className="w-full rounded-lg border border-border px-3 py-2 text-sm text-text-main transition-colors hover:bg-surface"
        >
          {THEME_LABEL[theme] || "⊙ 跟随系统"}
        </button>
      </div>
    </aside>
  );
}
