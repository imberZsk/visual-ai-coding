// 应用设置页：配置主题、VSCode 路径、Claude/Codex 配置目录，持久化到 ~/.visualAiCoding
import { Alert, Empty, Input, Segmented, Spin } from "antd";
import { useState, useEffect } from "react";
import { useAppStore } from "../store";
import { PageHeader, Card, Button, SectionTitle, PageShell } from "../components/ui";
import { DashboardContent } from "./Dashboard";
import { getOfficialSettingsSources, updateOfficialSettingsSources } from "../api";
import { CLAUDE_SETTINGS_SCHEMA } from "../config/claudeSettingsSchema";
import { CODEX_CONFIG_SCHEMA } from "../config/codexConfigSchema";
import type { OfficialSettingsSource, OfficialSettingsSyncResult } from "../types";

// 主题选项定义：值与展示文案
const THEME_OPTIONS = [
  { value: "light", label: "浅色" },
  { value: "dark", label: "深色" },
  { value: "system", label: "跟随系统" },
];

// SCHEMA_FIELD_PATHS 存储当前应用内置可视化 schema 已覆盖的字段路径，供官方来源覆盖率计算。
const SCHEMA_FIELD_PATHS: Record<string, Set<string>> = {
  "claude-settings": new Set(
    CLAUDE_SETTINGS_SCHEMA.groups.flatMap((group) =>
      group.fields.map((field) => field.path)
    )
  ),
  "codex-config": new Set(
    CODEX_CONFIG_SCHEMA.groups.flatMap((group) => group.fields.map((field) => field.path))
  ),
};

// OfficialSourceSummary 描述单个官方来源与当前内置 schema 的覆盖关系。
interface OfficialSourceSummary {
  coveredCount: number; // coveredCount 存储官方字段中已被当前可视化 schema 覆盖的数量。
  missingFields: string[]; // missingFields 存储官方已有但当前 schema 未覆盖的字段路径。
}

// summarizeOfficialSource 计算官方来源字段相对当前 schema 的覆盖情况。
// source 参数存储单个官方来源及其字段缓存。
function summarizeOfficialSource(source: OfficialSettingsSource): OfficialSourceSummary {
  // schemaPaths 存储当前来源对应的内置 schema 字段集合。
  const schemaPaths = SCHEMA_FIELD_PATHS[source.id] ?? new Set<string>();
  // officialPaths 存储官方来源字段路径列表。
  const officialPaths = source.fields.map((field) => field.path);
  // missingFields 存储官方字段中尚未被 schema 覆盖的字段路径。
  const missingFields = officialPaths.filter((path) => !schemaPaths.has(path));

  return {
    coveredCount: officialPaths.length - missingFields.length,
    missingFields,
  };
}

