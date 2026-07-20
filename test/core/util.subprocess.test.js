import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// execFileMock 存储 node:child_process execFile 的测试替身。
const execFileMock = vi.fn()
// spawnMock 存储 node:child_process spawn 的测试替身。
const spawnMock = vi.fn()

// mock 子进程模块，避免测试真的启动 shell 或外部命令。
// WHY：node:child_process 经 ESM interop 需要同时提供 default 导出，否则重置模块后再导入会报缺少 default。
vi.mock('node:child_process', () => {
  // childProcessStub 存储命名导出与 default 共用的替身实现。
  const childProcessStub = {
    execFile: (...args) => execFileMock(...args),
    spawn: (...args) => spawnMock(...args),
  }
  return { ...childProcessStub, default: childProcessStub }
})

describe('core util 子进程与 PATH 解析', () => {
  beforeEach(() => {
    execFileMock.mockReset()
    spawnMock.mockReset()
    // WHY：util.js 用模块级变量缓存 PATH，必须重置模块让每个用例从未初始化态开始。
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // 验证登录 shell 成功返回时会解析并缓存其 PATH。
  it('resolveLoginPath 解析登录 shell 输出的 PATH', async () => {
    // execFile 回调第 4 个参数是 callback，这里模拟 shell 成功返回 PATH。
    execFileMock.mockImplementation((_bin, _args, _opts, cb) => {
      cb(null, '/usr/local/bin:/usr/bin\n', '')
    })

    const { resolveLoginPath } = await import('../../src/core/util.js')
    // firstPath 存储首次解析得到的 PATH。
    const firstPath = await resolveLoginPath({ SHELL: '/bin/zsh' })
    expect(firstPath).toBe('/usr/local/bin:/usr/bin')
    expect(execFileMock).toHaveBeenCalledTimes(1)

    // 第二次调用应命中缓存，不再启动 shell。
    const secondPath = await resolveLoginPath()
    expect(secondPath).toBe('/usr/local/bin:/usr/bin')
    expect(execFileMock).toHaveBeenCalledTimes(1)
  })

  // 验证登录 shell 报错时降级为空字符串，避免阻塞后续命令执行。
  it('resolveLoginPath 在 shell 报错时降级为空字符串', async () => {
    execFileMock.mockImplementation((_bin, _args, _opts, cb) => {
      cb(new Error('shell failed'), '', 'boom')
    })

    const { resolveLoginPath } = await import('../../src/core/util.js')
    expect(await resolveLoginPath({ SHELL: '/bin/bash' })).toBe('')
  })

  // 验证并发调用只启动一次 shell，复用同一个进行中的 Promise。
  it('resolveLoginPath 并发调用复用同一 Promise', async () => {
    // resolveCb 存储被延迟的 execFile 回调，用于制造并发窗口。
    let resolveCb
    execFileMock.mockImplementation((_bin, _args, _opts, cb) => {
      resolveCb = () => cb(null, '/opt/bin\n', '')
    })

    const { resolveLoginPath } = await import('../../src/core/util.js')
    // p1/p2 存储并发发起的两次解析 Promise。
    const p1 = resolveLoginPath({ SHELL: '/bin/zsh' })
    const p2 = resolveLoginPath({ SHELL: '/bin/zsh' })
    resolveCb()
    expect(await p1).toBe('/opt/bin')
    expect(await p2).toBe('/opt/bin')
    // 只应启动一次 shell。
    expect(execFileMock).toHaveBeenCalledTimes(1)
  })

  // 验证 warmLoginPath 会触发一次 PATH 预热解析。
  it('warmLoginPath 预热 PATH 缓存', async () => {
    execFileMock.mockImplementation((_bin, _args, _opts, cb) =>
      cb(null, '/x\n', '')
    )
    const { warmLoginPath } = await import('../../src/core/util.js')
    expect(await warmLoginPath()).toBe('/x')
    expect(execFileMock).toHaveBeenCalledTimes(1)
  })

  // 验证 buildCommandEnv 会把解析出的 PATH 与额外变量合并进环境。
  it('buildCommandEnv 合并 PATH 与额外环境变量', async () => {
    execFileMock.mockImplementation((_bin, _args, _opts, cb) =>
      cb(null, '/merged/bin\n', '')
    )
    const { buildCommandEnv } = await import('../../src/core/util.js')
    // env 存储合并后的子进程环境。
    const env = await buildCommandEnv({ FOO: 'bar' })
    expect(env.PATH).toBe('/merged/bin')
    expect(env.FOO).toBe('bar')
  })

  // 验证 PATH 解析为空时 buildCommandEnv 不覆盖 process.env 的 PATH。
  it('buildCommandEnv 在 PATH 为空时保留原环境', async () => {
    execFileMock.mockImplementation((_bin, _args, _opts, cb) =>
      cb(new Error('x'), '', '')
    )
    const { buildCommandEnv } = await import('../../src/core/util.js')
    // env 存储降级后的子进程环境。
    const env = await buildCommandEnv()
    expect(env.PATH).toBe(process.env.PATH)
  })

  // 验证 runCommand 成功时返回 stdout/stderr 文本。
  it('runCommand 成功返回 stdout 与 stderr', async () => {
    execFileMock.mockImplementation((bin, _args, _opts, cb) => {
      // 第一次调用是 resolveLoginPath 的 shell，第二次才是真正命令。
      if (bin === '/bin/zsh' || bin.endsWith('zsh')) {
        return cb(null, '/p\n', '')
      }
      return cb(null, 'out', 'err')
    })

    const { runCommand } = await import('../../src/core/util.js')
    // result 存储命令执行结果。
    const result = await runCommand('which', ['node'])
    expect(result).toEqual({ stdout: 'out', stderr: 'err' })
  })

  // 验证 runCommand 将调用方超时配置传给 execFile，避免外部命令无限挂起。
  it('runCommand 透传子进程超时时间', async () => {
    execFileMock.mockImplementation((bin, _args, _opts, cb) => {
      if (bin === '/bin/zsh' || bin.endsWith('zsh')) {
        return cb(null, '/p\n', '')
      }
      return cb(null, 'out', '')
    })

    const { runCommand } = await import('../../src/core/util.js')
    await runCommand('claude', ['plugin'], { timeout: 15_000 })

    expect(execFileMock.mock.calls[1][2].timeout).toBe(15_000)
  })

  // 验证 runCommand 失败时抛出带 stdout/stderr 的错误，便于上层兜底。
  it('runCommand 失败时抛出带输出的错误', async () => {
    execFileMock.mockImplementation((bin, _args, _opts, cb) => {
      if (bin.endsWith('zsh')) {
        return cb(null, '/p\n', '')
      }
      return cb(new Error('命令失败'), 'std-out', 'std-err')
    })

    const { runCommand } = await import('../../src/core/util.js')
    // caught 存储捕获到的错误对象。
    let caught
    try {
      await runCommand('npm', ['view'])
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(Error)
    // 错误消息应合并 stdout 与 stderr。
    expect(caught.message).toContain('std-out')
    expect(caught.message).toContain('std-err')
    expect(caught.stdout).toBe('std-out')
    expect(caught.stderr).toBe('std-err')
  })

  // 验证 runCommand 在没有输出时回退到 error.message。
  it('runCommand 无输出时回退到 error.message', async () => {
    execFileMock.mockImplementation((bin, _args, _opts, cb) => {
      if (bin.endsWith('zsh')) {
        return cb(null, '/p\n', '')
      }
      return cb(new Error('原始错误'), '', '')
    })

    const { runCommand } = await import('../../src/core/util.js')
    await expect(runCommand('bad', [])).rejects.toThrow('原始错误')
  })

  // 验证 spawnDetached 会以 detached 方式启动进程并 unref。
  it('spawnDetached 分离启动并 unref', async () => {
    execFileMock.mockImplementation((_bin, _args, _opts, cb) =>
      cb(null, '/p\n', '')
    )
    // unrefMock 存储子进程 unref 的测试替身。
    const unrefMock = vi.fn()
    spawnMock.mockReturnValue({ unref: unrefMock })

    const { spawnDetached } = await import('../../src/core/util.js')
    await spawnDetached('open', ['-R', '/tmp'])

    expect(spawnMock).toHaveBeenCalledWith(
      'open',
      ['-R', '/tmp'],
      expect.objectContaining({ detached: true, stdio: 'ignore' })
    )
    expect(unrefMock).toHaveBeenCalledTimes(1)
  })
})
