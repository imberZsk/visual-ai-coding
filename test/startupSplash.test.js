import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// INDEX_HTML_PATH 存储渲染入口路径，用于验证 React 加载前的启动占位。
const INDEX_HTML_PATH = join(process.cwd(), 'index.html')
// STARTUP_ICON_PATH 存储轻量启动图标路径。
const STARTUP_ICON_PATH = join(process.cwd(), 'public/startup-icon.png')
// MAIN_PROCESS_PATH 存储 Electron 主进程入口路径，用于验证开发态项目图标。
const MAIN_PROCESS_PATH = join(process.cwd(), 'electron/main.js')
// WINDOW_CHROME_PATH 存储跨平台自定义标题栏配置源码路径。
const WINDOW_CHROME_PATH = join(process.cwd(), 'electron/windowChrome.js')

describe('Electron 启动体验', () => {
  it('使用项目图标和 Ant Design 默认四点 loading', () => {
    // indexHtml 存储入口源码，用于锁定静态首屏结构和设计尺寸。
    const indexHtml = readFileSync(INDEX_HTML_PATH, 'utf8')

    expect(indexHtml).toContain('aria-label="Visual AI Coding 正在启动"')
    expect(indexHtml).toContain('src="./startup-icon.png"')
    expect(
      indexHtml.match(/class="startup-splash__spinner-item"/g)
    ).toHaveLength(4)
    expect(indexHtml).toContain('--startup-icon-size: 112px')
    expect(indexHtml).toContain('--startup-spinner-size: 20px')
    expect(indexHtml).toContain('--startup-spinner-item-size: 9px')
    expect(indexHtml).toContain('top: calc(100% + 16px)')
    expect(existsSync(STARTUP_ICON_PATH)).toBe(true)
  })

  it('开发态显式使用仓库内的高清项目图标', () => {
    // mainProcess 存储主进程源码，用于锁定 BrowserWindow 和 macOS Dock 图标配置。
    const mainProcess = readFileSync(MAIN_PROCESS_PATH, 'utf8')

    expect(mainProcess).toContain("join(__dirname, '../build/icon.png')")
    expect(mainProcess).toContain(
      'app.dock?.setIcon(DEVELOPMENT_APP_ICON_PATH)'
    )
  })

  it('移除重复原生标题栏并保留系统窗口控件', async () => {
    // windowChromeModule 存储窗口外观纯逻辑模块，用于验证各平台选项。
    const windowChromeModule = await import(WINDOW_CHROME_PATH)

    expect(windowChromeModule.getWindowChromeOptions('darwin')).toEqual({
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 16, y: 16 },
    })
    expect(windowChromeModule.getWindowChromeOptions('win32')).toEqual({
      titleBarStyle: 'hidden',
      titleBarOverlay: {
        color: '#141414',
        symbolColor: '#f5f5f5',
        height: 40,
      },
    })
  })
})
