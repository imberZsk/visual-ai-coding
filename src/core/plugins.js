// 插件管理核心逻辑：解析 Claude/Codex 插件列表、比较版本并调用 CLI 更新。
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { cp, mkdir } from 'node:fs/promises'
import { basename, dirname, join, resolve, sep } from 'node:path'
import * as TOML from 'smol-toml'
import { atomicWrite, expandHome, runCommand } from './util.js'

// CLAUDE_MARKETPLACE_REFRESH_TIMEOUT_MS 存储单个 Claude marketplace 刷新的最长等待时间。
const CLAUDE_MARKETPLACE_REFRESH_TIMEOUT_MS = 15_000

// parseSemverLike 解析 semver-like 版本字符串。
// version 参数存储待解析的版本文本。
function parseSemverLike(version) {
  // trimmed 存储去掉空白后的版本文本。
  const trimmed = String(version || '').trim()
  // split 存储主版本与 prerelease 的切分结果。
  const split = trimmed.split('-')
  // core 存储 x.y.z 主版本部分。
  const core = split[0]
  // prerelease 存储预发布标签，正式版为 undefined。
  const prerelease = split.length > 1 ? split.slice(1).join('-') : undefined
  // coreParts 存储主版本、次版本、补丁版本三个片段。
  const coreParts = core.split('.')

  if (coreParts.length !== 3) {
    return undefined
  }
  if (prerelease === '') {
    return undefined
  }
  if (prerelease && !/^[0-9A-Za-z.-]+$/.test(prerelease)) {
    return undefined
  }

  // major 存储主版本号。
  const major = Number(coreParts[0])
  // minor 存储次版本号。
  const minor = Number(coreParts[1])
  // patch 存储补丁版本号。
  const patch = Number(coreParts[2])
  if (![major, minor, patch].every(Number.isInteger)) {
    return undefined
  }

  return { major, minor, patch, prerelease }
}

// splitPrerelease 将 prerelease 字符串拆成可比较的点分段。
// prerelease 参数存储预发布标签。
function splitPrerelease(prerelease) {
  return String(prerelease || '')
    .split('.')
    .map((value) => ({
      value,
      isNumeric: value !== '' && /^\d+$/.test(value),
    }))
}

// comparePrerelease 比较两个 prerelease 标签的先后顺序。
// left 和 right 分别存储左右两个预发布标签。
function comparePrerelease(left, right) {
  // leftParts 存储左侧 prerelease 点分段。
  const leftParts = splitPrerelease(left)
  // rightParts 存储右侧 prerelease 点分段。
  const rightParts = splitPrerelease(right)
  // sharedLength 存储两侧可逐段比较的长度。
  const sharedLength = Math.min(leftParts.length, rightParts.length)

  for (let index = 0; index < sharedLength; index += 1) {
    // leftPart 存储左侧当前位置分段。
    const leftPart = leftParts[index]
    // rightPart 存储右侧当前位置分段。
    const rightPart = rightParts[index]
    if (leftPart.value === rightPart.value) {
      continue
    }
    if (leftPart.isNumeric && rightPart.isNumeric) {
      return Number(leftPart.value) < Number(rightPart.value) ? -1 : 1
    }
    if (leftPart.isNumeric !== rightPart.isNumeric) {
      return leftPart.isNumeric ? -1 : 1
    }
    return leftPart.value < rightPart.value ? -1 : 1
  }

  if (leftParts.length === rightParts.length) {
    return 0
  }
  return leftParts.length < rightParts.length ? -1 : 1
}

// compareVersions 比较已安装版本与 marketplace 可用版本，返回统一更新状态。
// current 参数存储当前版本，available 参数存储可用版本。
export function compareVersions(current, available) {
  // currentText 存储当前版本文本。
  const currentText = String(current || '').trim()
  // availableText 存储可用版本文本。
  const availableText = String(available || '').trim()
  if (!currentText || !availableText) {
    return 'unknown'
  }
  if (currentText === availableText) {
    return 'same'
  }

  // currentParts 存储当前版本解析结果。
  const currentParts = parseSemverLike(currentText)
  // availableParts 存储可用版本解析结果。
  const availableParts = parseSemverLike(availableText)
  if (!currentParts || !availableParts) {
    return currentText === availableText ? 'same' : 'different'
  }

  for (const key of ['major', 'minor', 'patch']) {
    if (currentParts[key] !== availableParts[key]) {
      return currentParts[key] < availableParts[key] ? 'newer' : 'different'
    }
  }

  if (currentParts.prerelease === availableParts.prerelease) {
    return 'same'
  }
  if (!currentParts.prerelease && availableParts.prerelease) {
    return 'different'
  }
  if (currentParts.prerelease && !availableParts.prerelease) {
    return 'newer'
  }
  return comparePrerelease(currentParts.prerelease, availableParts.prerelease) <
    0
    ? 'newer'
    : 'different'
}

// pluginShortName 从插件完整 ID 中提取短名称。
// id 参数存储形如 name@marketplace 的插件标识。
function pluginShortName(id) {
  return String(id || '').split('@')[0] || String(id || '')
}

// pluginMarketplace 从插件完整 ID 中提取 marketplace 名称。
// id 参数存储形如 name@marketplace 的插件标识。
function pluginMarketplace(id) {
  return String(id || '').split('@')[1] || ''
}

// jsonString 读取对象字段中的字符串，缺失时返回空串。
// item 参数存储 JSON 对象，field 参数存储字段名。
function jsonString(item, field) {
  // value 存储读取到的原始字段值。
  const value = item?.[field]
  return typeof value === 'string' ? value : ''
}

// jsonBool 读取对象字段中的布尔值，缺失时返回 false。
// item 参数存储 JSON 对象，field 参数存储字段名。
function jsonBool(item, field) {
  return item?.[field] === true
}

// parseJsonRoot 解析命令输出中的 JSON 根对象。
// content 参数存储 CLI stdout，toolLabel 参数存储错误提示中的工具名。
function parseJsonRoot(content, toolLabel) {
  try {
    return JSON.parse(content)
  } catch (error) {
    throw new Error(`解析 ${toolLabel} 插件 JSON 失败: ${error.message}`, {
      cause: error,
    })
  }
}

// buildPluginUpdateResult 基于 installed/available 构建统一插件更新结果。
// options 参数存储不同 CLI 的字段名差异。
function buildPluginUpdateResult(options) {
  // plugins 存储统一格式的插件列表。
  const plugins = []
  for (const item of options.installed) {
    // id 存储当前插件完整标识。
    const id = jsonString(item, options.idField)
    // currentVersion 存储当前安装版本。
    const currentVersion = jsonString(item, 'version')
    // availableVersion 存储 marketplace 可用版本。
    const availableVersion = options.availableVersions.get(id) || ''
    // name 存储插件展示名。
    const name =
      (options.nameField && jsonString(item, options.nameField)) ||
      pluginShortName(id)
    // marketplace 存储插件 marketplace 名称。
    const marketplace =
      (options.marketplaceField &&
        jsonString(item, options.marketplaceField)) ||
      pluginMarketplace(id)
    // scope 存储插件安装作用域，Codex 没有时为空串。
    const scope = options.scopeField ? jsonString(item, options.scopeField) : ''

    plugins.push({
      id,
      name,
      marketplace,
      current_version: currentVersion,
      available_version: availableVersion,
      scope,
      enabled: jsonBool(item, 'enabled'),
      install_path: jsonString(item, options.installPathField),
      last_updated: jsonString(item, options.lastUpdatedField),
      update_status: compareVersions(currentVersion, availableVersion),
    })
  }

  return {
    tool: options.tool,
    plugins,
    raw_output: '',
    diagnostics: '',
  }
}

