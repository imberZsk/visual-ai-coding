// 左侧控制台导航栏：承载主模块切换、主题快捷切换与设置抽屉入口
import {
  ApiOutlined,
  AppstoreOutlined,
  CodeOutlined,
  DashboardOutlined,
  DesktopOutlined,
  ExperimentOutlined,
  FileSearchOutlined,
  MoonOutlined,
  RobotOutlined,
  SettingOutlined,
  SunOutlined,
  ThunderboltOutlined,
  ToolOutlined,
} from "@ant-design/icons";
import { useState, type ReactNode } from "react";
import { Button as AntButton, Drawer } from "antd";
import { useAppStore } from "../store";
import { NAV_ITEMS } from "../config";
import { SettingsContent } from "../pages/SettingsPage";

// 侧边栏导航项结构：id 对应页面标识，label 为展示文案，icon 为 Ant Design 图标。
interface SidebarNavItem {
  id: string; // id 存储页面标识，写入偏好的 last_active_tab。
  label: string; // label 存储导航展示名称和无障碍名称。
  icon: ReactNode; // icon 存储当前导航项使用的 Ant Design 图标。
}

// OVERVIEW_NAV_ITEM 存储概览页入口，概览是默认页但不在配置里的工具导航列表中。
const OVERVIEW_NAV_ITEM: SidebarNavItem = {
  id: "dashboard",
  label: "概览",
  icon: <DashboardOutlined aria-hidden="true" />,
};

// NAV_ITEM_ICONS 存储各页面对应的统一线性图标。
const NAV_ITEM_ICONS: Record<string, ReactNode> = {
  claude: <CodeOutlined aria-hidden="true" />,
  codex: <ThunderboltOutlined aria-hidden="true" />,
  hooks: <ApiOutlined aria-hidden="true" />,
  mcp: <ToolOutlined aria-hidden="true" />,
  agents: <RobotOutlined aria-hidden="true" />,
  plugins: <AppstoreOutlined aria-hidden="true" />,
  skills: <FileSearchOutlined aria-hidden="true" />,
};

// THEME_CYCLE 存储主题模式循环顺序：light → dark → system。
const THEME_CYCLE = ["light", "dark", "system"] as const;

// THEME_ICON 存储当前主题模式对应的 Ant Design 图标。
const THEME_ICON: Record<string, ReactNode> = {
  light: <SunOutlined aria-hidden="true" />,
  dark: <MoonOutlined aria-hidden="true" />,
  system: <DesktopOutlined aria-hidden="true" />,
};

// NEXT_THEME_LABEL 存储主题快捷按钮的下一步动作说明。
const NEXT_THEME_LABEL: Record<string, string> = {
  light: "切换到深色主题",
  dark: "切换到跟随系统主题",
  system: "切换到浅色主题",
};

// createSidebarNavItems 将配置里的主导航转换为侧边栏导航项。
function createSidebarNavItems(): SidebarNavItem[] {
  // toolNavItems 存储配置导航项补齐图标后的结果。
  const toolNavItems = NAV_ITEMS.map((item) => ({
    id: item.id,
    label: item.label,
    icon: NAV_ITEM_ICONS[item.id] ?? <ExperimentOutlined aria-hidden="true" />,
  }));

  return [OVERVIEW_NAV_ITEM, ...toolNavItems];
}

// SidebarNavButtonProps 描述单个侧边栏导航按钮的渲染参数。
interface SidebarNavButtonProps {
  item: SidebarNavItem; // item 存储当前要渲染的导航项。
  active: boolean; // active 标记当前导航项是否对应正在展示的页面。
  onSelect: (id: string) => void; // onSelect 存储点击后切换页面的回调。
}

