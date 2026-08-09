import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

// storeState 存储测试用的全局状态快照。
let storeState: {
  loaded: boolean
  prefs: {
    theme: string
    vscode_path: string
    claude_home: string
    codex_home: string
    active_ai_tool: 'codex' | 'claude'
    last_active_tab: string
  }
  tools: unknown[]
}

// rerenderApp 存储当前测试中的重新渲染函数。
let rerenderApp: (() => void) | null = null

// renderApp 在异步 act 边界内渲染应用，等待 rc-menu 挂载 effect 的内部状态更新完成。
async function renderApp() {
  // rendered 存储 App 渲染结果，供用例执行 DOM 查询和后续重渲染。
  let rendered: ReturnType<typeof render> | undefined
  await act(async () => {
    rendered = render(<App />)
    await Promise.resolve()
  })
  return rendered as ReturnType<typeof render>
}

vi.mock('./store', () => ({
  useAppStore: (selector: (state: unknown) => unknown) =>
    selector({
      ...storeState,
      init: vi.fn(async () => undefined),
      refreshTools: vi.fn(async () => undefined),
      updatePrefs: async (patch: Record<string, string>) => {
        storeState = {
          ...storeState,
          prefs: { ...storeState.prefs, ...patch },
        }
        rerenderApp?.()
      },
    }),
}))

vi.mock('./hooks/useTheme', () => ({
  useTheme: vi.fn(),
}))

vi.mock('./pages/Dashboard', () => ({
  default: () => <div>概览页面</div>,
}))

vi.mock('./pages/ClaudePage', () => ({
  default: () => <div>Claude 页面</div>,
}))

vi.mock('./pages/CodexPage', () => ({
  default: () => <div>Codex 页面</div>,
}))

vi.mock('./pages/PluginsPage', () => ({
  default: () => <div>插件页面</div>,
}))

vi.mock('./pages/MarketplacePage', () => ({
  default: () => <div>市场页面</div>,
}))

vi.mock('./pages/SkillsPage', () => ({
  default: () => <div>技能页面</div>,
}))

vi.mock('./pages/HooksPage', () => ({
  default: () => <div>Hooks 页面</div>,
}))

vi.mock('./pages/McpPage', () => ({
  default: () => <div>MCP 页面</div>,
}))

vi.mock('./pages/AgentsPage', () => ({
  default: () => <div>Agents 页面</div>,
}))

vi.mock('./pages/QuotaPage', () => ({
  default: () => <div>额度管理页面</div>,
}))