// parseClaudePluginUpdateJson 解析 Claude plugin list --json --available 输出。
// content 参数存储 Claude CLI stdout。
function parseClaudePluginUpdateJson(content) {
  // root 存储 JSON 根对象。
  const root = parseJsonRoot(content, 'Claude')
  // availableVersions 存储 pluginId 到可用版本的映射。
  const availableVersions = new Map()
  for (const item of Array.isArray(root.available) ? root.available : []) {
    // id 存储 marketplace 返回的插件 ID。
    const id = jsonString(item, 'pluginId')
    if (id) {
      availableVersions.set(id, jsonString(item, 'version'))
    }
  }

  // result 存储统一化后的插件更新结果。
  const result = buildPluginUpdateResult({
    tool: 'claude',
    installed: Array.isArray(root.installed) ? root.installed : [],
    availableVersions,
    idField: 'id',
    scopeField: 'scope',
    installPathField: 'installPath',
    lastUpdatedField: 'lastUpdated',
  })
  result.raw_output = content
  return result
}

// parseCodexPluginUpdateJson 解析 Codex plugin list --available --json 输出。
// content 参数存储 Codex CLI stdout。
function parseCodexPluginUpdateJson(content) {
  // root 存储 JSON 根对象。
  const root = parseJsonRoot(content, 'Codex')
  // availableVersions 存储插件 ID 到可用版本的映射。
  const availableVersions = new Map()
  for (const item of Array.isArray(root.available) ? root.available : []) {
    // id 存储 marketplace 返回的插件 ID。
    const id = jsonString(item, 'id') || jsonString(item, 'pluginId')
    if (id) {
      availableVersions.set(id, jsonString(item, 'version'))
    }
  }

  // installed 存储兼容新旧 Codex CLI 字段名的已安装插件列表。
  const installed = (Array.isArray(root.installed) ? root.installed : []).map(
    (item) => {
      // source 存储新版 Codex CLI 返回的插件来源对象。
      const source = item?.source
      return {
        ...item,
        id: jsonString(item, 'id') || jsonString(item, 'pluginId'),
        marketplace:
          jsonString(item, 'marketplace') ||
          jsonString(item, 'marketplaceName'),
        install_path:
          jsonString(item, 'install_path') ||
          jsonString(source, 'path') ||
          jsonString(source, 'url'),
      }
    }
  )

  // result 存储统一化后的插件更新结果。
  const result = buildPluginUpdateResult({
    tool: 'codex',
    installed,
    availableVersions,
    idField: 'id',
    nameField: 'name',
    marketplaceField: 'marketplace',
    installPathField: 'install_path',
    lastUpdatedField: 'last_updated',
  })
  result.raw_output = content
  return result
}

// parseClaudePluginUpdateCheckOutput 基于 stdout/stderr 构造 Claude 更新检查结果。
// stdout 参数存储 JSON 输出，stderr 参数存储成功时的 warning/诊断输出。
export function parseClaudePluginUpdateCheckOutput(stdout, stderr) {
  // result 存储基于 stdout 解析出的结果。
  const result = parseClaudePluginUpdateJson(stdout)
  result.diagnostics = String(stderr || '').trim()
  return result
}

// enrichClaudeAvailableVersions 从本地 marketplace 清单补齐已安装插件的可用版本。
// claudeHome 参数存储 Claude home，result 参数存储 CLI 已解析的检查结果。
export function enrichClaudeAvailableVersions(claudeHome, result) {
  // marketplacesRoot 存储 Claude 本地 marketplace 根目录。
  const marketplacesRoot = join(
    expandHome(claudeHome),
    'plugins',
    'marketplaces'
  )
  // marketplaceVersions 存储 marketplace 到插件名、版本的两级映射。
  const marketplaceVersions = new Map()

  for (const plugin of result.plugins) {
    if (!plugin.marketplace) {
      continue
    }

    // versions 存储当前 marketplace 清单中的插件版本映射。
    let versions = marketplaceVersions.get(plugin.marketplace)
    if (!versions) {
      // marketplaceRoot 存储当前 marketplace 的本地快照根目录。
      const marketplaceRoot = join(marketplacesRoot, plugin.marketplace)
      // manifestPath 存储当前 marketplace 的标准清单路径。
      const manifestPath = join(
        marketplaceRoot,
        '.claude-plugin',
        'marketplace.json'
      )
      // nextVersions 存储首次读取当前 marketplace 后得到的插件版本映射。
      const nextVersions = new Map()
      if (existsSync(manifestPath)) {
        try {
          // manifest 存储解析后的 marketplace 清单。
          const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
          for (const item of Array.isArray(manifest.plugins)
            ? manifest.plugins
            : []) {
            // name 存储 marketplace 清单中的插件短名称。
            const name = jsonString(item, 'name')
            // sourcePath 存储插件源码相对 marketplace 根目录的位置。
            const sourcePath = jsonString(item, 'source') || `./${name}`
            // pluginManifestPath 存储插件自身 Claude manifest 的路径。
            const pluginManifestPath = resolve(
              marketplaceRoot,
              sourcePath,
              '.claude-plugin',
              'plugin.json'
            )
            // version 存储插件自身 manifest 或 marketplace 条目声明的最新版本。
            let version = jsonString(item, 'version')
            if (existsSync(pluginManifestPath)) {
              // 插件自身 manifest 对应实际安装产物，总清单版本滞后时应以它为准。
              const pluginManifest = JSON.parse(
                readFileSync(pluginManifestPath, 'utf8')
              )
              version = jsonString(pluginManifest, 'version') || version
            }
            if (name && version) {
              nextVersions.set(name, version)
            }
          }
        } catch (error) {
          // marketplace 文件损坏时保留 CLI 结果，并把原因放入诊断信息供界面排查。
          result.diagnostics = [
            result.diagnostics,
            `解析 marketplace ${plugin.marketplace} 失败: ${error.message}`,
          ]
            .filter(Boolean)
            .join('\n')
        }
      }
      marketplaceVersions.set(plugin.marketplace, nextVersions)
      versions = nextVersions
    }

    // availableVersion 存储 marketplace 清单中与当前插件匹配的版本。
    const availableVersion =
      versions.get(plugin.name) || versions.get(pluginShortName(plugin.id))
    if (availableVersion) {
      plugin.available_version = availableVersion
      plugin.update_status = compareVersions(
        plugin.current_version,
        availableVersion
      )
    }
  }

  return result
}

// parseCodexPluginUpdateCheckOutput 基于 stdout/stderr 构造 Codex 更新检查结果。
// stdout 参数存储 JSON 输出，stderr 参数存储成功时的 warning/诊断输出。
export function parseCodexPluginUpdateCheckOutput(stdout, stderr) {
  // result 存储基于 stdout 解析出的结果。
  const result = parseCodexPluginUpdateJson(stdout)
  result.diagnostics = String(stderr || '').trim()
  return result
}

