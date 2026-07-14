import { describe, expect, it } from 'vitest'
import { mkdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { homedir, tmpdir } from 'node:os'
import { atomicWrite, expandHome } from '../../src/core/util.js'

// makeTempDir 创建隔离测试目录，避免原子写入测试污染真实配置目录。
function makeTempDir(name) {
  // dir 存储当前测试使用的唯一临时目录。
  const dir = join(
    tmpdir(),
    `visual-aicoding-${name}-${process.pid}-${Date.now()}`
  )
  mkdirSync(dir, { recursive: true })
  return dir
}

describe('core util', () => {
  // 验证 "~" 整体路径会展开为当前用户主目录。
  it('expands root tilde to the user home directory', () => {
    expect(expandHome('~')).toBe(homedir())
  })

  // 验证 "~/xxx" 会展开为主目录下的子路径。
  it('expands home-relative paths', () => {
    expect(expandHome('~/.codex')).toBe(join(homedir(), '.codex'))
  })

  // 验证 "~otheruser" 形式不被错误展开。
  it('leaves other-user tilde paths untouched', () => {
    expect(expandHome('~otheruser/x')).toBe('~otheruser/x')
  })

  // 验证原子写入可以创建父目录并写入完整内容。
  it('atomically writes a new nested file', () => {
    // dir 存储测试根目录。
    const dir = makeTempDir('atomic-create')
    // target 存储本次写入的目标文件。
    const target = join(dir, 'nested', 'settings.json')

    atomicWrite(target, '{"a":1}')

    expect(readFileSync(target, 'utf8')).toBe('{"a":1}')
    rmSync(dir, { recursive: true, force: true })
  })

  // 验证原子写入可以覆盖已有文件。
  it('atomically replaces an existing file', () => {
    // dir 存储测试根目录。
    const dir = makeTempDir('atomic-replace')
    // target 存储本次写入的目标文件。
    const target = join(dir, 'config.toml')

    atomicWrite(target, 'old')
    atomicWrite(target, 'new')

    expect(readFileSync(target, 'utf8')).toBe('new')
    rmSync(dir, { recursive: true, force: true })
  })

  // 验证 rename 失败时会清理临时文件并抛出替换失败错误。
  // WHY：目标路径已被一个目录占用，renameSync 无法用文件覆盖目录，触发 catch 分支。
  it('cleans up and throws when replacing target fails', () => {
    // dir 存储测试根目录。
    const dir = makeTempDir('atomic-fail')
    // target 存储与目标同名的目录，使 rename 覆盖失败。
    const target = join(dir, 'occupied')
    mkdirSync(target, { recursive: true })

    expect(() => atomicWrite(target, 'data')).toThrow(/替换目标文件失败/)

    // 临时文件 .occupied.tmp 应已被清理，不残留。
    expect(() => statSync(join(dir, '.occupied.tmp'))).toThrow()

    rmSync(dir, { recursive: true, force: true })
  })
})