// 应用设置内容组件：复用主题、路径与保存设置，供页面和右侧抽屉共同使用。
export function SettingsContent() {
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
  // savingPaths 标记路径配置是否正在保存并刷新工具探测。
  const [savingPaths, setSavingPaths] = useState(false);
  // pathError 存储路径配置保存或刷新工具探测失败时的错误提示。
  const [pathError, setPathError] = useState("");
  // officialSettings 存储官方设置来源缓存与同步诊断。
  const [officialSettings, setOfficialSettings] = useState<OfficialSettingsSyncResult | null>(null);
  // officialLoading 标记官方设置来源是否正在读取或同步。
  const [officialLoading, setOfficialLoading] = useState(false);
  // officialError 存储官方设置来源读取或同步失败提示。
  const [officialError, setOfficialError] = useState("");

  // 偏好加载后同步到本地草稿
  useEffect(() => {
    if (prefs) {
      setVscodePath(prefs.vscode_path);
      setClaudeHome(prefs.claude_home);
      setCodexHome(prefs.codex_home);
    }
  }, [prefs]);

  // 设置页挂载时读取已缓存的官方设置来源。
  useEffect(() => {
    // cancelled 标记组件是否已经卸载，避免异步返回后更新已卸载组件。
    let cancelled = false;

    // loadOfficialSettings 负责读取本地官方设置来源缓存。
    async function loadOfficialSettings() {
      setOfficialLoading(true);
      setOfficialError("");

      try {
        // result 存储后端返回的官方设置来源缓存。
        const result = await getOfficialSettingsSources();

        if (!cancelled) {
          setOfficialSettings(result);
        }
      } catch (error) {
        if (!cancelled) {
          setOfficialError(String(error));
        }
      } finally {
        if (!cancelled) {
          setOfficialLoading(false);
        }
      }
    }

    void loadOfficialSettings();

    return () => {
      cancelled = true;
    };
  }, []);

  // 保存路径类设置并刷新工具探测
  const handleSavePaths = async () => {
    if (savingPaths) {
      return;
    }

    setSavingPaths(true);
    setPathError("");
    setSaved(false);

    try {
      await updatePrefs({
        vscode_path: vscodePath,
        claude_home: claudeHome,
        codex_home: codexHome,
      });
      await refreshTools();
      setSaved(true);
      // 2 秒后清除已保存提示
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      setPathError(String(error));
    } finally {
      setSavingPaths(false);
    }
  };

  // handleUpdateOfficialSettings 负责从官方文档同步最新配置字段元数据。
  const handleUpdateOfficialSettings = async () => {
    setOfficialLoading(true);
    setOfficialError("");

    try {
      // result 存储本次同步官方来源后的最新缓存。
      const result = await updateOfficialSettingsSources();
      setOfficialSettings(result);
    } catch (error) {
      setOfficialError(String(error));
    } finally {
      setOfficialLoading(false);
    }
  };

  // 当前主题模式
  const theme = prefs?.theme || "system";

  return (
    <div className="space-y-4">
      {/* 概览内容：设置抽屉里直接查看工具状态，不再切换到单独概览路由。 */}
      <DashboardContent compact />

      {/* 主题设置 */}
      <Card>
        <SectionTitle>主题</SectionTitle>
        <Segmented
          options={THEME_OPTIONS}
          value={theme}
          onChange={(nextTheme) => updatePrefs({ theme: String(nextTheme) })}
        />
      </Card>

      {/* 官方设置来源 */}
      <Card>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <SectionTitle>官方设置来源</SectionTitle>
            <p className="text-xs text-text-muted">
              同步官方配置字段后，可对照当前可视化 schema 的覆盖情况。
            </p>
          </div>
          <Button onClick={handleUpdateOfficialSettings} variant="default" loading={officialLoading}>
            更新官方设置
          </Button>
        </div>
        <div className="space-y-3">
          {(officialSettings?.sources ?? []).map((source) => {
            // summary 存储当前官方来源相对内置 schema 的覆盖统计。
            const summary = summarizeOfficialSource(source);
            // cachedAt 存储该来源最近同步时间的展示文本。
            const cachedAt = source.cached_at || "未同步";
            // missingPreview 存储最多展示的未覆盖字段，避免设置页被长列表撑开。
            const missingPreview = summary.missingFields.slice(0, 12);
            // hiddenMissingCount 存储未在预览里展示的剩余未覆盖字段数量。
            const hiddenMissingCount = Math.max(summary.missingFields.length - missingPreview.length, 0);

            return (
              <div
                key={source.id}
                data-testid={`official-source-${source.id}`}
                className="rounded-lg border border-border bg-surface p-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-text-main">{source.title}</div>
                    <div className="mt-1 text-xs text-text-muted">{source.description}</div>
                    <div className="mt-1 break-all font-mono text-xs text-text-muted">
                      {source.url}
                    </div>
                  </div>
                  <span className="shrink-0 rounded-md bg-border/60 px-2 py-0.5 text-xs text-text-muted">
                    {cachedAt}
                  </span>
                </div>
                <div className="mt-2 text-xs text-text-muted">
                  官方字段 {source.fields.length} / 已覆盖 {summary.coveredCount} / 未覆盖{" "}
                  {summary.missingFields.length}
                </div>
                {missingPreview.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {missingPreview.map((path) => (
                      <span
                        key={path}
                        className="rounded-md bg-border/50 px-1.5 py-0.5 font-mono text-xs text-text-muted"
                      >
                        {path}
                      </span>
                    ))}
                    {hiddenMissingCount > 0 && (
                      <span className="rounded-md bg-border/50 px-1.5 py-0.5 text-xs text-text-muted">
                        另有 {hiddenMissingCount} 项
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {!officialLoading && officialSettings && officialSettings.sources.length === 0 && (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无官方设置来源" />
          )}
          {!officialSettings && officialLoading && (
            <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-border py-6 text-sm text-text-muted">
              <Spin size="small" />
              <span>正在读取官方设置来源…</span>
            </div>
          )}
          {officialSettings?.diagnostics && (
            <Alert message={officialSettings.diagnostics} showIcon type="warning" />
          )}
          {officialError && <Alert message={officialError} showIcon type="error" />}
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
            <Input
              id="settings-vscode-path"
              value={vscodePath}
              onChange={(e) => setVscodePath(e.target.value)}
              spellCheck={false}
              placeholder="code 或 /usr/local/bin/code"
            />
          </div>
          {/* Claude 配置目录 */}
          <div>
            <label htmlFor="settings-claude-home" className="mb-1 block text-xs text-text-muted">
              Claude 配置目录
            </label>
            <Input
              id="settings-claude-home"
              value={claudeHome}
              onChange={(e) => setClaudeHome(e.target.value)}
              spellCheck={false}
              className="font-mono"
              placeholder="~/.claude"
            />
          </div>
          {/* Codex 配置目录 */}
          <div>
            <label htmlFor="settings-codex-home" className="mb-1 block text-xs text-text-muted">
              Codex 配置目录
            </label>
            <Input
              id="settings-codex-home"
              value={codexHome}
              onChange={(e) => setCodexHome(e.target.value)}
              spellCheck={false}
              className="font-mono"
              placeholder="~/.codex"
            />
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={handleSavePaths} variant="primary" loading={savingPaths}>
              保存
            </Button>
            {/* 保存成功短暂提示 */}
            {saved && <Alert className="py-1" message="已保存" showIcon type="success" />}
            {pathError && <Alert className="py-1" message={pathError} showIcon type="error" />}
          </div>
        </div>
      </Card>
    </div>
  );
}

// 应用设置页组件：保留独立设置页兼容历史 last_active_tab=settings。
export default function SettingsPage() {
  return (
    <PageShell>
      <PageHeader
        title="应用设置"
        subtitle="偏好持久化到 ~/.visualAiCoding/preferences.json"
      />

      <SettingsContent />
    </PageShell>
  );
}
