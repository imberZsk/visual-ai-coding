import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// fakeHome 存储每个用例隔离的假主目录，缓存文件落在其 .visualAiCoding 下。
let fakeHome
// runCommandMock 存储 util.runCommand 的测试替身，隔离真实 curl 抓取。
const runCommandMock = vi.fn()

// mock node:os，让 homedir 指向测试临时目录。
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    default: { ...actual, homedir: () => fakeHome },
    homedir: () => fakeHome,
  }
})

// mock util.js：runCommand 用替身，atomicWrite 保留真实实现以便验证落盘。
vi.mock('../../src/core/util.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    runCommand: (...args) => runCommandMock(...args),
  }
})

// cacheFilePath 返回官方来源缓存文件的绝对路径。
function cacheFilePath() {
  return join(fakeHome, '.visualAiCoding', 'official_settings_sources.json')
}

describe('core officialSettings', () => {
  beforeEach(() => {
    fakeHome = join(
      tmpdir(),
      `va-official-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`
    )
    mkdirSync(fakeHome, { recursive: true })
    runCommandMock.mockReset()
    vi.resetModules()
  })

  afterEach(() => {
    rmSync(fakeHome, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  // 验证从反引号包裹片段中提取字段路径。
  it('extractSettingPaths 提取反引号字段', async () => {
    const { extractSettingPaths } =
      await import('../../src/core/officialSettings.js')
    // paths 存储从文本中提取的字段集合。
    const paths = extractSettingPaths(
      '配置项 `model` 和 `permissions.allow` 可用。'
    )
    expect(paths).toContain('model')
    expect(paths).toContain('permissions.allow')
  })

  // 验证从 TOML 表头与赋值行中提取字段路径。
  it('extractSettingPaths 提取 TOML 表头与赋值 key', async () => {
    const { extractSettingPaths } =
      await import('../../src/core/officialSettings.js')
    // content 存储含 TOML 表头与赋值语句的文本。
    const content = [
      '[model_providers.openai]',
      'approval_policy = "auto"',
      "model = 'gpt'",
    ].join('\n')
    const paths = extractSettingPaths(content)
    // 表头只取第一段。
    expect(paths).toContain('model_providers')
    expect(paths).toContain('approval_policy')
    expect(paths).toContain('model')
  })

  // 验证非法候选（含协议、过长、非字母数字、纯数字）会被过滤。
  it('extractSettingPaths 过滤非法候选', async () => {
    const { extractSettingPaths } =
      await import('../../src/core/officialSettings.js')
    // content 存储各种应被过滤的候选。
    const content = [
      '`https://example.com`',
      '`--flag`',
      '`with space`',
      '`12345`',
      '`' + 'a'.repeat(100) + '`',
    ].join('\n')
    const paths = extractSettingPaths(content)
    expect(paths).toEqual([])
  })

  // 验证无缓存时读取返回内置默认来源。
  it('getOfficialSettingsSources 无缓存返回默认来源', async () => {
    const { getOfficialSettingsSources } =
      await import('../../src/core/officialSettings.js')
    // result 存储读取到的默认来源结构。
    const result = getOfficialSettingsSources()
    expect(result.sources.map((s) => s.id)).toEqual([
      'claude-settings',
      'codex-config',
    ])
    expect(result.diagnostics).toBe('')
  })

  // 验证已有缓存时读取会用内置定义合并历史字段。
  it('getOfficialSettingsSources 合并已有缓存字段', async () => {
    mkdirSync(join(fakeHome, '.visualAiCoding'), { recursive: true })
    // 写入只含 claude-settings 且带自定义字段的历史缓存。
    writeFileSync(
      cacheFilePath(),
      JSON.stringify({
        sources: [
          {
            id: 'claude-settings',
            fields: [{ path: 'customField' }],
            cached_at: '2024-01-01',
          },
        ],
      }),
      'utf8'
    )

    const { getOfficialSettingsSources } =
      await import('../../src/core/officialSettings.js')
    const result = getOfficialSettingsSources()
    // claude-settings 应保留缓存字段，codex-config 用内置默认补齐。
    const claude = result.sources.find((s) => s.id === 'claude-settings')
    expect(claude.fields).toEqual([{ path: 'customField' }])
    expect(claude.cached_at).toBe('2024-01-01')
    expect(result.sources.find((s) => s.id === 'codex-config')).toBeDefined()
  })

  // 验证同步成功时会抓取文档、提取字段并写入缓存。
  it('updateOfficialSettingsSources 抓取成功写入字段缓存', async () => {
    // 两个来源都返回可提取字段的文本。
    runCommandMock.mockResolvedValue({
      stdout: '`model` `mcp_servers`',
      stderr: '',
    })

    const { updateOfficialSettingsSources } =
      await import('../../src/core/officialSettings.js')
    const result = await updateOfficialSettingsSources()

    expect(result.diagnostics).toBe('')
    // 每个来源都应提取到字段。
    for (const source of result.sources) {
      expect(source.fields.length).toBeGreaterThan(0)
      expect(source.cached_at).not.toBe('')
    }
    // 结果应已落盘。
    const cached = JSON.parse(readFileSync(cacheFilePath(), 'utf8'))
    expect(cached.sources).toHaveLength(2)
  })

  // 验证抓取失败时会用内置兜底字段并记录诊断信息。
  it('updateOfficialSettingsSources 抓取失败用兜底字段', async () => {
    // curl 抓取始终失败，触发兜底分支。
    runCommandMock.mockRejectedValue(new Error('curl 失败'))

    const { updateOfficialSettingsSources } =
      await import('../../src/core/officialSettings.js')
    const result = await updateOfficialSettingsSources()

    // 诊断信息应记录失败并说明使用缓存或内置兜底。
    expect(result.diagnostics).toContain('兜底')
    // 无缓存文件时 readCachedResult 返回带空字段的默认来源，失败时保留该占位来源。
    const claude = result.sources.find((s) => s.id === 'claude-settings')
    expect(claude).toBeDefined()
    const codex = result.sources.find((s) => s.id === 'codex-config')
    expect(codex).toBeDefined()
  })

  // 验证抓取内容提取不到字段时视为失败并走兜底。
  it('updateOfficialSettingsSources 提取不到字段时走兜底', async () => {
    // 返回无任何合法字段的文本。
    runCommandMock.mockResolvedValue({
      stdout: '纯说明文本没有字段',
      stderr: '',
    })

    const { updateOfficialSettingsSources } =
      await import('../../src/core/officialSettings.js')
    const result = await updateOfficialSettingsSources()
    expect(result.diagnostics).toContain('未提取到可识别字段')
  })

  // 验证抓取失败但已有缓存字段时优先保留缓存而非兜底。
  it('updateOfficialSettingsSources 抓取失败时优先保留已有缓存', async () => {
    mkdirSync(join(fakeHome, '.visualAiCoding'), { recursive: true })
    writeFileSync(
      cacheFilePath(),
      JSON.stringify({
        sources: [
          {
            id: 'claude-settings',
            fields: [{ path: 'cachedOnly' }],
            cached_at: '2024-05-05',
          },
        ],
      }),
      'utf8'
    )
    runCommandMock.mockRejectedValue(new Error('网络中断'))

    const { updateOfficialSettingsSources } =
      await import('../../src/core/officialSettings.js')
    const result = await updateOfficialSettingsSources()
    // claude-settings 应保留缓存字段而非兜底字段。
    const claude = result.sources.find((s) => s.id === 'claude-settings')
    expect(claude.fields).toEqual([{ path: 'cachedOnly' }])
  })
})
