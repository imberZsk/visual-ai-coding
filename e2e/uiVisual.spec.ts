import {
  expect,
  type Locator,
  type Page,
  type TestInfo,
} from '@playwright/test'
import { electronTest } from './helpers/electronApp'

// capturePage 截取当前 Electron 页面并作为测试附件保留，供 UI 人工验收。
async function capturePage(
  page: Page,
  testInfo: TestInfo,
  screenshotName: string
): Promise<void> {
  // screenshotPath 存储当前页面截图在 Playwright 用例输出目录中的路径。
  const screenshotPath = testInfo.outputPath(`${screenshotName}.png`)
  await page.screenshot({ path: screenshotPath, animations: 'disabled' })
  await testInfo.attach(screenshotName, {
    path: screenshotPath,
    contentType: 'image/png',
  })
}

// assertStableLayout 验证页面没有文档级横向溢出，主内容仍位于视口中。
async function assertStableLayout(page: Page): Promise<void> {
  // layoutMetrics 存储文档与主内容几何信息，用于发现截图之外的溢出。
  const layoutMetrics = await page.evaluate(() => {
    // mainContent 存储应用右侧主内容滚动容器。
    const mainContent = document.querySelector<HTMLElement>('main')
    // mainBounds 存储主内容相对视口的位置和尺寸。
    const mainBounds = mainContent?.getBoundingClientRect()
    return {
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      mainLeft: mainBounds?.left ?? -1,
      mainRight: mainBounds?.right ?? -1,
    }
  })

  expect(layoutMetrics.scrollWidth).toBe(layoutMetrics.clientWidth)
  expect(layoutMetrics.mainLeft).toBeGreaterThanOrEqual(0)
  expect(layoutMetrics.mainRight).toBeLessThanOrEqual(layoutMetrics.clientWidth)
}

// assertCustomWindowDragRegions 验证页面不新增可见顶部栏，并保留可用的窗口拖动热区。
async function assertCustomWindowDragRegions(page: Page): Promise<void> {
  // dragRegions 存储品牌区、内容顶部热区和交互控件的最终 Electron 拖动属性。
  const dragRegions = await page.evaluate(() => {
    // brand 存储侧栏顶部承担拖动功能的品牌区域。
    const brand = document.querySelector<HTMLElement>('.app-sidebar__brand')
    // main 存储不包含独立 Header 的主内容容器。
    const main = document.querySelector<HTMLElement>('.app-main')
    // toolSelect 存储品牌区下方首个交互选择器。
    const toolSelect = document.querySelector<HTMLElement>(
      '.app-sidebar__tool-select .ant-select'
    )
    return {
      brandDrag: brand
        ? getComputedStyle(brand).getPropertyValue('-webkit-app-region')
        : '',
      mainTopDrag: main
        ? getComputedStyle(main, '::before').getPropertyValue(
            '-webkit-app-region'
          )
        : '',
      mainTopHeight: main ? getComputedStyle(main, '::before').height : '',
      toolSelectDrag: toolSelect
        ? getComputedStyle(toolSelect).getPropertyValue('-webkit-app-region')
        : '',
      visibleHeaderCount: document.querySelectorAll(
        '.app-header, .titlebar, .title-bar'
      ).length,
    }
  })

  expect(dragRegions).toEqual({
    brandDrag: 'drag',
    mainTopDrag: 'drag',
    mainTopHeight: '12px',
    toolSelectDrag: 'no-drag',
    visibleHeaderCount: 0,
  })
}

// assertSidebarRhythm 验证侧栏只保留一条分隔线，并给单层能力入口保留统一纵向间距。
async function assertSidebarRhythm(page: Page): Promise<void> {
  // sidebarMetrics 存储侧栏、根菜单的最终边框和相邻项间距。
  const sidebarMetrics = await page.evaluate(() => {
    // sidebar 存储承担唯一右侧分隔线的侧栏容器。
    const sidebar = document.querySelector<HTMLElement>('.app-sidebar')
    // menu 存储 Ant Design 根导航菜单。
    const menu = document.querySelector<HTMLElement>('.sidebar-menu')
    // readGaps 读取同级可见菜单项之间的垂直距离。
    const readGaps = (elements: Element[]): number[] =>
      elements.slice(1).map((element, index) => {
        // previousBounds 存储前一菜单项的几何边界。
        const previousBounds = elements[index]?.getBoundingClientRect()
        // currentBounds 存储当前菜单项的几何边界。
        const currentBounds = element.getBoundingClientRect()
        return currentBounds.top - (previousBounds?.bottom ?? currentBounds.top)
      })
    // rootItems 存储一级导航的直接子项。
    const rootItems = Array.from(
      menu?.querySelectorAll(
        ':scope > .ant-menu-item, :scope > .ant-menu-submenu'
      ) ?? []
    )
    return {
      sidebarBorderWidth: sidebar
        ? getComputedStyle(sidebar).borderRightWidth
        : '',
      menuBorderWidth: menu ? getComputedStyle(menu).borderRightWidth : '',
      rootGaps: readGaps(rootItems),
      submenuCount: menu?.querySelectorAll('.ant-menu-submenu').length ?? -1,
    }
  })

  expect(sidebarMetrics.sidebarBorderWidth).toBe('1px')
  expect(sidebarMetrics.menuBorderWidth).toBe('0px')
  expect(sidebarMetrics.rootGaps.every((gap) => gap >= 4)).toBe(true)
  expect(sidebarMetrics.submenuCount).toBe(0)
  await expect(page.locator('.app-sidebar__brand img')).toHaveCount(0)
}

