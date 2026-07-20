// 左侧控制台导航栏：使用 Ant Design 层级菜单承载工具与各自能力入口。
import {
  ApiOutlined,
  AppstoreOutlined,
  CodeOutlined,
  DashboardOutlined,
  DeploymentUnitOutlined,
  DesktopOutlined,
  FileSearchOutlined,
  MoonOutlined,
  RobotOutlined,
  SettingOutlined,
  SunOutlined,
  ThunderboltOutlined,
  ToolOutlined,
} from '@ant-design/icons'
import { useState, type ReactNode } from 'react'
import { Button as AntButton, Drawer, Menu, type MenuProps } from 'antd'
import { useAppStore } from '../store'
import { TOOL_NAV_GROUPS } from '../config'
import { SettingsContent } from '../pages/SettingsPage'

// CAPABILITY_ICONS 存储二级能力对应的 Ant Design 图标。
const CAPABILITY_ICONS: Record<string, ReactNode> = {
  config: <SettingOutlined aria-hidden="true" />,
  mcp: <ToolOutlined aria-hidden="true" />,
  hooks: <ApiOutlined aria-hidden="true" />,
  agents: <RobotOutlined aria-hidden="true" />,
  plugins: <AppstoreOutlined aria-hidden="true" />,
  skills: <FileSearchOutlined aria-hidden="true" />,
}

// TOOL_ICONS 存储一级工具对应的 Ant Design 图标。
const TOOL_ICONS: Record<string, ReactNode> = {
  codex: <ThunderboltOutlined aria-hidden="true" />,
  claude: <CodeOutlined aria-hidden="true" />,
}

// THEME_CYCLE 存储主题模式循环顺序：light -> dark -> system。
const THEME_CYCLE = ['light', 'dark', 'system'] as const

// THEME_ICON 存储当前主题模式对应的 Ant Design 图标。
const THEME_ICON: Record<string, ReactNode> = {
  light: <SunOutlined aria-hidden="true" />,
  dark: <MoonOutlined aria-hidden="true" />,
  system: <DesktopOutlined aria-hidden="true" />,
}

// NEXT_THEME_LABEL 存储主题快捷按钮的下一步动作说明。
const NEXT_THEME_LABEL: Record<string, string> = {
  light: '切换到深色主题',
  dark: '切换到跟随系统主题',
  system: '切换到浅色主题',
}

// createMenuItems 将工具导航配置转换为 Ant Design Menu 的层级数据。
function createMenuItems(): MenuProps['items'] {
  // toolItems 存储 Codex 与 Claude Code 的一级分组及二级能力。
  const toolItems: NonNullable<MenuProps['items']> = TOOL_NAV_GROUPS.map(
    (group) => ({
      key: `group-${group.id}`,
      icon: TOOL_ICONS[group.id],
      label: group.label,
      children: group.children.map((item) => {
        // capability 存储路由末段，用于匹配能力图标；工具本身路由对应“配置”。
        const capability =
          item.id === group.id ? 'config' : item.id.replace(`${group.id}-`, '')
        return {
          key: item.id,
          icon: CAPABILITY_ICONS[capability],
          label: item.label,
        }
      }),
    })
  )

  return [
    {
      key: 'dashboard',
      icon: <DashboardOutlined aria-hidden="true" />,
      label: 'Dashboard',
    },
    {
      key: 'unified',
      icon: <DeploymentUnitOutlined aria-hidden="true" />,
      label: 'Unified',
    },
    { type: 'divider' },
    ...toolItems,
  ]
}

// normalizeActiveTab 将旧版跨工具页签映射到 Codex 分组，确保升级后仍有明确选中态。
function normalizeActiveTab(activeTab: string): string {
  // legacyTabs 存储升级前可能持久化的跨工具页签名称。
  const legacyTabs = new Set(['mcp', 'hooks', 'agents', 'plugins', 'skills'])
  return legacyTabs.has(activeTab) ? `codex-${activeTab}` : activeTab
}

