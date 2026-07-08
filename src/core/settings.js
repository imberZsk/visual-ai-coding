// 配置文件读写：统一读取/保存 Claude 与 Codex 的配置文件，并扫描 Claude output style。
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import * as TOML from "smol-toml";
import { atomicWrite, expandHome } from "./util.js";

// detectFormat 根据文件扩展名推断编辑格式。
// filePath 参数存储配置文件路径。
export function detectFormat(filePath) {
  // extension 存储小写扩展名。
  const extension = extname(String(filePath || "")).toLowerCase();
  if (extension === ".json") {
    return "json";
  }
  if (extension === ".toml") {
    return "toml";
  }
  return "text";
}

// validateContent 按格式校验配置内容合法性。
// content 参数存储待保存文本，format 参数存储 json/toml/text。
export function validateContent(content, format) {
  if (format === "json") {
    try {
      JSON.parse(content);
    } catch (error) {
      throw new Error(`JSON 格式错误: ${error.message}`);
    }
  }

  if (format === "toml") {
    try {
      TOML.parse(content);
    } catch (error) {
      throw new Error(`TOML 格式错误: ${error.message}`);
    }
  }
}

// readConfigFile 读取单个配置文件为前端展示结构。
// params 参数存储 id/title/path/readonly。
export function readConfigFile(params) {
  // absolutePath 存储展开后的目标路径。
  const absolutePath = expandHome(params.path);
  // exists 存储文件是否存在。
  const exists = existsSync(absolutePath);
  // content 存储文件文本内容，不存在时为空。
  const content = exists ? readFileSync(absolutePath, "utf8") : "";

  return {
    id: params.id,
    title: params.title,
    path: absolutePath,
    format: detectFormat(absolutePath),
    content,
    exists,
    readonly: Boolean(params.readonly),
  };
}

// saveConfigFile 保存配置文件内容；保存前按格式做语法校验。
// filePath 参数存储目标路径，content 参数存储文本内容，format 参数存储格式。
export function saveConfigFile(filePath, content, format) {
  // absolutePath 存储展开后的目标路径。
  const absolutePath = expandHome(filePath);
  validateContent(content, format);
  atomicWrite(absolutePath, content);
}

// listDir 列出目录直接子条目，目录优先并按名称排序。
// dirPath 参数存储待浏览目录路径。
// WHY 改为 async：对大目录逐条 statSync 会在主进程累积阻塞，改用 fs.promises 避免卡主线程。
export async function listDir(dirPath) {
  // absolutePath 存储展开后的目录路径。
  const absolutePath = expandHome(dirPath);
  if (!existsSync(absolutePath)) {
    return [];
  }

  // rawEntries 存储目录原始条目（含文件类型，避免重复 stat）。
  const rawEntries = await readdir(absolutePath, { withFileTypes: true });
  // statResults 并行获取所有条目的文件元数据，减少串行等待。
  const statResults = await Promise.all(
    rawEntries.map(async (entry) => {
      // entryPath 存储当前条目绝对路径。
      const entryPath = join(absolutePath, entry.name);
      try {
        // meta 存储当前条目文件系统元数据。
        const meta = await stat(entryPath);
        return {
          name: entry.name,
          path: entryPath,
          is_dir: meta.isDirectory(),
          size: meta.isDirectory() ? 0 : meta.size,
        };
      } catch {
        // 条目在读取间隙被删除时静默跳过
        return null;
      }
    }),
  );

  // entries 存储过滤掉 null（已删除条目）后的有效条目列表。
  const entries = statResults
    .filter(Boolean)
    .sort((left, right) => {
      if (left.is_dir !== right.is_dir) {
        return left.is_dir ? -1 : 1;
      }
      return left.name.toLowerCase().localeCompare(right.name.toLowerCase());
    });

  return entries;
}

// builtinOutputStyles 返回 Claude Code 当前可用的内置 output style 列表。
function builtinOutputStyles() {
  return [
    {
      name: "default",
      kind: "builtin",
      path: "",
      description: "默认输出风格",
    },
    {
      name: "Explanatory",
      kind: "builtin",
      path: "",
      description: "解释型输出风格",
    },
    {
      name: "Learning",
      kind: "builtin",
      path: "",
      description: "学习型输出风格",
    },
  ];
}

// outputStylesDir 计算 Claude 自定义 output style 目录。
// claudeHome 参数存储 Claude 配置根目录。
function outputStylesDir(claudeHome) {
  return join(expandHome(claudeHome), "output-styles");
}

