// 顶部导航栏：页签切换 + 主题快速切换，布局参考 visual-worktree
import { useState, type MouseEvent } from "react";
import { useAppStore } from "../store";
import { NAV_ITEMS } from "../config";
import { SettingsContent } from "../pages/SettingsPage";

// 主题模式循环顺序：light → dark → system
const THEME_CYCLE = ["light", "dark", "system"] as const;

// 主题模式对应的纯图标。
const THEME_ICON: Record<string, string> = {
  light: "☀",
  dark: "☾",
  system: "⊙",
};

// 下一主题模式对应的无障碍提示。
const NEXT_THEME_LABEL: Record<string, string> = {
  light: "切换到深色主题",
  dark: "切换到跟随系统主题",
  system: "切换到浅色主题",
};

// 顶部导航组件
export default function Sidebar() {
  // settingsOpen 标记右侧设置抽屉是否展开。
  const [settingsOpen, setSettingsOpen] = useState(false);
  // activeTab 为当前激活页签
  const activeTab = useAppStore((s) => s.prefs?.last_active_tab || "dashboard");
  // theme 为当前主题模式
  const theme = useAppStore((s) => s.prefs?.theme || "system");
  // updatePrefs 用于切换页签与主题并持久化
  const updatePrefs = useAppStore((s) => s.updatePrefs);
  // activeIndex 存储当前激活页签在导航中的位置，用于驱动 segmented 背景滑块移动。
  const activeIndex = NAV_ITEMS.findIndex((item) => item.id === activeTab);
  // hasVisibleActiveTab 标记当前页签是否存在于主导航，Dashboard 等隐藏入口不显示滑块。
  const hasVisibleActiveTab = activeIndex >= 0;

  // 切换到指定页签
  const goTab = (id: string) => updatePrefs({ last_active_tab: id });

  // 打开设置抽屉。
  const openSettings = () => setSettingsOpen(true);

  // 关闭设置抽屉。
  const closeSettings = () => setSettingsOpen(false);

  // 从设置抽屉切换到概览页，并关闭抽屉。
  const openDashboard = () => {
    updatePrefs({ last_active_tab: "dashboard" });
    setSettingsOpen(false);
  };

  // stopDrawerClick 阻止抽屉内部点击冒泡到遮罩，避免用户编辑设置时误关闭抽屉。
  const stopDrawerClick = (event: MouseEvent<HTMLElement>) => {
    event.stopPropagation();
  };

  // 循环切换主题模式
  const cycleTheme = () => {
    // idx 为当前主题在循环中的位置
    const idx = THEME_CYCLE.indexOf(theme as (typeof THEME_CYCLE)[number]);
    // next 为下一个主题模式（越界回环到 0）
    const next = THEME_CYCLE[(idx + 1) % THEME_CYCLE.length];
    updatePrefs({ theme: next });
  };

  return (
    <>
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-panel px-4">
        {/* 左侧：应用标题 + 主导航 */}
        <div className="flex min-w-0 items-center gap-4">
          <div className="min-w-0 whitespace-nowrap text-base font-semibold text-text-main">
            Visual AI Coding
          </div>

          {/* 页签列表 */}
          <nav
            aria-label="主导航"
            className="relative grid min-w-0 grid-flow-col items-center rounded-lg bg-sidebar p-1"
            style={{
              gridTemplateColumns: `repeat(${NAV_ITEMS.length}, minmax(0, 1fr))`,
            }}
          >
            <div
              data-testid="tab-active-indicator"
              className="absolute bottom-1 left-1 top-1 rounded-md border border-border bg-panel shadow-sm transition-all duration-200 ease-out"
              style={{
                width: `calc((100% - 0.5rem) / ${NAV_ITEMS.length})`,
                opacity: hasVisibleActiveTab ? 1 : 0,
                transform: `translateX(${Math.max(activeIndex, 0) * 100}%)`,
              }}
            />
            {NAV_ITEMS.map((item) => {
              // active 标记该页签是否为当前激活项。
              const active = item.id === activeTab;
              return (
                <button
                  key={item.id}
                  onClick={() => goTab(item.id)}
                  className={`relative z-10 whitespace-nowrap rounded-md px-3 py-1.5 text-sm transition-colors ${
                    active
                      ? "text-text-main"
                      : "text-text-muted/70 hover:bg-panel hover:text-text-main"
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* 右侧快捷操作 */}
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={cycleTheme}
            aria-label={NEXT_THEME_LABEL[theme] || NEXT_THEME_LABEL.system}
            title={NEXT_THEME_LABEL[theme] || NEXT_THEME_LABEL.system}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface text-base text-text-main transition-colors hover:bg-sidebar"
          >
            <span aria-hidden="true">{THEME_ICON[theme] || THEME_ICON.system}</span>
          </button>
          <button
            onClick={openSettings}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-text-main transition-colors hover:bg-sidebar"
          >
            <span aria-hidden="true">⚙</span>
            <span>设置</span>
          </button>
        </div>
      </header>

      {/* 设置抽屉：从右侧覆盖当前页面，保留页面上下文。 */}
      {settingsOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={closeSettings}>
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="设置"
            className="h-full w-full max-w-md overflow-y-auto border-l border-border bg-panel shadow-xl"
            onClick={stopDrawerClick}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-panel px-5 py-4">
              <h2 className="text-base font-semibold text-text-main">设置</h2>
              <button
                onClick={closeSettings}
                aria-label="关闭设置"
                title="关闭设置"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface hover:text-text-main"
              >
                <span aria-hidden="true">×</span>
              </button>
            </div>
            <div className="p-5">
              <SettingsContent onOpenDashboard={openDashboard} />
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
