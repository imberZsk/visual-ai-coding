import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// runCommandMock 存储 util.runCommand 的测试替身，隔离真实命令执行。
const runCommandMock = vi.fn()
// spawnMock 存储 node:child_process spawn 的测试替身。
const spawnMock = vi.fn()

// mock util.js，只替换 runCommand 与 buildCommandEnv，保留 expandHome 真实实现。
vi.mock('../../src/core/util.js', async (importOriginal) => {
  // actual 存储 util.js 原始导出。
  const actual = await importOriginal()
  return {
    ...actual,
    runCommand: (...args) => runCommandMock(...args),
    buildCommandEnv: vi.fn(() => ({})),
  }
})

// mock 子进程模块，用于验证 spawnAndForget 的分离启动行为。
vi.mock('node:child_process', () => {
  // childProcessStub 存储命名导出与 default 共用的替身实现。
  const childProcessStub = { spawn: (...args) => spawnMock(...args) }
  return { ...childProcessStub, default: childProcessStub }
})

describe('core system 异步命令', () => {
  beforeEach(() => {
    runCommandMock.mockReset()
    spawnMock.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // 验证 openInVscode 会用给定 code 路径与展开后的目标分离启动。
  it('openInVscode 使用给定 code 路径分离启动', async () => {
    // unrefMock 存储子进程 unref 替身。
    const unrefMock = vi.fn()
    spawnMock.mockReturnValue({ unref: unrefMock })
    const { openInVscode } = await import('../../src/core/system.js')

    openInVscode('cursor', '/tmp/a.json')
    expect(spawnMock).toHaveBeenCalledWith(
      'cursor',
      ['/tmp/a.json'],
      expect.objectContaining({ detached: true })
    )
    expect(unrefMock).toHaveBeenCalled()
  })

  // 验证 vscodePath 为空时回退到默认 code 命令。
  it('openInVscode 空路径回退到 code', async () => {
    spawnMock.mockReturnValue({ unref: vi.fn() })
    const { openInVscode } = await import('../../src/core/system.js')
    openInVscode('', '/tmp/a.json')
    expect(spawnMock).toHaveBeenCalledWith(
      'code',
      ['/tmp/a.json'],
      expect.any(Object)
    )
  })

  // 验证 revealInFinder 会用 open -R 分离启动。
  it('revealInFinder 使用 open -R 定位文件', async () => {
    spawnMock.mockReturnValue({ unref: vi.fn() })
    const { revealInFinder } = await import('../../src/core/system.js')
    revealInFinder('/tmp/a.json')
    expect(spawnMock).toHaveBeenCalledWith(
      'open',
      ['-R', '/tmp/a.json'],
      expect.any(Object)
    )
  })

  // 验证 detectTools 会探测 claude 与 codex 的安装状态与版本。
  it('detectTools 返回已安装工具状态', async () => {
    // 根据命令与参数返回不同结果：which 返回路径，--version 返回版本。
    runCommandMock.mockImplementation((bin, args) => {
      if (bin === 'which') {
        return Promise.resolve({
          stdout: `/usr/local/bin/${args[0]}\n`,
          stderr: '',
        })
      }
      if (args?.[0] === '--version') {
        return Promise.resolve({ stdout: '2.1.196\n', stderr: '' })
      }
      return Promise.resolve({ stdout: '', stderr: '' })
    })

    const { detectTools } = await import('../../src/core/system.js')
    // tools 存储探测结果列表。
    const tools = await detectTools()
    expect(tools).toHaveLength(2)
    expect(tools[0]).toMatchObject({
      id: 'claude',
      installed: true,
      version: '2.1.196',
    })
    expect(tools[1]).toMatchObject({ id: 'codex', installed: true })
  })

  // 验证 which 找不到可执行文件时探测返回未安装。
  it('detectTools 在 which 无输出时标记未安装', async () => {
    runCommandMock.mockImplementation((bin) => {
      if (bin === 'which') {
        return Promise.resolve({ stdout: '\n', stderr: '' })
      }
      return Promise.resolve({ stdout: '', stderr: '' })
    })

    const { detectTools } = await import('../../src/core/system.js')
    const tools = await detectTools()
    expect(tools[0]).toMatchObject({
      id: 'claude',
      installed: false,
      version: '',
      path: '',
    })
  })

  // 验证 --version 报错时被 catch 兜底为空版本，但仍标记已安装。
  it('detectTools 在 --version 失败时版本为空', async () => {
    runCommandMock.mockImplementation((bin, args) => {
      if (bin === 'which') {
        return Promise.resolve({
          stdout: '/usr/local/bin/claude\n',
          stderr: '',
        })
      }
      if (args?.[0] === '--version') {
        return Promise.reject(new Error('version failed'))
      }
      return Promise.resolve({ stdout: '', stderr: '' })
    })

    const { detectTools } = await import('../../src/core/system.js')
    const tools = await detectTools()
    expect(tools[0]).toMatchObject({
      id: 'claude',
      installed: true,
      version: '',
    })
  })

  // 验证 checkToolLatestVersion 会调用 npm view 并解析最新版本。
  it('checkToolLatestVersion 查询 npm 最新版本', async () => {
    runCommandMock.mockResolvedValue({ stdout: '2.1.200\n', stderr: '' })
    const { checkToolLatestVersion } = await import('../../src/core/system.js')
    // info 存储版本查询结果。
    const info = await checkToolLatestVersion('claude')
    expect(info).toMatchObject({
      tool_id: 'claude',
      package_name: '@anthropic-ai/claude-code',
      latest_version: '2.1.200',
    })
  })

  // 验证查询不支持的工具会抛出错误。
  it('checkToolLatestVersion 不支持的工具抛错', async () => {
    const { checkToolLatestVersion } = await import('../../src/core/system.js')
    await expect(checkToolLatestVersion('unknown')).rejects.toThrow(
      '不支持查询'
    )
  })

  // 验证 npm 路径的更新流程会安装最新版并校验通过。
  it('updateToolCli 走 npm 安装并校验版本', async () => {
    runCommandMock.mockImplementation((bin, args) => {
      // npm view 查询最新版本
      if (bin === 'npm' && args[0] === 'view') {
        return Promise.resolve({ stdout: '2.1.200\n', stderr: '' })
      }
      // which 解析当前 CLI 路径（npm 全局路径）
      if (bin === 'which') {
        return Promise.resolve({
          stdout: '/usr/local/bin/claude\n',
          stderr: '',
        })
      }
      // npm install 安装
      if (bin === 'npm' && args[0] === 'install') {
        return Promise.resolve({ stdout: 'installed\n', stderr: '' })
      }
      // 更新后 --version 校验，返回目标版本表示成功
      if (args?.[0] === '--version') {
        return Promise.resolve({ stdout: '2.1.200\n', stderr: '' })
      }
      return Promise.resolve({ stdout: '', stderr: '' })
    })

    const { updateToolCli } = await import('../../src/core/system.js')
    // result 存储更新成功输出。
    const result = await updateToolCli('claude')
    expect(result).toBe('installed')
  })

  // 验证 Volta 路径的更新流程会走 volta install。
  it('updateToolCli 走 volta 安装', async () => {
    runCommandMock.mockImplementation((bin, args) => {
      if (bin === 'npm' && args[0] === 'view') {
        return Promise.resolve({ stdout: '2.1.200\n', stderr: '' })
      }
      if (bin === 'which') {
        return Promise.resolve({
          stdout: '/Users/test/.volta/bin/claude\n',
          stderr: '',
        })
      }
      if (bin === 'volta') {
        return Promise.resolve({ stdout: '', stderr: '' })
      }
      if (args?.[0] === '--version') {
        return Promise.resolve({ stdout: '2.1.200\n', stderr: '' })
      }
      return Promise.resolve({ stdout: '', stderr: '' })
    })

    const { updateToolCli } = await import('../../src/core/system.js')
    const result = await updateToolCli('claude')
    // 无 stdout 时回退到默认成功文案。
    expect(result).toContain('已更新到 2.1.200')
    expect(runCommandMock).toHaveBeenCalledWith(
      'volta',
      expect.any(Array),
      expect.any(Object)
    )
  })

  // 验证更新后版本不一致会抛出带路径提示的错误，帮助定位多来源冲突。
  it('updateToolCli 在版本不一致时抛出诊断错误', async () => {
    runCommandMock.mockImplementation((bin, args) => {
      if (bin === 'npm' && args[0] === 'view') {
        return Promise.resolve({ stdout: '2.1.200\n', stderr: '' })
      }
      if (bin === 'which') {
        return Promise.resolve({
          stdout: '/usr/local/bin/claude\n',
          stderr: '',
        })
      }
      if (bin === 'npm' && args[0] === 'install') {
        return Promise.resolve({ stdout: 'installed\n', stderr: '' })
      }
      // 更新后 --version 仍是旧版本，触发校验失败分支。
      if (args?.[0] === '--version') {
        return Promise.resolve({ stdout: '2.1.100\n', stderr: '' })
      }
      return Promise.resolve({ stdout: '', stderr: '' })
    })

    const { updateToolCli } = await import('../../src/core/system.js')
    await expect(updateToolCli('claude')).rejects.toThrow(
      /仍报告版本 2\.1\.100/
    )
  })

  // 验证不支持的工具更新会抛出错误。
  it('updateToolCli 不支持的工具抛错', async () => {
    const { updateToolCli } = await import('../../src/core/system.js')
    await expect(updateToolCli('unknown')).rejects.toThrow('不支持更新')
  })

  // 验证更新时 which 找不到可执行文件会抛出解析路径错误。
  it('updateToolCli 在无法解析路径时抛错', async () => {
    runCommandMock.mockImplementation((bin, args) => {
      if (bin === 'npm' && args[0] === 'view') {
        return Promise.resolve({ stdout: '2.1.200\n', stderr: '' })
      }
      if (bin === 'which') {
        return Promise.resolve({ stdout: '\n', stderr: '' })
      }
      return Promise.resolve({ stdout: '', stderr: '' })
    })

    const { updateToolCli } = await import('../../src/core/system.js')
    await expect(updateToolCli('codex')).rejects.toThrow(/未找到 codex/)
  })
})