// readCodexConfigRoot 读取 Codex config.toml 并解析为对象。
// codexHome 参数存储 Codex home 目录。
function readCodexConfigRoot(codexHome) {
  // configPath 存储 Codex config.toml 路径。
  const configPath = join(codexHome, 'config.toml')
  // content 存储 config.toml 文本。
  const content = readFileSync(configPath, 'utf8')
  return TOML.parse(content)
}

// writeCodexConfigRoot 将 Codex config.toml 根对象序列化并原子写回。
// codexHome 参数存储 Codex home 目录，root 参数存储待写入的 TOML 根对象。
function writeCodexConfigRoot(codexHome, root) {
  // configPath 存储 Codex config.toml 路径。
  const configPath = join(codexHome, 'config.toml')
  // content 存储序列化后的 TOML 文本。
  const content = TOML.stringify(root)
  atomicWrite(configPath, content)
}

// readCodexPluginManifest 读取已安装 Codex 插件的 plugin.json。
// installPath 参数存储具体版本安装目录。
function readCodexPluginManifest(installPath) {
  // manifestPath 存储插件 manifest 路径。
  const manifestPath = join(installPath, '.codex-plugin', 'plugin.json')
  if (!existsSync(manifestPath)) {
    return undefined
  }
  try {
    return JSON.parse(readFileSync(manifestPath, 'utf8'))
  } catch {
    return undefined
  }
}

// latestCodexPluginInstallPath 在本地 cache 中寻找指定插件的最新安装目录。
// codexHome 参数存储 Codex home，marketplace 和 name 参数定位插件。
function latestCodexPluginInstallPath(codexHome, marketplace, name) {
  // pluginRoot 存储该插件所有版本目录所在位置。
  const pluginRoot = join(codexHome, 'plugins', 'cache', marketplace, name)
  if (!existsSync(pluginRoot)) {
    return undefined
  }

  // candidates 存储包含 manifest 的候选版本目录。
  const candidates = readdirSync(pluginRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(pluginRoot, entry.name))
    .filter((path) => existsSync(join(path, '.codex-plugin', 'plugin.json')))

  candidates.sort((left, right) => {
    // leftName 存储左侧候选版本目录名。
    const leftName = basename(left)
    // rightName 存储右侧候选版本目录名。
    const rightName = basename(right)
    // status 存储把 left 当 current、right 当 available 的比较结果。
    const status = compareVersions(leftName, rightName)
    if (status === 'newer') {
      return -1
    }
    if (status === 'same') {
      return 0
    }
    return 1
  })

  return candidates.pop()
}

// buildCodexFallbackResult 在 Codex CLI 失败时从本地配置/cache 构造降级结果。
// codexHome 参数存储 Codex home，diagnostics 参数存储原始 CLI 错误。
export function buildCodexFallbackResult(codexHome, diagnostics) {
  // root 存储解析后的 Codex config.toml。
  const root = readCodexConfigRoot(codexHome)
  // pluginsTable 存储 config.toml 中的 plugins 表。
  const pluginsTable = root.plugins
  if (!pluginsTable || typeof pluginsTable !== 'object') {
    throw new Error(String(diagnostics || ''))
  }

  // plugins 存储从本地配置/cache 构造出的插件列表。
  const plugins = []
  for (const [id, value] of Object.entries(pluginsTable)) {
    // marketplace 存储插件所属 marketplace。
    const marketplace = pluginMarketplace(id)
    // name 存储插件短名称。
    const name = pluginShortName(id)
    // installPath 存储本地 cache 中最新版本目录。
    const installPath = latestCodexPluginInstallPath(
      codexHome,
      marketplace,
      name
    )
    // manifest 存储插件 manifest 内容。
    const manifest = installPath
      ? readCodexPluginManifest(installPath)
      : undefined
    // currentVersion 存储插件当前安装版本。
    const currentVersion =
      jsonString(manifest, 'version') ||
      (installPath ? basename(installPath) : '')
    // displayName 存储 manifest 插件名，缺失时回退到 ID 短名。
    const displayName = jsonString(manifest, 'name') || name

    plugins.push({
      id,
      name: displayName,
      marketplace,
      current_version: currentVersion,
      available_version: '',
      scope: '',
      enabled: value?.enabled === true,
      install_path: installPath || '',
      last_updated: '',
      update_status: 'unknown',
    })
  }

  plugins.sort((left, right) =>
    left.id.toLowerCase().localeCompare(right.id.toLowerCase())
  )

  // result 存储本地 fallback 构造结果，随后从配置的 marketplace 补齐最新版本。
  const result = {
    tool: 'codex',
    plugins,
    raw_output: '',
    diagnostics: String(diagnostics || ''),
  }
  return enrichCodexAvailableVersions(codexHome, result, root)
}

// readCodexMarketplaceVersions 读取单个 Codex marketplace 中各插件声明的最新版本。
// marketplaceRoot 参数存储 marketplace 根目录。
function readCodexMarketplaceVersions(marketplaceRoot) {
  // versions 存储插件短名称到最新版本的映射。
  const versions = new Map()
  // manifestCandidates 存储 Codex 与兼容 marketplace 可能使用的清单路径。
  const manifestCandidates = [
    join(marketplaceRoot, '.agents', 'plugins', 'marketplace.json'),
    join(marketplaceRoot, '.codex-plugin', 'marketplace.json'),
    join(marketplaceRoot, '.claude-plugin', 'marketplace.json'),
  ]
  // manifestPath 存储首个存在的 marketplace 清单路径。
  const manifestPath = manifestCandidates.find((candidate) =>
    existsSync(candidate)
  )
  if (!manifestPath) {
    return versions
  }

  // manifest 存储解析后的 marketplace 清单。
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  for (const item of Array.isArray(manifest.plugins) ? manifest.plugins : []) {
    // name 存储 marketplace 中的插件短名称。
    const name = jsonString(item, 'name')
    // sourcePath 存储插件相对 marketplace 根目录的源码路径。
    const sourcePath =
      jsonString(item, 'source') ||
      jsonString(item?.source, 'path') ||
      jsonString(item?.source, 'url') ||
      `./plugins/${name}`
    // pluginManifestPath 存储插件自身声明版本的 Codex manifest 路径。
    const pluginManifestPath = resolve(
      marketplaceRoot,
      sourcePath,
      '.codex-plugin',
      'plugin.json'
    )
    // version 存储 marketplace 条目或插件 manifest 声明的版本。
    let version = jsonString(item, 'version')
    if (!version && existsSync(pluginManifestPath)) {
      // pluginManifest 存储解析后的 Codex 插件 manifest。
      const pluginManifest = JSON.parse(
        readFileSync(pluginManifestPath, 'utf8')
      )
      version = jsonString(pluginManifest, 'version')
    }
    if (name && version) {
      versions.set(name, version)
    }
  }
  return versions
}

