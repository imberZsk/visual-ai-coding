// Codex 配置页：可视化展示并编辑 ~/.codex 下的各类配置文件
import { CODEX_CONFIG_FILES } from '../config'
import { CODEX_CONFIG_SCHEMA } from '../config/codexConfigSchema'
import { PageHeader, PageShell } from '../components/ui'
import ConfigEditor from '../components/ConfigEditor'
import VisualConfigEditor from '../components/VisualConfigEditor'

// Codex 配置页组件
export default function CodexPage() {
  return (
    <PageShell>
      <PageHeader
        title="Codex"
        subtitle="可视化管理 ~/.codex 下的核心配置文件（CLI 与 App 共用）"
      />
      {/* 逐个渲染配置文件编辑器 */}
      <div className="page-module-stack">
        {CODEX_CONFIG_FILES.map((spec) =>
          spec.id === 'codex-config' ? (
            <VisualConfigEditor
              key={spec.id}
              spec={spec}
              schema={CODEX_CONFIG_SCHEMA}
            />
          ) : (
            <ConfigEditor key={spec.id} spec={spec} />
          )
        )}
      </div>
    </PageShell>
  )
}