// SidebarNavButton 渲染单个主导航入口，使用原生 button 以精确控制选中态和焦点态。
function SidebarNavButton({ item, active, onSelect }: SidebarNavButtonProps) {
  // activeClassName 存储当前项选中时的强调样式。
  const activeClassName = active
    ? "border-text-main bg-panel-soft text-text-main shadow-sm"
    : "border-transparent text-text-muted hover:border-border-strong hover:bg-panel-soft hover:text-text-main";
  // buttonClassName 存储导航按钮的完整 className。
  const buttonClassName = [
    "group flex h-10 w-full cursor-pointer items-center gap-3 rounded-md border-l-2 px-3 text-left text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-strong max-md:justify-center max-md:px-0",
    activeClassName,
  ].join(" ");

  return (
    <button
      type="button"
      aria-current={active ? "page" : undefined}
      className={buttonClassName}
      onClick={() => onSelect(item.id)}
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center text-base">
        {item.icon}
      </span>
      <span className="min-w-0 truncate max-md:sr-only">{item.label}</span>
    </button>
  );
}

// Sidebar 渲染应用左侧导航与设置抽屉。
export default function Sidebar() {
  // settingsOpen 标记右侧设置抽屉是否展开。
  const [settingsOpen, setSettingsOpen] = useState(false);
  // activeTab 存储当前激活页签，空值回退到概览。
  const activeTab = useAppStore((s) => s.prefs?.last_active_tab || "dashboard");
  // theme 存储当前主题模式，默认深色。
  const theme = useAppStore((s) => s.prefs?.theme || "dark");
  // updatePrefs 存储切换页面与主题时使用的偏好更新方法。
  const updatePrefs = useAppStore((s) => s.updatePrefs);
  // navItems 存储当前侧边栏主导航项。
  const navItems = createSidebarNavItems();

  // goTab 切换到指定页面。
  const goTab = (id: string) => updatePrefs({ last_active_tab: id });

  // openSettings 打开设置抽屉。
  const openSettings = () => setSettingsOpen(true);

  // closeSettings 关闭设置抽屉。
  const closeSettings = () => setSettingsOpen(false);

  // cycleTheme 循环切换主题模式。
  const cycleTheme = () => {
    // idx 存储当前主题在循环数组中的位置。
    const idx = THEME_CYCLE.indexOf(theme as (typeof THEME_CYCLE)[number]);
    // next 存储下一主题模式，当前主题异常时回退到 dark 的下一项。
    const next = THEME_CYCLE[((idx < 0 ? 1 : idx) + 1) % THEME_CYCLE.length];
    void updatePrefs({ theme: next });
  };

  return (
    <>
      <aside
        data-testid="app-sidebar"
        className="flex h-full w-60 shrink-0 flex-col border-r border-border bg-sidebar px-3 py-4 max-md:w-16 max-md:px-2"
      >
        <div className="mb-5 flex h-10 items-center gap-3 px-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-panel-soft text-lg text-text-main">
            <AppstoreOutlined aria-hidden="true" />
          </span>
          <div className="min-w-0 max-md:hidden">
            <div className="truncate text-sm font-semibold text-text-main">Visual AI Coding</div>
            <div className="truncate text-xs text-text-muted">配置与插件控制台</div>
          </div>
        </div>

        <nav aria-label="主导航" className="flex flex-1 flex-col gap-1">
          {navItems.map((item) => (
            <SidebarNavButton
              key={item.id}
              item={item}
              active={activeTab === item.id}
              onSelect={goTab}
            />
          ))}
        </nav>

        <div className="mt-4 grid grid-cols-[2.25rem_minmax(0,1fr)] gap-2 border-t border-border pt-4 max-md:grid-cols-1">
          <AntButton
            className="h-9 w-9"
            icon={THEME_ICON[theme] || THEME_ICON.dark}
            onClick={cycleTheme}
            title={NEXT_THEME_LABEL[theme] || NEXT_THEME_LABEL.dark}
            aria-label={NEXT_THEME_LABEL[theme] || NEXT_THEME_LABEL.dark}
            type="text"
          />
          <AntButton
            block
            className="justify-start max-md:h-9 max-md:w-9 max-md:px-0"
            icon={<SettingOutlined aria-hidden="true" />}
            onClick={openSettings}
            type="text"
          >
            <span className="max-md:sr-only">设置</span>
          </AntButton>
        </div>
      </aside>

      <Drawer
        destroyOnHidden
        open={settingsOpen}
        title="设置"
        width={760}
        onClose={closeSettings}
      >
        <SettingsContent />
      </Drawer>
    </>
  );
}
