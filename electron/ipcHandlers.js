// IPC handler 注册：把 src/core 的纯业务能力暴露给渲染进程。
import { IPC } from './ipcChannels.js'
import { getPreferences, savePreferences } from '../src/core/preferences.js'
import {
  createClaudeOutputStyle,
  listClaudeOutputStyles,
  listDir,
  readConfigFile,
  saveConfigFile,
} from '../src/core/settings.js'
import {
  checkClaudePluginUpdates,
  checkCodexPluginUpdates,
  listClaudeMarketplaces,
  listCodexMarketplaces,
  listClaudePlugins,
  setClaudePluginEnabled,
  setCodexPluginEnabled,
  listPluginGitBranches,
  switchPluginGitBranch,
  updateClaudeMarketplace,
  updateClaudePlugin,
  updateCodexMarketplace,
  updateCodexPlugin,
} from '../src/core/plugins.js'
import { listSkills } from '../src/core/skills.js'
import {
  deleteQuotaAccount,
  discoverQuotaModels,
  listQuotaAccounts,
  queryQuotaAccount,
  saveQuotaAccount,
} from '../src/core/quotaManager.js'
import {
  checkToolLatestVersion,
  detectTools,
  openInVscode,
  revealInFinder,
  updateToolCli,
} from '../src/core/system.js'
import {
  getOfficialSettingsSources,
  updateOfficialSettingsSources,
} from '../src/core/officialSettings.js'
import {
  listUnifiedSkills,
  readUnifiedMcp,
  saveUnifiedMcp,
  syncUnified,
} from '../src/core/unified.js'

