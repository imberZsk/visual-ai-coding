// 统一配置：只写一次，同步到 Claude Code 与 Codex。
// 当前覆盖 MCP server（JSON↔TOML 块替换合并）与 Skills（目录软链）。
// 单一数据源存放在 ~/.visualAiCoding/unified/ 下：mcp.json 描述 MCP，skills/ 存放技能真身。
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
} from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import * as TOML from 'smol-toml'
import { atomicWrite, expandHome } from './util.js'

// MANAGED_MARKER 存储写入两端配置时给托管 MCP server 打的标记键。
// WHY：同步是「块替换」而非整文件覆盖，必须能识别哪些 server 由本工具管理，
// 才能在用户删除统一源条目后精确移除对应 server，同时不碰用户手动加的 server。
export const MANAGED_MARKER = 'x-visual-aicoding-managed'

// unifiedDir 返回统一配置源目录，并确保目录存在。
// override 参数存储可选的自定义根目录（测试注入隔离目录用），缺省时使用 ~/.visualAiCoding/unified。
export function unifiedDir(override) {
  // dir 存储统一配置源根目录路径。
  const dir = override
    ? expandHome(override)
    : join(homedir(), '.visualAiCoding', 'unified')
  mkdirSync(dir, { recursive: true })
  return dir
}

// unifiedMcpPath 返回统一 MCP 配置文件路径。
// override 参数存储可选的自定义根目录。
export function unifiedMcpPath(override) {
  return join(unifiedDir(override), 'mcp.json')
}

// unifiedSkillsDir 返回统一 Skills 源目录，并确保目录存在。
// override 参数存储可选的自定义根目录。
export function unifiedSkillsDir(override) {
  // dir 存储统一 Skills 源目录路径。
  const dir = join(unifiedDir(override), 'skills')
  mkdirSync(dir, { recursive: true })
  return dir
}

// normalizeMcpServer 将单个 MCP server 描述归一化为中立结构。
// WHY：Claude 与 Codex 的 MCP server 模型都收敛到 command/args/env，
// 归一化后两端渲染器只消费统一字段，避免各页面各自兜底。
// name 参数存储 server 名称，raw 参数存储用户填写的原始描述。
export function normalizeMcpServer(name, raw) {
  // value 存储原始描述对象，非对象时按空对象处理。
  const value = raw && typeof raw === 'object' ? raw : {}
  // command 存储 server 启动命令，缺失时为空字符串。
  const command = typeof value.command === 'string' ? value.command : ''
  // args 存储启动参数数组，过滤非字符串项防止序列化异常。
  const args = Array.isArray(value.args)
    ? value.args.filter((item) => typeof item === 'string')
    : []
  // env 存储环境变量键值表，仅保留字符串值。
  const env = {}
  if (value.env && typeof value.env === 'object') {
    for (const [envKey, envValue] of Object.entries(value.env)) {
      if (typeof envValue === 'string') {
        env[envKey] = envValue
      }
    }
  }

  return { name: String(name || '').trim(), command, args, env }
}

// parseUnifiedMcp 将统一 mcp.json 文本解析为 server 列表。
// content 参数存储 mcp.json 原始文本，空文本返回空列表。
export function parseUnifiedMcp(content) {
  // text 存储去空白后的文本。
  const text = String(content || '').trim()
  if (!text) {
    return []
  }

  // parsed 存储 JSON 解析结果。
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    throw new Error(`统一 MCP 配置 JSON 解析失败: ${error.message}`)
  }

  // rawServers 存储 mcpServers 字段，兼容直接以对象为根的旧写法。
  const rawServers =
    parsed &&
    typeof parsed === 'object' &&
    parsed.mcpServers &&
    typeof parsed.mcpServers === 'object'
      ? parsed.mcpServers
      : parsed && typeof parsed === 'object'
        ? parsed
        : {}

  // servers 存储归一化后的 server 列表。
  const servers = []
  for (const [name, raw] of Object.entries(rawServers)) {
    // 跳过空名称，避免生成无法引用的 server。
    if (!String(name || '').trim()) {
      continue
    }
    servers.push(normalizeMcpServer(name, raw))
  }
  return servers
}

