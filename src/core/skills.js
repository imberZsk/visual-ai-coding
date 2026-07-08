// Skill 扫描：从 Claude / Codex / Agents 目录提取 SKILL.md 元数据。
import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { basename, join, relative, sep } from "node:path";
import { homedir } from "node:os";
import { expandHome } from "./util.js";

// MAX_SCAN_DEPTH 存储递归扫描最大深度，避免误扫超大目录。
const MAX_SCAN_DEPTH = 10;

// cleanYamlValue 清理 front matter 中的单行 YAML 值。
// value 参数存储冒号后的原始文本。
function cleanYamlValue(value) {
  // trimmed 存储去除空白后的值。
  const trimmed = String(value || "").trim();
  if (
    (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).replaceAll("\\\"", "\"");
  }
  return trimmed.replaceAll("\\\"", "\"");
}

// parseSkillMarkdown 从 SKILL.md front matter 中解析 name 与 description。
// content 参数存储 Markdown 文本，fallbackName 参数存储缺省名称。
export function parseSkillMarkdown(content, fallbackName) {
  // name 存储解析出的 Skill 名称。
  let name = "";
  // description 存储解析出的 Skill 用途说明。
  let description = "";
  // lines 存储 Markdown 按行拆分后的数组。
  const lines = String(content || "").split(/\r?\n/);

  if (lines[0]?.trim() === "---") {
    for (const line of lines.slice(1)) {
      // trimmed 存储当前 front matter 行的去空白文本。
      const trimmed = line.trim();
      if (trimmed === "---") {
        break;
      }
      if (trimmed.startsWith("name:")) {
        name = cleanYamlValue(trimmed.slice("name:".length));
      } else if (trimmed.startsWith("description:")) {
        description = cleanYamlValue(trimmed.slice("description:".length));
      }
    }
  }

  return {
    name: name || fallbackName,
    description,
  };
}

// shouldDescendInto 判断递归扫描时是否进入某个目录。
// fileName 参数存储目录名。
function shouldDescendInto(fileName) {
  return !["node_modules", "target", ".git"].includes(fileName);
}

// collectSkillFiles 异步递归收集目录下所有 SKILL.md 文件。
// dir 参数存储当前目录，depth 参数存储当前深度，out/diagnostics 接收结果。
// WHY 改为 async：readdirSync 对大型插件缓存目录会在主进程长时间阻塞，改用 fs.promises 不卡事件循环。
async function collectSkillFiles(dir, depth, out, diagnostics) {
  if (depth > MAX_SCAN_DEPTH) {
    return;
  }

  let entries = [];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    diagnostics.push(`读取目录失败：${dir} (${error.message})`);
    return;
  }

  // 并行处理所有条目以减少串行等待
  await Promise.all(
    entries.map(async (entry) => {
      // path 存储当前条目的完整路径。
      const path = join(dir, entry.name);
      if (entry.isFile() && entry.name === "SKILL.md") {
        out.push(path);
        return;
      }
      if (entry.isDirectory() && shouldDescendInto(entry.name)) {
        await collectSkillFiles(path, depth + 1, out, diagnostics);
      }
    }),
  );
}

// refineSource 根据路径细化来源展示名。
// source 参数存储根目录来源，skillFile 参数存储 SKILL.md 路径。
export function refineSource(source, skillFile) {
  if (source === "Codex 用户" && String(skillFile).includes("/skills/.system/")) {
    return "Codex 系统";
  }
  return source;
}

// inferPluginName 尝试从插件目录路径中推断插件归属。
// root 参数存储扫描根目录，source 参数存储来源展示名，skillFile 参数存储 SKILL.md 路径。
export function inferPluginName(root, source, skillFile) {
  if (!String(source).includes("插件")) {
    return "";
  }

  // relativePath 存储 skill 文件相对扫描根目录的路径。
  const relativePath = relative(root, skillFile);
  // parts 存储相对路径各段文本。
  const parts = relativePath.split(sep).filter(Boolean);
  if (source === "Codex 插件" && parts.length >= 2) {
    // marketplace 存储 Codex 插件 marketplace 名称。
    const marketplace = parts[0];
    // plugin 存储 Codex 插件短名称。
    const plugin = parts[1];
    return `${plugin}@${marketplace}`;
  }
  return parts[0] || "";
}

