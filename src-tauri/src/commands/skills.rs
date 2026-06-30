// Skill 扫描命令：从 Claude / Codex / Agents 目录中提取 SKILL.md 元数据
use serde::Serialize;
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

use super::util::expand_home;

// MAX_SCAN_DEPTH 存储递归扫描最大深度，避免误扫超大目录或循环结构。
const MAX_SCAN_DEPTH: usize = 10;

// SkillInfo 描述单个可用 Skill 的展示信息。
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct SkillInfo {
    pub name: String,        // Skill 名称，来自 front matter 或目录名
    pub description: String, // Skill 用途说明，来自 front matter description
    pub source: String,      // 来源展示名，如 Codex 插件
    pub tool: String,        // 所属工具域：claude / codex / agents
    pub plugin: String,      // 插件归属，非插件 Skill 为空字符串
    pub path: String,        // SKILL.md 绝对路径
}

// SkillListResult 描述 Skill 扫描结果。
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct SkillListResult {
    pub skills: Vec<SkillInfo>, // 扫描到的 Skill 列表
    pub diagnostics: String,    // 扫描诊断信息
}

// SkillRoot 描述一个待扫描的 Skill 根目录。
struct SkillRoot {
    path: PathBuf,   // path 存储根目录路径
    source: String, // source 存储来源展示名
    tool: String,   // tool 存储工具域标识
}

// list_skills 扫描本机可用 Skill 列表，供前端展示。
// claude_home 为 Claude 配置根目录，codex_home 为 Codex 配置根目录。
#[tauri::command]
pub fn list_skills(claude_home: String, codex_home: String) -> Result<SkillListResult, String> {
    // diagnostics 存储扫描过程中的非致命诊断信息。
    let mut diagnostics = Vec::new();
    // skills 存储最终返回给前端的 Skill 列表。
    let mut skills = Vec::new();
    // seen_paths 存储已处理的规范化路径，避免同一 SKILL.md 被多个根目录重复收集。
    let mut seen_paths = HashSet::new();
    // roots 存储所有需要扫描的根目录。
    let roots = build_skill_roots(&claude_home, &codex_home);

    for root in roots {
        scan_skill_root(&root, &mut seen_paths, &mut skills, &mut diagnostics);
    }

    skills.sort_by(|left, right| {
        // left_key 存储左侧 skill 的排序键，先按来源再按名称。
        let left_key = format!("{}:{}", left.source.to_lowercase(), left.name.to_lowercase());
        // right_key 存储右侧 skill 的排序键，先按来源再按名称。
        let right_key = format!("{}:{}", right.source.to_lowercase(), right.name.to_lowercase());
        left_key.cmp(&right_key)
    });

    Ok(SkillListResult {
        skills,
        diagnostics: diagnostics.join("\n"),
    })
}

// build_skill_roots 根据用户配置与系统目录构造需要扫描的 Skill 根目录。
// claude_home 为 Claude 配置根目录文本，codex_home 为 Codex 配置根目录文本。
fn build_skill_roots(claude_home: &str, codex_home: &str) -> Vec<SkillRoot> {
    // roots 存储待扫描目录集合。
    let mut roots = Vec::new();

    if !codex_home.trim().is_empty() {
        // codex_root 存储展开后的 Codex 配置根目录。
        let codex_root = expand_home(codex_home);
        roots.push(SkillRoot {
            path: codex_root.join("skills"),
            source: "Codex 用户".to_string(),
            tool: "codex".to_string(),
        });
        roots.push(SkillRoot {
            path: codex_root.join("plugins").join("cache"),
            source: "Codex 插件".to_string(),
            tool: "codex".to_string(),
        });
    }

    if !claude_home.trim().is_empty() {
        // claude_root 存储展开后的 Claude 配置根目录。
        let claude_root = expand_home(claude_home);
        roots.push(SkillRoot {
            path: claude_root.join("skills"),
            source: "Claude 用户".to_string(),
            tool: "claude".to_string(),
        });
        roots.push(SkillRoot {
            path: claude_root.join("plugins"),
            source: "Claude 插件".to_string(),
            tool: "claude".to_string(),
        });
    }

    if let Some(home) = dirs::home_dir() {
        roots.push(SkillRoot {
            path: home.join(".agents").join("skills"),
            source: "Agents".to_string(),
            tool: "agents".to_string(),
        });
    }

    roots
}

