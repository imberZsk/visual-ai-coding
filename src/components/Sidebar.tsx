// 左侧控制台导航栏：使用 Ant Design 层级菜单承载工具与各自能力入口。
import {
  ApiOutlined,
  AppstoreOutlined,
  DashboardOutlined,
  DeploymentUnitOutlined,
  DesktopOutlined,
  FileSearchOutlined,
  MoonOutlined,
  RobotOutlined,
  SettingOutlined,
  ShopOutlined,
  SunOutlined,
  ToolOutlined,
  WalletOutlined,
} from '@ant-design/icons'
import { useEffect, useState, type ReactNode } from 'react'
import { Button as AntButton, Drawer, Menu, Select, type MenuProps } from 'antd'
import { useAppStore } from '../store'
import { TOOL_NAV_GROUPS } from '../config'
import { SettingsContent } from '../pages/SettingsPage'
import './Sidebar.css'

// CAPABILITY_ICONS 存储二级能力对应的 Ant Design 图标。
const CAPABILITY_ICONS: Record<string, ReactNode> = {
  config: <SettingOutlined aria-hidden="true" />,
  mcp: <ToolOutlined aria-hidden="true" />,
  hooks: <ApiOutlined aria-hidden="true" />,
  agents: <RobotOutlined aria-hidden="true" />,
  marketplace: <ShopOutlined aria-hidden="true" />,
  plugins: <AppstoreOutlined aria-hidden="true" />,
  skills: <FileSearchOutlined aria-hidden="true" />,
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

// SIDEBAR_COMPACT_QUERY 存储侧栏进入紧凑模式的窗口阈值，避免中等宽度窗口被固定导航挤压。
const SIDEBAR_COMPACT_QUERY = '(max-width: 1023px)'

// AI_TOOL_OPTIONS 存储侧栏工具选择器可切换的 AI 工具。
const AI_TOOL_OPTIONS = TOOL_NAV_GROUPS.map((group) => ({
  value: group.id,
  label: group.label,
}))

// createMenuItems 将当前工具能力转换为单层菜单，避免重复的二级折叠导航。
// activeAiTool 参数存储侧栏当前选中的 AI 工具。
function createMenuItems(activeAiTool: 'codex' | 'claude'): MenuProps['items'] {
  // activeGroup 存储当前 AI 工具对应的能力入口定义。
  const activeGroup =
    TOOL_NAV_GROUPS.find((group) => group.id === activeAiTool) ??
    TOOL_NAV_GROUPS[0]
  // toolItems 存储当前工具的一层能力菜单。
  const toolItems: NonNullable<MenuProps['items']> = activeGroup.children.map(
    (item) => {
      // capability 存储路由末段，用于匹配能力图标；工具本身路由对应“配置”。
      const capability =
        item.id === activeGroup.id
          ? 'config'
          : item.id.replace(`${activeGroup.id}-`, '')
      return {
        key: item.id,
        icon: CAPABILITY_ICONS[capability],
        label: item.label,
      }
    }
  )

  return [
    {
      key: 'dashboard',
      icon: <DashboardOutlined aria-hidden="true" />,
      label: '概览',
    },
    {
      key: 'unified',
      icon: <DeploymentUnitOutlined aria-hidden="true" />,
      label: '统一配置',
    },
    {
      key: 'quota',
      icon: <WalletOutlined aria-hidden="true" />,
      label: '额度管理',
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

// Sidebar 渲染应用左侧层级导航与设置抽屉。
export default function Sidebar() {
  // settingsOpen 标记右侧设置抽屉是否展开。
  const [settingsOpen, setSettingsOpen] = useState(false)
  // sidebarCollapsed 标记当前窗口是否使用只显示图标的紧凑侧栏。
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => window.matchMedia(SIDEBAR_COMPACT_QUERY).matches
  )
  // activeTab 存储当前激活页签，空值回退到概览。
  const activeTab = useAppStore(
    (state) => state.prefs?.last_active_tab || 'dashboard'
  )
  // activeAiTool 存储侧栏当前展示的 AI 工具，旧偏好默认使用 Codex。
  const activeAiTool = useAppStore(
    (state) => state.prefs?.active_ai_tool || 'codex'
  )
  // theme 存储当前主题模式，默认深色。
  const theme = useAppStore((state) => state.prefs?.theme || 'dark')
  // updatePrefs 存储切换页面与主题时使用的偏好更新方法。
  const updatePrefs = useAppStore((state) => state.updatePrefs)
  // menuItems 存储 Ant Design Menu 使用的完整层级导航数据。
  const menuItems = createMenuItems(activeAiTool)
  // selectedTab 存储兼容历史偏好后的当前二级菜单 key。
  const selectedTab = normalizeActiveTab(activeTab)

  // 监听窗口宽度并同步 Ant Design Menu 的真实折叠状态，避免仅裁切文字造成导航不可用。
  useEffect(() => {
    // compactMediaQuery 存储紧凑侧栏的媒体查询监听器。
    const compactMediaQuery = window.matchMedia(SIDEBAR_COMPACT_QUERY)
    // handleCompactChange 将媒体查询结果同步到侧栏状态。
    function handleCompactChange(event: MediaQueryListEvent) {
      setSidebarCollapsed(event.matches)
    }

    setSidebarCollapsed(compactMediaQuery.matches)
    compactMediaQuery.addEventListener('change', handleCompactChange)
    return () => {
      compactMediaQuery.removeEventListener('change', handleCompactChange)
    }
  }, [])

  // goTab 切换到指定页面。
  function goTab(info: { key: string }) {
    void updatePrefs({ last_active_tab: info.key })
  }

  // changeAiTool 持久化工具选择，并在当前位于工具能力页时切换到新工具的同类能力页。
  function changeAiTool(nextTool: 'codex' | 'claude') {
    // capability 存储当前工具页的能力后缀，非工具页切换时保持原页面不变。
    const capability = selectedTab.match(/^(?:codex|claude)(-.+)?$/)?.[1] ?? ''
    // nextTab 存储工具切换后的目标页面，概览等公共页面不随选择器跳转。
    const nextTab =
      capability !== '' || selectedTab === activeAiTool
        ? `${nextTool}${capability}`
        : selectedTab
    void updatePrefs({ active_ai_tool: nextTool, last_active_tab: nextTab })
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
        className={`app-sidebar${sidebarCollapsed ? ' app-sidebar--collapsed' : ''}`}
      >
        <div className="app-sidebar__brand">
          <div className="app-sidebar__brand-copy">
            <div className="app-sidebar__brand-title">Visual AI Coding</div>
            <div className="app-sidebar__brand-subtitle">配置与插件控制台</div>
          </div>
        </div>

        <nav aria-label="主导航" className="app-sidebar__nav">
          <div className="app-sidebar__tool-select">
            <Select
              id="sidebar-ai-tool"
              aria-label="当前 AI 工具"
              options={AI_TOOL_OPTIONS}
              value={activeAiTool}
              onChange={changeAiTool}
            />
          </div>
          <Menu
            className="sidebar-menu"
            inlineCollapsed={sidebarCollapsed}
            items={menuItems}
            mode="inline"
            onClick={goTab}
            selectedKeys={[selectedTab]}
          />
        </nav>

        <div className="app-sidebar__footer">
          <AntButton
            className="app-sidebar__theme-button"
            icon={THEME_ICON[theme] || THEME_ICON.dark}
            onClick={cycleTheme}
            title={NEXT_THEME_LABEL[theme] || NEXT_THEME_LABEL.dark}
            aria-label={NEXT_THEME_LABEL[theme] || NEXT_THEME_LABEL.dark}
            type="text"
          />
          <AntButton
            block
            className="app-sidebar__settings-button"
            icon={<SettingOutlined aria-hidden="true" />}
            onClick={openSettings}
            type="text"
          >
            <span className="app-sidebar__settings-label">设置</span>
          </AntButton>
        </div>
      </aside>

      <Drawer
        destroyOnHidden
        open={settingsOpen}
        rootClassName="settings-drawer"
        size={640}
        title="设置"
        onClose={closeSettings}
      >
        <SettingsContent />
      </Drawer>
    </>
  )
}
