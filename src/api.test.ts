import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from './api'

// apiMock 存储 preload 注入到 window.api 上的全部方法测试替身。
let apiMock: Record<string, ReturnType<typeof vi.fn>>

// buildApiMock 构造覆盖 api.ts 所需全部 preload 方法的替身对象。
function buildApiMock() {
  return {
    getPreferences: vi.fn().mockResolvedValue({ theme: 'dark' }),
    savePreferences: vi.fn().mockResolvedValue(undefined),
    readConfigFile: vi.fn().mockResolvedValue({ content: '{}' }),
    saveConfigFile: vi.fn().mockResolvedValue(undefined),
    listDir: vi.fn().mockResolvedValue([]),
    listClaudeOutputStyles: vi.fn().mockResolvedValue({ styles: [] }),
    createClaudeOutputStyle: vi.fn().mockResolvedValue({ name: 'x' }),
    listClaudePlugins: vi.fn().mockResolvedValue([]),
    listClaudeMarketplaces: vi.fn().mockResolvedValue([]),
    updateClaudePlugin: vi.fn().mockResolvedValue('ok'),
    updateClaudeMarketplace: vi.fn().mockResolvedValue('ok'),
    checkClaudePluginUpdates: vi.fn().mockResolvedValue({ updates: [] }),
    checkCodexPluginUpdates: vi.fn().mockResolvedValue({ updates: [] }),
    updateCodexMarketplace: vi.fn().mockResolvedValue('ok'),
    updateCodexPlugin: vi.fn().mockResolvedValue('ok'),
    setPluginEnabled: vi.fn().mockResolvedValue('ok'),
    listPluginGitBranches: vi.fn().mockResolvedValue({ branches: [] }),
    switchPluginGitBranch: vi.fn().mockResolvedValue({ branches: [] }),
    listQuotaAccounts: vi.fn().mockResolvedValue([]),
    saveQuotaAccount: vi.fn().mockResolvedValue({ id: 'quota-1' }),
    deleteQuotaAccount: vi.fn().mockResolvedValue(undefined),
    queryQuotaAccount: vi.fn().mockResolvedValue({ remaining: 10 }),
    discoverQuotaModels: vi.fn().mockResolvedValue(['gpt-5.4']),
    detectTools: vi.fn().mockResolvedValue([]),
    checkToolLatestVersion: vi
      .fn()
      .mockResolvedValue({ latest_version: '1.0.0' }),
    updateToolCli: vi.fn().mockResolvedValue('ok'),
    openInVscode: vi.fn().mockResolvedValue(undefined),
    revealInFinder: vi.fn().mockResolvedValue(undefined),
    openExternalUrl: vi.fn().mockResolvedValue(undefined),
    listSkills: vi.fn().mockResolvedValue({ skills: [] }),
    getOfficialSettingsSources: vi.fn().mockResolvedValue({ sources: [] }),
    updateOfficialSettingsSources: vi.fn().mockResolvedValue({ sources: [] }),
  }
}