// scan_skill_root 扫描单个根目录并将解析出的 Skill 写入结果列表。
// root 为待扫描根目录，seen_paths 用于去重，skills 与 diagnostics 分别接收结果与诊断。
fn scan_skill_root(
    root: &SkillRoot,
    seen_paths: &mut HashSet<String>,
    skills: &mut Vec<SkillInfo>,
    diagnostics: &mut Vec<String>,
) {
    if !root.path.exists() {
        return;
    }

    // skill_files 存储当前根目录下找到的 SKILL.md 文件路径。
    let mut skill_files = Vec::new();
    collect_skill_files(&root.path, 0, &mut skill_files, diagnostics);

    for skill_file in skill_files {
        // canonical_path 存储规范化路径文本，规范化失败时使用原始路径文本兜底。
        let canonical_path = skill_file
            .canonicalize()
            .unwrap_or_else(|_| skill_file.clone())
            .to_string_lossy()
            .to_string();

        if !seen_paths.insert(canonical_path.clone()) {
            continue;
        }

        // content 存储 SKILL.md 文本内容。
        let content = match fs::read_to_string(&skill_file) {
            Ok(value) => value,
            Err(error) => {
                diagnostics.push(format!(
                    "读取 Skill 失败：{} ({})",
                    skill_file.to_string_lossy(),
                    error
                ));
                continue;
            }
        };
        // fallback_name 存储无 front matter name 时使用的目录名。
        let fallback_name = skill_file
            .parent()
            .and_then(|parent| parent.file_name())
            .and_then(|name| name.to_str())
            .unwrap_or("unknown");
        // metadata 存储从 SKILL.md 解析出的名称和说明。
        let metadata = parse_skill_markdown(&content, fallback_name);

        skills.push(SkillInfo {
            name: metadata.0,
            description: metadata.1,
            source: refine_source(&root.source, &skill_file),
            tool: root.tool.clone(),
            plugin: infer_plugin_name(&root.path, &root.source, &skill_file),
            path: canonical_path,
        });
    }
}

// collect_skill_files 递归收集目录下所有 SKILL.md 文件。
// dir 为当前目录，depth 为当前深度，out 与 diagnostics 分别接收路径与诊断。
fn collect_skill_files(
    dir: &Path,
    depth: usize,
    out: &mut Vec<PathBuf>,
    diagnostics: &mut Vec<String>,
) {
    if depth > MAX_SCAN_DEPTH {
        return;
    }

    // entries 存储当前目录的读取结果。
    let entries = match fs::read_dir(dir) {
        Ok(value) => value,
        Err(error) => {
            diagnostics.push(format!(
                "读取目录失败：{} ({})",
                dir.to_string_lossy(),
                error
            ));
            return;
        }
    };

    for entry_result in entries {
        // entry 存储当前目录条目，读取失败时跳过并记录诊断。
        let entry = match entry_result {
            Ok(value) => value,
            Err(error) => {
                diagnostics.push(format!("读取目录条目失败：{}", error));
                continue;
            }
        };
        // path 存储当前条目的完整路径。
        let path = entry.path();
        // file_name 存储当前条目的文件名文本。
        let file_name = entry.file_name().to_string_lossy().to_string();

        if path.is_file() && file_name == "SKILL.md" {
            out.push(path);
            continue;
        }

        if path.is_dir() && should_descend_into(&file_name) {
            collect_skill_files(&path, depth + 1, out, diagnostics);
        }
    }
}

// should_descend_into 判断递归扫描时是否进入某个目录。
// file_name 为目录名；跳过典型大目录，避免扫描无关依赖与构建产物。
fn should_descend_into(file_name: &str) -> bool {
    !matches!(file_name, "node_modules" | "target" | ".git")
}

// parse_skill_markdown 从 SKILL.md front matter 中解析 name 与 description。
// content 为 markdown 文本，fallback_name 为缺少 name 时使用的目录名。
fn parse_skill_markdown(content: &str, fallback_name: &str) -> (String, String) {
    // name 存储解析出的 Skill 名称。
    let mut name = String::new();
    // description 存储解析出的 Skill 用途说明。
    let mut description = String::new();

    if content.trim_start().starts_with("---") {
        // in_front_matter 标记当前行是否仍处于 front matter 块中。
        let mut in_front_matter = false;

        for (index, line) in content.lines().enumerate() {
            // trimmed 存储去除首尾空白后的当前行。
            let trimmed = line.trim();

            if index == 0 && trimmed == "---" {
                in_front_matter = true;
                continue;
            }
            if in_front_matter && trimmed == "---" {
                break;
            }
            if !in_front_matter {
                continue;
            }

            if let Some(value) = trimmed.strip_prefix("name:") {
                name = clean_yaml_value(value);
            } else if let Some(value) = trimmed.strip_prefix("description:") {
                description = clean_yaml_value(value);
            }
        }
    }

    if name.is_empty() {
        name = fallback_name.to_string();
    }

    (name, description)
}