// assertModuleRhythm 验证配置页相邻模块使用统一 16px 垂直间距。
async function assertModuleRhythm(page: Page): Promise<void> {
  // moduleGaps 存储模块容器内相邻子元素的实际垂直距离。
  const moduleGaps = await page
    .locator('.page-module-stack')
    .evaluate((stack) => {
      // modules 存储模块容器的直接子元素。
      const modules = Array.from(stack.children)
      return modules.slice(1).map((module, index) => {
        // previousBounds 存储前一个模块的几何边界。
        const previousBounds = modules[index]?.getBoundingClientRect()
        // currentBounds 存储当前模块的几何边界。
        const currentBounds = module.getBoundingClientRect()
        return currentBounds.top - (previousBounds?.bottom ?? currentBounds.top)
      })
    })

  expect(moduleGaps.length).toBeGreaterThan(0)
  expect(moduleGaps.every((gap) => gap >= 16)).toBe(true)

  // fieldGaps 存储首个配置分组内相邻字段卡片的实际垂直距离。
  const fieldGaps = await page
    .locator('.visual-config-group .page-item-stack')
    .first()
    .evaluate((stack) => {
      // fields 存储字段列表的直接子元素。
      const fields = Array.from(stack.children)
      return fields.slice(1).map((field, index) => {
        // previousBounds 存储前一个字段卡片的几何边界。
        const previousBounds = fields[index]?.getBoundingClientRect()
        // currentBounds 存储当前字段卡片的几何边界。
        const currentBounds = field.getBoundingClientRect()
        return currentBounds.top - (previousBounds?.bottom ?? currentBounds.top)
      })
    })

  expect(fieldGaps.length).toBeGreaterThan(0)
  expect(fieldGaps.every((gap) => gap >= 12)).toBe(true)
}

// readButtonDensity 读取真实渲染按钮的高度、字号与横向内边距。
// button 参数存储需要验收的可见 Ant Design 按钮。
async function readButtonDensity(button: Locator) {
  return button.evaluate((element) => {
    // style 存储浏览器计算后的最终按钮样式。
    const style = getComputedStyle(element)
    return {
      height: Number.parseFloat(style.height),
      fontSize: Number.parseFloat(style.fontSize),
      paddingLeft: Number.parseFloat(style.paddingLeft),
      paddingRight: Number.parseFloat(style.paddingRight),
    }
  })
}

// assertVisualWorktreeButtonDensity 验证常规与小号按钮遵循 Visual Worktree 的 Ant Design 默认密度。
async function assertVisualWorktreeButtonDensity(page: Page): Promise<void> {
  // regularDensity 存储概览页常规按钮的最终几何尺寸。
  const regularDensity = await readButtonDensity(
    page.getByRole('button', { name: '重新探测' })
  )
  expect(regularDensity).toEqual({
    height: 32,
    fontSize: 14,
    paddingLeft: 15,
    paddingRight: 15,
  })

  await page.getByRole('menuitem', { name: '统一配置' }).click()
  // smallDensity 存储统一配置页小号新增按钮的最终几何尺寸。
  const smallDensity = await readButtonDensity(
    page.getByRole('button', { name: '新增 Server' })
  )
  expect(smallDensity.height).toBe(24)
  expect(smallDensity.fontSize).toBe(14)
  expect(smallDensity.paddingLeft).toBe(7)
  expect(smallDensity.paddingRight).toBe(7)
}

electronTest(
  '关键工作区生成深浅主题 UI 验收截图',
  async (page, _app, testInfo) => {
    await assertStableLayout(page)
    await assertCustomWindowDragRegions(page)
    await assertSidebarRhythm(page)
    await assertVisualWorktreeButtonDensity(page)
    await page.getByRole('menuitem', { name: '概览' }).click()
    await capturePage(page, testInfo, 'dashboard-dark')

    // Codex 默认显示，Marketplace 截图用于验收单层导航与内容模块间距。
    await page
      .getByRole('menuitem', { name: 'Marketplace', exact: true })
      .click()
    await expect(
      page.getByRole('heading', { name: 'Codex · Marketplace' })
    ).toBeVisible()
    await assertStableLayout(page)
    await capturePage(page, testInfo, 'codex-marketplace-dark')

    await page.getByRole('menuitem', { name: 'Settings', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Codex' })).toBeVisible()
    await assertModuleRhythm(page)
    await capturePage(page, testInfo, 'codex-settings-dark')

    await page.getByRole('menuitem', { name: '统一配置' }).click()
    await expect(page.getByRole('heading', { name: '统一配置' })).toBeVisible()
    await assertStableLayout(page)
    await capturePage(page, testInfo, 'unified-dark')

    await page.getByRole('menuitem', { name: '额度管理' }).click()
    await expect(page.getByRole('heading', { name: '额度管理' })).toBeVisible()
    await assertStableLayout(page)
    await capturePage(page, testInfo, 'quota-dark')

    await page.getByRole('button', { name: '设置', exact: true }).click()
    await expect(page.getByRole('dialog', { name: '设置' })).toBeVisible()
    await capturePage(page, testInfo, 'settings-drawer-dark')

    await page.locator('.settings-drawer .ant-drawer-close').click()
    await page.getByRole('button', { name: '切换到跟随系统主题' }).click()
    await page.getByRole('button', { name: '切换到浅色主题' }).click()
    await page.getByRole('menuitem', { name: '概览' }).click()
    await expect(
      page.getByRole('button', { name: '切换到深色主题' })
    ).toBeVisible()
    await assertStableLayout(page)
    await capturePage(page, testInfo, 'dashboard-light')

    // 窄窗口尺寸用于验收工具卡片单列回落和导航/主内容边界。
    await page.setViewportSize({ width: 900, height: 700 })
    await assertStableLayout(page)
    await capturePage(page, testInfo, 'dashboard-narrow-light')
  }
)