describe('api 后端命令封装层', () => {
  beforeEach(() => {
    apiMock = buildApiMock()
    // 将替身挂到 window.api，模拟 preload 已初始化。
    ;(window as unknown as { api: unknown }).api = apiMock
  })

  // 验证额度管理 API 会把账户数据与 ID 转发给 preload 安全桥。
  it('额度管理方法转发到 preload', async () => {
    // input 存储待保存的额度账户表单值。
    const input: Parameters<typeof api.saveQuotaAccount>[0] = {
      id: '',
      name: 'OpenAI',
      provider: 'openai',
      models: ['gpt-5.4'],
      base_url: '',
      quota_path: '',
      endpoint: '',
      quota_limit: 100,
      unit: 'USD',
      api_key: 'secret',
    }
    await api.listQuotaAccounts()
    await api.saveQuotaAccount(input)
    await api.queryQuotaAccount('quota-1')
    await api.deleteQuotaAccount('quota-1')
    await api.discoverQuotaModels({
      base_url: 'https://api.example.com/v1',
      api_key: 'secret',
    })
    expect(apiMock.listQuotaAccounts).toHaveBeenCalledTimes(1)
    expect(apiMock.saveQuotaAccount).toHaveBeenCalledWith(input)
    expect(apiMock.queryQuotaAccount).toHaveBeenCalledWith('quota-1')
    expect(apiMock.deleteQuotaAccount).toHaveBeenCalledWith('quota-1')
    expect(apiMock.discoverQuotaModels).toHaveBeenCalledWith({
      base_url: 'https://api.example.com/v1',
      api_key: 'secret',
    })
  })

  afterEach(() => {
    // 清理 window.api，避免用例间相互影响。
    delete (window as unknown as { api?: unknown }).api
  })

  // 验证 preload API 缺失时给出明确错误，便于定位启动链路问题。
  // WHY：getElectronApi 在返回 Promise 前同步抛错，因此这里用同步断言而非 rejects。
  it('preload 未初始化时抛出明确错误', () => {
    delete (window as unknown as { api?: unknown }).api
    expect(() => api.getPreferences()).toThrow('Electron preload API 未初始化')
  })

  // 验证读取偏好会转发到 preload getPreferences。
  it('getPreferences 转发到 preload', async () => {
    await api.getPreferences()
    expect(apiMock.getPreferences).toHaveBeenCalledTimes(1)
  })

  // 验证保存偏好会把偏好对象透传给 preload。
  it('savePreferences 透传偏好对象', async () => {
    // prefs 存储待保存的偏好对象。
    const prefs = { theme: 'light' } as never
    await api.savePreferences(prefs)
    expect(apiMock.savePreferences).toHaveBeenCalledWith(prefs)
  })

  // 验证读取配置文件会把入参组装为对象再转发。
  it('readConfigFile 组装参数对象转发', async () => {
    await api.readConfigFile('id', '标题', '/tmp/a.json', false)
    expect(apiMock.readConfigFile).toHaveBeenCalledWith({
      id: 'id',
      title: '标题',
      path: '/tmp/a.json',
      readonly: false,
    })
  })

  // 验证保存配置文件会把 path/content/format 组装转发。
  it('saveConfigFile 组装参数对象转发', async () => {
    await api.saveConfigFile('/tmp/a.json', '{}', 'json')
    expect(apiMock.saveConfigFile).toHaveBeenCalledWith({
      path: '/tmp/a.json',
      content: '{}',
      format: 'json',
    })
  })

  // 验证列目录转发路径参数。
  it('listDir 转发路径', async () => {
    await api.listDir('/tmp')
    expect(apiMock.listDir).toHaveBeenCalledWith('/tmp')
  })

  // 验证 output style 列表查询转发 claudeHome。
  it('listClaudeOutputStyles 转发 claudeHome', async () => {
    await api.listClaudeOutputStyles('/home/.claude')
    expect(apiMock.listClaudeOutputStyles).toHaveBeenCalledWith('/home/.claude')
  })

  // 验证创建 output style 会组装 claudeHome 与 name 转发。
  it('createClaudeOutputStyle 组装参数转发', async () => {
    await api.createClaudeOutputStyle('/home/.claude', 'my-style')
    expect(apiMock.createClaudeOutputStyle).toHaveBeenCalledWith({
      claudeHome: '/home/.claude',
      name: 'my-style',
    })
  })

  // 验证插件与市场列表查询转发对应根目录。
  it('listClaudePlugins / listClaudeMarketplaces 转发根目录', async () => {
    await api.listClaudePlugins('/home/.claude')
    await api.listClaudeMarketplaces('/home/.claude')
    expect(apiMock.listClaudePlugins).toHaveBeenCalledWith('/home/.claude')
    expect(apiMock.listClaudeMarketplaces).toHaveBeenCalledWith('/home/.claude')
  })

  // 验证更新 Claude 插件会组装名称与作用域转发。
  it('updateClaudePlugin 组装名称与作用域转发', async () => {
    await api.updateClaudePlugin('plugin-a', 'user')
    expect(apiMock.updateClaudePlugin).toHaveBeenCalledWith({
      pluginName: 'plugin-a',
      scope: 'user',
    })
  })

  // 验证更新市场与插件更新检查按参数转发。
  it('市场更新与更新检查转发参数', async () => {
    await api.updateClaudeMarketplace('mk')
    await api.checkClaudePluginUpdates('/home/.claude')
    await api.checkCodexPluginUpdates('/home/.codex')
    await api.updateCodexMarketplace('mk')
    expect(apiMock.updateClaudeMarketplace).toHaveBeenCalledWith('mk')
    expect(apiMock.checkClaudePluginUpdates).toHaveBeenCalledWith(
      '/home/.claude'
    )
    expect(apiMock.checkCodexPluginUpdates).toHaveBeenCalledWith('/home/.codex')
    expect(apiMock.updateCodexMarketplace).toHaveBeenCalledWith('mk')
  })

  // 验证更新 Codex 插件会组装 pluginId 与 marketplace 转发。
  it('updateCodexPlugin 组装参数转发', async () => {
    await api.updateCodexPlugin('p1', 'mk')
    expect(apiMock.updateCodexPlugin).toHaveBeenCalledWith({
      pluginId: 'p1',
      marketplace: 'mk',
    })
  })

  // 验证插件启停会把整个 payload 透传。
  it('setPluginEnabled 透传 payload', async () => {
    // payload 存储插件启停请求参数。
    const payload = {
      tool: 'claude' as const,
      pluginId: 'p1',
      scope: 'user',
      enabled: true,
      claudeHome: '/home/.claude',
      codexHome: '/home/.codex',
    }
    await api.setPluginEnabled(payload)
    expect(apiMock.setPluginEnabled).toHaveBeenCalledWith(payload)
  })

  // 验证插件 Git 分支查询与切换会透传完整仓库定位参数。
  it('插件 Git 分支操作透传参数', async () => {
    // payload 存储定位插件 Git 仓库所需的信息。
    const payload = {
      tool: 'claude' as const,
      pluginId: 'plugin@mk',
      scope: 'user',
      marketplace: 'mk',
      installPath: '/tmp/plugin',
      claudeHome: '/home/.claude',
      codexHome: '/home/.codex',
    }
    await api.listPluginGitBranches(payload)
    await api.switchPluginGitBranch({ ...payload, branch: 'feature/demo' })
    expect(apiMock.listPluginGitBranches).toHaveBeenCalledWith(payload)
    expect(apiMock.switchPluginGitBranch).toHaveBeenCalledWith({
      ...payload,
      branch: 'feature/demo',
    })
  })

  // 验证工具探测与版本查询/更新按参数转发。
  it('工具探测与版本操作转发参数', async () => {
    await api.detectTools()
    await api.checkToolLatestVersion('claude')
    await api.updateToolCli('codex')
    expect(apiMock.detectTools).toHaveBeenCalledTimes(1)
    expect(apiMock.checkToolLatestVersion).toHaveBeenCalledWith('claude')
    expect(apiMock.updateToolCli).toHaveBeenCalledWith('codex')
  })

  // 验证在 VSCode 打开会组装 vscodePath 与 target 转发。
  it('openInVscode 组装参数转发', async () => {
    await api.openInVscode('code', '/tmp/a.json')
    expect(apiMock.openInVscode).toHaveBeenCalledWith({
      vscodePath: 'code',
      target: '/tmp/a.json',
    })
  })

  // 验证 Finder 定位与外链打开转发目标参数。
  it('revealInFinder / openExternalUrl 转发目标', async () => {
    await api.revealInFinder('/tmp/a.json')
    await api.openExternalUrl('https://example.com')
    expect(apiMock.revealInFinder).toHaveBeenCalledWith('/tmp/a.json')
    expect(apiMock.openExternalUrl).toHaveBeenCalledWith('https://example.com')
  })

  // 验证 Skill 列表查询会组装 claudeHome 与 codexHome 转发。
  it('listSkills 组装双根目录转发', async () => {
    await api.listSkills('/home/.claude', '/home/.codex')
    expect(apiMock.listSkills).toHaveBeenCalledWith({
      claudeHome: '/home/.claude',
      codexHome: '/home/.codex',
    })
  })

  // 验证官方设置来源读取与同步转发到对应 preload。
  it('官方设置来源读取与同步转发', async () => {
    await api.getOfficialSettingsSources()
    await api.updateOfficialSettingsSources()
    expect(apiMock.getOfficialSettingsSources).toHaveBeenCalledTimes(1)
    expect(apiMock.updateOfficialSettingsSources).toHaveBeenCalledTimes(1)
  })
})
