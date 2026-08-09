import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OfficialSettingsSyncResult } from '../types'
import { SettingsContent } from './SettingsPage'

// getOfficialSettingsSourcesMock 存储读取官方设置来源缓存的 API 替身。
const getOfficialSettingsSourcesMock = vi.fn()
// updateOfficialSettingsSourcesMock 存储同步官方设置来源的 API 替身。
const updateOfficialSettingsSourcesMock = vi.fn()
// updatePrefsMock 存储偏好保存动作替身。
const updatePrefsMock = vi.fn()
// refreshToolsMock 存储工具重新探测动作替身。
const refreshToolsMock = vi.fn()

vi.mock('../api', () => ({
  getOfficialSettingsSources: (...args: unknown[]) =>
    getOfficialSettingsSourcesMock(...args),
  updateOfficialSettingsSources: (...args: unknown[]) =>
    updateOfficialSettingsSourcesMock(...args),
}))

vi.mock('../store', () => ({
  useAppStore: (selector: (state: unknown) => unknown) =>
    selector({
      prefs: {
        theme: 'system',
        vscode_path: 'code',
        claude_home: '/Users/test/.claude',
        codex_home: '/Users/test/.codex',
        last_active_tab: 'settings',
        hidden_visual_config_fields: {},
      },
      updatePrefs: updatePrefsMock,
      refreshTools: refreshToolsMock,
    }),
}))

// DeferredValue 描述测试中可手动结束的 Promise。
interface DeferredValue<T> {
  promise: Promise<T> // promise 存储被测异步流程等待的 Promise。
  resolve: (value: T) => void // resolve 存储手动完成 Promise 的函数。
}

// createDeferred 创建可手动 resolve 的 Promise，便于断言 loading 中间态。
// T 为 Promise 完成时返回的数据类型。
function createDeferred<T>(): DeferredValue<T> {
  // resolveDeferred 存储当前 Promise 的 resolve 函数。
  let resolveDeferred: (value: T) => void = () => undefined
  // promise 存储交给被测代码等待的 Promise。
  const promise = new Promise<T>((resolve) => {
    resolveDeferred = resolve
  })

  return { promise, resolve: resolveDeferred }
}

// createOfficialSourcesResult 创建设置页测试用官方来源同步结果。
function createOfficialSourcesResult(
  cachedAt: string
): OfficialSettingsSyncResult {
  return {
    sources: [
      {
        id: 'claude-settings',
        title: 'Claude settings.json',
        description: 'Claude Code settings 官方参考。',
        url: 'https://docs.anthropic.com/en/docs/claude-code/settings',
        cached_at: cachedAt,
        fields: cachedAt
          ? [{ path: 'model' }, { path: 'futureClaudeFlag' }]
          : [],
      },
      {
        id: 'codex-config',
        title: 'Codex config.toml',
        description: 'Codex 配置官方参考。',
        url: 'https://developers.openai.com/codex/config-reference',
        cached_at: cachedAt,
        fields: cachedAt ? [{ path: 'model' }, { path: 'sandbox_mode' }] : [],
      },
    ],
    diagnostics: '',
  }
}

describe('SettingsContent', () => {
  beforeEach(() => {
    getOfficialSettingsSourcesMock.mockReset()
    updateOfficialSettingsSourcesMock.mockReset()
    updatePrefsMock.mockReset()
    refreshToolsMock.mockReset()
    getOfficialSettingsSourcesMock.mockResolvedValue(
      createOfficialSourcesResult('')
    )
    updateOfficialSettingsSourcesMock.mockResolvedValue(
      createOfficialSourcesResult('2026-07-01T01:02:03Z')
    )
    updatePrefsMock.mockResolvedValue(undefined)
    refreshToolsMock.mockResolvedValue(undefined)
  })

  it('shows official settings sources and refreshes official metadata', async () => {
    // user 存储用户交互模拟器，用于点击官方设置同步按钮。
    const user = userEvent.setup()

    render(<SettingsContent />)

    expect(await screen.findByText('官方设置来源')).toBeInTheDocument()
    expect(screen.getByText('Claude settings.json')).toBeInTheDocument()
    expect(
      screen.getByText(
        'https://docs.anthropic.com/en/docs/claude-code/settings'
      )
    ).toBeInTheDocument()
    expect(screen.getAllByText('未同步').length).toBeGreaterThan(0)

    await user.click(screen.getByRole('button', { name: '更新官方设置' }))

    await waitFor(() => {
      expect(updateOfficialSettingsSourcesMock).toHaveBeenCalledTimes(1)
    })

    // claudeSourceCard 存储 Claude 官方来源卡片，用于断言覆盖统计按 schema id 计算。
    const claudeSourceCard = screen.getByTestId(
      'official-source-claude-settings'
    )
    expect(
      within(claudeSourceCard).getByText('官方字段 2 / 已覆盖 1 / 未覆盖 1')
    ).toBeInTheDocument()
    expect(
      within(claudeSourceCard).getByText('futureClaudeFlag')
    ).toBeInTheDocument()
    expect(
      within(claudeSourceCard).getByText('2026-07-01T01:02:03Z')
    ).toBeInTheDocument()
  })

  it('uses unified loading while refreshing official settings', async () => {
    // user 存储用户交互模拟器，用于点击官方设置同步按钮。
    const user = userEvent.setup()
    // updateDeferred 存储官方设置同步 Promise，用于保持按钮 loading 中间态。
    const updateDeferred = createDeferred<OfficialSettingsSyncResult>()

    updateOfficialSettingsSourcesMock.mockReturnValue(updateDeferred.promise)

    render(<SettingsContent />)

    expect(await screen.findByText('官方设置来源')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '更新官方设置' }))

    // updateButton 存储进入 loading 状态的官方设置更新按钮。
    const updateButton = screen.getByRole('button', { name: '更新官方设置' })
    expect(updateButton).toBeDisabled()
    expect(within(updateButton).getByTestId('loading-icon')).toBeInTheDocument()

    updateDeferred.resolve(createOfficialSourcesResult('2026-07-01T01:02:03Z'))

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: '更新官方设置' })
      ).not.toBeDisabled()
    })
  })

  it('uses unified loading while saving paths', async () => {
    // user 存储用户交互模拟器，用于点击保存路径按钮。
    const user = userEvent.setup()
    // saveDeferred 存储偏好保存 Promise，用于保持保存按钮 loading 中间态。
    const saveDeferred = createDeferred<void>()

    updatePrefsMock.mockReturnValue(saveDeferred.promise)

    render(<SettingsContent />)

    expect(await screen.findByText('官方设置来源')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '保存' }))

    // saveButton 存储进入 loading 状态的路径保存按钮。
    const saveButton = screen.getByRole('button', { name: '保存' })
    expect(saveButton).toBeDisabled()
    expect(within(saveButton).getByTestId('loading-icon')).toBeInTheDocument()

    saveDeferred.resolve(undefined)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '保存' })).not.toBeDisabled()
    })
  })
})
