// Claude Code 配置页：可视化展示并编辑 ~/.claude 下的各类配置文件
import { CLAUDE_CONFIG_FILES } from "../config";
import { PageHeader } from "../components/ui";
import ConfigEditor from "../components/ConfigEditor";

// Claude Code 配置页组件
export default function ClaudePage() {
  return (
    <div className="p-6">
      <PageHeader
        title="Claude Code"
        subtitle="可视化管理 ~/.claude 下的核心配置文件"
      />
      {/* 逐个渲染配置文件编辑器 */}
      <div className="space-y-4">
        {CLAUDE_CONFIG_FILES.map((spec) => (
          <ConfigEditor key={spec.id} spec={spec} />
        ))}
      </div>
    </div>
  );
}