// serializeUnifiedMcp 将 server 列表序列化为统一 mcp.json 文本。
// servers 参数存储归一化后的 server 列表。
export function serializeUnifiedMcp(servers) {
  // mcpServers 存储写回文件的 server 映射。
  const mcpServers = {}
  for (const server of servers || []) {
    // name 存储去空白后的 server 名称，空名称直接跳过。
    const name = String(server?.name || '').trim()
    if (!name) {
      continue
    }
    mcpServers[name] = {
      command: server.command || '',
      args: Array.isArray(server.args) ? server.args : [],
      env: server.env && typeof server.env === 'object' ? server.env : {},
    }
  }
  return `${JSON.stringify({ mcpServers }, null, 2)}\n`
}

// mergeClaudeMcp 把统一 server 列表合并进 Claude ~/.claude.json 对象。
// WHY：直接覆盖 claude.json 会抹掉用户的 numStartups、projects 等大量状态，
// 因此只在顶层 mcpServers 内做块替换：先删掉上一轮托管过的 server，再写入当前统一源。
// existing 参数存储解析后的 claude.json 对象，servers 参数存储统一 server 列表。
export function mergeClaudeMcp(existing, servers) {
  // root 存储合并后的 claude.json 对象，非对象时重建，避免污染其余配置。
  const root = existing && typeof existing === 'object' ? { ...existing } : {}
  // currentServers 存储合并前的 mcpServers 映射副本。
  const currentServers =
    root.mcpServers && typeof root.mcpServers === 'object'
      ? { ...root.mcpServers }
      : {}

  // nextServers 存储剔除旧托管条目后的 server 映射。
  const nextServers = {}
  for (const [name, value] of Object.entries(currentServers)) {
    // 跳过上一轮由本工具写入的托管 server，保留用户手动添加的 server。
    if (value && typeof value === 'object' && value[MANAGED_MARKER]) {
      continue
    }
    nextServers[name] = value
  }

  // 写入当前统一源的全部 server，并打上托管标记便于下次识别。
  for (const server of servers || []) {
    // name 存储 server 名称，空名称跳过。
    const name = String(server?.name || '').trim()
    if (!name) {
      continue
    }
    nextServers[name] = {
      [MANAGED_MARKER]: true,
      command: server.command || '',
      args: Array.isArray(server.args) ? server.args : [],
      env: server.env && typeof server.env === 'object' ? server.env : {},
    }
  }

  root.mcpServers = nextServers
  return root
}

// mergeCodexMcp 把统一 server 列表合并进 Codex config.toml 对象。
// WHY：config.toml 含 auth、model、projects 等关键字段，只能替换 mcp_servers 表；
// 同样用托管标记做块替换，保留用户手写的 MCP server（如 node_repl）。
// existing 参数存储解析后的 config.toml 对象，servers 参数存储统一 server 列表。
export function mergeCodexMcp(existing, servers) {
  // root 存储合并后的 config.toml 对象。
  const root = existing && typeof existing === 'object' ? { ...existing } : {}
  // currentServers 存储合并前的 mcp_servers 表副本。
  const currentServers =
    root.mcp_servers && typeof root.mcp_servers === 'object'
      ? { ...root.mcp_servers }
      : {}

  // nextServers 存储剔除旧托管条目后的 server 表。
  const nextServers = {}
  for (const [name, value] of Object.entries(currentServers)) {
    // 跳过上一轮托管 server，保留用户手动配置。
    if (value && typeof value === 'object' && value[MANAGED_MARKER]) {
      continue
    }
    nextServers[name] = value
  }

  // 写入统一源 server，env 非空时渲染为 TOML 子表 [mcp_servers.<名>.env]。
  for (const server of servers || []) {
    // name 存储 server 名称，空名称跳过。
    const name = String(server?.name || '').trim()
    if (!name) {
      continue
    }
    // entry 存储单个 Codex MCP server 的 TOML 结构。
    const entry = {
      [MANAGED_MARKER]: true,
      command: server.command || '',
      args: Array.isArray(server.args) ? server.args : [],
    }
    if (
      server.env &&
      typeof server.env === 'object' &&
      Object.keys(server.env).length > 0
    ) {
      entry.env = server.env
    }
    nextServers[name] = entry
  }

  root.mcp_servers = nextServers
  return root
}