// enrichCodexAvailableVersions 从 config.toml 配置的 marketplace 补齐 Codex 插件可用版本。
// codexHome 参数存储 Codex home，result 参数存储检查结果，configRoot 参数允许 fallback 复用已解析配置。
export function enrichCodexAvailableVersions(codexHome, result, configRoot) {
  // root 存储 Codex config.toml 根对象。
  const root = configRoot || readCodexConfigRoot(codexHome)
  // marketplaces 存储 marketplace 名称到配置项的映射。
  const marketplaces = root.marketplaces || {}
  // cachedVersions 存储已读取 marketplace 的版本映射，避免同市场重复读盘。
  const cachedVersions = new Map()

  for (const plugin of result.plugins) {
    // cachedInstallPath 存储当前插件具体版本的本地安装缓存目录。
    const cachedInstallPath = join(
      expandHome(codexHome),
      'plugins',
      'cache',
      plugin.marketplace,
      plugin.name,
      plugin.current_version
    )
    if (
      plugin.marketplace &&
      plugin.name &&
      plugin.current_version &&
      existsSync(cachedInstallPath)
    ) {
      // Codex 新版 CLI 不返回安装路径与更新时间，因此以实际版本缓存目录作为 Finder 路径和更新时间来源。
      plugin.install_path = cachedInstallPath
      // cacheStat 存储版本缓存目录的文件系统时间信息。
      const cacheStat = statSync(cachedInstallPath)
      plugin.last_updated = cacheStat.mtime.toISOString()
    }

    if (plugin.available_version || !plugin.marketplace) {
      continue
    }

    // versions 存储当前插件所属 marketplace 的版本映射。
    let versions = cachedVersions.get(plugin.marketplace)
    if (!versions) {
      // marketplaceConfig 存储 config.toml 中当前 marketplace 配置。
      const marketplaceConfig = marketplaces[plugin.marketplace]
      // marketplaceSource 存储 marketplace 本地根目录。
      const marketplaceSource = jsonString(marketplaceConfig, 'source')
      // marketplaceSourceType 存储 marketplace 来源类型，用于区分本地目录与 Git URL。
      const marketplaceSourceType = jsonString(marketplaceConfig, 'source_type')
      // marketplaceRoot 存储最终可读取的 marketplace 快照根目录。
      const marketplaceRoot =
        marketplaceSourceType === 'git'
          ? join(
              expandHome(codexHome),
              '.tmp',
              'marketplaces',
              plugin.marketplace
            )
          : expandHome(marketplaceSource)
      try {
        versions = marketplaceSource
          ? readCodexMarketplaceVersions(marketplaceRoot)
          : new Map()
      } catch (error) {
        versions = new Map()
        result.diagnostics = [
          result.diagnostics,
          `解析 Codex marketplace ${plugin.marketplace} 失败: ${error.message}`,
        ]
          .filter(Boolean)
          .join('\n')
      }
      cachedVersions.set(plugin.marketplace, versions)
    }

    // availableVersion 存储 marketplace 中与当前插件匹配的最新版本。
    const availableVersion =
      versions.get(plugin.name) || versions.get(pluginShortName(plugin.id))
    if (availableVersion) {
      plugin.available_version = availableVersion
      plugin.update_status = compareVersions(
        plugin.current_version,
        availableVersion
      )
    }
  }
  return result
}

// runPluginCliRaw 执行插件相关 CLI 命令，返回拆分 stdout/stderr。
// bin 参数存储命令名，args 参数存储命令参数，homeEnvKey/homeDir 指定工具 home，timeout 指定超时毫秒数。
async function runPluginCliRaw(bin, args, homeEnvKey, homeDir, timeout) {
  // expandedHome 存储展开后的工具根目录。
  const expandedHome = expandHome(homeDir)
  try {
    return await runCommand(bin, args, {
      env: { [homeEnvKey]: expandedHome },
      timeout,
    })
  } catch (error) {
    // mergedOutput 存储失败时要原样透传给调用方的合并输出。
    const mergedOutput =
      `${error.stdout || ''}\n${error.stderr || ''}`.trim() || error.message
    throw new Error(`执行命令失败:\n${mergedOutput}`.trim(), { cause: error })
  }
}

// runPluginCli 执行插件相关 CLI 命令并返回合并后的可读输出。
// bin 参数存储命令名，args 参数存储命令参数，homeEnvKey/homeDir 指定工具 home。
async function runPluginCli(bin, args, homeEnvKey, homeDir) {
  // output 存储拆分后的 CLI 输出。
  const output = await runPluginCliRaw(bin, args, homeEnvKey, homeDir)
  return `${output.stdout}\n${output.stderr}`.trim()
}

// checkClaudePluginUpdates 检查 Claude 已安装插件是否存在可用更新。
// claudeHome 参数存储 Claude 配置根目录，commandRunner 参数允许测试替换命令执行器。
export async function checkClaudePluginUpdates(
  claudeHome,
  commandRunner = runPluginCliRaw
) {
  // output 存储 Claude CLI 原始 stdout/stderr。
  const output = await commandRunner(
    'claude',
    ['plugin', 'list', '--json', '--available'],
    'CLAUDE_HOME',
    claudeHome
  )
  // result 存储 CLI 解析结果，随后按已安装插件来源并行刷新 marketplace。
  const result = parseClaudePluginUpdateCheckOutput(
    output.stdout,
    output.stderr
  )
  // marketplaceNames 存储已安装插件涉及的唯一 marketplace 名称。
  const marketplaceNames = [
    ...new Set(
      result.plugins.map((plugin) => plugin.marketplace).filter(Boolean)
    ),
  ]
  // refreshResults 存储各 marketplace 并行刷新后的成功或失败状态。
  const refreshResults = await Promise.allSettled(
    marketplaceNames.map((marketplaceName) =>
      commandRunner(
        'claude',
        ['plugin', 'marketplace', 'update', marketplaceName],
        'CLAUDE_HOME',
        claudeHome,
        CLAUDE_MARKETPLACE_REFRESH_TIMEOUT_MS
      )
    )
  )
  for (let index = 0; index < refreshResults.length; index += 1) {
    // refreshResult 存储当前位置 marketplace 的刷新结果。
    const refreshResult = refreshResults[index]
    if (refreshResult.status === 'rejected') {
      // marketplaceName 存储刷新失败的 marketplace 名称。
      const marketplaceName = marketplaceNames[index]
      // 刷新失败时继续使用本地缓存，并保留具体来源诊断，避免单个远程源阻塞整个页面。
      result.diagnostics = [
        result.diagnostics,
        `刷新 Claude marketplace ${marketplaceName} 失败，已使用本地缓存: ${refreshResult.reason}`,
      ]
        .filter(Boolean)
        .join('\n')
    }
  }
  return enrichClaudeAvailableVersions(claudeHome, result)
}

// checkCodexPluginUpdates 检查 Codex 已安装插件是否存在可用更新。
// codexHome 参数存储 Codex 配置根目录。
export async function checkCodexPluginUpdates(codexHome) {
  // expandedHome 存储展开后的 Codex home，CLI 失败时用于本地 fallback。
  const expandedHome = expandHome(codexHome)
  try {
    // output 存储 Codex CLI 原始 stdout/stderr。
    const output = await runPluginCliRaw(
      'codex',
      ['plugin', 'list', '--available', '--json'],
      'CODEX_HOME',
      codexHome
    )
    // result 存储 CLI 结果，并从 config.toml 指向的 marketplace 补齐缺失版本。
    const result = parseCodexPluginUpdateCheckOutput(
      output.stdout,
      output.stderr
    )
    return enrichCodexAvailableVersions(expandedHome, result)
  } catch (error) {
    return buildCodexFallbackResult(expandedHome, error.message)
  }
}