// registerIpcHandlers 注册 Electron IPC handler。
// ipcMain 参数存储 Electron ipcMain，deps 参数保留 shell 等可注入依赖以便测试扩展。
export function registerIpcHandlers(ipcMain, deps = {}) {
  // injectedDeps 存储测试或主进程注入的 Electron shell 等依赖。
  const injectedDeps = deps
  // decryptQuotaSecret 使用系统安全存储解密额度凭据，仅供主进程额度请求使用。
  // encryptedSecret 参数存储 Base64 编码后的系统密文。
  const decryptQuotaSecret = (encryptedSecret) => {
    if (!injectedDeps.safeStorage?.isEncryptionAvailable()) {
      throw new Error('当前系统安全存储不可用，无法读取 API Key')
    }
    return injectedDeps.safeStorage.decryptString(
      Buffer.from(encryptedSecret, 'base64')
    )
  }

  ipcMain.handle(IPC.GET_PREFERENCES, () => getPreferences())
  ipcMain.handle(IPC.SAVE_PREFERENCES, (_event, prefs) =>
    savePreferences(prefs)
  )
  ipcMain.handle(IPC.GET_OFFICIAL_SETTINGS_SOURCES, () =>
    getOfficialSettingsSources()
  )
  ipcMain.handle(IPC.UPDATE_OFFICIAL_SETTINGS_SOURCES, () =>
    updateOfficialSettingsSources()
  )

  ipcMain.handle(IPC.READ_CONFIG_FILE, (_event, payload) =>
    readConfigFile(payload)
  )
  ipcMain.handle(IPC.SAVE_CONFIG_FILE, (_event, payload) =>
    saveConfigFile(payload.path, payload.content, payload.format)
  )
  ipcMain.handle(IPC.LIST_DIR, (_event, path) => listDir(path))
  ipcMain.handle(IPC.LIST_CLAUDE_OUTPUT_STYLES, (_event, claudeHome) =>
    listClaudeOutputStyles(claudeHome)
  )
  ipcMain.handle(IPC.CREATE_CLAUDE_OUTPUT_STYLE, (_event, payload) =>
    createClaudeOutputStyle(payload.claudeHome, payload.name)
  )

  ipcMain.handle(IPC.LIST_CLAUDE_PLUGINS, (_event, claudeHome) =>
    listClaudePlugins(claudeHome)
  )
  ipcMain.handle(IPC.LIST_CLAUDE_MARKETPLACES, (_event, claudeHome) =>
    listClaudeMarketplaces(claudeHome)
  )
  ipcMain.handle(IPC.LIST_CODEX_MARKETPLACES, (_event, codexHome) =>
    listCodexMarketplaces(codexHome)
  )
  ipcMain.handle(IPC.CHECK_CLAUDE_PLUGIN_UPDATES, (_event, claudeHome) =>
    checkClaudePluginUpdates(claudeHome)
  )
  ipcMain.handle(IPC.CHECK_CODEX_PLUGIN_UPDATES, (_event, codexHome) =>
    checkCodexPluginUpdates(codexHome)
  )
  ipcMain.handle(IPC.UPDATE_CLAUDE_PLUGIN, (_event, payload) =>
    updateClaudePlugin(payload.pluginName, payload.scope)
  )
  ipcMain.handle(IPC.UPDATE_CLAUDE_MARKETPLACE, (_event, payload) =>
    updateClaudeMarketplace(payload.marketplaceName, payload.toolHome)
  )
  ipcMain.handle(IPC.UPDATE_CODEX_PLUGIN, (_event, payload) =>
    updateCodexPlugin(payload.pluginId, payload.marketplace)
  )
  ipcMain.handle(IPC.UPDATE_CODEX_MARKETPLACE, (_event, payload) =>
    updateCodexMarketplace(payload.marketplaceName, payload.toolHome)
  )
  ipcMain.handle(IPC.SET_PLUGIN_ENABLED, (_event, payload) => {
    if (payload.tool === 'claude') {
      // Claude 插件启停优先使用官方 CLI，确保 scope 与 Claude 自身配置语义一致。
      return setClaudePluginEnabled(
        payload.pluginId,
        payload.scope,
        payload.enabled,
        payload.claudeHome
      )
    }
    return setCodexPluginEnabled(
      payload.codexHome,
      payload.pluginId,
      payload.enabled
    )
  })
  ipcMain.handle(IPC.LIST_PLUGIN_GIT_BRANCHES, (_event, payload) =>
    listPluginGitBranches(payload)
  )
  ipcMain.handle(IPC.SWITCH_PLUGIN_GIT_BRANCH, (_event, payload) =>
    switchPluginGitBranch(payload)
  )
  ipcMain.handle(IPC.LIST_QUOTA_ACCOUNTS, () => listQuotaAccounts())
  ipcMain.handle(IPC.SAVE_QUOTA_ACCOUNT, (_event, payload) =>
    saveQuotaAccount(payload, {
      encryptSecret: (secret) => {
        if (!injectedDeps.safeStorage?.isEncryptionAvailable()) {
          throw new Error('当前系统安全存储不可用，无法安全保存 API Key')
        }
        return injectedDeps.safeStorage.encryptString(secret).toString('base64')
      },
    })
  )
  ipcMain.handle(IPC.DELETE_QUOTA_ACCOUNT, (_event, accountId) =>
    deleteQuotaAccount(accountId)
  )
  ipcMain.handle(IPC.QUERY_QUOTA_ACCOUNT, (_event, accountId) =>
    queryQuotaAccount(accountId, {
      decryptSecret: decryptQuotaSecret,
    })
  )
  ipcMain.handle(IPC.DISCOVER_QUOTA_MODELS, (_event, payload) =>
    discoverQuotaModels(payload, { decryptSecret: decryptQuotaSecret })
  )

  ipcMain.handle(IPC.LIST_SKILLS, (_event, payload) =>
    listSkills(payload.claudeHome, payload.codexHome)
  )
  ipcMain.handle(IPC.CHECK_TOOL_LATEST_VERSION, (_event, toolId) =>
    checkToolLatestVersion(toolId)
  )
  ipcMain.handle(IPC.UPDATE_TOOL_CLI, (_event, toolId) => updateToolCli(toolId))
  ipcMain.handle(IPC.DETECT_TOOLS, () => detectTools())
  ipcMain.handle(IPC.OPEN_IN_VSCODE, (_event, payload) =>
    openInVscode(payload.vscodePath, payload.target)
  )
  ipcMain.handle(IPC.REVEAL_IN_FINDER, (_event, target) =>
    revealInFinder(target)
  )

  // 统一配置：读取/保存中立 MCP 源、列出统一 Skills、一键同步到两端。
  ipcMain.handle(IPC.GET_UNIFIED_MCP, () => readUnifiedMcp())
  ipcMain.handle(IPC.SAVE_UNIFIED_MCP, (_event, servers) =>
    saveUnifiedMcp(servers)
  )
  ipcMain.handle(IPC.LIST_UNIFIED_SKILLS, () => listUnifiedSkills())
  ipcMain.handle(IPC.SYNC_UNIFIED, (_event, options) => syncUnified(options))
  ipcMain.handle(IPC.OPEN_EXTERNAL_URL, (_event, url) => {
    // parsedUrl 存储解析后的外链地址，用于限制主进程只打开 HTTPS 页面。
    const parsedUrl = new URL(url)
    if (parsedUrl.protocol !== 'https:') {
      // 非 HTTPS 协议可能触发本机应用或危险 URL scheme，不允许从渲染进程打开。
      throw new Error('仅支持打开 HTTPS 网址')
    }
    return injectedDeps.shell.openExternal(parsedUrl.toString())
  })
}
