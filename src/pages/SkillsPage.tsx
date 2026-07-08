// Skill 清单页：展示当前 Claude / Codex / Agents 可用的 skill 及其用途说明
import {
  Alert,
  Button as AntButton,
  Empty,
  Input,
  Space,
  Spin,
  Table,
  Tag,
  Tooltip,
  Typography,
  type TableColumnsType,
} from "antd";
import { useEffect, useMemo, useRef, useState } from "react";
import { listSkills, openInVscode } from "../api";
import { PageHeader, PageShell } from "../components/ui";
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

// toolTagColor 根据 skill 所属工具返回 Ant Design Tag 色值。
// tool 为后端返回的工具域标识。
function toolTagColor(tool: SkillInfo["tool"]): string {
  if (tool === "codex") {
    return "processing";
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

// getSkillRowKey 生成 Ant Design Table 的稳定行 key。
// skill 为待展示的 skill 信息。
function getSkillRowKey(skill: SkillInfo): string {
  return `${skill.path}-${skill.name}`;
}

// SkillTable 使用 Ant Design Table 渲染扁平 skill 清单，避免维护手写表格语义与响应式细节。
// skills 为当前需要展示的 skill 列表，vscodePath 为 VSCode CLI 路径。
function SkillTable({
  skills,
  vscodePath,
}: {
  skills: SkillInfo[]; // skills 存储当前需要展示的 skill 列表。
  vscodePath: string; // vscodePath 存储用户配置的 VSCode CLI 路径。
}) {
  // columns 存储 Ant Design Table 列配置，集中声明每列如何消费 skill 字段。
  const columns: TableColumnsType<SkillInfo> = [
    {
      title: "Skill",
      dataIndex: "name",
      key: "name",
      width: 220,
      render: (_value, skill) => (
        <Space direction="vertical" size={6} className="min-w-0">
          <Typography.Text strong ellipsis={{ tooltip: skill.name }}>
            {skill.name}
          </Typography.Text>
          <Space size={4} wrap>
            <Tag color={toolTagColor(skill.tool)} className="m-0">
              {skill.tool}
            </Tag>
            {skill.plugin && <Tag className="m-0">{skill.plugin}</Tag>}
          </Space>
        </Space>
      ),
    },
    {
      title: "用途",
      dataIndex: "description",
      key: "description",
      render: (description: SkillInfo["description"]) => (
        <Typography.Paragraph
          className="m-0 text-text-muted"
          ellipsis={{ rows: 3, tooltip: description || "这个 skill 没有提供用途说明。" }}
        >
          {description || "这个 skill 没有提供用途说明。"}
        </Typography.Paragraph>
      ),
    },
    {
      title: "来源",
      dataIndex: "source",
      key: "source",
      width: 160,
      render: (source: SkillInfo["source"]) => (
        <Typography.Text ellipsis={{ tooltip: source || "未知来源" }}>
          {source || "未知来源"}
        </Typography.Text>
      ),
    },
    {
      title: "路径",
      dataIndex: "path",
      key: "path",
      width: 260,
      render: (path: SkillInfo["path"]) => (
        <Typography.Paragraph
          className="m-0 skill-path-text"
          ellipsis={{ rows: 2, tooltip: path }}
          style={{ wordBreak: "break-all" }}
        >
          {path}
        </Typography.Paragraph>
      ),
    },
    {
      title: "操作",
      key: "action",
      align: "right",
      width: 88,
      render: (_value, skill) => {
        // canOpenInVscode 标记当前是否具备使用 VSCode 打开的必要配置。
        const canOpenInVscode = Boolean(vscodePath && skill.path);

        return (
          <Tooltip title={canOpenInVscode ? "用 VSCode 打开 SKILL.md" : "请先在设置中配置 VSCode CLI 路径"}>
            <AntButton
              aria-label="VSCode"
              disabled={!canOpenInVscode}
              icon={<VscodeIcon />}
              onClick={() => {
                void openInVscode(vscodePath, skill.path).catch(console.error);
              }}
              type="text"
            />
          </Tooltip>
        );
      },
    },
  ];

  return (
    <Table
      className="skill-directory-table"
      columns={columns}
      dataSource={skills}
      pagination={false}
      rowKey={getSkillRowKey}
      size="small"
      tableLayout="fixed"
    />
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
  // loadingRef 存储正在执行的 loadSkills 请求序号，用于丢弃过期请求结果，避免竞态覆盖。
  const loadingRef = useRef(0);

  // loadSkills 从后端扫描可用 skill。
  async function loadSkills() {
    // seq 存储本次请求序号；若返回时序号已被更新则说明有更新的请求在运行，丢弃结果。
    const seq = ++loadingRef.current;
    setLoading(true);
    setError("");
    try {
      // nextResult 存储后端返回的 skill 扫描结果。
      const nextResult = await listSkills(claudeHome, codexHome);
      // 只有最新一次请求的结果才写入 state，避免并发时旧结果覆盖新结果。
      if (seq !== loadingRef.current) return;
      setResult(nextResult);
    } catch (loadError) {
      if (seq !== loadingRef.current) return;
      setError(String(loadError));
      setResult({ skills: [], diagnostics: "" });
    } finally {
      if (seq === loadingRef.current) {
        setLoading(false);
      }
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
    <PageShell className="max-w-6xl">
      <PageHeader
        title="技能"
        subtitle="查看当前 Claude、Codex 与本机 Agents 可用的 Skill，以及每个 Skill 适合处理什么任务。"
        actions={
          <AntButton aria-label="刷新" disabled={loading} onClick={() => void loadSkills()} loading={loading}>
            刷新
          </AntButton>
        }
      />

      <div className="mb-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索 skill、用途、来源"
        />
        <div className="flex items-center gap-2 text-sm text-text-muted">
          {loading && <Spin size="small" />}
          <span>
            共 {result.skills.length} 个 Skill
            {query ? `，匹配 ${filteredSkills.length} 个` : ""}
          </span>
        </div>
      </div>

      {error && (
        <Alert
          className="mb-4"
          description={<pre className="m-0 max-h-32 overflow-auto whitespace-pre-wrap font-mono">{error}</pre>}
          message="Skill 扫描失败"
          showIcon
          type="error"
        />
      )}

      {result.diagnostics && !error && (
        <Alert
          className="mb-4"
          description={
            <pre className="m-0 max-h-32 overflow-auto whitespace-pre-wrap font-mono">
              {result.diagnostics}
            </pre>
          }
          message="扫描诊断"
          showIcon
          type="warning"
        />
      )}

      {/* min-h 常驻基准：让 loading / 空 / 表格三态共用同一最小高度，避免扫描完成后内容区从小占位跳到不定行表格造成的整屏跳动（CLS） */}
      <div className="min-h-[280px]">
        {loading && result.skills.length === 0 ? (
          <div className="flex min-h-[280px] items-center justify-center gap-2 text-sm text-text-muted">
            <Spin size="small" />
            <span>加载 Skill…</span>
          </div>
        ) : filteredSkills.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border py-8">
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={query ? "没有匹配的 Skill" : "未发现可用 Skill"}
            />
          </div>
        ) : (
          <SkillTable skills={filteredSkills} vscodePath={vscodePath} />
        )}
      </div>
    </PageShell>
  );
}
