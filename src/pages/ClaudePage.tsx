// Claude Code 配置页：可视化展示并编辑 ~/.claude 下的各类配置文件
import { CLAUDE_CONFIG_FILES } from "../config";
import { CLAUDE_SETTINGS_SCHEMA } from "../config/claudeSettingsSchema";
import { PageHeader, PageShell } from "../components/ui";
import ConfigEditor from "../components/ConfigEditor";
import VisualConfigEditor from "../components/VisualConfigEditor";

// Claude Code 配置页组件
export default function ClaudePage() {
  return (
    <PageShell>
      <PageHeader
        title="Claude Code"
        subtitle="可视化管理 ~/.claude 下的核心配置文件"
      />
      {/* 逐个渲染配置文件编辑器 */}
      <div className="space-y-4">
        {CLAUDE_CONFIG_FILES.map((spec) =>
          spec.id === "claude-settings" ? (
            <VisualConfigEditor key={spec.id} spec={spec} schema={CLAUDE_SETTINGS_SCHEMA} />
          ) : (
            <ConfigEditor key={spec.id} spec={spec} />
          )
        )}
      </div>
    </PageShell>
  );
}