// listClaudePlugins 读取已安装 Claude 插件列表。
// claudeHome 参数存储 Claude 配置根目录。
export function listClaudePlugins(claudeHome) {
  // filePath 存储 installed_plugins.json 路径。
  const filePath = join(
    expandHome(claudeHome),
    'plugins',
    'installed_plugins.json'
  )
  if (!existsSync(filePath)) {
    return []
  }

  // root 存储插件 JSON 根对象。
  const root = JSON.parse(readFileSync(filePath, 'utf8'))
  // result 存储所有安装记录。
  const result = []
  for (const [fullName, installs] of Object.entries(root.plugins || {})) {
    // marketplace 存储 @ 后面的市场名。
    const marketplace = pluginMarketplace(fullName)
    for (const item of Array.isArray(installs) ? installs : []) {
      result.push({
        name: fullName,
        marketplace,
        version: jsonString(item, 'version'),
        scope: jsonString(item, 'scope'),
        install_path: jsonString(item, 'installPath'),
        installed_at: jsonString(item, 'installedAt'),
        last_updated: jsonString(item, 'lastUpdated'),
        git_commit_sha: jsonString(item, 'gitCommitSha'),
      })
    }
  }
  result.sort((left, right) =>
    left.name.toLowerCase().localeCompare(right.name.toLowerCase())
  )
  return result
}

// listClaudeMarketplaces 读取 Claude marketplace 列表。
// claudeHome 参数存储 Claude 配置根目录。
export function listClaudeMarketplaces(claudeHome) {
  // filePath 存储 known_marketplaces.json 路径。
  const filePath = join(
    expandHome(claudeHome),
    'plugins',
    'known_marketplaces.json'
  )
  if (!existsSync(filePath)) {
    return []
  }

  // root 存储 marketplace JSON 根对象。
  const root = JSON.parse(readFileSync(filePath, 'utf8'))
  // result 存储所有 marketplace 展示信息。
  const result = []
  for (const [name, value] of Object.entries(root || {})) {
    // source 存储来源对象。
    const source = value?.source || {}
    result.push({
      name,
      source_type: jsonString(source, 'source'),
      source: jsonString(source, 'url') || jsonString(source, 'source'),
      install_location: jsonString(value, 'installLocation'),
      last_updated: jsonString(value, 'lastUpdated'),
    })
  }
  result.sort((left, right) =>
    left.name.toLowerCase().localeCompare(right.name.toLowerCase())
  )
  return result
}

// parseCodexMarketplaceListOutput 将 Codex CLI 的 marketplace JSON 转换为统一市场信息。
// stdout 参数存储 `codex plugin marketplace list --json` 的标准输出。
export function parseCodexMarketplaceListOutput(stdout) {
  // root 存储 Codex CLI 返回的 JSON 根对象。
  const root = JSON.parse(String(stdout || '{}'))
  // marketplaces 存储 CLI 返回的市场数组，格式异常时回退为空数组。
  const marketplaces = Array.isArray(root?.marketplaces)
    ? root.marketplaces
    : []
  // result 存储转换后的统一市场信息。
  const result = marketplaces.map((item) => {
    // marketplaceSource 存储当前市场声明的来源类型和原始地址。
    const marketplaceSource = item?.marketplaceSource || {}
    return {
      name: jsonString(item, 'name'),
      source_type: jsonString(marketplaceSource, 'sourceType'),
      source: jsonString(marketplaceSource, 'source'),
      install_location: jsonString(item, 'root'),
      last_updated: '',
    }
  })
  result.sort((left, right) =>
    left.name.toLowerCase().localeCompare(right.name.toLowerCase())
  )
  return result
}

// listCodexMarketplaces 通过 Codex CLI 读取已注册 marketplace 列表。
// codexHome 参数存储 Codex 配置根目录，commandRunner 参数允许测试替换命令执行器。
export async function listCodexMarketplaces(
  codexHome,
  commandRunner = runPluginCliRaw
) {
  // output 存储 Codex CLI 拆分后的 stdout 与 stderr。
  const output = await commandRunner(
    'codex',
    ['plugin', 'marketplace', 'list', '--json'],
    'CODEX_HOME',
    codexHome
  )
  return parseCodexMarketplaceListOutput(output.stdout)
}

// updateClaudePlugin 通过 claude CLI 更新指定插件。
// pluginName 参数存储插件完整名，scope 参数存储安装作用域。
export async function updateClaudePlugin(pluginName, scope) {
  // args 存储传给 claude CLI 的参数。
  const args = ['plugin', 'update', pluginName]
  if (String(scope || '').trim()) {
    args.push('-s', scope)
  }
  return runPluginCli(
    'claude',
    args,
    'CLAUDE_HOME',
    process.env.CLAUDE_HOME || '~/.claude'
  )
}

// updateClaudeMarketplace 通过 claude CLI 刷新指定 marketplace。
// marketplaceName 参数存储 marketplace 名称，claudeHome 参数存储本次命令使用的配置根目录。
export async function updateClaudeMarketplace(
  marketplaceName,
  claudeHome = process.env.CLAUDE_HOME || '~/.claude'
) {
  return runPluginCli(
    'claude',
    ['plugin', 'marketplace', 'update', marketplaceName],
    'CLAUDE_HOME',
    claudeHome
  )
}

// updateCodexPlugin 通过 Codex CLI 安装指定 marketplace 中的插件以完成升级。
// pluginId 参数存储插件 ID，marketplace 参数存储所属 marketplace。
export async function updateCodexPlugin(pluginId, marketplace) {
  // defaultHome 存储当前 CODEX_HOME 或默认值。
  const defaultHome = process.env.CODEX_HOME || '~/.codex'
  // pluginArg 存储清理后的插件参数。
  const pluginArg = String(pluginId || '').trim()
  // marketplaceArg 存储清理后的 marketplace 参数。
  const marketplaceArg = String(marketplace || '').trim()
  // args 存储传给 codex plugin add 的参数。
  const args = ['plugin', 'add', pluginArg, '--json']
  if (marketplaceArg && !pluginArg.includes('@')) {
    args.push('--marketplace', marketplaceArg)
  }
  return runPluginCli('codex', args, 'CODEX_HOME', defaultHome)
}

// buildClaudePluginToggleArgs 构造 Claude 插件启停命令参数。
// pluginName 参数存储插件完整名，scope 参数存储安装作用域，enabled 参数表示目标启用状态。
export function buildClaudePluginToggleArgs(pluginName, scope, enabled) {
  // normalizedPluginName 存储去掉空白后的插件完整名。
  const normalizedPluginName = String(pluginName || '').trim()
  // normalizedScope 存储去掉空白后的安装作用域。
  const normalizedScope = String(scope || '').trim()
  if (!normalizedPluginName) {
    throw new Error('插件名称不能为空')
  }

  // args 存储传给 Claude CLI 的启停参数。
  const args = ['plugin', enabled ? 'enable' : 'disable', normalizedPluginName]
  if (normalizedScope) {
    // Claude project/local/user 插件需要带作用域，否则 auto-detect 可能作用到错误安装位置。
    args.push('-s', normalizedScope)
  }
  return args
}