// activeToolGroup 根据当前页面返回应默认展开的一级工具分组。
function activeToolGroup(activeTab: string): string {
  return activeTab.startsWith('claude') ? 'group-claude' : 'group-codex'
}

// Sidebar 渲染应用左侧层级导航与设置抽屉。
export default function Sidebar() {
  // settingsOpen 标记右侧设置抽屉是否展开。
  const [settingsOpen, setSettingsOpen] = useState(false)
  // activeTab 存储当前激活页签，空值回退到概览。
  const activeTab = useAppStore(
    (state) => state.prefs?.last_active_tab || 'dashboard'
  )
  // openGroups 存储当前展开的一级工具分组，数组最多保留一个 key。
  const [openGroups, setOpenGroups] = useState<string[]>([
    activeToolGroup(activeTab),
  ])
  // theme 存储当前主题模式，默认深色。
  const theme = useAppStore((state) => state.prefs?.theme || 'dark')
  // updatePrefs 存储切换页面与主题时使用的偏好更新方法。
  const updatePrefs = useAppStore((state) => state.updatePrefs)
  // menuItems 存储 Ant Design Menu 使用的完整层级导航数据。
  const menuItems = createMenuItems()
  // selectedTab 存储兼容历史偏好后的当前二级菜单 key。
  const selectedTab = normalizeActiveTab(activeTab)

  // goTab 切换到指定页面。
  function goTab(info: { key: string }) {
    void updatePrefs({ last_active_tab: info.key })
  }

  // changeOpenGroups 以手风琴方式切换一级工具分组，新分组展开时自动关闭旧分组。
  function changeOpenGroups(nextOpenGroups: string[]) {
    // newlyOpenedGroup 存储本次新展开的分组；点击已展开分组时为空，表示收起全部。
    const newlyOpenedGroup = nextOpenGroups.find(
      (group) => !openGroups.includes(group)
    )
    setOpenGroups(newlyOpenedGroup ? [newlyOpenedGroup] : [])
  }

  // openSettings 打开设置抽屉。
  function openSettings() {
    setSettingsOpen(true)
  }

  // closeSettings 关闭设置抽屉。
  function closeSettings() {
    setSettingsOpen(false)
  }

  // cycleTheme 循环切换主题模式。
  function cycleTheme() {
    // currentIndex 存储当前主题在循环数组中的位置。
    const currentIndex = THEME_CYCLE.indexOf(
      theme as (typeof THEME_CYCLE)[number]
    )
    // nextTheme 存储下一主题模式，当前主题异常时回退到 dark 的下一项。
    const nextTheme =
      THEME_CYCLE[
        ((currentIndex < 0 ? 1 : currentIndex) + 1) % THEME_CYCLE.length
      ]
    void updatePrefs({ theme: nextTheme })
  }

  return (
    <>
      <aside
        data-testid="app-sidebar"
        className="flex h-full w-64 shrink-0 flex-col bg-sidebar py-4 max-md:w-[4.5rem]"
      >
        <div className="mb-4 flex h-10 items-center gap-3 px-4 max-md:justify-center max-md:px-0">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-panel-soft text-lg text-text-main">
            <AppstoreOutlined aria-hidden="true" />
          </span>
          <div className="min-w-0 max-md:hidden">
            <div className="truncate text-sm font-semibold text-text-main">
              Visual AI Coding
            </div>
            <div className="truncate text-xs text-text-muted">
              配置与插件控制台
            </div>
          </div>
        </div>

        <nav
          aria-label="主导航"
          className="min-h-0 flex-1 overflow-y-auto px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <Menu
            className="sidebar-menu"
            inlineCollapsed={false}
            items={menuItems}
            mode="inline"
            onClick={goTab}
            onOpenChange={changeOpenGroups}
            openKeys={openGroups}
            selectedKeys={[selectedTab]}
            style={{ borderInlineEnd: 0 }}
          />
        </nav>

        <div className="mx-3 mt-3 grid grid-cols-[2.25rem_minmax(0,1fr)] gap-2 border-t border-border pt-4 max-md:mx-2 max-md:grid-cols-1">
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
  )
}
