/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import appSource from '../App.tsx?raw'
import sidebarSource from '../components/Sidebar.tsx?raw'
import uiSource from '../components/ui.tsx?raw'
import dashboardSource from '../pages/Dashboard.tsx?raw'
import quotaSource from '../pages/QuotaPage.tsx?raw'
import settingsSource from '../pages/SettingsPage.tsx?raw'
import skillsSource from '../pages/SkillsPage.tsx?raw'
import unifiedSource from '../pages/UnifiedPage.tsx?raw'

// readSource 读取仓库内源码，供样式边界静态回归测试复用。
function readSource(relativePath: string): string {
  return readFileSync(relativePath, 'utf8')
}

describe('桌面端样式规范', () => {
  it('业务组件不使用固定行内样式', () => {
    // componentSources 存储所有 UI 组件源码，用于阻止固定视觉规则回流 JSX。
    const componentSources = [
      appSource,
      sidebarSource,
      uiSource,
      dashboardSource,
      quotaSource,
      settingsSource,
      skillsSource,
      unifiedSource,
    ]

    for (const componentSource of componentSources) {
      expect(componentSource).not.toMatch(/\bstyle\s*=/)
      expect(componentSource).not.toMatch(/\bstyles\s*=/)
    }
  })

  it('页面专用样式使用相邻 CSS 和语义颜色', () => {
    // pageCss 存储本次收敛的关键工作区样式，用于防止固定色值回流。
    const pageCss = [
      'src/components/Sidebar.css',
      'src/pages/Dashboard.css',
      'src/pages/QuotaPage.css',
      'src/pages/SettingsPage.css',
      'src/pages/UnifiedPage.css',
    ]
      .map(readSource)
      .join('\n')

    expect(pageCss).toContain('var(--accent)')
    expect(pageCss).toContain('var(--border)')
    expect(pageCss).not.toMatch(/#[0-9a-f]{3,8}\b/i)
  })

  it('侧栏和页面标题遵循紧凑工作台尺寸', () => {
    // sidebarCss 存储侧栏尺寸规则，防止宽侧栏和品牌图标回流组件。
    const sidebarCss = readSource('src/components/Sidebar.css')

    expect(sidebarCss).toContain('--app-sidebar-width: 200px')
    expect(sidebarCss).toContain('--app-sidebar-collapsed-width: 56px')
    expect(sidebarCss).not.toContain('.app-sidebar__logo')
    expect(sidebarSource).not.toMatch(/<img\b/)
    expect(sidebarCss).toContain('font-size: 16px')
    expect(uiSource).toContain('text-xl')
    expect(uiSource).not.toContain('text-2xl')
    expect(sidebarSource).not.toMatch(/\bw-(?:56|64)\b/)
  })

  it('按钮密度与 Visual Worktree 的 Ant Design 默认尺寸一致', () => {
    // mainSource 存储 Ant Design 全局控件高度配置。
    const mainSource = readSource('src/main.tsx')
    // globalCss 存储全局按钮规则，用于阻止 min-height 覆盖 small 尺寸。
    const globalCss = readSource('src/styles/index.css')

    expect(mainSource).toContain('controlHeight: 32')
    expect(globalCss).not.toMatch(/\.ant-btn\s*\{[^}]*min-height:/)
  })

  it('颜色使用 Visual Worktree 的 Ant Design seed 和算法派生结果', () => {
    // mainSource 存储主题入口，用于防止按主题重新硬编码主色。
    const mainSource = readSource('src/main.tsx')
    // globalCss 存储明暗主题语义变量，用于锁定算法派生后的关键色值。
    const globalCss = readSource('src/styles/index.css')
    // indexHtml 存储 React 挂载前的启动颜色。
    const indexHtml = readSource('index.html')

    expect(mainSource).toContain("colorPrimary: '#1677ff'")
    expect(mainSource).not.toContain("isDark ? '#4096ff'")
    expect(globalCss).toContain('--accent: 22 104 220')
    expect(indexHtml).toContain('--startup-spinner-color: #1668dc')
  })
})
