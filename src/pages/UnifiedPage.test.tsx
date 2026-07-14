import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import UnifiedPage from './UnifiedPage'

// getUnifiedMcpMock 存储读取统一 MCP 源的测试替身。
const getUnifiedMcpMock = vi.fn()
// saveUnifiedMcpMock 存储保存统一 MCP 源的测试替身。
const saveUnifiedMcpMock = vi.fn()
// listUnifiedSkillsMock 存储列出统一 Skills 的测试替身。
const listUnifiedSkillsMock = vi.fn()
// syncUnifiedMock 存储同步统一配置的测试替身。
const syncUnifiedMock = vi.fn()

vi.mock('../api', () => ({
  getUnifiedMcp: () => getUnifiedMcpMock(),
  saveUnifiedMcp: (servers: unknown) => saveUnifiedMcpMock(servers),
  listUnifiedSkills: () => listUnifiedSkillsMock(),
  syncUnified: (options: unknown) => syncUnifiedMock(options),
}))

vi.mock('../store', () => ({
  useAppStore: (selector: (state: unknown) => unknown) =>
    selector({
      prefs: {
        claude_home: '/Users/test/.claude',
        codex_home: '/Users/test/.codex',
      },
    }),
}))

describe('UnifiedPage', () => {
  beforeEach(() => {
    getUnifiedMcpMock.mockReset()
    saveUnifiedMcpMock.mockReset()
    listUnifiedSkillsMock.mockReset()
    syncUnifiedMock.mockReset()

    getUnifiedMcpMock.mockResolvedValue({
      path: '/Users/test/.visualAiCoding/unified/mcp.json',
      servers: [
        {
          name: 'ctx7',
          command: 'npx',
          args: ['-y', 'ctx7-mcp'],
          env: { K: 'v' },
        },
      ],
    })
    listUnifiedSkillsMock.mockResolvedValue({
      dir: '/Users/test/.visualAiCoding/unified/skills',
      skills: ['demo-skill'],
    })
    saveUnifiedMcpMock.mockImplementation((servers) =>
      Promise.resolve({ path: '/p', servers })
    )
    syncUnifiedMock.mockResolvedValue({
      results: [
        {
          capability: 'mcp',
          tool: 'claude',
          path: '/Users/test/.claude.json',
          count: 1,
          warnings: [],
        },
        {
          capability: 'skills',
          tool: 'codex',
          path: '/Users/test/.codex/skills',
          count: 1,
          total: 1,
          warnings: ['跳过技能软链：目标已存在同名真实目录 x'],
        },
      ],
      warnings: ['跳过技能软链：目标已存在同名真实目录 x'],
      syncedAt: '2026-07-15T00:00:00.000Z',
    })
  })

  // 验证初始加载会展示统一 MCP server 与 Skills 列表。
  it('loads unified mcp servers and skills', async () => {
    render(<UnifiedPage />)

    // MCP server 名称回填到输入框。
    expect(await screen.findByDisplayValue('ctx7')).toBeInTheDocument()
    // Skills 列表展示统一源技能。
    expect(screen.getByText('demo-skill')).toBeInTheDocument()
  })

  // 验证新增 server 后点击「保存并同步」会先保存再同步，并展示同步结果与警告。
  it('saves then syncs and shows results with warnings', async () => {
    render(<UnifiedPage />)
    await screen.findByDisplayValue('ctx7')

    // 点击「保存并同步」触发保存 + 同步链路。
    fireEvent.click(screen.getByRole('button', { name: '保存并同步' }))

    await waitFor(() => expect(syncUnifiedMock).toHaveBeenCalledTimes(1))
    // 同步入参携带两端配置根目录。
    expect(syncUnifiedMock).toHaveBeenCalledWith({
      claudeHome: '/Users/test/.claude',
      codexHome: '/Users/test/.codex',
    })
    // 同步结果与警告展示出来。
    expect(await screen.findByText(/同步完成/)).toBeInTheDocument()
    expect(screen.getByText(/目标已存在同名真实目录/)).toBeInTheDocument()
  })

  // 验证新增与删除 server 会即时更新表单行。
  it('adds and removes server rows', async () => {
    render(<UnifiedPage />)
    await screen.findByDisplayValue('ctx7')

    // 初始只有一行 server。
    expect(screen.getByText('Server #1')).toBeInTheDocument()
    expect(screen.queryByText('Server #2')).not.toBeInTheDocument()

    // 新增一行。
    fireEvent.click(screen.getByRole('button', { name: /新增 Server/ }))
    expect(screen.getByText('Server #2')).toBeInTheDocument()

    // 删除第一行后仍剩一行。
    fireEvent.click(screen.getAllByRole('button', { name: '删除' })[0])
    expect(screen.queryByText('Server #2')).not.toBeInTheDocument()
  })
})
