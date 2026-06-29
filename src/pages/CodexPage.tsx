// Codex 配置页：可视化展示并编辑 ~/.codex 下的各类配置文件
import { CODEX_CONFIG_FILES } from "../config";
import { PageHeader } from "../components/ui";
import ConfigEditor from "../components/ConfigEditor";

// Codex 配置页组件
export default function CodexPage() {
  return (
    <div className="p-6">
      <PageHeader
        title="Codex"
        subtitle="可视化管理 ~/.codex 下的核心配置文件（CLI 与 App 共用）"
      />
      {/* 逐个渲染配置文件编辑器 */}
      <div className="space-y-4">
        {CODEX_CONFIG_FILES.map((spec) => (
          <ConfigEditor key={spec.id} spec={spec} />
        ))}
      </div>
    </div>
  );
}
