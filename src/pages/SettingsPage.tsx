// 应用设置页：配置主题、VSCode 路径、Claude/Codex 配置目录，持久化到 ~/.visualAiCoding
import { useState, useEffect } from "react";
import { useAppStore } from "../store";
import { PageHeader, Card, Button, SectionTitle } from "../components/ui";

// 主题选项定义：值与展示文案
const THEME_OPTIONS = [
  { value: "light", label: "浅色" },
  { value: "dark", label: "深色" },
  { value: "system", label: "跟随系统" },
];

// 设置内容属性：控制内容在页面或抽屉中的附加入口。
interface SettingsContentProps {
  // onOpenDashboard 为点击概览入口时触发的回调，抽屉场景用于切换页面并关闭抽屉。
  onOpenDashboard?: () => void;
}

// 应用设置内容组件：复用主题、路径与保存设置，供页面和右侧抽屉共同使用。
export function SettingsContent({ onOpenDashboard }: SettingsContentProps) {
  // prefs 为应用偏好
  const prefs = useAppStore((s) => s.prefs);
  // updatePrefs 用于更新并持久化偏好
  const updatePrefs = useAppStore((s) => s.updatePrefs);
  // refreshTools 用于路径变更后重新探测工具
  const refreshTools = useAppStore((s) => s.refreshTools);

  // vscodePath 为 VSCode CLI 路径草稿
  const [vscodePath, setVscodePath] = useState("");
  // claudeHome 为 Claude 配置目录草稿
  const [claudeHome, setClaudeHome] = useState("");
  // codexHome 为 Codex 配置目录草稿
  const [codexHome, setCodexHome] = useState("");
  // saved 标记最近一次保存成功，用于短暂提示
  const [saved, setSaved] = useState(false);

  // 偏好加载后同步到本地草稿
  useEffect(() => {
    if (prefs) {
      setVscodePath(prefs.vscode_path);
      setClaudeHome(prefs.claude_home);
      setCodexHome(prefs.codex_home);
    }
  }, [prefs]);

  // 保存路径类设置并刷新工具探测
  const handleSavePaths = async () => {
    await updatePrefs({
      vscode_path: vscodePath,
      claude_home: claudeHome,
      codex_home: codexHome,
    });
    await refreshTools();
    setSaved(true);
    // 2 秒后清除已保存提示
    setTimeout(() => setSaved(false), 2000);
  };

  // 当前主题模式
  const theme = prefs?.theme || "system";

  return (
    <div className="space-y-4">
      {/* 概览入口：主导航移除概览后，抽屉提供返回 Dashboard 的入口。 */}
      {onOpenDashboard && (
        <Card>
          <SectionTitle>导航</SectionTitle>
          <Button onClick={onOpenDashboard} variant="default" className="w-full justify-start">
            概览
          </Button>
        </Card>
      )}

      {/* 主题设置 */}
      <Card>
        <SectionTitle>主题</SectionTitle>
        <div className="flex gap-2">
          {THEME_OPTIONS.map((opt) => (
            <Button
              key={opt.value}
              onClick={() => updatePrefs({ theme: opt.value })}
              variant={theme === opt.value ? "primary" : "default"}
            >
              {opt.label}
            </Button>
          ))}
        </div>
      </Card>

      {/* 路径设置 */}
      <Card>
        <SectionTitle>路径配置</SectionTitle>
        <div className="space-y-3">
          {/* VSCode CLI 路径 */}
          <div>
            <label htmlFor="settings-vscode-path" className="mb-1 block text-xs text-text-muted">
              VSCode CLI 路径（默认 code）
            </label>
            <input
              id="settings-vscode-path"
              value={vscodePath}
              onChange={(e) => setVscodePath(e.target.value)}
              spellCheck={false}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-main outline-none focus:border-accent"
              placeholder="code 或 /usr/local/bin/code"
            />
          </div>
          {/* Claude 配置目录 */}
          <div>
            <label htmlFor="settings-claude-home" className="mb-1 block text-xs text-text-muted">
              Claude 配置目录
            </label>
            <input
              id="settings-claude-home"
              value={claudeHome}
              onChange={(e) => setClaudeHome(e.target.value)}
              spellCheck={false}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm font-mono text-text-main outline-none focus:border-accent"
              placeholder="~/.claude"
            />
          </div>
          {/* Codex 配置目录 */}
          <div>
            <label htmlFor="settings-codex-home" className="mb-1 block text-xs text-text-muted">
              Codex 配置目录
            </label>
            <input
              id="settings-codex-home"
              value={codexHome}
              onChange={(e) => setCodexHome(e.target.value)}
              spellCheck={false}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm font-mono text-text-main outline-none focus:border-accent"
              placeholder="~/.codex"
            />
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={handleSavePaths} variant="primary">
              保存
            </Button>
            {/* 保存成功短暂提示 */}
            {saved && <span className="text-xs text-green-500">已保存</span>}
          </div>
        </div>
      </Card>
    </div>
  );
}

// 应用设置页组件：保留独立设置页兼容历史 last_active_tab=settings。
export default function SettingsPage() {
  return (
    <div className="p-6">
      <PageHeader
        title="应用设置"
        subtitle="偏好持久化到 ~/.visualAiCoding/preferences.json"
      />

      <SettingsContent />
    </div>
  );
}
