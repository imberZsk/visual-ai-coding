import { describe, expect, it } from 'vitest'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import * as TOML from 'smol-toml'
import {
  MANAGED_MARKER,
  mergeClaudeMcp,
  mergeCodexMcp,
  normalizeMcpServer,
  parseUnifiedMcp,
  serializeUnifiedMcp,
  syncUnified,
} from '../../src/core/unified.js'

// makeTempDir 创建隔离临时目录，供同步落盘测试使用。
function makeTempDir(name) {
  // dir 存储当前测试使用的唯一临时目录。
  const dir = join(
    tmpdir(),
    `visual-aicoding-unified-${name}-${process.pid}-${Date.now()}`
  )
  mkdirSync(dir, { recursive: true })
  return dir
}

describe('unified mcp 纯函数', () => {
  // 验证归一化会剔除非法字段并保留 command/args/env。
  it('normalizes a server into command/args/env', () => {
    const server = normalizeMcpServer(' ctx7 ', {
      command: 'npx',
      args: ['-y', '@upstash/context7-mcp', 42],
      env: { API_KEY: 'x', BAD: 1 },
      extra: 'dropped',
    })
    expect(server).toEqual({
      name: 'ctx7',
      command: 'npx',
      args: ['-y', '@upstash/context7-mcp'],
      env: { API_KEY: 'x' },
    })
  })

  // 验证解析兼容 { mcpServers: {...} } 与直接以对象为根两种写法。
  it('parses both mcpServers-wrapped and root-object forms', () => {
    const wrapped = parseUnifiedMcp('{"mcpServers":{"a":{"command":"c"}}}')
    const root = parseUnifiedMcp('{"a":{"command":"c"}}')
    expect(wrapped).toHaveLength(1)
    expect(root).toHaveLength(1)
    expect(wrapped[0].name).toBe('a')
  })

  // 验证非法 JSON 会抛出明确错误。
  it('throws on invalid unified mcp json', () => {
    expect(() => parseUnifiedMcp('{not json}')).toThrow(/JSON 解析失败/)
  })

  // 验证序列化后可被再次解析，形成稳定回环。
  it('serializes servers into re-parsable json', () => {
    const text = serializeUnifiedMcp([
      { name: 'a', command: 'c', args: ['x'], env: { K: 'v' } },
    ])
    expect(parseUnifiedMcp(text)).toEqual([
      { name: 'a', command: 'c', args: ['x'], env: { K: 'v' } },
    ])
  })
})

describe('unified mcp 块替换合并', () => {
  // 验证合并进 Claude 时保留用户手动 server，并给托管 server 打标记。
  it('preserves user claude servers and marks managed ones', () => {
    const existing = {
      numStartups: 10,
      mcpServers: {
        userKept: { command: 'keep' },
        oldManaged: { [MANAGED_MARKER]: true, command: 'stale' },
      },
    }
    const merged = mergeClaudeMcp(existing, [
      { name: 'ctx7', command: 'npx', args: [], env: {} },
    ])

    // 用户手动 server 必须保留。
    expect(merged.mcpServers.userKept).toEqual({ command: 'keep' })
    // 上一轮托管的 server 必须被移除。
    expect(merged.mcpServers.oldManaged).toBeUndefined()
    // 新托管 server 带标记写入。
    expect(merged.mcpServers.ctx7[MANAGED_MARKER]).toBe(true)
    // 其余顶层字段不受影响。
    expect(merged.numStartups).toBe(10)
  })

  // 验证合并进 Codex 时 env 非空渲染为子表、env 为空则省略。
  it('renders codex env as subtable only when present', () => {
    const withEnv = mergeCodexMcp({}, [
      { name: 'a', command: 'c', args: [], env: { K: 'v' } },
    ])
    const withoutEnv = mergeCodexMcp({}, [
      { name: 'b', command: 'c', args: [], env: {} },
    ])
    expect(withEnv.mcp_servers.a.env).toEqual({ K: 'v' })
    expect(withoutEnv.mcp_servers.b.env).toBeUndefined()
  })

  // 验证 Codex 合并保留用户手写 server（如 node_repl）。
  it('preserves user codex servers', () => {
    const existing = { mcp_servers: { node_repl: { command: 'node' } } }
    const merged = mergeCodexMcp(existing, [
      { name: 'a', command: 'c', args: [], env: {} },
    ])
    expect(merged.mcp_servers.node_repl).toEqual({ command: 'node' })
    expect(merged.mcp_servers.a[MANAGED_MARKER]).toBe(true)
  })
})

describe('syncUnified 落盘同步', () => {
  // 验证一次同步会把统一 MCP 写入两端配置，并把 Skills 软链到两端目录。
  it('writes mcp to both tools and symlinks skills', () => {
    // root 存储本次测试的隔离根目录。
    const root = makeTempDir('sync')
    // claudeHome / codexHome 存储两端配置根目录。
    const claudeHome = join(root, '.claude')
    const codexHome = join(root, '.codex')
    // claudeConfigPath / codexConfigPath 存储 MCP 写入目标文件。
    const claudeConfigPath = join(root, '.claude.json')
    const codexConfigPath = join(codexHome, 'config.toml')
    mkdirSync(claudeHome, { recursive: true })
    mkdirSync(codexHome, { recursive: true })

    // 预置统一源：mcp.json 与一个技能目录。
    const unifiedSkills = join(root, 'unified', 'skills')
    mkdirSync(join(unifiedSkills, 'demo-skill'), { recursive: true })
    writeFileSync(
      join(unifiedSkills, 'demo-skill', 'SKILL.md'),
      '---\nname: demo\n---\n'
    )

    // 预置已有 claude.json，验证顶层字段不被覆盖。
    writeFileSync(
      claudeConfigPath,
      JSON.stringify({ numStartups: 5, mcpServers: {} })
    )
    // 预置 config.toml，验证用户手写 server 保留。
    writeFileSync(
      codexConfigPath,
      TOML.stringify({
        model: 'gpt',
        mcp_servers: { node_repl: { command: 'node' } },
      })
    )

    // WHY：syncUnified 默认读 ~/.visualAiCoding，测试用 unifiedDirOverride 注入隔离目录。
    const result = syncUnified({
      claudeHome,
      codexHome,
      claudeConfigPath,
      codexConfigPath,
      unifiedDirOverride: join(root, 'unified'),
    })

    // 断言 MCP 写入两端（此处只放了空 mcp.json，故 server 数为 0，但文件结构保留）。
    const claudeJson = JSON.parse(readFileSync(claudeConfigPath, 'utf8'))
    expect(claudeJson.numStartups).toBe(5)
    const codexToml = TOML.parse(readFileSync(codexConfigPath, 'utf8'))
    expect(codexToml.model).toBe('gpt')
    expect(codexToml.mcp_servers.node_repl.command).toBe('node')

    // 断言技能软链到两端 skills 目录。
    const claudeLink = join(claudeHome, 'skills', 'demo-skill')
    const codexLink = join(codexHome, 'skills', 'demo-skill')
    expect(lstatSync(claudeLink).isSymbolicLink()).toBe(true)
    expect(lstatSync(codexLink).isSymbolicLink()).toBe(true)
    expect(realpathSync(claudeLink)).toBe(
      realpathSync(join(unifiedSkills, 'demo-skill'))
    )

    // 结果结构含 4 个动作（mcp×2 + skills×2）。
    expect(result.results).toHaveLength(4)
    expect(existsSync(join(root, 'unified', 'mcp.json'))).toBe(true)

    rmSync(root, { recursive: true, force: true })
  })
})
