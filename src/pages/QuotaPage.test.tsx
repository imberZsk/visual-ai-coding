import { App as AntApp } from 'antd'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import QuotaPage from './QuotaPage'
import * as quotaApi from '../api'

vi.mock('../api', () => ({
  listQuotaAccounts: vi.fn(),
  saveQuotaAccount: vi.fn(),
  deleteQuotaAccount: vi.fn(),
  queryQuotaAccount: vi.fn(),
  discoverQuotaModels: vi.fn(),
}))

// renderPage 在 Ant Design App 上下文中渲染额度管理页面。
function renderPage() {
  return render(
    <AntApp>
      <QuotaPage />
    </AntApp>
  )
}

describe('QuotaPage', () => {
  beforeEach(() => {
    vi.mocked(quotaApi.listQuotaAccounts).mockResolvedValue([
      {
        id: 'quota-1',
        name: '研发 OpenAI',
        provider: 'openai',
        models: ['gpt-5.4', 'gpt-5.4-codex'],
        base_url: '',
        quota_path: '',
        endpoint: '',
        quota_limit: 100,
        unit: 'USD',
        has_api_key: true,
      },
    ])
    vi.mocked(quotaApi.queryQuotaAccount).mockResolvedValue({
      account_id: 'quota-1',
      checked_at: '2026-07-22T08:00:00.000Z',
      used: 35.5,
      limit: 100,
      remaining: 64.5,
      unit: 'USD',
    })
  })

  // 验证页面展示账户模型，并在异步查询后渲染规范化额度结果。
  it('loads model accounts and displays quota after querying', async () => {
    renderPage()

    expect(await screen.findByText('研发 OpenAI')).toBeInTheDocument()
    expect(screen.getByText('gpt-5.4')).toBeInTheDocument()
    expect(screen.getByText('gpt-5.4-codex')).toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('button', { name: '查询 研发 OpenAI 额度' })
    )

    await waitFor(() => {
      expect(quotaApi.queryQuotaAccount).toHaveBeenCalledWith('quota-1')
    })
    expect(await screen.findByText('35.5 USD')).toBeInTheDocument()
    expect(screen.getByText('100 USD')).toBeInTheDocument()
    expect(screen.getByText('64.5 USD')).toBeInTheDocument()
  })

  // 验证编辑兼容服务时可复用已保存密钥，并通过 Base URL 读取模型。
  it('discovers models from a custom account base URL', async () => {
    vi.mocked(quotaApi.listQuotaAccounts).mockResolvedValue([
      {
        id: 'quota-custom',
        name: '兼容网关',
        provider: 'custom',
        models: ['old-model'],
        base_url: 'https://gateway.example.com/v1',
        quota_path: 'account/quota',
        endpoint: '',
        quota_limit: 1000,
        unit: 'credits',
        has_api_key: true,
      },
    ])
    vi.mocked(quotaApi.discoverQuotaModels).mockResolvedValue([
      'model-a',
      'model-b',
    ])
    renderPage()

    expect(await screen.findByText('兼容网关')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '编辑 兼容网关' }))
    fireEvent.click(
      await screen.findByRole('button', { name: '从 Base URL 读取模型' })
    )

    await waitFor(() => {
      expect(quotaApi.discoverQuotaModels).toHaveBeenCalledWith({
        account_id: 'quota-custom',
        base_url: 'https://gateway.example.com/v1',
        api_key: undefined,
      })
    })
  })
})
