// 官方设置来源同步：从官方文档抓取配置字段名并缓存到本地。
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { appConfigDir } from "./preferences.js";
import { atomicWrite, runCommand } from "./util.js";

// sourceDefinition 创建官方来源静态定义。
// id/title/description/url 参数分别存储 schema 标识、标题、说明和官方文档地址。
function sourceDefinition(id, title, description, url) {
  return {
    id,
    title,
    description,
    url,
    cached_at: "",
    fields: [],
  };
}

// defaultSources 返回当前应用支持同步的官方配置来源。
function defaultSources() {
  return [
    sourceDefinition(
      "claude-settings",
      "Claude settings.json",
      "Claude Code settings.json 官方字段参考。",
      "https://docs.anthropic.com/en/docs/claude-code/settings",
    ),
    sourceDefinition(
      "codex-config",
      "Codex config.toml",
      "Codex config.toml 官方字段参考。",
      "https://developers.openai.com/codex/config-reference",
    ),
  ];
}

// fallbackFieldPaths 返回网络同步失败时可用于展示的内置字段兜底列表。
// id 参数存储官方来源 schema 标识。
function fallbackFieldPaths(id) {
  if (id === "claude-settings") {
    return [
      "model",
      "fallbackModel",
      "advisorModel",
      "agent",
      "effortLevel",
      "permissions.defaultMode",
      "permissions.allow",
      "permissions.ask",
      "permissions.deny",
      "env",
      "hooks",
      "mcpServers",
      "outputStyle",
      "theme",
      "statusLine",
      "apiKeyHelper",
      "includeGitInstructions",
      "worktree.baseRef",
    ];
  }
  if (id === "codex-config") {
    return [
      "model_provider",
      "model",
      "review_model",
      "model_providers",
      "approval_policy",
      "sandbox_mode",
      "sandbox_workspace_write",
      "instructions",
      "developer_instructions",
      "model_reasoning_effort",
      "model_verbosity",
      "tools.web_search",
      "mcp_servers",
      "hooks",
      "skills",
      "agents",
      "projects",
    ];
  }
  return [];
}

// cachePath 返回官方设置来源缓存文件路径。
function cachePath() {
  return join(appConfigDir(), "official_settings_sources.json");
}

// mergeWithDefaults 用内置来源定义修补缓存结构，避免旧缓存缺少新增来源。
// cached 参数存储磁盘缓存结果，diagnostics 参数存储附加诊断。
function mergeWithDefaults(cached, diagnostics = "") {
  // cachedById 存储历史缓存来源到 schema id 的映射。
  const cachedById = new Map((cached.sources || []).map((source) => [source.id, source]));
  // sources 存储按内置来源顺序合并后的来源列表。
  const sources = defaultSources().map((source) => {
    // cachedSource 存储同 id 的历史缓存来源。
    const cachedSource = cachedById.get(source.id);
    return cachedSource
      ? { ...source, fields: cachedSource.fields || [], cached_at: cachedSource.cached_at || "" }
      : source;
  });
  return { sources, diagnostics };
}

// readCachedResult 读取本地官方来源缓存，缓存不存在时返回默认来源。
function readCachedResult() {
  // path 存储官方来源缓存路径。
  const path = cachePath();
  if (!existsSync(path)) {
    return { sources: defaultSources(), diagnostics: "" };
  }
  // content 存储缓存文件 JSON 文本。
  const content = readFileSync(path, "utf8");
  return mergeWithDefaults(JSON.parse(content), "");
}

// writeCachedResult 把官方来源同步结果写入本地缓存。
// result 参数存储同步结果。
function writeCachedResult(result) {
  atomicWrite(cachePath(), JSON.stringify(result, null, 2));
}

