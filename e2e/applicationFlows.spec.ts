import { expect, type Page } from '@playwright/test'
import { electronTest } from './helpers/electronApp'

// openToolPage 从侧栏进入指定工具的能力页；tool 和 capability 分别是一级分组与二级入口名称。
async function openToolPage(
  page: Page,
  tool: 'Codex' | 'Claude Code',
  capability: string
) {
  // group 存储目标工具的一级菜单节点。
  const group = page.getByRole('menuitem', { name: tool, exact: true })
  if ((await group.getAttribute('aria-expanded')) !== 'true') {
    await group.click()
  }
  // openMenu 存储当前唯一展开的子菜单，避免过渡期间隐藏菜单产生同名元素歧义。
  const openMenu = page.locator('.ant-menu-submenu-open')
  await openMenu
    .getByRole('menuitem', { name: capability, exact: true })
    .click()
}

electronTest('首屏展示应用品牌与概览标题', async (page) => {
  await expect(
    page.getByText('Visual AI Coding', { exact: true })
  ).toBeVisible()
  await expect(page.getByRole('heading', { name: '概览' })).toBeVisible()
})

electronTest('概览展示两种已安装工具及版本', async (page) => {
  await expect(
    page.getByText('Claude Code', { exact: true }).last()
  ).toBeVisible()
  await expect(page.getByText('Codex', { exact: true }).last()).toBeVisible()
  await expect(page.getByText('版本：1.0.0').first()).toBeVisible()
})

electronTest('概览展示隔离的 Claude 与 Codex 配置目录', async (page) => {
  await expect(page.getByText('/tmp/e2e-claude', { exact: true })).toBeVisible()
  await expect(page.getByText('/tmp/e2e-codex', { exact: true })).toBeVisible()
})

electronTest('重新探测后工具卡片保持可用且没有叠加 loading', async (page) => {
  await page.getByRole('button', { name: '重新探测' }).click()
  await expect(page.getByText('版本：1.0.0').first()).toBeVisible()
  await expect(page.getByText('加载中…')).toHaveCount(0)
})

electronTest('概览的管理配置入口跳转 Claude 设置页', async (page) => {
  await page.getByRole('button', { name: '管理配置' }).first().click()
  await expect(page.getByRole('heading', { name: 'Claude Code' })).toBeVisible()
})

electronTest('主题快捷按钮从深色切换到跟随系统', async (page) => {
  await page.getByRole('button', { name: '切换到跟随系统主题' }).click()
  await expect(
    page.getByRole('button', { name: '切换到浅色主题' })
  ).toBeVisible()
})

electronTest('主题快捷按钮可完成深色、系统、浅色循环', async (page) => {
  await page.getByRole('button', { name: '切换到跟随系统主题' }).click()
  await page.getByRole('button', { name: '切换到浅色主题' }).click()
  await expect(
    page.getByRole('button', { name: '切换到深色主题' })
  ).toBeVisible()
})

electronTest('设置按钮打开设置抽屉并展示应用设置', async (page) => {
  await page.getByRole('button', { name: '设置', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '设置' })).toBeVisible()
  await expect(page.getByPlaceholder('~/.claude')).toHaveValue(
    '/tmp/e2e-claude'
  )
})

electronTest('设置抽屉可修改并保存工具路径', async (page) => {
  await page.getByRole('button', { name: '设置', exact: true }).click()
  await page.getByPlaceholder('~/.codex').fill('/tmp/updated-codex')
  await page
    .getByRole('dialog', { name: '设置' })
    .getByRole('button', { name: '保存' })
    .click()
  await expect(
    page.getByRole('dialog', { name: '设置' }).getByText('已保存')
  ).toBeVisible()
})

electronTest('Codex Settings 展示四类核心配置文件', async (page) => {
  await openToolPage(page, 'Codex', 'Settings')
  await expect(page.getByRole('heading', { name: 'Codex' })).toBeVisible()
  await expect(page.getByText('config.toml', { exact: true })).toBeVisible()
  await expect(page.getByText('AGENTS.md', { exact: true })).toBeVisible()
  await expect(page.getByText('hooks.json', { exact: true })).toBeVisible()
  await expect(page.getByText('version.json', { exact: true })).toBeVisible()
})

electronTest('Codex 配置草稿修改后可保存', async (page) => {
  await openToolPage(page, 'Codex', 'Settings')
  // agentsCard 存储 AGENTS.md 原始文本编辑卡片，用于验证通用配置保存反馈。
  const agentsCard = page.locator('.ant-card').filter({ hasText: 'AGENTS.md' })
  await agentsCard.getByRole('textbox').fill('# Updated E2E instructions\n')
  await expect(agentsCard.getByText('未保存')).toBeVisible()
  await agentsCard.getByRole('button', { name: '保存' }).click()
  await expect(agentsCard.getByText('已保存')).toBeVisible()
})

electronTest('Codex MCP 页面标题和说明正确', async (page) => {
  await openToolPage(page, 'Codex', 'MCP')
  await expect(page.getByRole('heading', { name: 'Codex · MCP' })).toBeVisible()
})

electronTest('Codex Hooks 页面标题和配置编辑器可见', async (page) => {
  await openToolPage(page, 'Codex', 'Hooks')
  await expect(
    page.getByRole('heading', { name: 'Codex · Hooks' })
  ).toBeVisible()
  await expect(page.getByText('Codex Hooks', { exact: true })).toBeVisible()
})

