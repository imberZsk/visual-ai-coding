// IPC handler 注册：把 src/core 的纯业务能力暴露给渲染进程。
import { IPC } from "./ipcChannels.js";
import { getPreferences, savePreferences } from "../src/core/preferences.js";
import {
  createClaudeOutputStyle,
  listClaudeOutputStyles,
  listDir,
  readConfigFile,
  saveConfigFile,
} from "../src/core/settings.js";
import {
  checkClaudePluginUpdates,
  checkCodexPluginUpdates,
  listClaudeMarketplaces,
  listClaudePlugins,
  setClaudePluginEnabled,
  setCodexPluginEnabled,
  updateClaudeMarketplace,
  updateClaudePlugin,
  updateCodexMarketplace,
  updateCodexPlugin,
} from "../src/core/plugins.js";
import { listSkills } from "../src/core/skills.js";
import {
  checkToolLatestVersion,
  detectTools,
  openInVscode,
  revealInFinder,
  updateToolCli,
} from "../src/core/system.js";
import {
  getOfficialSettingsSources,
  updateOfficialSettingsSources,
} from "../src/core/officialSettings.js";

// registerIpcHandlers 注册 Electron IPC handler。
// ipcMain 参数存储 Electron ipcMain，deps 参数保留 shell 等可注入依赖以便测试扩展。
export function registerIpcHandlers(ipcMain, deps = {}) {
  // injectedDeps 存储测试或主进程注入的依赖；当前核心逻辑不依赖它，但保留接口与 visual-worktree 一致。
  const injectedDeps = deps;
  void injectedDeps;

  ipcMain.handle(IPC.GET_PREFERENCES, () => getPreferences());
  ipcMain.handle(IPC.SAVE_PREFERENCES, (_event, prefs) => savePreferences(prefs));
  ipcMain.handle(IPC.GET_OFFICIAL_SETTINGS_SOURCES, () => getOfficialSettingsSources());
  ipcMain.handle(IPC.UPDATE_OFFICIAL_SETTINGS_SOURCES, () => updateOfficialSettingsSources());

  ipcMain.handle(IPC.READ_CONFIG_FILE, (_event, payload) => readConfigFile(payload));
  ipcMain.handle(IPC.SAVE_CONFIG_FILE, (_event, payload) =>
    saveConfigFile(payload.path, payload.content, payload.format),
  );
  ipcMain.handle(IPC.LIST_DIR, (_event, path) => listDir(path));
  ipcMain.handle(IPC.LIST_CLAUDE_OUTPUT_STYLES, (_event, claudeHome) =>
    listClaudeOutputStyles(claudeHome),
  );
  ipcMain.handle(IPC.CREATE_CLAUDE_OUTPUT_STYLE, (_event, payload) =>
    createClaudeOutputStyle(payload.claudeHome, payload.name),
  );

  ipcMain.handle(IPC.LIST_CLAUDE_PLUGINS, (_event, claudeHome) =>
    listClaudePlugins(claudeHome),
  );
  ipcMain.handle(IPC.LIST_CLAUDE_MARKETPLACES, (_event, claudeHome) =>
    listClaudeMarketplaces(claudeHome),
  );
  ipcMain.handle(IPC.CHECK_CLAUDE_PLUGIN_UPDATES, (_event, claudeHome) =>
    checkClaudePluginUpdates(claudeHome),
  );
  ipcMain.handle(IPC.CHECK_CODEX_PLUGIN_UPDATES, (_event, codexHome) =>
    checkCodexPluginUpdates(codexHome),
  );
  ipcMain.handle(IPC.UPDATE_CLAUDE_PLUGIN, (_event, payload) =>
    updateClaudePlugin(payload.pluginName, payload.scope),
  );
  ipcMain.handle(IPC.UPDATE_CLAUDE_MARKETPLACE, (_event, marketplaceName) =>
    updateClaudeMarketplace(marketplaceName),
  );
  ipcMain.handle(IPC.UPDATE_CODEX_PLUGIN, (_event, payload) =>
    updateCodexPlugin(payload.pluginId, payload.marketplace),
  );
  ipcMain.handle(IPC.UPDATE_CODEX_MARKETPLACE, (_event, marketplaceName) =>
    updateCodexMarketplace(marketplaceName),
  );
  ipcMain.handle(IPC.SET_PLUGIN_ENABLED, (_event, payload) => {
    if (payload.tool === "claude") {
      // Claude 插件启停优先使用官方 CLI，确保 scope 与 Claude 自身配置语义一致。
      return setClaudePluginEnabled(
        payload.pluginId,
        payload.scope,
        payload.enabled,
        payload.claudeHome,
      );
    }
    return setCodexPluginEnabled(payload.codexHome, payload.pluginId, payload.enabled);
  });

  ipcMain.handle(IPC.LIST_SKILLS, (_event, payload) =>
    listSkills(payload.claudeHome, payload.codexHome),
  );
  ipcMain.handle(IPC.CHECK_TOOL_LATEST_VERSION, (_event, toolId) =>
    checkToolLatestVersion(toolId),
  );
  ipcMain.handle(IPC.UPDATE_TOOL_CLI, (_event, toolId) => updateToolCli(toolId));
  ipcMain.handle(IPC.DETECT_TOOLS, () => detectTools());
  ipcMain.handle(IPC.OPEN_IN_VSCODE, (_event, payload) =>
    openInVscode(payload.vscodePath, payload.target),
  );
  ipcMain.handle(IPC.REVEAL_IN_FINDER, (_event, target) => revealInFinder(target));
}
