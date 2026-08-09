import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('theme colors', () => {
  // 验证深浅主题使用中性层级和统一蓝色交互语义 token。
  it('uses neutral surfaces and semantic interaction tokens', () => {
    // cssPath 存储全局样式文件路径。
    const cssPath = resolve(process.cwd(), 'src/styles/index.css')
    // css 存储全局样式内容，用于检查主题变量。
    const css = readFileSync(cssPath, 'utf8')

    expect(css).toContain('--surface: 245 245 245;')
    expect(css).toContain('--sidebar: 255 255 255;')
    expect(css).toContain('--panel: 255 255 255;')
    expect(css).toContain('--panel-soft: 250 250 250;')
    expect(css).toContain('--accent: 22 119 255;')
    expect(css).toContain('--text-main: 31 31 31;')
    expect(css).toContain('--text-muted: 89 89 89;')
    expect(css).toContain('--success: 82 196 26;')
    expect(css).toContain('--warning: 250 173 20;')
    expect(css).toContain('--danger: 255 77 79;')
    expect(css).toContain('--control-on: 22 119 255;')
    expect(css).toContain('--control-on-hover: 64 150 255;')
    expect(css).not.toContain('--success: 92 125 92;')
    expect(css).not.toContain('--warning: 163 116 58;')
    expect(css).not.toContain('--danger: 178 86 82;')
    expect(css).toContain('--surface: 0 0 0;')
    expect(css).toContain('--sidebar: 20 20 20;')
    expect(css).toContain('--panel: 31 31 31;')
    expect(css).toContain('--panel-soft: 38 38 38;')
    expect(css).toContain('--accent: 22 104 220;')
    expect(css).toContain('--text-main: 217 217 217;')
    expect(css).toContain('--text-muted: 173 173 173;')
    expect(css).toContain('--success: 73 170 25;')
    expect(css).toContain('--warning: 216 150 20;')
    expect(css).toContain('--danger: 220 68 70;')
    expect(css).toContain('.ant-app .ant-switch.ant-switch-checked')
    expect(css).toContain('background: rgb(var(--control-on));')
    expect(css).toContain(
      '.dark .ant-app .ant-btn-default:not(:disabled):not(.ant-btn-disabled):hover'
    )
  })

  // 验证 Ant Design token 与 CSS 使用相同的中性容器层级和蓝色交互语义。
  it('aligns Ant Design runtime tokens with the workspace palette', () => {
    // entryPath 存储 React 入口文件路径。
    const entryPath = resolve(process.cwd(), 'src/main.tsx')
    // entrySource 存储 React 入口源码，用于检查 Ant Design 主题 token。
    const entrySource = readFileSync(entryPath, 'utf8')
    // normalizedEntrySource 统一单双引号，避免 Prettier 引号风格影响语义断言。
    const normalizedEntrySource = entrySource.replaceAll("'", '"')

    expect(normalizedEntrySource).toContain('colorPrimary: "#1677ff"')
    expect(normalizedEntrySource).not.toContain('isDark ? "#4096ff"')
    expect(normalizedEntrySource).toContain('antdTheme.darkAlgorithm')
    expect(normalizedEntrySource).not.toContain('buttonThemeTokens')
  })
})
