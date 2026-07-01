// Skill 清单页：展示当前 Claude / Codex / Agents 可用的 skill 及其用途说明
import { useEffect, useMemo, useState } from "react";
import { listSkills, openInVscode } from "../api";
import { Badge, Button, EmptyState, LoadingIcon, PageHeader } from "../components/ui";
import { useAppStore } from "../store";
import type { SkillInfo, SkillListResult } from "../types";

// INITIAL_SKILL_LOAD_DELAY_MS 存储首次扫描延迟，用于让 tab 切换动画先完成。
const INITIAL_SKILL_LOAD_DELAY_MS = 180;

// VscodeIcon 渲染简化版 VSCode logo，用于 Skill 行的“在 VSCode 中打开”图标按钮。
function VscodeIcon() {
  return (
    <span role="img" aria-label="vscode" className="inline-flex text-base leading-none">
      <svg width="1em" height="1em" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M17.484 0.291l-8.082 7.952L4.18 4.503 0 6.875l5.263 5.125L0 17.126l4.18.372 5.222-3.742 8.082 7.952L24 19.237V4.763L17.484.291zM18 18.582l-6.667-6.582L18 5.418v13.164z" />
      </svg>
    </span>
  );
}

// toolTone 根据 skill 所属工具返回徽章色调。
// tool 为后端返回的工具域标识。
function toolTone(tool: SkillInfo["tool"]): "neutral" | "success" | "warning" | "info" {
  if (tool === "codex") {
    return "info";
  }
  if (tool === "claude") {
    return "warning";
  }
  return "success";
}

