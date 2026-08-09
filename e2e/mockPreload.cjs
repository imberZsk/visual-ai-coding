// Playwright 专用 preload：提供确定性测试数据，隔离用户真实配置、插件和凭据。
const { contextBridge } = require('electron')

// preferences 存储测试窗口内可持久更新的应用偏好。
let preferences = {
  theme: 'dark',
  active_ai_tool: 'codex',
  vscode_path: 'code',
  claude_home: '/tmp/e2e-claude',
  codex_home: '/tmp/e2e-codex',
  last_active_tab: 'dashboard',
  hidden_visual_config_fields: {},
}

// unifiedServers 存储统一 MCP 编辑器当前已保存的数据。
let unifiedServers = [
  { name: 'context7', command: 'npx', args: ['-y', '@context7/mcp'], env: {} },
]

// quotaAccounts 存储额度页展示的脱敏测试账户。
const quotaAccounts = [
  {
    id: 'team-openai',
    name: '团队 OpenAI',
    provider: 'openai',
    models: ['gpt-5'],
    base_url: 'https://api.openai.com/v1',
    quota_path: 'account/quota',
    endpoint: '',
    quota_limit: 100,
    unit: 'USD',
    has_api_key: true,
  },
]

// configFormat 根据文件路径返回编辑器使用的配置格式。
function configFormat(path) {
  if (path.endsWith('.json')) return 'json'
  if (path.endsWith('.toml')) return 'toml'
  return 'text'
}

// api 存储渲染进程 E2E 所需的完整安全桥替身。
const api = {
  checkAppUpdate: async () => ({
    status: 'not-available',
    currentVersion: '0.17.0',
  }),
  downloadAppUpdate: async () => undefined,
  installAppUpdate: async () => undefined,
  getPreferences: async () => ({ ...preferences }),
  savePreferences: async (next) => {
    preferences = { ...next }
  },
  getOfficialSettingsSources: async () => ({ sources: [], diagnostics: '' }),
  updateOfficialSettingsSources: async () => ({ sources: [], diagnostics: '' }),
  readConfigFile: async ({ id, title, path, readonly }) => ({
    id,
    title,
    path,
    readonly,
    format: configFormat(path),
    content: path.endsWith('.toml')
      ? 'model = "gpt-5"\n'
      : path.endsWith('.json')
        ? '{}\n'
        : '# E2E instructions\n',
    exists: true,
  }),
  saveConfigFile: async () => undefined,
  listDir: async () => [],
  listClaudeOutputStyles: async () => ({
    directory: '/tmp/e2e-claude/output-styles',
    exists: true,
    styles: [],
    diagnostics: '',
  }),
  createClaudeOutputStyle: async ({ name }) => ({
    name,
    kind: 'custom',
    path: `/tmp/${name}.md`,
    description: '',
  }),
  listClaudePlugins: async () => [
    {
      name: 'review-tools',
      marketplace: 'official',
      version: '1.0.0',
      scope: 'user',
      install_path: '/tmp/review-tools',
      installed_at: '',
      last_updated: '',
      git_commit_sha: '',
    },
  ],
  listClaudeMarketplaces: async () => [
    {
      name: 'official',
      source_type: 'git',
      source: 'https://example.test/repo',
      install_location: '/tmp/official',
      last_updated: '',
    },
  ],
  listCodexMarketplaces: async () => [
    {
      name: 'openai-bundled',
      source_type: 'local',
      source: '/tmp/e2e-codex/bundled-marketplace',
      install_location: '/tmp/e2e-codex/openai-bundled',
      last_updated: '',
    },
  ],
  checkClaudePluginUpdates: async () => ({
    tool: 'claude',
    plugins: [
      {
        id: 'review-tools@official',
        name: 'review-tools',
        marketplace: 'official',
        current_version: '1.0.0',
        available_version: '1.0.0',
        scope: 'user',
        enabled: true,
        install_path: '/tmp/review-tools',
        last_updated: '',
        update_status: 'same',
      },
    ],
    raw_output: '',
    diagnostics: '',
  }),
  checkCodexPluginUpdates: async () => ({
    tool: 'codex',
    plugins: [],
    raw_output: '',
    diagnostics: '',
  }),
  updateClaudePlugin: async () => 'updated',
  updateClaudeMarketplace: async () => 'updated',
  updateCodexPlugin: async () => 'updated',
  updateCodexMarketplace: async () => 'updated',
  setPluginEnabled: async () => 'updated',
  listPluginGitBranches: async () => ({
    repository_path: '/tmp/plugin',
    current_branch: 'main',
    branches: ['main'],
  }),
  switchPluginGitBranch: async () => ({
    repository_path: '/tmp/plugin',
    current_branch: 'main',
    branches: ['main'],
  }),
  listQuotaAccounts: async () => quotaAccounts,
  saveQuotaAccount: async (input) => ({ ...input, has_api_key: true }),
  deleteQuotaAccount: async () => undefined,
  queryQuotaAccount: async (accountId) => ({
    account_id: accountId,
    checked_at: '2026-07-25T00:00:00.000Z',
    used: 25,
    limit: 100,
    remaining: 75,
    unit: 'USD',
  }),
  discoverQuotaModels: async () => ['gpt-5', 'gpt-5-mini'],
  listSkills: async () => ({
    skills: [
      {
        name: 'review-code',
        description: '检查代码质量',
        source: 'Codex 系统',
        tool: 'codex',
        plugin: '',
        path: '/tmp/review-code/SKILL.md',
      },
      {
        name: 'review-code',
        description: '检查代码质量',
        source: 'Claude 用户',
        tool: 'claude',
        plugin: '',
        path: '/tmp/claude-review-code/SKILL.md',
      },
    ],
    diagnostics: '',
  }),
  checkToolLatestVersion: async (toolId) => ({
    tool_id: toolId,
    package_name: toolId,
    latest_version: '9.9.9',
    release_notes_url: 'https://example.test/releases',
  }),
  updateToolCli: async () => '更新完成',
  detectTools: async () => [
    {
      id: 'claude',
      name: 'Claude Code',
      installed: true,
      version: '1.0.0',
      path: '/usr/local/bin/claude',
    },
    {
      id: 'codex',
      name: 'Codex',
      installed: true,
      version: '1.0.0',
      path: '/usr/local/bin/codex',
    },
  ],
  openInVscode: async () => undefined,
  revealInFinder: async () => undefined,
  openExternalUrl: async () => undefined,
  getUnifiedMcp: async () => ({
    path: '/tmp/unified/mcp.json',
    servers: unifiedServers,
  }),
  saveUnifiedMcp: async (servers) => {
    unifiedServers = servers
    return { path: '/tmp/unified/mcp.json', servers }
  },
  listUnifiedSkills: async () => ({
    dir: '/tmp/unified/skills',
    skills: ['review-code'],
  }),
  syncUnified: async () => ({
    results: [],
    warnings: [],
    syncedAt: '2026-07-25T00:00:00.000Z',
  }),
}

contextBridge.exposeInMainWorld('api', api)