// normalizeCandidate 清洗从官方文档中截取出的字段候选文本。
// candidate 参数存储可能包含标点、空白或赋值片段的字段候选。
function normalizeCandidate(candidate) {
  // trimmed 存储去除包裹符和空白后的候选文本。
  const trimmed = String(candidate || "").trim().replace(/^`|`$/g, "").replace(/^["']|["']$/g, "").trim();
  if (!trimmed || trimmed.length > 96) {
    return undefined;
  }
  if (/^(https?:\/\/|--|\/|~|\$|@|#)/.test(trimmed)) {
    return undefined;
  }
  if (!/^[A-Za-z0-9_.-]+$/.test(trimmed)) {
    return undefined;
  }
  if (!/[A-Za-z_]/.test(trimmed)) {
    return undefined;
  }
  return trimmed;
}

// pushCandidate 尝试把候选字段加入集合。
// paths 参数存储字段集合，candidate 参数存储待归一化候选。
function pushCandidate(paths, candidate) {
  // path 存储归一化后的字段路径。
  const path = normalizeCandidate(candidate);
  if (path) {
    paths.add(path);
  }
}

// extractBacktickPaths 提取反引号包裹的字段名。
// paths 参数存储字段集合，content 参数存储官方文档文本。
function extractBacktickPaths(paths, content) {
  // matches 存储所有反引号片段的迭代器。
  const matches = String(content || "").matchAll(/`([^`]+)`/g);
  for (const match of matches) {
    pushCandidate(paths, match[1]);
  }
}

// extractLinePaths 从代码块样式行中提取 root key、点分 key 和 TOML 表头。
// paths 参数存储字段集合，content 参数存储官方文档文本。
function extractLinePaths(paths, content) {
  for (const line of String(content || "").split(/\r?\n/)) {
    // trimmedLine 存储当前行去空白后的文本。
    const trimmedLine = line.trim();
    if (trimmedLine.startsWith("[") && trimmedLine.includes("]")) {
      // tableName 存储 TOML 表头中的路径文本。
      const tableName = trimmedLine.slice(1).split("]")[0] || "";
      pushCandidate(paths, tableName.split(".")[0] || tableName);
      continue;
    }
    if (trimmedLine.includes("=")) {
      // keyCandidate 存储赋值语句左侧字段候选。
      const keyCandidate = trimmedLine.split("=")[0].trim().replace(/^["']|["']$/g, "");
      pushCandidate(paths, keyCandidate);
    }
  }
}

// extractSettingPaths 从官方文档文本中提取配置字段路径。
// content 参数存储官方文档 HTML 或 Markdown 文本。
export function extractSettingPaths(content) {
  // paths 存储去重并排序后的字段路径。
  const paths = new Set();
  extractBacktickPaths(paths, content);
  extractLinePaths(paths, content);
  return Array.from(paths).sort();
}

// fetchUrlText 通过 curl 拉取官方文档文本。
// url 参数存储官方文档地址。
async function fetchUrlText(url) {
  // output 存储 curl 命令输出。
  const output = await runCommand("curl", [
    "-L",
    "--fail",
    "--silent",
    "--show-error",
    "--max-time",
    "20",
    url,
  ]);
  return output.stdout;
}

// sourceWithFallbackFields 用内置字段列表构造同步失败时的来源数据。
// source 参数存储官方来源定义。
function sourceWithFallbackFields(source) {
  return {
    ...source,
    cached_at: new Date().toISOString(),
    fields: fallbackFieldPaths(source.id).map((path) => ({ path })),
  };
}

// sourceWithFields 拉取单个官方来源并返回更新后的来源结构。
// source 参数存储待同步的官方来源定义。
async function sourceWithFields(source) {
  // content 存储官方文档页面内容。
  const content = await fetchUrlText(source.url);
  // fields 存储提取后的字段定义。
  const fields = extractSettingPaths(content).map((path) => ({ path }));
  if (fields.length === 0) {
    throw new Error(`${source.title} 未提取到可识别字段`);
  }
  return {
    ...source,
    fields,
    cached_at: new Date().toISOString(),
  };
}

// getOfficialSettingsSources 读取本地缓存的官方设置来源与字段列表。
export function getOfficialSettingsSources() {
  return readCachedResult();
}

// updateOfficialSettingsSources 拉取官方文档并刷新本地字段缓存。
export async function updateOfficialSettingsSources() {
  // cachedResult 存储同步前读取到的历史缓存。
  const cachedResult = readCachedResult();
  // cachedById 存储历史缓存来源到 schema id 的映射。
  const cachedById = new Map(cachedResult.sources.map((source) => [source.id, source]));
  // diagnostics 存储逐来源同步失败说明。
  const diagnostics = [];
  // sources 存储同步后的来源列表。
  const sources = [];

  for (const source of defaultSources()) {
    try {
      sources.push(await sourceWithFields(source));
    } catch (error) {
      diagnostics.push(`${error.message}；已保留缓存或使用本应用内置字段兜底。`);
      sources.push(cachedById.get(source.id) || sourceWithFallbackFields(source));
    }
  }

  // result 存储本次最终同步结果。
  const result = { sources, diagnostics: diagnostics.join("\n") };
  writeCachedResult(result);
  return result;
}