// filterSkills 按名称、说明、来源、插件与路径过滤 skill。
// skills 为完整 skill 列表，query 为用户输入的搜索关键词。
function filterSkills(skills: SkillInfo[], query: string): SkillInfo[] {
  // keyword 存储归一化后的搜索关键词。
  const keyword = query.trim().toLowerCase();
  if (!keyword) {
    return skills;
  }

  return skills.filter((skill) => {
    // haystack 存储参与搜索匹配的 skill 文本字段集合。
    const haystack = [
      skill.name,
      skill.description,
      skill.source,
      skill.tool,
      skill.plugin,
      skill.path,
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(keyword);
  });
}

// SkillTable 渲染扁平的 skill 清单表格，避免分组卡片造成嵌套视觉负担。
// skills 为当前需要展示的 skill 列表，vscodePath 为 VSCode CLI 路径。
function SkillTable({
  skills,
  vscodePath,
}: {
  skills: SkillInfo[]; // skills 存储当前需要展示的 skill 列表。
  vscodePath: string; // vscodePath 存储用户配置的 VSCode CLI 路径。
}) {
  return (
    <div
      role="table"
      aria-label="Skill 清单"
      className="overflow-hidden rounded-xl border border-border bg-panel"
    >
      <div
        role="row"
        className="hidden grid-cols-[minmax(140px,0.85fr)_minmax(220px,1.55fr)_minmax(110px,0.65fr)_minmax(160px,0.9fr)_88px] gap-4 bg-surface px-4 py-3 text-xs font-medium uppercase text-text-muted md:grid"
      >
        <div role="columnheader">Skill</div>
        <div role="columnheader">用途</div>
        <div role="columnheader">来源</div>
        <div role="columnheader">路径</div>
        <div role="columnheader">操作</div>
      </div>
      <div className="divide-y divide-border">
        {skills.map((skill) => (
          <SkillRow
            key={`${skill.path}-${skill.name}`}
            skill={skill}
            vscodePath={vscodePath}
          />
        ))}
      </div>
    </div>
  );
}

// SkillRow 渲染单条 skill 信息。
// skill 为待展示的 skill 信息，vscodePath 为 VSCode CLI 路径。
function SkillRow({
  skill,
  vscodePath,
}: {
  skill: SkillInfo; // skill 存储待展示的 skill 信息。
  vscodePath: string; // vscodePath 存储用户配置的 VSCode CLI 路径。
}) {
  // canOpenInVscode 标记当前是否具备使用 VSCode 打开的必要配置。
  const canOpenInVscode = Boolean(vscodePath && skill.path);

  return (
    <div
      role="row"
      className="grid gap-3 px-4 py-4 transition-colors hover:bg-surface/70 md:grid-cols-[minmax(140px,0.85fr)_minmax(220px,1.55fr)_minmax(110px,0.65fr)_minmax(160px,0.9fr)_88px] md:gap-4"
    >
      <div role="cell" className="min-w-0">
        <div className="min-w-0">
          <div className="truncate font-medium text-text-main" title={skill.name}>
            {skill.name}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge tone={toolTone(skill.tool)}>{skill.tool}</Badge>
            {skill.plugin && <Badge tone="neutral">{skill.plugin}</Badge>}
          </div>
        </div>
      </div>
      <div role="cell" className="min-w-0">
        <div className="mb-1 text-xs font-medium text-text-muted md:hidden">用途</div>
        <p className="line-clamp-3 text-sm leading-6 text-text-muted">
          {skill.description || "这个 skill 没有提供用途说明。"}
        </p>
      </div>
      <div role="cell" className="min-w-0">
        <div className="mb-1 text-xs font-medium text-text-muted md:hidden">来源</div>
        <div className="text-sm text-text-main">{skill.source || "未知来源"}</div>
      </div>
      <div role="cell" className="min-w-0">
        <div className="mb-1 text-xs font-medium text-text-muted md:hidden">路径</div>
        <div className="min-w-0 font-mono text-xs leading-5 text-text-muted">
          <div className="line-clamp-2 break-all" title={skill.path}>
            {skill.path}
          </div>
        </div>
      </div>
      <div role="cell" className="flex items-start md:justify-end">
        <Button
          onClick={() => {
            void openInVscode(vscodePath, skill.path).catch(console.error);
          }}
          variant="ghost"
          disabled={!canOpenInVscode}
          className="h-8 w-8 px-0 py-0 text-accent hover:bg-accent/10 hover:text-accent"
          title={canOpenInVscode ? "用 VSCode 打开 SKILL.md" : "请先在设置中配置 VSCode CLI 路径"}
          ariaLabel="VSCode"
        >
          <VscodeIcon />
        </Button>
      </div>
    </div>
  );
}

// SkillsPage 展示本机可用 skill 列表。
export default function SkillsPage() {
  // claudeHome 存储 Claude 配置根目录。
  const claudeHome = useAppStore((state) => state.prefs?.claude_home || "");
  // codexHome 存储 Codex 配置根目录。
  const codexHome = useAppStore((state) => state.prefs?.codex_home || "");
  // vscodePath 存储 VSCode CLI 路径，用于打开 Skill 文件。
  const vscodePath = useAppStore((state) => state.prefs?.vscode_path || "");
  // result 存储最近一次 skill 扫描结果。
  const [result, setResult] = useState<SkillListResult>({
    skills: [],
    diagnostics: "",
  });
  // loading 标记 skill 扫描是否正在执行。
  const [loading, setLoading] = useState(true);
  // error 存储 skill 扫描失败原因。
  const [error, setError] = useState("");
  // query 存储搜索框输入内容。
  const [query, setQuery] = useState("");

  // loadSkills 从后端扫描可用 skill。
  async function loadSkills() {
    setLoading(true);
    setError("");
    try {
      // nextResult 存储后端返回的 skill 扫描结果。
      const nextResult = await listSkills(claudeHome, codexHome);
      setResult(nextResult);
    } catch (loadError) {
      setError(String(loadError));
      setResult({ skills: [], diagnostics: "" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // timer 存储首次扫描延迟句柄，避免 tab 切换期间同步扫描磁盘造成卡顿。
    const timer = window.setTimeout(() => {
      void loadSkills();
    }, INITIAL_SKILL_LOAD_DELAY_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [claudeHome, codexHome]);

  // filteredSkills 存储按当前搜索词过滤后的 skill 列表。
  const filteredSkills = useMemo(
    () => filterSkills(result.skills, query),
    [result.skills, query]
  );

  return (
    <div className="mx-auto max-w-6xl p-6">
      <PageHeader
        title="技能"
        subtitle="查看当前 Claude、Codex 与本机 Agents 可用的 Skill，以及每个 Skill 适合处理什么任务。"
        actions={
          <Button onClick={() => void loadSkills()} loading={loading}>
            刷新
          </Button>
        }
      />

      <div className="mb-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索 skill、用途、来源"
          className="min-w-0 rounded-lg border border-border bg-panel px-3 py-2 text-sm text-text-main outline-none transition-colors placeholder:text-text-muted focus:border-accent"
        />
        <div className="flex items-center gap-2 text-sm text-text-muted">
          {loading && <LoadingIcon className="text-accent" />}
          <span>
            共 {result.skills.length} 个 Skill
            {query ? `，匹配 ${filteredSkills.length} 个` : ""}
          </span>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/40 p-3 text-xs text-red-500">
          <div className="font-medium">Skill 扫描失败</div>
          <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap font-mono">
            {error}
          </pre>
        </div>
      )}

      {result.diagnostics && !error && (
        <div className="mb-4 rounded-lg border border-amber-500/40 p-3 text-xs text-amber-500">
          <div className="font-medium">扫描诊断</div>
          <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap font-mono">
            {result.diagnostics}
          </pre>
        </div>
      )}

      {loading && result.skills.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-text-muted">
          <LoadingIcon className="text-accent" />
          <span>加载 Skill…</span>
        </div>
      ) : filteredSkills.length === 0 ? (
        <EmptyState text={query ? "没有匹配的 Skill" : "未发现可用 Skill"} />
      ) : (
        <SkillTable skills={filteredSkills} vscodePath={vscodePath} />
      )}
    </div>
  );
}