// setClaudePluginEnabled 通过 Claude CLI 启用或禁用指定插件。
// pluginName 参数存储插件完整名，scope 参数存储安装作用域，enabled 参数表示目标启用状态，claudeHome 参数存储 Claude 配置根目录。
export async function setClaudePluginEnabled(
  pluginName,
  scope,
  enabled,
  claudeHome
) {
  // home 存储本次命令使用的 Claude 配置根目录。
  const home = claudeHome || process.env.CLAUDE_HOME || '~/.claude'
  // args 存储传给 Claude CLI 的启停参数。
  const args = buildClaudePluginToggleArgs(pluginName, scope, enabled)
  return runPluginCli('claude', args, 'CLAUDE_HOME', home)
}

// setCodexPluginEnabled 通过写入 config.toml 启用或禁用指定 Codex 插件。
// codexHome 参数存储 Codex 配置根目录，pluginId 参数存储插件完整 ID，enabled 参数表示目标启用状态。
export function setCodexPluginEnabled(codexHome, pluginId, enabled) {
  // expandedHome 存储展开后的 Codex 配置根目录。
  const expandedHome = expandHome(codexHome)
  // normalizedPluginId 存储去掉空白后的插件完整 ID。
  const normalizedPluginId = String(pluginId || '').trim()
  if (!normalizedPluginId) {
    throw new Error('插件 ID 不能为空')
  }

  // root 存储解析后的 Codex config.toml 根对象。
  const root = readCodexConfigRoot(expandedHome)
  if (!root.plugins || typeof root.plugins !== 'object') {
    // Codex 插件配置整体缺失时创建 plugins 表，支持已安装但未写 enabled 的插件补齐状态。
    root.plugins = {}
  }
  if (
    !root.plugins[normalizedPluginId] ||
    typeof root.plugins[normalizedPluginId] !== 'object'
  ) {
    // 单个插件配置缺失时创建插件表，避免覆盖其他插件配置。
    root.plugins[normalizedPluginId] = {}
  }

  root.plugins[normalizedPluginId].enabled = Boolean(enabled)
  writeCodexConfigRoot(expandedHome, root)
  return enabled ? '已启用插件' : '已禁用插件'
}

// updateCodexMarketplace 通过 Codex CLI 刷新 marketplace 快照。
// marketplaceName 参数存储 marketplace 名称；为空表示升级全部，codexHome 参数存储本次命令使用的配置根目录。
export async function updateCodexMarketplace(
  marketplaceName,
  codexHome = process.env.CODEX_HOME || '~/.codex'
) {
  // normalizedName 存储清理后的 marketplace 名称。
  const normalizedName = String(marketplaceName || '').trim()
  // args 存储传给 codex plugin marketplace upgrade 的参数。
  const args = ['plugin', 'marketplace', 'upgrade', '--json']
  if (normalizedName) {
    args.push(normalizedName)
  }
  return runPluginCli('codex', args, 'CODEX_HOME', codexHome)
}

// PLUGIN_GIT_TIMEOUT_MS 存储插件 Git 查询或切换允许的最长等待时间。
const PLUGIN_GIT_TIMEOUT_MS = 30_000

// pluginRepositoryCandidates 构造插件 Git 仓库的候选路径。
// payload 参数存储工具、marketplace、安装路径与配置根目录。
function pluginRepositoryCandidates(payload) {
  // marketplaceName 存储去除空白后的 marketplace 名称。
  const marketplaceName = String(payload.marketplace || '').trim()
  // toolHome 存储当前工具配置根目录。
  const toolHome = expandHome(
    payload.tool === 'claude' ? payload.claudeHome : payload.codexHome
  )
  // marketplacePath 存储当前工具的 marketplace Git 仓库路径。
  let marketplacePath = join(
    toolHome,
    'plugins',
    'marketplaces',
    marketplaceName
  )
  if (payload.tool === 'codex') {
    try {
      // codexRoot 存储 Codex 配置，用于区分 Git 快照与本地 marketplace。
      const codexRoot = readCodexConfigRoot(toolHome)
      // marketplaceConfig 存储目标 Codex marketplace 配置。
      const marketplaceConfig = codexRoot.marketplaces?.[marketplaceName]
      // sourceType 存储 Codex marketplace 来源类型。
      const sourceType = jsonString(marketplaceConfig, 'source_type')
      // source 存储 Codex marketplace 原始来源。
      const source = jsonString(marketplaceConfig, 'source')
      marketplacePath =
        sourceType === 'git'
          ? join(toolHome, '.tmp', 'marketplaces', marketplaceName)
          : expandHome(source)
    } catch {
      // 旧配置或测试环境没有 config.toml 时继续使用实际插件 Git 安装路径。
      marketplacePath = ''
    }
  }
  // candidates 优先检查 marketplace 仓库，再用安装路径兼容直接 Git 安装插件。
  const candidates = [marketplacePath, expandHome(payload.installPath)].filter(
    Boolean
  )
  return [...new Set(candidates)]
}

// resolvePluginRepository 定位实际承载插件能力的 Git 仓库根目录。
// payload 参数存储插件路径信息，commandRunner 参数用于执行异步 Git 命令。
async function resolvePluginRepository(payload, commandRunner) {
  // candidates 存储插件安装目录与 marketplace 目录候选项。
  const candidates = pluginRepositoryCandidates(payload)
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue
    try {
      // result 存储 Git 返回的仓库顶层目录。
      const result = await commandRunner(
        'git',
        ['-C', candidate, 'rev-parse', '--show-toplevel'],
        { timeout: PLUGIN_GIT_TIMEOUT_MS }
      )
      // repositoryPath 存储标准化后的仓库根目录。
      const repositoryPath = result.stdout.trim()
      if (repositoryPath) return repositoryPath
    } catch {
      // 安装快照不是 Git 仓库时继续检查其余候选项。
    }
  }
  throw new Error('未找到插件安装路径或 marketplace 对应的 Git 仓库')
}

// readJsonFile 读取并解析 JSON 文件，失败时附带明确路径。
// filePath 参数存储需要读取的 JSON 文件路径。
function readJsonFile(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'))
  } catch (error) {
    throw new Error(`读取 ${filePath} 失败: ${error.message}`, { cause: error })
  }
}

// shouldCopyPluginCachePath 排除 Git 元数据，避免根目录插件把完整仓库对象复制进运行缓存。
// sourcePath 参数存储 fs.cp 当前准备复制的源路径。
function shouldCopyPluginCachePath(sourcePath) {
  return basename(sourcePath) !== '.git'
}