// readUnifiedMcp 读取统一 MCP 配置文件；不存在时返回空列表并写入初始模板。
// override 参数存储可选的自定义根目录。
export function readUnifiedMcp(override) {
  // path 存储统一 mcp.json 路径。
  const path = unifiedMcpPath(override)
  if (!existsSync(path)) {
    // 首次使用写入空模板，方便用户直接编辑。
    atomicWrite(path, serializeUnifiedMcp([]))
    return { path, servers: [] }
  }

  // content 存储 mcp.json 原始文本。
  const content = readFileSync(path, 'utf8')
  return { path, servers: parseUnifiedMcp(content) }
}

// saveUnifiedMcp 校验并保存统一 MCP 配置。
// servers 参数存储归一化前的 server 列表。
export function saveUnifiedMcp(servers) {
  // normalized 存储归一化后的 server 列表。
  const normalized = (Array.isArray(servers) ? servers : []).map((server) =>
    normalizeMcpServer(server?.name, server)
  )

  // seen 存储已出现的 server 名称，用于拒绝重名，避免同步时相互覆盖。
  const seen = new Set()
  for (const server of normalized) {
    if (!server.name) {
      throw new Error('MCP server 名称不能为空')
    }
    if (seen.has(server.name)) {
      throw new Error(`MCP server 名称重复: ${server.name}`)
    }
    seen.add(server.name)
  }

  atomicWrite(unifiedMcpPath(), serializeUnifiedMcp(normalized))
  return { path: unifiedMcpPath(), servers: normalized }
}

// syncMcpToClaude 把统一 MCP 同步进 Claude 配置文件（~/.claude.json）。
// claudeConfigPath 参数存储 claude.json 绝对路径，servers 参数存储统一 server 列表。
function syncMcpToClaude(claudeConfigPath, servers) {
  // path 存储展开后的 claude.json 路径。
  const path = expandHome(claudeConfigPath)
  // existing 存储解析后的现有配置，文件缺失或损坏时按空对象处理并记录诊断。
  let existing = {}
  // warnings 存储本次同步产生的非致命提示。
  const warnings = []
  if (existsSync(path)) {
    try {
      existing = JSON.parse(readFileSync(path, 'utf8'))
    } catch (error) {
      warnings.push(`Claude 配置解析失败，已按空配置写入 MCP：${error.message}`)
      existing = {}
    }
  }

  // merged 存储块替换后的 claude.json 对象。
  const merged = mergeClaudeMcp(existing, servers)
  atomicWrite(path, `${JSON.stringify(merged, null, 2)}\n`)
  return { tool: 'claude', path, count: servers.length, warnings }
}

// syncMcpToCodex 把统一 MCP 同步进 Codex 配置文件（config.toml）。
// codexConfigPath 参数存储 config.toml 绝对路径，servers 参数存储统一 server 列表。
function syncMcpToCodex(codexConfigPath, servers) {
  // path 存储展开后的 config.toml 路径。
  const path = expandHome(codexConfigPath)
  // existing 存储解析后的现有配置。
  let existing = {}
  // warnings 存储本次同步产生的非致命提示。
  const warnings = []
  if (existsSync(path)) {
    try {
      existing = TOML.parse(readFileSync(path, 'utf8'))
    } catch (error) {
      warnings.push(`Codex 配置解析失败，已按空配置写入 MCP：${error.message}`)
      existing = {}
    }
  }

  // merged 存储块替换后的 config.toml 对象。
  const merged = mergeCodexMcp(existing, servers)
  atomicWrite(path, TOML.stringify(merged))
  return { tool: 'codex', path, count: servers.length, warnings }
}

// linkSkillDir 将统一 Skills 源目录下的单个技能软链到目标工具 skills 目录。
// WHY：技能是「目录 + SKILL.md」形态，软链后改一处两端生效，无需转换或复制同步。
// sourcePath 参数存储技能源目录，targetPath 参数存储目标链接路径。
function linkSkillDir(sourcePath, targetPath, warnings) {
  // 目标已是指向同一源的软链时跳过，保证同步幂等。
  if (existsSync(targetPath) || isSymlink(targetPath)) {
    if (isSymlink(targetPath)) {
      try {
        // linked 存储目标软链当前指向的真实路径。
        const linked = realpathSync(targetPath)
        if (linked === realpathSync(sourcePath)) {
          return 'linked'
        }
      } catch {
        // 悬空软链：删除后重建。
      }
      rmSync(targetPath, { force: true })
    } else {
      // 目标是用户真实目录（非软链），不覆盖，避免误删用户手写技能。
      warnings.push(`跳过技能软链：目标已存在同名真实目录 ${targetPath}`)
      return 'skipped'
    }
  }

  symlinkSync(sourcePath, targetPath, 'dir')
  return 'linked'
}