// clean_yaml_value 清理 front matter 中的单行 YAML 值。
// value 为冒号后面的原始文本。
fn clean_yaml_value(value: &str) -> String {
    // trimmed 存储去除空白后的值。
    let trimmed = value.trim();
    // unquoted 存储去除成对引号后的值。
    let unquoted = if (trimmed.starts_with('"') && trimmed.ends_with('"'))
        || (trimmed.starts_with('\'') && trimmed.ends_with('\''))
    {
        &trimmed[1..trimmed.len().saturating_sub(1)]
    } else {
        trimmed
    };

    unquoted.replace("\\\"", "\"")
}

// refine_source 根据路径细化来源展示名。
// source 为根目录来源，skill_file 为 SKILL.md 路径。
fn refine_source(source: &str, skill_file: &Path) -> String {
    if source == "Codex 用户" && skill_file.to_string_lossy().contains("/skills/.system/") {
        return "Codex 系统".to_string();
    }

    source.to_string()
}

// infer_plugin_name 尝试从插件目录路径中推断插件归属。
// root 为扫描根目录，source 为来源展示名，skill_file 为 SKILL.md 路径。
fn infer_plugin_name(root: &Path, source: &str, skill_file: &Path) -> String {
    if !source.contains("插件") {
        return String::new();
    }

    // relative 存储 skill 文件相对于扫描根目录的路径。
    let relative = match skill_file.strip_prefix(root) {
        Ok(value) => value,
        Err(_) => return String::new(),
    };
    // parts 存储相对路径各段文本。
    let parts: Vec<String> = relative
        .components()
        .filter_map(|part| part.as_os_str().to_str().map(|value| value.to_string()))
        .collect();

    if source == "Codex 插件" && parts.len() >= 2 {
        // marketplace 存储 Codex 插件 marketplace 名称。
        let marketplace = &parts[0];
        // plugin 存储 Codex 插件短名称。
        let plugin = &parts[1];
        return format!("{}@{}", plugin, marketplace);
    }

    parts.first().cloned().unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    // 验证 front matter 中的 name 与 description 会被正确提取。
    #[test]
    fn parses_skill_front_matter() {
        // content 存储带 front matter 的 Skill 文本。
        let content = "---\nname: brainstorming\ndescription: \"Explore ideas.\"\n---\n# Body";

        assert_eq!(
            parse_skill_markdown(content, "fallback"),
            ("brainstorming".to_string(), "Explore ideas.".to_string())
        );
    }

    // 验证缺少 name 时使用目录名兜底，避免前端出现空标题。
    #[test]
    fn falls_back_to_directory_name_when_name_missing() {
        // content 存储不含 front matter 的 Skill 文本。
        let content = "# Skill\n\nBody";

        assert_eq!(
            parse_skill_markdown(content, "local-skill"),
            ("local-skill".to_string(), String::new())
        );
    }

    // 验证 Codex 插件缓存路径能推断出 plugin@marketplace 归属。
    #[test]
    fn infers_codex_plugin_name_from_cache_path() {
        // root 存储 Codex 插件缓存根目录。
        let root = PathBuf::from("/Users/test/.codex/plugins/cache");
        // skill_file 存储某个插件 Skill 的典型路径。
        let skill_file = root
            .join("superpowers-dev")
            .join("superpowers")
            .join("6.0.3")
            .join("skills")
            .join("brainstorming")
            .join("SKILL.md");

        assert_eq!(
            infer_plugin_name(&root, "Codex 插件", &skill_file),
            "superpowers@superpowers-dev"
        );
    }

    // 验证 Codex 内置 system skill 会被细化显示为 Codex 系统。
    #[test]
    fn refines_codex_system_skill_source() {
        // skill_file 存储 Codex system skill 的典型路径。
        let skill_file = PathBuf::from("/Users/test/.codex/skills/.system/openai-docs/SKILL.md");

        assert_eq!(refine_source("Codex 用户", &skill_file), "Codex 系统");
    }
}