describe('App tab loading', () => {
  beforeEach(() => {
    storeState = {
      loaded: true,
      prefs: {
        theme: 'dark',
        vscode_path: 'code',
        claude_home: '/Users/test/.claude',
        codex_home: '/Users/test/.codex',
        active_ai_tool: 'codex',
        last_active_tab: 'dashboard',
      },
      tools: [],
    }
    rerenderApp = null
  })

  afterEach(() => {
    rerenderApp = null
  })

  // 验证切换任意页签时只保留内容过渡，不再叠加整页 loading 遮罩。
  it('switches tabs with content animation without stacked loading', async () => {
    // rendered 存储 App 渲染结果，供 mock store 触发重渲染。
    const rendered = await renderApp()
    rerenderApp = () => rendered.rerender(<App />)

    // codexPluginItem 存储当前 Codex 工具的一层插件入口。
    const codexPluginItem = screen.getByRole('menuitem', { name: 'Plugins' })
    fireEvent.click(codexPluginItem)

    // 切到“插件”后该导航项应处于 Ant Design Menu 选中态。
    expect(codexPluginItem).toHaveClass('ant-menu-item-selected')

    expect(screen.queryByText('页面加载中…')).not.toBeInTheDocument()
    expect(
      screen.queryByTestId('tab-loading-indicator')
    ).not.toBeInTheDocument()
    expect(screen.getByText('插件页面')).toBeInTheDocument()
    expect(screen.getByTestId('tab-content')).toHaveClass('tab-content-enter')
  })

  // 验证应用使用桌面控制台式左侧栏，而不是顶部页签栏布局。
  it('renders a desktop sidebar navigation instead of a top tab bar', async () => {
    // rendered 存储 App 渲染结果，供布局断言查询 DOM。
    const rendered = await renderApp()

    expect(screen.getByTestId('app-sidebar')).toBeInTheDocument()
    expect(
      screen.getByRole('navigation', { name: '主导航' })
    ).toBeInTheDocument()
    expect(rendered.container.querySelector('aside')).toBeInTheDocument()
    expect(screen.queryByRole('banner')).not.toBeInTheDocument()
    expect(screen.getByTestId('app-sidebar')).toHaveClass('app-sidebar')
    expect(screen.getByTestId('app-sidebar')).not.toHaveClass('w-56')
    expect(screen.getByTestId('app-sidebar')).not.toHaveClass('border-r')
    // menu 存储 Ant Design 导航根节点，用于确认固定视觉规则没有回流行内样式。
    const menu = rendered.container.querySelector('.sidebar-menu')
    expect(menu).toBeInTheDocument()
    expect(menu).not.toHaveAttribute('style')
    expect(screen.getByTestId('app-shell')).toHaveClass('flex-row')
  })

  // 验证概览作为左侧导航的第一入口，并在默认页显示选中态。
  it('keeps overview available as the first sidebar entry', async () => {
    // rendered 存储 App 渲染结果，供概览初始状态断言使用。
    const rendered = await renderApp()
    rerenderApp = () => rendered.rerender(<App />)

    expect(screen.getByText('概览页面')).toBeInTheDocument()
    // overviewButton 存储左侧导航中的概览入口，用于确认当前页语义态。
    const overviewButton = within(
      screen.getByRole('navigation', { name: '主导航' })
    ).getByRole('menuitem', { name: '概览' })
    expect(overviewButton).toHaveClass('ant-menu-item-selected')
  })

  // 验证额度管理作为一级导航入口，并可切换到对应页面。
  it('opens quota management from the primary navigation', async () => {
    // rendered 存储 App 渲染结果，供 store mock 更新后重渲染。
    const rendered = await renderApp()
    rerenderApp = () => rendered.rerender(<App />)
    // nav 存储主导航区域，避免匹配页面内同名文本。
    const nav = screen.getByRole('navigation', { name: '主导航' })

    fireEvent.click(within(nav).getByRole('menuitem', { name: '额度管理' }))
    expect(await screen.findByText('额度管理页面')).toBeInTheDocument()
  })

  // 验证设置入口不混入主导航，而是保留为左侧栏底部操作。
  it('keeps settings as a sidebar utility action outside main navigation', async () => {
    // rendered 存储 App 渲染结果，供导航断言查询 DOM。
    const rendered = await renderApp()
    rerenderApp = () => rendered.rerender(<App />)

    // nav 存储主导航区域，避免页面内容或工具区操作影响导航断言。
    const nav = screen.getByRole('navigation', { name: '主导航' })
    expect(
      within(nav).getByRole('menuitem', { name: '概览' })
    ).toBeInTheDocument()
    expect(
      within(nav).queryByRole('button', { name: '设置' })
    ).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '设置' })).toBeInTheDocument()
  })

  // 验证侧栏仅展示当前工具的一层能力，并通过 Select 持久化切换工具。
  it('shows one tool capability set and switches tools with a select', async () => {
    // rendered 存储 App 渲染结果，供 mock store 在页签切换时触发重渲染。
    const rendered = await renderApp()
    rerenderApp = () => rendered.rerender(<App />)

    // nav 存储主导航区域，用于限定能力入口查询范围。
    const nav = screen.getByRole('navigation', { name: '主导航' })
    expect(within(nav).queryByRole('menuitem', { name: 'Codex' })).toBeNull()
    expect(
      within(nav).queryByRole('menuitem', { name: 'Claude Code' })
    ).toBeNull()
    expect(within(nav).getAllByRole('menuitem', { name: 'MCP' })).toHaveLength(
      1
    )

    fireEvent.click(within(nav).getByRole('menuitem', { name: 'Hooks' }))
    expect(screen.getByText('Hooks 页面')).toBeInTheDocument()

    fireEvent.click(within(nav).getByRole('menuitem', { name: 'Marketplace' }))
    expect(screen.getByText('市场页面')).toBeInTheDocument()

    // toolSelect 存储当前 AI 工具选择器，点击 Claude Code 后触发偏好持久化。
    const toolSelect = screen.getByRole('combobox', { name: '当前 AI 工具' })
    fireEvent.mouseDown(toolSelect)
    fireEvent.click(await screen.findByText('Claude Code'))
    expect(storeState.prefs.active_ai_tool).toBe('claude')

    // claudeMcpItem 存储 Claude Code 分组下具有稳定路由 key 的 MCP 入口。
    const claudeMcpItem = nav.querySelector('[data-menu-id$="-claude-mcp"]')
    expect(claudeMcpItem).toBeInTheDocument()
    fireEvent.click(claudeMcpItem as HTMLElement)
    expect(screen.getByText('MCP 页面')).toBeInTheDocument()

    // claudeAgentsItem 存储 Claude Code 分组下具有稳定路由 key 的 Agents 入口。
    const claudeAgentsItem = nav.querySelector(
      '[data-menu-id$="-claude-agents"]'
    )
    expect(claudeAgentsItem).toBeInTheDocument()
    fireEvent.click(claudeAgentsItem as HTMLElement)
    expect(screen.getByText('Agents 页面')).toBeInTheDocument()
  })

  // 验证设置按钮可从左侧栏打开右侧抽屉，并展示聚焦的设置表单内容。
  it('opens the settings drawer from the sidebar settings button', async () => {
    // rendered 存储 App 渲染结果，供 mock store 触发重渲染。
    const rendered = await renderApp()
    rerenderApp = () => rendered.rerender(<App />)

    fireEvent.click(screen.getByRole('button', { name: '设置' }))

    // drawer 存储设置抽屉，确保标题与设置内容都在抽屉内出现。
    const drawer = screen.getByRole('dialog', { name: '设置' })
    expect(drawer).toBeInTheDocument()
    expect(drawer).toHaveClass('ant-drawer-section')
    expect(within(drawer).queryByText('概览页面')).not.toBeInTheDocument()
    expect(within(drawer).getByText('主题')).toBeInTheDocument()
    expect(
      within(drawer).getByLabelText('VSCode CLI 路径（默认 code）')
    ).toBeInTheDocument()
    expect(within(drawer).getByLabelText('Claude 配置目录')).toBeInTheDocument()
    expect(within(drawer).getByLabelText('Codex 配置目录')).toBeInTheDocument()
    expect(
      within(drawer).getByRole('button', { name: '保存' })
    ).toBeInTheDocument()
  })

  // 验证设置抽屉不嵌入概览页，打开时不改变当前业务路由。
  it('keeps the settings drawer focused without changing routes', async () => {
    storeState = {
      ...storeState,
      prefs: {
        ...storeState.prefs,
        last_active_tab: 'claude',
      },
    }

    // rendered 存储 App 渲染结果，供抽屉入口触发重渲染。
    const rendered = await renderApp()
    rerenderApp = () => rendered.rerender(<App />)

    fireEvent.click(screen.getByRole('button', { name: '设置' }))

    expect(storeState.prefs.last_active_tab).toBe('claude')
    expect(screen.getByText('Claude 页面')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: '设置' })).toBeInTheDocument()
    expect(screen.queryByText('概览页面')).not.toBeInTheDocument()
    expect(screen.getByText('主题')).toBeInTheDocument()
  })

  // 验证主题快捷按钮只显示图标，依旧能按 light/dark/system 循环更新偏好。
  it('cycles theme from an icon-only quick theme button', async () => {
    // rendered 存储 App 渲染结果，供主题切换后刷新按钮状态。
    const rendered = await renderApp()
    rerenderApp = () => rendered.rerender(<App />)

    // themeButton 存储顶部主题快捷切换按钮。
    const themeButton = screen.getByRole('button', {
      name: '切换到跟随系统主题',
    })
    expect(themeButton.querySelector('.anticon')).toBeInTheDocument()
    expect(themeButton).not.toHaveTextContent('浅色')
    expect(themeButton).not.toHaveTextContent('深色')
    expect(themeButton).not.toHaveTextContent('跟随系统')

    fireEvent.click(themeButton)

    expect(storeState.prefs.theme).toBe('system')
  })
})