// activateClaudePluginBranch 将 marketplace 当前分支的插件复制到 Claude 缓存并更新安装索引。
// payload 参数存储插件标识与 Claude home，repositoryPath 参数存储 marketplace 仓库，branch 参数存储当前本地分支。
async function activateClaudePluginBranch(
  payload,
  repositoryPath,
  branch,
  commandRunner
) {
  // marketplaceManifestPath 存储 marketplace 插件清单路径。
  const marketplaceManifestPath = join(
    repositoryPath,
    '.claude-plugin',
    'marketplace.json'
  )
  // marketplaceManifest 存储当前分支解析后的插件清单。
  const marketplaceManifest = readJsonFile(marketplaceManifestPath)
  // pluginName 存储插件完整 ID 中 @ 前的短名称。
  const pluginName = pluginShortName(payload.pluginId)
  // pluginEntry 存储 marketplace 中与目标插件匹配的条目。
  const pluginEntry = (
    Array.isArray(marketplaceManifest.plugins)
      ? marketplaceManifest.plugins
      : []
  ).find((item) => jsonString(item, 'name') === pluginName)
  if (!pluginEntry || typeof pluginEntry.source !== 'string') {
    throw new Error('当前分支未找到可复制的本地插件源码')
  }
  // sourcePath 存储解析后的插件源码绝对路径。
  const sourcePath = resolve(repositoryPath, pluginEntry.source)
  // repositoryRoot 存储标准化后的 marketplace 仓库根目录。
  const repositoryRoot = resolve(repositoryPath)
  if (
    (sourcePath !== repositoryRoot &&
      !sourcePath.startsWith(`${repositoryRoot}${sep}`)) ||
    !existsSync(sourcePath)
  ) {
    throw new Error('当前分支的插件源码路径无效')
  }
  // commitResult 存储当前分支 HEAD commit，用于生成不可冲突的缓存快照。
  const commitResult = await commandRunner(
    'git',
    ['-C', repositoryPath, 'rev-parse', 'HEAD'],
    { timeout: PLUGIN_GIT_TIMEOUT_MS }
  )
  // commitSha 存储当前分支完整 commit SHA。
  const commitSha = commitResult.stdout.trim()
  if (!commitSha) throw new Error('无法读取插件分支 commit')
  // safeBranch 存储可安全用于缓存目录名的分支名称。
  const safeBranch = String(branch || 'detached').replace(
    /[^0-9A-Za-z._-]+/g,
    '-'
  )
  // cachePath 存储该分支插件能力的新缓存快照路径。
  const cachePath = join(
    expandHome(payload.claudeHome),
    'plugins',
    'cache',
    String(payload.marketplace || '').trim(),
    pluginName,
    `branch-${safeBranch}-${commitSha.slice(0, 12)}`
  )
  await mkdir(dirname(cachePath), { recursive: true })
  if (!existsSync(cachePath)) {
    // commit SHA 对应不可变快照；已存在时直接复用，避免重复复制大插件阻塞磁盘。
    await cp(sourcePath, cachePath, {
      recursive: true,
      force: true,
      filter: shouldCopyPluginCachePath,
    })
  }

  // installedPluginsPath 存储 Claude 已安装插件索引路径。
  const installedPluginsPath = join(
    expandHome(payload.claudeHome),
    'plugins',
    'installed_plugins.json'
  )
  // installedRoot 存储 Claude 已安装插件索引根对象。
  const installedRoot = readJsonFile(installedPluginsPath)
  // installations 存储目标插件的全部 scope 安装记录。
  const installations = installedRoot.plugins?.[payload.pluginId]
  if (!Array.isArray(installations)) {
    throw new Error('Claude 已安装插件索引中未找到目标插件')
  }
  // installation 存储与当前卡片 scope 和安装路径匹配的记录。
  const installation =
    installations.find(
      (item) =>
        jsonString(item, 'scope') === String(payload.scope || '') &&
        jsonString(item, 'installPath') === expandHome(payload.installPath)
    ) ||
    installations.find(
      (item) => jsonString(item, 'scope') === String(payload.scope || '')
    )
  if (!installation) throw new Error('未找到当前作用域的 Claude 插件安装记录')
  installation.installPath = cachePath
  installation.gitCommitSha = commitSha
  installation.lastUpdated = new Date().toISOString()
  atomicWrite(
    installedPluginsPath,
    `${JSON.stringify(installedRoot, null, 2)}\n`
  )

  // knownMarketplacesPath 存储 Claude marketplace 来源配置路径。
  const knownMarketplacesPath = join(
    expandHome(payload.claudeHome),
    'plugins',
    'known_marketplaces.json'
  )
  // knownMarketplaces 存储全部已注册 marketplace 来源。
  const knownMarketplaces = readJsonFile(knownMarketplacesPath)
  // marketplaceConfig 存储当前插件所属 marketplace 配置。
  const marketplaceConfig = knownMarketplaces[payload.marketplace]
  if (marketplaceConfig?.source?.source === 'git') {
    // ref 必须持久化，否则后续 marketplace 更新会重新回到默认分支。
    marketplaceConfig.source.ref = branch
    marketplaceConfig.lastUpdated = new Date().toISOString()
    atomicWrite(
      knownMarketplacesPath,
      `${JSON.stringify(knownMarketplaces, null, 2)}\n`
    )
  }
}

// activateClaudeMarketplaceBranch 为 marketplace 下所有已安装插件生成当前分支缓存。
// payload 参数存储 marketplace 与 Claude home，repositoryPath 和 branch 定位已切换源码。
async function activateClaudeMarketplaceBranch(
  payload,
  repositoryPath,
  branch,
  commandRunner
) {
  // installedPluginsPath 存储 Claude 已安装插件索引路径。
  const installedPluginsPath = join(
    expandHome(payload.claudeHome),
    'plugins',
    'installed_plugins.json'
  )
  // installedRoot 存储 Claude 已安装插件索引根对象。
  const installedRoot = readJsonFile(installedPluginsPath)
  // marketplaceSuffix 存储用于筛选同 marketplace 插件 ID 的后缀。
  const marketplaceSuffix = `@${String(payload.marketplace || '').trim()}`
  // affectedInstallations 存储该 marketplace 下每条已安装插件记录。
  const affectedInstallations = Object.entries(
    installedRoot.plugins || {}
  ).flatMap(([pluginId, installations]) =>
    pluginId.endsWith(marketplaceSuffix) && Array.isArray(installations)
      ? installations.map((installation) => ({ pluginId, installation }))
      : []
  )
  if (affectedInstallations.length === 0) {
    throw new Error('该 marketplace 下没有已安装插件')
  }
  for (const affected of affectedInstallations) {
    await activateClaudePluginBranch(
      {
        ...payload,
        pluginId: affected.pluginId,
        scope: jsonString(affected.installation, 'scope'),
        installPath: jsonString(affected.installation, 'installPath'),
      },
      repositoryPath,
      branch,
      commandRunner
    )
  }
}

// activateCodexMarketplaceBranch 持久化 marketplace ref 并重装同市场全部已注册插件。
// payload 参数存储 Codex home 与 marketplace，branch 参数存储已切换的本地分支。
async function activateCodexMarketplaceBranch(payload, branch, commandRunner) {
  // codexHome 存储展开后的 Codex 配置根目录。
  const codexHome = expandHome(payload.codexHome)
  // root 存储解析后的 Codex config.toml 根对象。
  const root = readCodexConfigRoot(codexHome)
  // marketplaceConfig 存储目标 marketplace 配置。
  const marketplaceConfig = root.marketplaces?.[payload.marketplace]
  if (!marketplaceConfig || typeof marketplaceConfig !== 'object') {
    throw new Error('Codex 配置中未找到目标 marketplace')
  }
  marketplaceConfig.ref = branch
  writeCodexConfigRoot(codexHome, root)
  // marketplaceSuffix 存储用于筛选同 marketplace 插件 ID 的后缀。
  const marketplaceSuffix = `@${String(payload.marketplace || '').trim()}`
  // pluginIds 存储该 marketplace 下全部已注册插件 ID。
  const pluginIds = Object.keys(root.plugins || {}).filter((pluginId) =>
    pluginId.endsWith(marketplaceSuffix)
  )
  if (pluginIds.length === 0) throw new Error('该 marketplace 下没有已注册插件')
  for (const pluginId of pluginIds) {
    await commandRunner('codex', ['plugin', 'add', pluginId, '--json'], {
      env: { CODEX_HOME: codexHome },
      timeout: PLUGIN_GIT_TIMEOUT_MS,
    })
  }
}

