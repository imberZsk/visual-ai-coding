import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ConfigEditor from './ConfigEditor'
import type { ConfigFileSpec } from '../config'
import { useAppStore } from '../store'

// readConfigFileMock 存储读取配置文件命令的测试替身。
const readConfigFileMock = vi.fn()
// saveConfigFileMock 存储保存配置文件命令的测试替身。
const saveConfigFileMock = vi.fn()
// openInVscodeMock 存储 VSCode 打开命令的测试替身。
const openInVscodeMock = vi.fn()
// revealInFinderMock 存储 Finder 定位命令的测试替身。
const revealInFinderMock = vi.fn()

vi.mock('../api', () => ({
  readConfigFile: (...args: unknown[]) => readConfigFileMock(...args),
  saveConfigFile: (...args: unknown[]) => saveConfigFileMock(...args),
  openInVscode: (...args: unknown[]) => openInVscodeMock(...args),
  revealInFinder: (...args: unknown[]) => revealInFinderMock(...args),
}))

// editableSpec 存储可编辑的 Claude 配置文件规格。
const editableSpec: ConfigFileSpec = {
  id: 'claude-md',
  title: 'CLAUDE.md',
  relPath: 'CLAUDE.md',
  tool: 'claude',
  readonly: false,
  desc: '全局指令',
}

// readonlySpec 存储只读的 Claude 配置文件规格。
const readonlySpec: ConfigFileSpec = {
  id: 'claude-installed-plugins',
  title: 'installed_plugins.json',
  relPath: 'plugins/installed_plugins.json',
  tool: 'claude',
  readonly: true,
  desc: '已安装插件清单',
}

// resetStore 重置 ConfigEditor 依赖的 prefs（工具根目录与 VSCode 路径）。
function resetStore() {
  useAppStore.setState({
    prefs: {
      theme: 'system',
      vscode_path: 'code',
      claude_home: '/Users/test/.claude',
      codex_home: '/Users/test/.codex',
      last_active_tab: 'claude',
      hidden_visual_config_fields: {},
    },
  })
}