// isSymlink 判断路径是否为软链（含悬空软链）。
// targetPath 参数存储待判断路径。
function isSymlink(targetPath) {
  try {
    return lstatSync(targetPath).isSymbolicLink()
  } catch {
    return false
  }
}

// syncSkillsToTool 把统一 Skills 源目录下所有技能软链到目标工具 skills 目录。
// toolHome 参数存储工具配置根目录，tool 参数存储工具标识，override 参数存储统一源自定义根目录。
function syncSkillsToTool(toolHome, tool, override) {
  // warnings 存储本次同步产生的非致命提示。
  const warnings = []
  // sourceDir 存储统一 Skills 源目录。
  const sourceDir = unifiedSkillsDir(override)
  // targetRoot 存储目标工具 skills 目录，确保存在。
  const targetRoot = join(expandHome(toolHome), 'skills')
  mkdirSync(targetRoot, { recursive: true })

  // entries 存储源目录下的技能子目录（仅目录参与软链）。
  const entries = readdirSync(sourceDir, { withFileTypes: true }).filter(
    (entry) => entry.isDirectory()
  )

  // linked 存储成功软链的技能数量。
  let linked = 0
  for (const entry of entries) {
    // result 存储单个技能软链结果。
    const result = linkSkillDir(
      join(sourceDir, entry.name),
      join(targetRoot, entry.name),
      warnings
    )
    if (result === 'linked') {
      linked += 1
    }
  }

  return {
    tool,
    path: targetRoot,
    count: linked,
    total: entries.length,
    warnings,
  }
}

// syncUnified 执行一次统一配置同步：MCP 写入两端配置，Skills 软链到两端目录。
// options 参数存储 claudeHome/codexHome/claudeConfigPath/codexConfigPath 等路径。
export function syncUnified(options = {}) {
  // claudeHome 存储 Claude 配置根目录，默认 ~/.claude。
  const claudeHome = options.claudeHome || join(homedir(), '.claude')
  // codexHome 存储 Codex 配置根目录，默认 ~/.codex。
  const codexHome = options.codexHome || join(homedir(), '.codex')
  // claudeConfigPath 存储 Claude MCP 写入目标，默认用户级 ~/.claude.json。
  const claudeConfigPath =
    options.claudeConfigPath || join(homedir(), '.claude.json')
  // codexConfigPath 存储 Codex MCP 写入目标，默认 <codexHome>/config.toml。
  const codexConfigPath =
    options.codexConfigPath || join(expandHome(codexHome), 'config.toml')
  // override 存储统一源自定义根目录（测试注入隔离目录用）。
  const override = options.unifiedDirOverride

  // servers 存储统一源当前的 MCP server 列表。
  const { servers } = readUnifiedMcp(override)

  // results 存储各同步动作的结果，供前端逐项展示。
  const results = []
  results.push({
    capability: 'mcp',
    ...syncMcpToClaude(claudeConfigPath, servers),
  })
  results.push({
    capability: 'mcp',
    ...syncMcpToCodex(codexConfigPath, servers),
  })
  results.push({
    capability: 'skills',
    ...syncSkillsToTool(claudeHome, 'claude', override),
  })
  results.push({
    capability: 'skills',
    ...syncSkillsToTool(codexHome, 'codex', override),
  })

  // warnings 存储汇总后的全部非致命提示。
  const warnings = results.flatMap((result) => result.warnings || [])
  return { results, warnings, syncedAt: new Date().toISOString() }
}

// listUnifiedSkills 列出统一 Skills 源目录下的技能名称，供前端展示。
export function listUnifiedSkills() {
  // sourceDir 存储统一 Skills 源目录。
  const sourceDir = unifiedSkillsDir()
  // names 存储技能子目录名称列表。
  const names = readdirSync(sourceDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right))
  return { dir: sourceDir, skills: names }
}
