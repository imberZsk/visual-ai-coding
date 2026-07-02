// preload 安全桥：在隔离上下文中向渲染进程暴露受限 API。
const { contextBridge, ipcRenderer } = require("electron");

// IPC 通道常量；preload 使用 CommonJS，故与 ipcChannels.js 保持同名内联。
const IPC = {
  GET_PREFERENCES: "get-preferences",
  SAVE_PREFERENCES: "save-preferences",
  GET_OFFICIAL_SETTINGS_SOURCES: "get-official-settings-sources",
  UPDATE_OFFICIAL_SETTINGS_SOURCES: "update-official-settings-sources",
  READ_CONFIG_FILE: "read-config-file",
  SAVE_CONFIG_FILE: "save-config-file",
  LIST_DIR: "list-dir",
  LIST_CLAUDE_OUTPUT_STYLES: "list-claude-output-styles",
  CREATE_CLAUDE_OUTPUT_STYLE: "create-claude-output-style",
  LIST_CLAUDE_PLUGINS: "list-claude-plugins",
  LIST_CLAUDE_MARKETPLACES: "list-claude-marketplaces",
  CHECK_CLAUDE_PLUGIN_UPDATES: "check-claude-plugin-updates",
  CHECK_CODEX_PLUGIN_UPDATES: "check-codex-plugin-updates",
  UPDATE_CLAUDE_PLUGIN: "update-claude-plugin",
  UPDATE_CLAUDE_MARKETPLACE: "update-claude-marketplace",
  UPDATE_CODEX_PLUGIN: "update-codex-plugin",
  UPDATE_CODEX_MARKETPLACE: "update-codex-marketplace",
  LIST_SKILLS: "list-skills",
  CHECK_TOOL_LATEST_VERSION: "check-tool-latest-version",
  UPDATE_TOOL_CLI: "update-tool-cli",
  DETECT_TOOLS: "detect-tools",
  OPEN_IN_VSCODE: "open-in-vscode",
  REVEAL_IN_FINDER: "reveal-in-finder",
};

// api 存储暴露给渲染进程的受限调用集合。
const api = {
  // getPreferences 读取应用偏好。
  getPreferences: () => ipcRenderer.invoke(IPC.GET_PREFERENCES),
  // savePreferences 保存应用偏好。
  savePreferences: (prefs) => ipcRenderer.invoke(IPC.SAVE_PREFERENCES, prefs),
  // getOfficialSettingsSources 读取官方设置来源缓存。
  getOfficialSettingsSources: () => ipcRenderer.invoke(IPC.GET_OFFICIAL_SETTINGS_SOURCES),
  // updateOfficialSettingsSources 同步官方设置来源。
  updateOfficialSettingsSources: () => ipcRenderer.invoke(IPC.UPDATE_OFFICIAL_SETTINGS_SOURCES),
  // readConfigFile 读取单个配置文件。
  readConfigFile: (payload) => ipcRenderer.invoke(IPC.READ_CONFIG_FILE, payload),
  // saveConfigFile 保存单个配置文件。
  saveConfigFile: (payload) => ipcRenderer.invoke(IPC.SAVE_CONFIG_FILE, payload),
  // listDir 列出目录条目。
  listDir: (path) => ipcRenderer.invoke(IPC.LIST_DIR, path),
  // listClaudeOutputStyles 扫描 Claude output style。
  listClaudeOutputStyles: (claudeHome) => ipcRenderer.invoke(IPC.LIST_CLAUDE_OUTPUT_STYLES, claudeHome),
  // createClaudeOutputStyle 创建 Claude output style 文件。
  createClaudeOutputStyle: (payload) => ipcRenderer.invoke(IPC.CREATE_CLAUDE_OUTPUT_STYLE, payload),
  // listClaudePlugins 读取 Claude 插件列表。
  listClaudePlugins: (claudeHome) => ipcRenderer.invoke(IPC.LIST_CLAUDE_PLUGINS, claudeHome),
  // listClaudeMarketplaces 读取 Claude marketplace 列表。
  listClaudeMarketplaces: (claudeHome) => ipcRenderer.invoke(IPC.LIST_CLAUDE_MARKETPLACES, claudeHome),
  // checkClaudePluginUpdates 检查 Claude 插件更新。
  checkClaudePluginUpdates: (claudeHome) => ipcRenderer.invoke(IPC.CHECK_CLAUDE_PLUGIN_UPDATES, claudeHome),
  // checkCodexPluginUpdates 检查 Codex 插件更新。
  checkCodexPluginUpdates: (codexHome) => ipcRenderer.invoke(IPC.CHECK_CODEX_PLUGIN_UPDATES, codexHome),
  // updateClaudePlugin 更新 Claude 插件。
  updateClaudePlugin: (payload) => ipcRenderer.invoke(IPC.UPDATE_CLAUDE_PLUGIN, payload),
  // updateClaudeMarketplace 更新 Claude marketplace。
  updateClaudeMarketplace: (marketplaceName) => ipcRenderer.invoke(IPC.UPDATE_CLAUDE_MARKETPLACE, marketplaceName),
  // updateCodexPlugin 更新 Codex 插件。
  updateCodexPlugin: (payload) => ipcRenderer.invoke(IPC.UPDATE_CODEX_PLUGIN, payload),
  // updateCodexMarketplace 更新 Codex marketplace。
  updateCodexMarketplace: (marketplaceName) => ipcRenderer.invoke(IPC.UPDATE_CODEX_MARKETPLACE, marketplaceName),
  // listSkills 扫描 Skill 列表。
  listSkills: (payload) => ipcRenderer.invoke(IPC.LIST_SKILLS, payload),
  // checkToolLatestVersion 查询工具最新版。
  checkToolLatestVersion: (toolId) => ipcRenderer.invoke(IPC.CHECK_TOOL_LATEST_VERSION, toolId),
  // updateToolCli 更新工具 CLI。
  updateToolCli: (toolId) => ipcRenderer.invoke(IPC.UPDATE_TOOL_CLI, toolId),
  // detectTools 探测本机工具。
  detectTools: () => ipcRenderer.invoke(IPC.DETECT_TOOLS),
  // openInVscode 在 VSCode 中打开路径。
  openInVscode: (payload) => ipcRenderer.invoke(IPC.OPEN_IN_VSCODE, payload),
  // revealInFinder 在 Finder 中显示路径。
  revealInFinder: (target) => ipcRenderer.invoke(IPC.REVEAL_IN_FINDER, target),
};

contextBridge.exposeInMainWorld("api", api);
