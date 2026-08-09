// Hooks 能力页：集中管理 Claude 与 Codex 的 Hook 配置入口。
import { CLAUDE_CONFIG_FILES, CODEX_CONFIG_FILES } from '../config'
import { CLAUDE_SETTINGS_SCHEMA } from '../config/claudeSettingsSchema'
import { CODEX_CONFIG_SCHEMA } from '../config/codexConfigSchema'
import CapabilityConfigEditor from '../components/CapabilityConfigEditor'
import ConfigEditor from '../components/ConfigEditor'
import { PageHeader, PageShell } from '../components/ui'

// HooksPageProps 描述 Hooks 页面当前所属的一级工具。
interface HooksPageProps {
  tool?: 'claude' | 'codex' // tool 存储需要展示 Hooks 配置的工具作用域，省略时保留汇总视图兼容性。
}

// CLAUDE_HOOK_FIELD_PATHS 存储 Claude settings 中与 Hooks 能力相关的字段路径。
const CLAUDE_HOOK_FIELD_PATHS = [
  'hooks',
  'disableAllHooks',
  'allowManagedHooksOnly',
  'allowedHttpHookUrls',
  'httpHookAllowedEnvVars',
]

// CODEX_HOOK_FIELD_PATHS 存储 Codex config.toml 中与 Hooks 能力相关的字段路径。
const CODEX_HOOK_FIELD_PATHS = ['hooks']

// findConfigSpec 根据配置文件 id 查找对应描述。
// files 参数存储候选配置文件列表，id 参数存储需要查找的配置文件标识。
function findConfigSpec(files: typeof CLAUDE_CONFIG_FILES, id: string) {
  // spec 存储命中的配置文件描述。
  const spec = files.find((file) => file.id === id)

  if (!spec) {
    throw new Error(`未找到配置文件: ${id}`)
  }

  return spec
}

// HooksPage 渲染 Hooks 跨工具能力页。
export default function HooksPage({ tool }: HooksPageProps) {
  // claudeSettingsSpec 存储 Claude settings.json 的配置文件描述。
  const claudeSettingsSpec = findConfigSpec(
    CLAUDE_CONFIG_FILES,
    'claude-settings'
  )
  // codexConfigSpec 存储 Codex config.toml 的配置文件描述。
  const codexConfigSpec = findConfigSpec(CODEX_CONFIG_FILES, 'codex-config')
  // codexHooksSpec 存储 Codex hooks.json 的配置文件描述。
  const codexHooksSpec = findConfigSpec(CODEX_CONFIG_FILES, 'codex-hooks')

  return (
    <PageShell>
      <PageHeader
        title={
          tool
            ? `${tool === 'codex' ? 'Codex' : 'Claude Code'} · Hooks`
            : 'Hooks'
        }
        subtitle={
          tool
            ? `管理 ${tool === 'codex' ? 'Codex' : 'Claude Code'} 的生命周期 Hook 配置`
            : '集中管理 Claude 与 Codex 的生命周期 Hook 配置'
        }
      />
      <div className="page-module-stack">
        {tool !== 'codex' && (
          <CapabilityConfigEditor
            description="Claude settings.json 中的 Hooks、禁用开关和托管 Hook allowlist。"
            fieldPaths={CLAUDE_HOOK_FIELD_PATHS}
            schema={CLAUDE_SETTINGS_SCHEMA}
            spec={claudeSettingsSpec}
            title="Claude Hooks"
          />
        )}
        {tool !== 'claude' && (
          <CapabilityConfigEditor
            description="Codex config.toml 中的生命周期 hooks 配置。"
            fieldPaths={CODEX_HOOK_FIELD_PATHS}
            schema={CODEX_CONFIG_SCHEMA}
            spec={codexConfigSpec}
            title="Codex Hooks"
          />
        )}
        {tool !== 'claude' && <ConfigEditor spec={codexHooksSpec} />}
      </div>
    </PageShell>
  )
}