// buildSkillRoots 根据用户配置与系统目录构造需要扫描的 Skill 根目录。
// claudeHome 参数存储 Claude 配置根目录，codexHome 参数存储 Codex 配置根目录。
function buildSkillRoots(claudeHome, codexHome) {
  // roots 存储待扫描目录集合。
  const roots = [];
  if (String(codexHome || "").trim()) {
    // codexRoot 存储展开后的 Codex 配置目录。
    const codexRoot = expandHome(codexHome);
    roots.push({ path: join(codexRoot, "skills"), source: "Codex 用户", tool: "codex" });
    roots.push({ path: join(codexRoot, "plugins", "cache"), source: "Codex 插件", tool: "codex" });
  }
  if (String(claudeHome || "").trim()) {
    // claudeRoot 存储展开后的 Claude 配置目录。
    const claudeRoot = expandHome(claudeHome);
    roots.push({ path: join(claudeRoot, "skills"), source: "Claude 用户", tool: "claude" });
    roots.push({ path: join(claudeRoot, "plugins"), source: "Claude 插件", tool: "claude" });
  }
  roots.push({ path: join(homedir(), ".agents", "skills"), source: "Agents", tool: "agents" });
  return roots;
}

// scanSkillRoot 异步扫描单个根目录并将 Skill 写入结果列表。
// root 参数存储待扫描根目录，seenPaths 用于去重，skills/diagnostics 接收结果。
async function scanSkillRoot(root, seenPaths, skills, diagnostics) {
  if (!existsSync(root.path)) {
    return;
  }
  try {
    // rootStat 存储根目录文件系统元数据，用于判断是否为目录。
    const rootStat = await stat(root.path);
    if (!rootStat.isDirectory()) return;
  } catch {
    return;
  }

  // skillFiles 存储当前根目录下找到的 SKILL.md 文件路径。
  const skillFiles = [];
  await collectSkillFiles(root.path, 0, skillFiles, diagnostics);

  // 并行读取所有 SKILL.md 内容，减少串行 I/O 等待。
  await Promise.all(
    skillFiles.map(async (skillFile) => {
      // canonicalPath 存储规范化失败时仍可展示的路径文本。
      const canonicalPath = skillFile;
      if (seenPaths.has(canonicalPath)) {
        return;
      }
      seenPaths.add(canonicalPath);

      try {
        // content 存储 SKILL.md 文本内容。
        const content = await readFile(skillFile, "utf8");
        // fallbackName 存储无 front matter name 时使用的目录名。
        const fallbackName = basename(skillFile.split("/").slice(0, -1).join("/")) || "unknown";
        // metadata 存储解析出的名称和说明。
        const metadata = parseSkillMarkdown(content, fallbackName);
        skills.push({
          name: metadata.name,
          description: metadata.description,
          source: refineSource(root.source, skillFile),
          tool: root.tool,
          plugin: inferPluginName(root.path, root.source, skillFile),
          path: canonicalPath,
        });
      } catch (error) {
        diagnostics.push(`读取 Skill 失败：${skillFile} (${error.message})`);
      }
    }),
  );
}

// listSkills 异步扫描本机可用 Skill 列表。
// claudeHome 参数存储 Claude 配置根目录，codexHome 参数存储 Codex 配置根目录。
export async function listSkills(claudeHome, codexHome) {
  // diagnostics 存储扫描过程中的非致命诊断。
  const diagnostics = [];
  // skills 存储最终返回给前端的 Skill 列表。
  const skills = [];
  // seenPaths 存储已处理路径，避免重复收集。
  const seenPaths = new Set();
  // roots 存储所有待扫描根目录。
  const roots = buildSkillRoots(claudeHome, codexHome);

  // 串行扫描各根目录（保证 seenPaths 去重顺序稳定）
  for (const root of roots) {
    await scanSkillRoot(root, seenPaths, skills, diagnostics);
  }

  skills.sort((left, right) => {
    // leftKey 存储左侧排序键。
    const leftKey = `${left.source.toLowerCase()}:${left.name.toLowerCase()}`;
    // rightKey 存储右侧排序键。
    const rightKey = `${right.source.toLowerCase()}:${right.name.toLowerCase()}`;
    return leftKey.localeCompare(rightKey);
  });

  return {
    skills,
    diagnostics: diagnostics.join("\n"),
  };
}
