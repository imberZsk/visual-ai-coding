import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('initial theme paint', () => {
  // 验证首屏 HTML 在 React 加载前就有暗色兜底，避免深色主题用户启动时先看到白屏。
  it('applies a dark-safe theme before the React entry script runs', () => {
    // htmlPath 存储入口 HTML 文件路径。
    const htmlPath = resolve(process.cwd(), 'index.html')
    // html 存储入口 HTML 文本，用于检查首屏同步主题逻辑。
    const html = readFileSync(htmlPath, 'utf8')
    // themeScriptIndex 存储首屏主题脚本的位置。
    const themeScriptIndex = html.indexOf('visual-aicoding.theme')
    // reactEntryIndex 存储 React 入口脚本的位置。
    const reactEntryIndex = html.indexOf('/src/main.tsx')

    expect(html).toContain('<html lang="zh-CN" class="dark">')
    expect(html).toContain('background: #141414')
    expect(html).toContain('--startup-spinner-color: #1668dc')
    expect(themeScriptIndex).toBeGreaterThanOrEqual(0)
    expect(reactEntryIndex).toBeGreaterThan(themeScriptIndex)
  })

  // 验证后端偏好加载后会同步到前端缓存，下一次启动才能在首屏脚本里立即命中主题。
  it('mirrors the loaded preference theme to startup cache', () => {
    // hookPath 存储主题 hook 文件路径。
    const hookPath = resolve(process.cwd(), 'src/hooks/useTheme.ts')
    // hookSource 存储主题 hook 源码，用于检查偏好缓存同步调用。
    const hookSource = readFileSync(hookPath, 'utf8')

    expect(hookSource).toContain('cacheThemePreference(theme)')
  })

  // 验证 Ant Design Provider 在偏好加载前也读取首屏主题缓存，避免组件和页面背景短暂错色。
  it('uses startup theme cache before preferences finish loading', () => {
    // entryPath 存储 React 入口文件路径。
    const entryPath = resolve(process.cwd(), 'src/main.tsx')
    // entrySource 存储 React 入口源码，用于检查 Ant Design Provider 的首屏主题兜底。
    const entrySource = readFileSync(entryPath, 'utf8')

    expect(entrySource).toContain('getStartupThemePreference()')
    expect(entrySource).toContain('visual-aicoding.theme')
  })
})