// trimFrontMatterValue 清理 front matter 值两侧空白和成对引号。
// raw 参数存储冒号后的原始文本。
function trimFrontMatterValue(raw) {
  // trimmed 存储去除空白后的值。
  const trimmed = String(raw || "").trim();
  if (trimmed.length >= 2 && trimmed.startsWith("\"") && trimmed.endsWith("\"")) {
    return trimmed.slice(1, -1);
  }
  if (trimmed.length >= 2 && trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

// parseFrontMatterValue 从简单 Markdown front matter 中读取指定键。
// content 参数存储 Markdown 文本，key 参数存储要读取的 front matter 键名。
function parseFrontMatterValue(content, key) {
  // lines 存储 Markdown 文件按行拆分后的数组。
  const lines = String(content || "").split(/\r?\n/);
  if (lines[0]?.trim() !== "---") {
    return undefined;
  }

  // keyPrefix 存储目标 front matter 键名前缀。
  const keyPrefix = `${key}:`;
  for (const line of lines.slice(1)) {
    // trimmedLine 存储当前行去空白后的文本。
    const trimmedLine = line.trim();
    if (trimmedLine === "---") {
      break;
    }
    if (trimmedLine.startsWith(keyPrefix)) {
      // value 存储清理后的键值。
      const value = trimFrontMatterValue(trimmedLine.slice(keyPrefix.length));
      return value || undefined;
    }
  }

  return undefined;
}

// readCustomOutputStyle 从 Markdown 文件异步读取自定义 output style 元数据。
// filePath 参数存储待解析 Markdown 文件路径。
async function readCustomOutputStyle(filePath) {
  if (extname(filePath) !== ".md") {
    return undefined;
  }

  // content 存储 Markdown 文件内容。
  const content = await readFile(filePath, "utf8");
  // fallbackName 存储文件名去掉 .md 后的兜底风格名称。
  const fallbackName = basename(filePath, ".md");
  if (!fallbackName) {
    return undefined;
  }

  // name 存储 front matter name 或文件名兜底值。
  const name = parseFrontMatterValue(content, "name") || fallbackName;
  // description 存储 front matter description 或默认说明。
  const description = parseFrontMatterValue(content, "description") || `自定义输出风格：${name}`;

  return {
    name,
    kind: "custom",
    path: filePath,
    description,
  };
}

// validateOutputStyleName 校验并规范化 output style 名称，防止路径穿越。
// name 参数存储用户希望创建的风格名称。
function validateOutputStyleName(name) {
  // trimmedName 存储去掉首尾空白后的名称。
  const trimmedName = String(name || "").trim();
  if (!trimmedName) {
    throw new Error("输出风格名称不能为空");
  }
  if (
    trimmedName === "." ||
    trimmedName === ".." ||
    trimmedName.includes("/") ||
    trimmedName.includes("\\") ||
    trimmedName.includes("\0") ||
    trimmedName.includes("\n") ||
    trimmedName.includes("\r")
  ) {
    throw new Error("输出风格名称不能包含路径分隔符或换行");
  }
  return trimmedName;
}

// outputStyleTemplate 创建 output style Markdown 初始模板。
// name 参数存储风格名称。
function outputStyleTemplate(name) {
  // description 存储写入 front matter 的默认说明。
  const description = `自定义输出风格：${name}`;
  return `---\nname: ${name}\ndescription: ${description}\n---\n\n你是一个使用「${name}」输出风格的助手。\n\n- 保持技术判断准确，先保证事实、边界和风险说明正确\n- 表达方式贴合「${name}」这个风格名称，但不要为了语气牺牲清晰度\n- 代码、命令和配置建议必须可执行、可验证\n`;
}

// listClaudeOutputStyles 异步扫描 Claude output style 列表。
// claudeHome 参数存储 Claude 配置根目录。
// WHY 改为 async：readdirSync + 每文件 readFileSync 会在 IPC handler 中同步阻塞主进程。
export async function listClaudeOutputStyles(claudeHome) {
  // dir 存储自定义 output style 目录。
  const dir = outputStylesDir(claudeHome);
  // builtinStyles 存储内置风格列表。
  const builtinStyles = builtinOutputStyles();
  // diagnostics 存储扫描过程中的非致命提示。
  const diagnostics = [];

  if (!existsSync(dir)) {
    return {
      directory: dir,
      exists: false,
      styles: builtinStyles,
      diagnostics: "output-styles 目录不存在",
    };
  }

  let dirStat;
  try {
    dirStat = await stat(dir);
  } catch {
    return {
      directory: dir,
      exists: false,
      styles: builtinStyles,
      diagnostics: "output-styles 路径读取失败",
    };
  }

  if (!dirStat.isDirectory()) {
    return {
      directory: dir,
      exists: false,
      styles: builtinStyles,
      diagnostics: "output-styles 路径不是目录",
    };
  }

  // rawEntries 存储目录原始条目（含文件类型标志）。
  const rawEntries = await readdir(dir, { withFileTypes: true });
  // fileEntries 存储过滤后的文件条目（跳过子目录）。
  const fileEntries = rawEntries.filter((e) => e.isFile());

  // 并行读取所有 .md 文件的元数据，减少串行等待。
  const styleResults = await Promise.all(
    fileEntries.map(async (entry) => {
      try {
        return await readCustomOutputStyle(join(dir, entry.name));
      } catch (error) {
        diagnostics.push(error.message);
        return null;
      }
    }),
  );

  // customStyles 存储解析成功的自定义风格（过滤掉 null 与 undefined）。
  const customStyles = styleResults.filter(Boolean);
  customStyles.sort((left, right) => left.name.toLowerCase().localeCompare(right.name.toLowerCase()));

  return {
    directory: dir,
    exists: true,
    styles: [...builtinStyles, ...customStyles],
    diagnostics: diagnostics.join("\n"),
  };
}

// createClaudeOutputStyle 创建 Claude 自定义 output style Markdown 文件。
// claudeHome 参数存储 Claude 配置根目录，name 参数存储风格名称。
export function createClaudeOutputStyle(claudeHome, name) {
  // styleName 存储校验后的风格名称。
  const styleName = validateOutputStyleName(name);
  // dir 存储 output-styles 目录。
  const dir = outputStylesDir(claudeHome);
  mkdirSync(dir, { recursive: true });

  // filePath 存储即将写入的 Markdown 文件路径。
  const filePath = join(dir, `${styleName}.md`);
  if (existsSync(filePath)) {
    throw new Error(`输出风格文件已存在: ${filePath}`);
  }

  atomicWrite(filePath, outputStyleTemplate(styleName));

  return {
    name: styleName,
    kind: "custom",
    path: filePath,
    description: `自定义输出风格：${styleName}`,
  };
}