electronTest('Codex Agents 页面标题和指令配置可见', async (page) => {
  await openToolPage(page, 'Codex', 'Agents')
  await expect(
    page.getByRole('heading', { name: 'Codex · Agents' })
  ).toBeVisible()
  await expect(page.getByText('Codex Agents', { exact: true })).toBeVisible()
})

electronTest('Codex Plugins 页面可进入并展示空状态', async (page) => {
  await openToolPage(page, 'Codex', 'Plugins')
  await expect(
    page.getByRole('heading', { name: 'Codex · 插件' })
  ).toBeVisible()
  await expect(page.getByText('未发现已安装插件')).toBeVisible()
})

electronTest('Codex Skills 页面展示测试 Skill', async (page) => {
  await openToolPage(page, 'Codex', 'Skills')
  await expect(
    page.getByRole('heading', { name: 'Codex · 技能' })
  ).toBeVisible()
  await expect(page.getByText('review-code', { exact: true })).toBeVisible()
})

electronTest('Claude Settings 展示核心配置文件', async (page) => {
  await openToolPage(page, 'Claude Code', 'Settings')
  await expect(page.getByRole('heading', { name: 'Claude Code' })).toBeVisible()
  await expect(page.getByText('settings.json', { exact: true })).toBeVisible()
  await expect(page.getByText('CLAUDE.md', { exact: true })).toBeVisible()
})

electronTest('Claude MCP 页面标题正确', async (page) => {
  await openToolPage(page, 'Claude Code', 'MCP')
  await expect(
    page.getByRole('heading', { name: 'Claude Code · MCP' })
  ).toBeVisible()
})

electronTest('Claude Hooks 页面标题正确', async (page) => {
  await openToolPage(page, 'Claude Code', 'Hooks')
  await expect(
    page.getByRole('heading', { name: 'Claude Code · Hooks' })
  ).toBeVisible()
})

electronTest('Claude Agents 页面标题正确', async (page) => {
  await openToolPage(page, 'Claude Code', 'Agents')
  await expect(
    page.getByRole('heading', { name: 'Claude Code · Agents' })
  ).toBeVisible()
})

electronTest('Claude Plugins 页面可加载测试插件', async (page) => {
  await openToolPage(page, 'Claude Code', 'Plugins')
  await expect(
    page.getByRole('heading', { name: 'Claude Code · 插件' })
  ).toBeVisible()
  await expect(
    page.getByText('review-tools@official', { exact: true })
  ).toBeVisible()
})

electronTest('Claude Skills 页面展示测试 Skill', async (page) => {
  await openToolPage(page, 'Claude Code', 'Skills')
  await expect(
    page.getByRole('heading', { name: 'Claude Code · 技能' })
  ).toBeVisible()
  await expect(page.getByText('review-code', { exact: true })).toBeVisible()
})

electronTest('统一配置页展示已保存 MCP 与 Skill', async (page) => {
  await page.getByRole('menuitem', { name: 'Unified' }).click()
  await expect(page.getByRole('heading', { name: '统一配置' })).toBeVisible()
  await expect(page.locator('input[value="context7"]')).toBeVisible()
  await expect(page.getByText('review-code', { exact: true })).toBeVisible()
})

electronTest('统一配置可新增并删除 Server', async (page) => {
  await page.getByRole('menuitem', { name: 'Unified' }).click()
  await page.getByRole('button', { name: '新增 Server' }).click()
  await expect(page.getByText('Server #2')).toBeVisible()
  await page.getByRole('button', { name: '删除' }).last().click()
  await expect(page.getByText('Server #2')).toHaveCount(0)
})

electronTest('统一配置修改后可保存并同步', async (page) => {
  await page.getByRole('menuitem', { name: 'Unified' }).click()
  await page.locator('input[value="context7"]').fill('context8')
  await page.getByRole('button', { name: '保存并同步' }).click()
  await expect(page.getByText(/同步完成：/)).toBeVisible()
})

electronTest('额度管理页展示已配置账户', async (page) => {
  await page.getByRole('menuitem', { name: '额度管理' }).click()
  await expect(page.getByRole('heading', { name: '额度管理' })).toBeVisible()
  await expect(page.getByText('团队 OpenAI', { exact: true })).toBeVisible()
  await expect(page.getByText('gpt-5', { exact: true })).toBeVisible()
})

electronTest('额度账户可查询并展示剩余额度', async (page) => {
  await page.getByRole('menuitem', { name: '额度管理' }).click()
  await page.getByRole('button', { name: '查询 团队 OpenAI 额度' }).click()
  await expect(page.getByText('75 USD')).toBeVisible()
})

electronTest('额度管理可打开新增账户对话框', async (page) => {
  await page.getByRole('menuitem', { name: '额度管理' }).click()
  await page.getByRole('button', { name: '添加账户' }).click()
  await expect(page.getByRole('dialog')).toContainText('添加额度账户')
  await expect(page.getByPlaceholder('例如：团队 OpenAI')).toBeVisible()
})

electronTest('窄窗口下侧栏收窄且内容区仍可见', async (page) => {
  await page.setViewportSize({ width: 720, height: 700 })
  await expect(page.getByTestId('app-sidebar')).toHaveCSS('width', '72px')
  await expect(page.getByRole('heading', { name: '概览' })).toBeVisible()
})