describe('ConfigEditor 单文件配置编辑器', () => {
  beforeEach(() => {
    readConfigFileMock.mockReset()
    saveConfigFileMock.mockReset()
    openInVscodeMock.mockReset()
    revealInFinderMock.mockReset()
    resetStore()
  })

  // 验证组件加载后会渲染标题、路径与文件内容。
  it('加载并渲染配置文件内容', async () => {
    readConfigFileMock.mockResolvedValue({
      path: '/Users/test/.claude/CLAUDE.md',
      format: 'markdown',
      content: '# 全局指令',
      exists: true,
    })

    render(<ConfigEditor spec={editableSpec} />)

    // 标题应渲染。
    expect(screen.getByText('CLAUDE.md')).toBeInTheDocument()
    // 文件内容加载完成后应出现在文本域。
    expect(await screen.findByDisplayValue('# 全局指令')).toBeInTheDocument()
    // 应以拼接后的绝对路径读取文件，去除多余斜杠。
    expect(readConfigFileMock).toHaveBeenCalledWith(
      'claude-md',
      'CLAUDE.md',
      '/Users/test/.claude/CLAUDE.md',
      false
    )
  })

  // 验证编辑草稿后可保存，并在保存成功后展示提示与重新加载。
  it('编辑后保存并展示成功提示', async () => {
    // user 存储用户交互模拟器。
    const user = userEvent.setup()
    readConfigFileMock.mockResolvedValue({
      path: '/Users/test/.claude/CLAUDE.md',
      format: 'markdown',
      content: 'old',
      exists: true,
    })
    saveConfigFileMock.mockResolvedValue(undefined)

    render(<ConfigEditor spec={editableSpec} />)

    // textarea 存储加载完成后的文本编辑区。
    const textarea = await screen.findByDisplayValue('old')
    // WHY：Ant Design 受控 TextArea 与 userEvent 逐字输入交互不稳定，直接触发 change 设置整段草稿。
    fireEvent.change(textarea, { target: { value: 'new' } })

    // 有改动后未保存徽章应出现。
    expect(screen.getByText('未保存')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '保存' }))

    expect(saveConfigFileMock).toHaveBeenCalledWith(
      '/Users/test/.claude/CLAUDE.md',
      'new',
      'markdown'
    )
    // 保存成功后会调用 load() 重新读取文件刷新状态（首次加载 + 保存后各一次）。
    await waitFor(() => {
      expect(readConfigFileMock).toHaveBeenCalledTimes(2)
    })
  })

  // 验证保存失败时展示错误提示。
  it('保存失败展示错误提示', async () => {
    const user = userEvent.setup()
    readConfigFileMock.mockResolvedValue({
      path: '/Users/test/.claude/CLAUDE.md',
      format: 'markdown',
      content: 'old',
      exists: true,
    })
    saveConfigFileMock.mockRejectedValue(new Error('语法错误'))

    render(<ConfigEditor spec={editableSpec} />)

    const textarea = await screen.findByDisplayValue('old')
    // 直接触发 change 制造脏状态，使保存按钮可点击。
    fireEvent.change(textarea, { target: { value: 'oldx' } })
    await user.click(screen.getByRole('button', { name: '保存' }))

    expect(await screen.findByText(/语法错误/)).toBeInTheDocument()
  })

  // 验证读取失败时展示错误提示。
  it('读取失败展示错误提示', async () => {
    readConfigFileMock.mockRejectedValue(new Error('读取失败'))

    render(<ConfigEditor spec={editableSpec} />)

    expect(await screen.findByText(/读取失败/)).toBeInTheDocument()
  })

  // 验证点击 VSCode 按钮会用偏好中的 code 路径打开文件。
  it('点击 VSCode 按钮打开文件', async () => {
    const user = userEvent.setup()
    readConfigFileMock.mockResolvedValue({
      path: '/Users/test/.claude/CLAUDE.md',
      format: 'markdown',
      content: 'x',
      exists: true,
    })
    openInVscodeMock.mockResolvedValue(undefined)

    render(<ConfigEditor spec={editableSpec} />)
    await screen.findByDisplayValue('x')

    await user.click(screen.getByRole('button', { name: 'VSCode' }))
    expect(openInVscodeMock).toHaveBeenCalledWith(
      'code',
      '/Users/test/.claude/CLAUDE.md'
    )
  })

  // 验证点击 Finder 按钮会定位文件。
  it('点击 Finder 按钮定位文件', async () => {
    const user = userEvent.setup()
    readConfigFileMock.mockResolvedValue({
      path: '/Users/test/.claude/CLAUDE.md',
      format: 'markdown',
      content: 'x',
      exists: true,
    })
    revealInFinderMock.mockResolvedValue(undefined)

    render(<ConfigEditor spec={editableSpec} />)
    await screen.findByDisplayValue('x')

    await user.click(screen.getByRole('button', { name: 'Finder' }))
    expect(revealInFinderMock).toHaveBeenCalledWith(
      '/Users/test/.claude/CLAUDE.md'
    )
  })

  // 验证 VSCode 打开失败时展示错误提示。
  it('VSCode 打开失败展示错误提示', async () => {
    const user = userEvent.setup()
    readConfigFileMock.mockResolvedValue({
      path: '/Users/test/.claude/CLAUDE.md',
      format: 'markdown',
      content: 'x',
      exists: true,
    })
    openInVscodeMock.mockRejectedValue(new Error('code 未安装'))

    render(<ConfigEditor spec={editableSpec} />)
    await screen.findByDisplayValue('x')

    await user.click(screen.getByRole('button', { name: 'VSCode' }))
    expect(await screen.findByText(/code 未安装/)).toBeInTheDocument()
  })

  // 验证只读文件不展示保存按钮，并给出只读徽章。
  it('只读文件隐藏保存按钮', async () => {
    readConfigFileMock.mockResolvedValue({
      path: '/Users/test/.claude/plugins/installed_plugins.json',
      format: 'json',
      content: '{}',
      exists: true,
    })

    render(<ConfigEditor spec={readonlySpec} />)
    await screen.findByText('只读')

    expect(
      screen.queryByRole('button', { name: '保存' })
    ).not.toBeInTheDocument()
    // 读取时 readonly 参数应为 true。
    expect(readConfigFileMock).toHaveBeenCalledWith(
      'claude-installed-plugins',
      'installed_plugins.json',
      '/Users/test/.claude/plugins/installed_plugins.json',
      true
    )
  })

  // 验证文件不存在时展示占位提示与徽章。
  it('文件不存在展示占位提示', async () => {
    readConfigFileMock.mockResolvedValue({
      path: '/Users/test/.claude/CLAUDE.md',
      format: 'markdown',
      content: '',
      exists: false,
    })

    render(<ConfigEditor spec={editableSpec} />)

    expect(await screen.findByText('文件不存在')).toBeInTheDocument()
    await waitFor(() => {
      expect(
        screen.getByPlaceholderText('文件不存在，保存后将创建')
      ).toBeInTheDocument()
    })
  })
})
