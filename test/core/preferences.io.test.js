import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// fakeHome 存储每个用例隔离的假主目录，避免污染真实 ~/.visualAiCoding。
let fakeHome

// mock node:os，让 homedir 指向测试临时目录，其余能力保留原生实现。
vi.mock('node:os', async (importOriginal) => {
  // actual 存储 node:os 原始导出。
  const actual = await importOriginal()
  return {
    ...actual,
    default: { ...actual, homedir: () => fakeHome },
    homedir: () => fakeHome,
  }
})

describe('core preferences 读写', () => {
  beforeEach(() => {
    // 每个用例使用唯一假主目录，保证 preferences.json 相互隔离。
    fakeHome = join(
      tmpdir(),
      `va-prefs-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`
    )
    mkdirSync(fakeHome, { recursive: true })
    vi.resetModules()
  })

  afterEach(() => {
    rmSync(fakeHome, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  // 验证配置目录会被创建，且偏好文件路径落在其中。
  it('appConfigDir 与 preferencesPath 指向应用配置目录', async () => {
    const { appConfigDir, preferencesPath } =
      await import('../../src/core/preferences.js')
    // dir 存储应用配置目录。
    const dir = appConfigDir()
    expect(dir).toBe(join(fakeHome, '.visualAiCoding'))
    expect(existsSync(dir)).toBe(true)
    expect(preferencesPath()).toBe(join(dir, 'preferences.json'))
  })

  // 验证首次读取偏好时会写入默认值并落盘，供后续启动直接命中。
  it('getPreferences 首次读取写入默认偏好', async () => {
    const { getPreferences, preferencesPath } =
      await import('../../src/core/preferences.js')
    // prefs 存储首次读取得到的偏好。
    const prefs = getPreferences()
    expect(prefs.theme).toBe('dark')
    // 默认偏好应已落盘。
    expect(existsSync(preferencesPath())).toBe(true)
  })

  // 验证保存后再读取能拿回写入的值，并用默认值补齐缺失字段。
  it('savePreferences 落盘后 getPreferences 能读回', async () => {
    const { savePreferences, getPreferences } =
      await import('../../src/core/preferences.js')
    savePreferences({ theme: 'light', vscode_path: 'cursor' })
    // prefs 存储读回的偏好，缺失字段应由默认值补齐。
    const prefs = getPreferences()
    expect(prefs.theme).toBe('light')
    expect(prefs.vscode_path).toBe('cursor')
    expect(prefs.active_ai_tool).toBe('codex')
    // hidden_visual_config_fields 非法时应归一化为对象。
    expect(prefs.hidden_visual_config_fields).toEqual({})
  })

  // 验证非法 AI 工具偏好回退到 Codex，避免侧栏无可用菜单。
  it('normalizePreferences 修正非法的 AI 工具', async () => {
    const { savePreferences, getPreferences } =
      await import('../../src/core/preferences.js')
    savePreferences({ active_ai_tool: 'unknown' })
    expect(getPreferences().active_ai_tool).toBe('codex')

    savePreferences({ active_ai_tool: 'claude' })
    expect(getPreferences().active_ai_tool).toBe('claude')
  })

  // 验证 hidden_visual_config_fields 为非对象时会被归一化为空对象。
  it('normalizePreferences 修正非法的 hidden 字段', async () => {
    const { savePreferences, getPreferences, preferencesPath } =
      await import('../../src/core/preferences.js')
    savePreferences({ hidden_visual_config_fields: 'not-object' })
    expect(getPreferences().hidden_visual_config_fields).toEqual({})
    // 保存合法 hidden 字段时应原样保留。
    savePreferences({ hidden_visual_config_fields: { 'a.b': ['x'] } })
    // content 存储落盘 JSON 文本。
    const content = readFileSync(preferencesPath(), 'utf8')
    expect(JSON.parse(content).hidden_visual_config_fields).toEqual({
      'a.b': ['x'],
    })
  })

  // 验证偏好文件损坏时会备份原文件并回退默认值，避免启动失败。
  it('getPreferences 在文件损坏时备份并回退默认值', async () => {
    const { preferencesPath, appConfigDir, getPreferences } =
      await import('../../src/core/preferences.js')
    appConfigDir()
    // 写入非法 JSON 制造损坏偏好。
    writeFileSync(preferencesPath(), '{ this is not json', 'utf8')

    // prefs 存储损坏回退后的默认偏好。
    const prefs = getPreferences()
    expect(prefs.theme).toBe('dark')
    // 原损坏文件应被重命名为 .corrupted 备份。
    expect(
      existsSync(preferencesPath().replace(/\.json$/, '.json.corrupted'))
    ).toBe(true)
  })
})
