import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
  type TestInfo,
} from '@playwright/test'
import path from 'node:path'

// PROJECT_ROOT 存储 Electron 启动所需的项目绝对路径。
const PROJECT_ROOT = path.resolve(import.meta.dirname, '../..')

// electronTest 为每条用例创建并关闭独立 Electron 应用，确保偏好和页面状态互不污染。
export function electronTest(
  title: string,
  run: (
    page: Page,
    app: ElectronApplication,
    testInfo: TestInfo
  ) => Promise<void>
) {
  test(title, async ({ browserName }, testInfo) => {
    // browserName 固定截图与桌面流程使用 Chromium 渲染，避免浏览器差异污染几何断言。
    expect(browserName).toBe('chromium')
    // app 存储当前用例的 Electron 应用实例。
    const app = await electron.launch({
      args: [PROJECT_ROOT],
      cwd: PROJECT_ROOT,
      env: { ...process.env, NODE_ENV: 'production', VAC_E2E: '1' },
    })
    // page 存储应用主窗口对应的 Playwright 页面。
    const page = await app.firstWindow()
    await expect(page.getByTestId('app-shell')).toBeVisible()
    try {
      await run(page, app, testInfo)
    } finally {
      await app.close()
    }
  })
}
