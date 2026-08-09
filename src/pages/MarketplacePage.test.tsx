import { App as AntApp } from 'antd'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MarketplacePage from './MarketplacePage'

// apiMocks 存储 Marketplace 页面依赖的后端接口替身。
const apiMocks = vi.hoisted(() => ({
  listClaudeMarketplaces: vi.fn(),
  listCodexMarketplaces: vi.fn(),
  revealInFinder: vi.fn(),
  updateClaudeMarketplace: vi.fn(),
  updateCodexMarketplace: vi.fn(),
}))

// storeState 存储页面读取的隔离配置目录。
const storeState = {
  prefs: {
    claude_home: '/tmp/test-claude',
    codex_home: '/tmp/test-codex',
  },
}

vi.mock('../api', () => apiMocks)

vi.mock('../store', () => ({
  useAppStore: (selector: (state: typeof storeState) => unknown) =>
    selector(storeState),
}))

// renderMarketplacePage 使用 Ant Design 上下文渲染指定工具的 Marketplace 页面。
// tool 参数存储需要测试的工具作用域。
function renderMarketplacePage(tool: 'claude' | 'codex') {
  return render(
    <AntApp>
      <MarketplacePage tool={tool} />
    </AntApp>
  )
}

describe('MarketplacePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiMocks.listClaudeMarketplaces.mockResolvedValue([])
    apiMocks.listCodexMarketplaces.mockResolvedValue([])
    apiMocks.revealInFinder.mockResolvedValue(undefined)
    apiMocks.updateClaudeMarketplace.mockResolvedValue('updated')
    apiMocks.updateCodexMarketplace.mockResolvedValue('updated')
  })

  // 验证 Codex 页面读取独立 marketplace 接口并展示来源，而不是插件数据。
  it('lists Codex marketplaces from the Codex home', async () => {
    apiMocks.listCodexMarketplaces.mockResolvedValue([
      {
        name: 'openai-bundled',
        source_type: 'local',
        source: '/tmp/bundled-source',
        install_location: '/tmp/openai-bundled',
        last_updated: '',
      },
    ])

    renderMarketplacePage('codex')

    expect(
      await screen.findByRole('heading', { name: 'Codex · Marketplace' })
    ).toBeInTheDocument()
    expect(screen.getByText('openai-bundled')).toBeInTheDocument()
    expect(apiMocks.listCodexMarketplaces).toHaveBeenCalledWith(
      '/tmp/test-codex'
    )
    expect(apiMocks.listClaudeMarketplaces).not.toHaveBeenCalled()
  })

  // 验证刷新 Claude marketplace 后重新读取来源列表。
  it('refreshes the selected Claude marketplace index', async () => {
    apiMocks.listClaudeMarketplaces.mockResolvedValue([
      {
        name: 'official',
        source_type: 'git',
        source: 'https://example.test/official.git',
        install_location: '/tmp/official',
        last_updated: '2026-07-29T00:00:00.000Z',
      },
    ])

    renderMarketplacePage('claude')

    fireEvent.click(await screen.findByRole('button', { name: '更新索引' }))

    await waitFor(() => {
      expect(apiMocks.updateClaudeMarketplace).toHaveBeenCalledWith(
        'official',
        '/tmp/test-claude'
      )
    })
    await waitFor(() => {
      expect(apiMocks.listClaudeMarketplaces).toHaveBeenCalledTimes(2)
    })
    expect(apiMocks.updateCodexMarketplace).not.toHaveBeenCalled()
  })
})