// readPluginGitBranches 读取仓库当前分支及全部本地/远端分支。
// repositoryPath 参数存储仓库根目录，commandRunner 参数用于执行异步 Git 命令。
async function readPluginGitBranches(repositoryPath, commandRunner) {
  // currentResult 存储当前分支查询结果，detached HEAD 时命令返回空文本。
  const currentResult = await commandRunner(
    'git',
    ['-C', repositoryPath, 'branch', '--show-current'],
    { timeout: PLUGIN_GIT_TIMEOUT_MS }
  )
  // branchesResult 存储本地与远端引用的短名称列表。
  const branchesResult = await commandRunner(
    'git',
    [
      '-C',
      repositoryPath,
      'for-each-ref',
      '--format=%(refname:short)%09%(symref)',
      'refs/heads',
      'refs/remotes',
    ],
    { timeout: PLUGIN_GIT_TIMEOUT_MS }
  )
  // branches 存储过滤远端 HEAD 符号引用并排序后的可切换分支。
  const branches = [
    ...new Set(
      branchesResult.stdout
        .split('\n')
        .map((line) => {
          // parts 存储分支短名称和可选符号引用目标。
          const parts = line.split('\t')
          // branch 存储当前位置解析出的引用短名称。
          const branch = parts[0]?.trim() || ''
          return parts[1]?.trim() || branch.endsWith('/HEAD') ? '' : branch
        })
        .filter(Boolean)
    ),
  ].sort()
  return {
    repository_path: repositoryPath,
    current_branch: currentResult.stdout.trim(),
    branches,
  }
}

// listPluginGitBranches 异步刷新远端引用并返回插件仓库分支。
// payload 参数存储插件仓库定位信息，commandRunner 参数用于测试替换命令执行器。
export async function listPluginGitBranches(
  payload,
  commandRunner = runCommand
) {
  // repositoryPath 存储定位到的插件 Git 仓库根目录。
  const repositoryPath = await resolvePluginRepository(payload, commandRunner)
  try {
    await commandRunner(
      'git',
      ['-C', repositoryPath, 'fetch', '--all', '--prune'],
      { timeout: PLUGIN_GIT_TIMEOUT_MS }
    )
  } catch {
    // 网络不可用时仍返回本地缓存分支，避免分支选择能力整体不可用。
  }
  return readPluginGitBranches(repositoryPath, commandRunner)
}

// switchPluginGitBranch 安全切换插件仓库分支并返回切换后的状态。
// payload 参数额外包含目标 branch，commandRunner 参数用于测试替换命令执行器。
export async function switchPluginGitBranch(
  payload,
  commandRunner = runCommand
) {
  // repositoryPath 存储定位到的插件 Git 仓库根目录。
  const repositoryPath = await resolvePluginRepository(payload, commandRunner)
  // branchInfo 存储当前仓库允许切换的已知分支。
  const branchInfo = await readPluginGitBranches(repositoryPath, commandRunner)
  // targetBranch 存储去除空白后的目标分支名。
  const targetBranch = String(payload.branch || '').trim()
  if (!targetBranch || !branchInfo.branches.includes(targetBranch))
    throw new Error('目标分支不存在，请刷新分支列表后重试')
  // statusResult 存储工作区未提交修改，用于防止切换覆盖用户内容。
  const statusResult = await commandRunner(
    'git',
    ['-C', repositoryPath, 'status', '--porcelain'],
    { timeout: PLUGIN_GIT_TIMEOUT_MS }
  )
  if (statusResult.stdout.trim())
    throw new Error('插件仓库存在未提交修改，请先提交或暂存后再切换分支')
  // localBranchesResult 存储全部本地分支，用于区分直接切换与跟踪远端分支。
  const localBranchesResult = await commandRunner(
    'git',
    [
      '-C',
      repositoryPath,
      'for-each-ref',
      '--format=%(refname:short)',
      'refs/heads',
    ],
    { timeout: PLUGIN_GIT_TIMEOUT_MS }
  )
  // localBranches 存储本地分支名称集合。
  const localBranches = new Set(
    localBranchesResult.stdout
      .split('\n')
      .map((branch) => branch.trim())
      .filter(Boolean)
  )
  // localBranch 存储远端分支对应的本地跟踪分支名。
  const localBranch = targetBranch.includes('/')
    ? targetBranch.slice(targetBranch.indexOf('/') + 1)
    : targetBranch
  if (localBranches.has(targetBranch) || localBranches.has(localBranch)) {
    // checkoutBranch 存储最终要直接检出的现有本地分支。
    const checkoutBranch = localBranches.has(targetBranch)
      ? targetBranch
      : localBranch
    await commandRunner(
      'git',
      ['-C', repositoryPath, 'switch', checkoutBranch],
      { timeout: PLUGIN_GIT_TIMEOUT_MS }
    )
  } else {
    if (!localBranch) throw new Error('无法从远端引用解析本地分支名称')
    await commandRunner(
      'git',
      [
        '-C',
        repositoryPath,
        'switch',
        '--track',
        '-c',
        localBranch,
        targetBranch,
      ],
      { timeout: PLUGIN_GIT_TIMEOUT_MS }
    )
  }
  // nextBranchInfo 存储切换完成后的分支状态。
  const nextBranchInfo = await readPluginGitBranches(
    repositoryPath,
    commandRunner
  )
  // expandedInstallPath 存储标准化后的实际插件安装路径。
  const expandedInstallPath = resolve(expandHome(payload.installPath))
  // expandedRepositoryPath 存储标准化后的当前 Git 仓库根目录。
  const expandedRepositoryPath = resolve(repositoryPath)
  // installationUsesRepository 标记 Claude 是否已直接从当前 Git 工作树运行。
  const installationUsesRepository =
    expandedInstallPath === expandedRepositoryPath ||
    expandedInstallPath.startsWith(`${expandedRepositoryPath}${sep}`)
  if (payload.tool === 'claude' && !installationUsesRepository) {
    // Claude 运行缓存快照，必须异步复制当前分支源码并更新安装索引才能真正使用该分支能力。
    await activateClaudeMarketplaceBranch(
      payload,
      repositoryPath,
      nextBranchInfo.current_branch,
      commandRunner
    )
  } else if (payload.tool === 'codex' && !installationUsesRepository) {
    // Codex marketplace 分支变化会影响其下全部注册插件，需要按新 ref 顺序重装。
    await activateCodexMarketplaceBranch(
      payload,
      nextBranchInfo.current_branch,
      commandRunner
    )
  }
  return nextBranchInfo
}

// buildUpdateToolArgs 构造 npm 全局更新参数；插件测试复用该纯函数保持旧覆盖面。
// packageName 参数存储 npm 包名。
export function buildUpdateToolArgs(packageName) {
  return ['install', '-g', packageName, '--registry=https://registry.npmjs.org']
}
