// 插件管理模块：解析 Claude 已安装插件与市场，支持手动触发更新
use super::util::{command_with_path, expand_home};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

// 单个已安装插件的可视化信息
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PluginInfo {
    // 插件全名，如 "development-tools@cyt-plugins"
    pub name: String,
    // 所属市场名，如 "cyt-plugins"
    pub marketplace: String,
    // 安装版本号
    pub version: String,
    // 安装作用域：user / project
    pub scope: String,
    // 安装路径
    pub install_path: String,
    // 安装时间（ISO 字符串）
    pub installed_at: String,
    // 最近更新时间（ISO 字符串）
    pub last_updated: String,
    // git commit sha，便于判断是否有新版本
    pub git_commit_sha: String,
}

// 市场信息，更新插件时需要先更新对应市场
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MarketplaceInfo {
    // 市场名
    pub name: String,
    // 来源类型：git / local
    pub source_type: String,
    // 来源地址（git url 或本地路径）
    pub source: String,
    // 本地安装位置
    pub install_location: String,
    // 最近更新时间
    pub last_updated: String,
}

// 插件更新检查结果：统一承载单个工具的已安装插件与可用更新信息
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PluginUpdateCheckResult {
    // tool 存储工具标识：claude 或 codex
    pub tool: String,
    // plugins 存储已安装插件及其可用版本信息
    pub plugins: Vec<ToolPluginInfo>,
    // raw_output 存储 CLI 原始 stdout，解析异常或诊断时便于排查
    pub raw_output: String,
    // diagnostics 存储成功时 CLI stderr 中的提示信息，供前端按需展示 warning。
    pub diagnostics: String,
}

// 单个插件的统一展示信息，供前端跨工具复用
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ToolPluginInfo {
    // id 存储插件完整 ID，如 browser@openai-bundled
    pub id: String,
    // name 存储插件短名称
    pub name: String,
    // marketplace 存储插件所属 marketplace 名称
    pub marketplace: String,
    // current_version 存储当前已安装版本
    pub current_version: String,
    // available_version 存储 marketplace 中可用版本
    pub available_version: String,
    // scope 存储安装作用域；Codex 无该字段时为空串
    pub scope: String,
    // enabled 标记插件当前是否启用
    pub enabled: bool,
    // install_path 存储插件安装路径
    pub install_path: String,
    // last_updated 存储插件最近更新时间
    pub last_updated: String,
    // update_status 存储版本比较结果：same / newer / different / unknown
    pub update_status: String,
}

// VersionParts 存储从版本字符串中解析出的 semver-like 主干与预发布标签。
#[derive(Debug)]
struct VersionParts {
    // major 存储主版本号。
    major: u64,
    // minor 存储次版本号。
    minor: u64,
    // patch 存储补丁版本号。
    patch: u64,
    // prerelease 存储预发布标签；正式版为 None。
    prerelease: Option<String>,
}

// PrereleaseIdentifier 存储 prerelease 点分段的文本与数字类型信息。
#[derive(Debug)]
struct PrereleaseIdentifier {
    // value 存储当前 prerelease 分段的原始文本。
    value: String,
    // is_numeric 标记当前分段是否为纯数字，纯数字需要按数值比较。
    is_numeric: bool,
}

// 解析 semver-like 版本字符串。
// version 为待解析的版本文本，必须形如 1.2.3 或 1.2.3-beta.1。
fn parse_semver_like(version: &str) -> Option<VersionParts> {
    // trimmed 存储去掉首尾空白后的版本文本。
    let trimmed = version.trim();
    // split 存储主版本与 prerelease 的切分结果。
    let split = trimmed.split_once('-');
    // core 存储 semver 主版本部分。
    let core = split.map(|parts| parts.0).unwrap_or(trimmed);
    // prerelease 存储可选的预发布标签。
    let prerelease = split.map(|parts| parts.1.to_string());
    // core_parts 存储主版本、次版本、补丁版本三个片段。
    let core_parts = core.split('.').collect::<Vec<&str>>();

    if core_parts.len() != 3 {
        return None;
    }

    if prerelease.as_ref().is_some_and(|value| value.is_empty()) {
        return None;
    }

    if prerelease.as_ref().is_some_and(|value| {
        !value.chars().all(|character| {
            character.is_ascii_alphanumeric() || character == '.' || character == '-'
        })
    }) {
        return None;
    }

    Some(VersionParts {
        major: core_parts[0].parse::<u64>().ok()?,
        minor: core_parts[1].parse::<u64>().ok()?,
        patch: core_parts[2].parse::<u64>().ok()?,
        prerelease,
    })
}

// 将 prerelease 字符串拆成可比较的点分段。
// prerelease 为预发布标签，返回值用于 semver-like 排序。
fn split_prerelease(prerelease: &str) -> Vec<PrereleaseIdentifier> {
    prerelease
        .split('.')
        .map(|identifier| {
            // value 存储当前点分段文本。
            let value = identifier.to_string();
            // is_numeric 标记当前分段是否能按数字比较。
            let is_numeric =
                !value.is_empty() && value.chars().all(|character| character.is_ascii_digit());
            PrereleaseIdentifier { value, is_numeric }
        })
        .collect::<Vec<PrereleaseIdentifier>>()
}

// 比较两个 prerelease 标签的先后顺序。
// left 和 right 分别存储左右两个预发布标签；返回负数表示 left 更旧。
fn compare_prerelease(left: &str, right: &str) -> i8 {
    // left_identifiers 存储左侧 prerelease 的点分段。
    let left_identifiers = split_prerelease(left);
    // right_identifiers 存储右侧 prerelease 的点分段。
    let right_identifiers = split_prerelease(right);
    // shared_len 存储左右两侧可逐段比较的长度。
    let shared_len = left_identifiers.len().min(right_identifiers.len());

    for index in 0..shared_len {
        // left_identifier 存储左侧当前位置的 prerelease 分段。
        let left_identifier = &left_identifiers[index];
        // right_identifier 存储右侧当前位置的 prerelease 分段。
        let right_identifier = &right_identifiers[index];

        if left_identifier.value == right_identifier.value {
            continue;
        }

        if left_identifier.is_numeric && right_identifier.is_numeric {
            // left_number 存储左侧纯数字 prerelease 分段。
            let left_number = left_identifier.value.parse::<u64>().unwrap_or(0);
            // right_number 存储右侧纯数字 prerelease 分段。
            let right_number = right_identifier.value.parse::<u64>().unwrap_or(0);
            return if left_number < right_number { -1 } else { 1 };
        }

        if left_identifier.is_numeric != right_identifier.is_numeric {
            return if left_identifier.is_numeric { -1 } else { 1 };
        }

        return if left_identifier.value < right_identifier.value {
            -1
        } else {
            1
        };
    }

    if left_identifiers.len() == right_identifiers.len() {
        0
    } else if left_identifiers.len() < right_identifiers.len() {
        -1
    } else {
        1
    }
}

// 比较已安装版本与 marketplace 可用版本，返回统一更新状态。
// current 为已安装版本；available 为 marketplace 返回的最新版本。
fn compare_versions(current: &str, available: &str) -> String {
    if current.trim().is_empty() || available.trim().is_empty() {
        return "unknown".to_string();
    }
    if current == available {
        return "same".to_string();
    }

    // current_parts 存储当前版本解析后的 semver-like 结构。
    let current_parts = parse_semver_like(current);
    // available_parts 存储可用版本解析后的 semver-like 结构。
    let available_parts = parse_semver_like(available);

    if current_parts.is_none() || available_parts.is_none() {
        return if current == available {
            "same"
        } else {
            "different"
        }
        .to_string();
    }

    // current_parts 存储当前版本结构，前面已确认存在。
    let current_parts = current_parts.unwrap();
    // available_parts 存储可用版本结构，前面已确认存在。
    let available_parts = available_parts.unwrap();

    if current_parts.major != available_parts.major {
        return if current_parts.major < available_parts.major {
            "newer"
        } else {
            "different"
        }
        .to_string();
    }
    if current_parts.minor != available_parts.minor {
        return if current_parts.minor < available_parts.minor {
            "newer"
        } else {
            "different"
        }
        .to_string();
    }
    if current_parts.patch != available_parts.patch {
        return if current_parts.patch < available_parts.patch {
            "newer"
        } else {
            "different"
        }
        .to_string();
    }

    if current_parts.prerelease == available_parts.prerelease {
        return "same".to_string();
    }

    if current_parts.prerelease.is_none() && available_parts.prerelease.is_some() {
        return "different".to_string();
    }

    if current_parts.prerelease.is_some() && available_parts.prerelease.is_none() {
        return "newer".to_string();
    }

    // current_prerelease 存储当前版本的预发布标签；上方已排除 None 场景。
    let current_prerelease = current_parts.prerelease.unwrap_or_default();
    // available_prerelease 存储可用版本的预发布标签；上方已排除 None 场景。
    let available_prerelease = available_parts.prerelease.unwrap_or_default();
    if compare_prerelease(&current_prerelease, &available_prerelease) < 0 {
        "newer".to_string()
    } else {
        "different".to_string()
    }
}

// 从插件完整 ID 中提取短名称。
// id 为形如 name@marketplace 的插件完整标识。
fn plugin_short_name(id: &str) -> String {
    id.split('@').next().unwrap_or(id).to_string()
}

// 从插件完整 ID 中提取 marketplace 名称。
// id 为形如 name@marketplace 的插件完整标识。
fn plugin_marketplace(id: &str) -> String {
    id.split('@').nth(1).unwrap_or("").to_string()
}

// toml_bool 读取 TOML 表字段中的布尔值；缺失时返回 false。
// item 为当前 TOML 表；field 为目标字段名。
fn toml_bool(item: &toml::value::Table, field: &str) -> bool {
    item.get(field)
        .and_then(|value| value.as_bool())
        .unwrap_or(false)
}

// read_codex_config_root 读取 Codex config.toml 并解析为 TOML Value。
// codex_home 为 Codex home 目录路径。
fn read_codex_config_root(codex_home: &Path) -> Result<toml::Value, String> {
    // config_path 存储 Codex config.toml 的绝对路径。
    let config_path = codex_home.join("config.toml");
    // content 存储 config.toml 文件文本。
    let content = std::fs::read_to_string(&config_path)
        .map_err(|e| format!("读取 Codex config.toml 失败: {}", e))?;
    content
        .parse::<toml::Value>()
        .map_err(|e| format!("解析 Codex config.toml 失败: {}", e))
}

// read_codex_plugin_manifest 读取已安装 Codex 插件的 plugin.json。
// install_path 为具体版本安装目录。
fn read_codex_plugin_manifest(install_path: &Path) -> Option<serde_json::Value> {
    // manifest_path 存储 Codex 插件 manifest 的路径。
    let manifest_path = install_path.join(".codex-plugin").join("plugin.json");
    // content 存储 manifest JSON 文本。
    let content = std::fs::read_to_string(manifest_path).ok()?;
    serde_json::from_str::<serde_json::Value>(&content).ok()
}

// latest_codex_plugin_install_path 在本地 cache 中寻找指定插件的最新安装目录。
// codex_home 为 Codex home；marketplace 与 name 分别为插件来源和短名。
fn latest_codex_plugin_install_path(
    codex_home: &Path,
    marketplace: &str,
    name: &str,
) -> Option<PathBuf> {
    // plugin_root 存储该插件所有版本目录所在位置。
    let plugin_root = codex_home
        .join("plugins")
        .join("cache")
        .join(marketplace)
        .join(name);
    // entries 存储该插件 cache 下的版本目录。
    let entries = std::fs::read_dir(plugin_root).ok()?;
    // candidates 存储包含 .codex-plugin/plugin.json 的候选版本目录。
    let mut candidates = entries
        .filter_map(|entry| entry.ok().map(|value| value.path()))
        .filter(|path| path.join(".codex-plugin").join("plugin.json").exists())
        .collect::<Vec<PathBuf>>();

    candidates.sort_by(|left, right| {
        // left_name 存储左侧候选目录名。
        let left_name = left
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("");
        // right_name 存储右侧候选目录名。
        let right_name = right
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("");
        match compare_versions(left_name, right_name).as_str() {
            "newer" => std::cmp::Ordering::Less,
            "same" => std::cmp::Ordering::Equal,
            _ => std::cmp::Ordering::Greater,
        }
    });
    candidates.pop()
}

// build_codex_fallback_result 在 Codex CLI 因 marketplace 损坏失败时，从本地配置/cache 构造降级结果。
// codex_home 为 Codex home；diagnostics 为原始 CLI 错误文本。
fn build_codex_fallback_result(
    codex_home: &Path,
    diagnostics: &str,
) -> Result<PluginUpdateCheckResult, String> {
    // root 存储解析后的 Codex config.toml。
    let root = read_codex_config_root(codex_home)?;
    // plugins_table 存储 config.toml 中的 [plugins] 表。
    let plugins_table = root
        .get("plugins")
        .and_then(|value| value.as_table())
        .ok_or_else(|| diagnostics.to_string())?;
    // plugins 存储从本地配置/cache 构造出的插件列表。
    let mut plugins = Vec::<ToolPluginInfo>::new();

    for (id, value) in plugins_table {
        // marketplace 存储插件所属 marketplace。
        let marketplace = plugin_marketplace(id);
        // name 存储插件短名称。
        let name = plugin_short_name(id);
        // enabled 标记插件当前是否启用。
        let enabled = value
            .as_table()
            .map(|table| toml_bool(table, "enabled"))
            .unwrap_or(false);
        // install_path 存储本地 cache 中最新版本目录。
        let install_path = latest_codex_plugin_install_path(codex_home, &marketplace, &name);
        // manifest 存储插件本地 manifest 内容。
        let manifest = install_path
            .as_ref()
            .and_then(|path| read_codex_plugin_manifest(path));
        // current_version 存储插件当前安装版本。
        let current_version = manifest
            .as_ref()
            .map(|item| json_string(item, "version"))
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| {
                install_path
                    .as_ref()
                    .and_then(|path| path.file_name())
                    .and_then(|value| value.to_str())
                    .unwrap_or("")
                    .to_string()
            });
        // display_name 存储 manifest 中的插件名，缺失时回退到 ID 短名。
        let display_name = manifest
            .as_ref()
            .map(|item| json_string(item, "name"))
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| name.clone());

        plugins.push(ToolPluginInfo {
            id: id.clone(),
            name: display_name,
            marketplace,
            current_version,
            available_version: String::new(),
            scope: String::new(),
            enabled,
            install_path: install_path
                .map(|path| path.to_string_lossy().to_string())
                .unwrap_or_default(),
            last_updated: String::new(),
            update_status: "unknown".to_string(),
        });
    }

    plugins.sort_by(|left, right| left.id.to_lowercase().cmp(&right.id.to_lowercase()));

    Ok(PluginUpdateCheckResult {
        tool: "codex".to_string(),
        plugins,
        raw_output: String::new(),
        diagnostics: diagnostics.to_string(),
    })
}

// 解析命令输出中的 JSON 根对象。
// content 为 CLI stdout 文本；tool_label 为错误提示中的工具名。
fn parse_json_root(content: &str, tool_label: &str) -> Result<serde_json::Value, String> {
    // root 存储反序列化后的 JSON 根节点，供各工具 parser 二次提取字段。
    let root = serde_json::from_str::<serde_json::Value>(content)
        .map_err(|e| format!("解析 {} 插件 JSON 失败: {}", tool_label, e))?;
    Ok(root)
}

// 读取对象字段中的字符串；缺失时返回空串，便于统一前端展示。
// item 为当前 JSON 对象；field 为目标字段名。
fn json_string(item: &serde_json::Value, field: &str) -> String {
    item.get(field)
        .and_then(|value| value.as_str())
        .unwrap_or("")
        .to_string()
}

// 读取对象字段中的布尔值；缺失时返回 false。
// item 为当前 JSON 对象；field 为目标字段名。
fn json_bool(item: &serde_json::Value, field: &str) -> bool {
    item.get(field)
        .and_then(|value| value.as_bool())
        .unwrap_or(false)
}

// 基于 installed/available 数组构建已安装插件的统一更新信息。
// tool 为工具标识；installed 为已安装插件数组；available_versions 为最新版本映射；
// 其余参数用于描述不同 CLI JSON 字段名。
fn build_plugin_update_result(
    tool: &str,
    installed: &[serde_json::Value],
    available_versions: &HashMap<String, String>,
    id_field: &str,
    name_field: Option<&str>,
    marketplace_field: Option<&str>,
    scope_field: Option<&str>,
    install_path_field: &str,
    last_updated_field: &str,
) -> PluginUpdateCheckResult {
    // plugins 存储统一格式的插件列表，最终返回给前端。
    let mut plugins = Vec::<ToolPluginInfo>::new();
    for item in installed {
        // id 存储当前已安装插件的完整标识。
        let id = json_string(item, id_field);
        // current_version 存储当前安装版本。
        let current_version = json_string(item, "version");
        // available_version 存储 marketplace 中可用版本；缺失时为空串。
        let available_version = available_versions.get(&id).cloned().unwrap_or_default();
        // name 存储插件短名称；Codex/Claude 字段不同，因此先读显式字段，再从 id 回退。
        let name = name_field
            .map(|field| json_string(item, field))
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| plugin_short_name(&id));
        // marketplace 存储 marketplace 名称；字段缺失时从 id 回退。
        let marketplace = marketplace_field
            .map(|field| json_string(item, field))
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| plugin_marketplace(&id));
        // scope 存储插件安装作用域；Codex 没有该信息时统一为空串。
        let scope = scope_field
            .map(|field| json_string(item, field))
            .unwrap_or_default();
        plugins.push(ToolPluginInfo {
            id,
            name,
            marketplace,
            current_version: current_version.clone(),
            available_version: available_version.clone(),
            scope,
            enabled: json_bool(item, "enabled"),
            install_path: json_string(item, install_path_field),
            last_updated: json_string(item, last_updated_field),
            update_status: compare_versions(&current_version, &available_version),
        });
    }
    PluginUpdateCheckResult {
        tool: tool.to_string(),
        plugins,
        raw_output: String::new(),
        diagnostics: String::new(),
    }
}

// 解析 Claude plugin list --json --available 输出。
// content 为 Claude CLI stdout 返回的 JSON 文本。
fn parse_claude_plugin_update_json(content: &str) -> Result<PluginUpdateCheckResult, String> {
    // root 存储 Claude 插件列表 JSON 根对象。
    let root = parse_json_root(content, "Claude")?;
    // available_versions 存储 pluginId 到 marketplace 可用版本的映射。
    let mut available_versions = HashMap::<String, String>::new();
    if let Some(available) = root.get("available").and_then(|value| value.as_array()) {
        for item in available {
            // id 存储 marketplace 返回的插件完整 ID。
            let id = json_string(item, "pluginId");
            // version 存储 marketplace 返回的可用版本。
            let version = json_string(item, "version");
            if !id.is_empty() {
                available_versions.insert(id, version);
            }
        }
    }
    // installed 存储已安装插件数组；缺失时按空数组处理。
    let installed = root
        .get("installed")
        .and_then(|value| value.as_array())
        .cloned()
        .unwrap_or_default();
    // result 存储统一化后的 Claude 插件更新结果。
    let mut result = build_plugin_update_result(
        "claude",
        &installed,
        &available_versions,
        "id",
        None,
        None,
        Some("scope"),
        "installPath",
        "lastUpdated",
    );
    result.raw_output = content.to_string();
    Ok(result)
}

// 基于 Claude 更新检查命令的 stdout/stderr 构造统一结果。
// stdout 为可解析 JSON；stderr 为成功时的 warning/诊断输出。
fn parse_claude_plugin_update_check_output(
    stdout: &str,
    stderr: &str,
) -> Result<PluginUpdateCheckResult, String> {
    // result 存储基于 stdout 解析出的 Claude 更新检查结果。
    let mut result = parse_claude_plugin_update_json(stdout)?;
    // 成功时 stderr 只作为诊断信息保留，不能参与 JSON 解析。
    result.diagnostics = stderr.trim().to_string();
    Ok(result)
}

// 解析 Codex plugin list --json --available 输出。
// content 为 Codex CLI stdout 返回的 JSON 文本。
fn parse_codex_plugin_update_json(content: &str) -> Result<PluginUpdateCheckResult, String> {
    // root 存储 Codex 插件列表 JSON 根对象。
    let root = parse_json_root(content, "Codex")?;
    // available_versions 存储插件 ID 到 marketplace 可用版本的映射。
    let mut available_versions = HashMap::<String, String>::new();
    if let Some(available) = root.get("available").and_then(|value| value.as_array()) {
        for item in available {
            // id 存储 marketplace 返回的插件完整 ID。
            let id = json_string(item, "id");
            // version 存储 marketplace 返回的可用版本。
            let version = json_string(item, "version");
            if !id.is_empty() {
                available_versions.insert(id, version);
            }
        }
    }
    // installed 存储已安装插件数组；缺失时按空数组处理。
    let installed = root
        .get("installed")
        .and_then(|value| value.as_array())
        .cloned()
        .unwrap_or_default();
    // result 存储统一化后的 Codex 插件更新结果。
    let mut result = build_plugin_update_result(
        "codex",
        &installed,
        &available_versions,
        "id",
        Some("name"),
        Some("marketplace"),
        None,
        "install_path",
        "last_updated",
    );
    result.raw_output = content.to_string();
    Ok(result)
}

// 基于 Codex 更新检查命令的 stdout/stderr 构造统一结果。
// stdout 为可解析 JSON；stderr 为成功时的 warning/诊断输出。
fn parse_codex_plugin_update_check_output(
    stdout: &str,
    stderr: &str,
) -> Result<PluginUpdateCheckResult, String> {
    // result 存储基于 stdout 解析出的 Codex 更新检查结果。
    let mut result = parse_codex_plugin_update_json(stdout)?;
    // 成功时 stderr 只作为诊断信息保留，不能参与 JSON 解析。
    result.diagnostics = stderr.trim().to_string();
    Ok(result)
}

// 插件 CLI 的原始执行结果：为更新检查保留纯 stdout/stderr，为更新命令保留错误透传能力。
#[derive(Debug, Clone)]
struct PluginCliOutput {
    // stdout 存储命令标准输出文本。
    stdout: String,
    // stderr 存储命令标准错误文本。
    stderr: String,
}

// 执行插件相关 CLI 命令并返回拆分后的 stdout/stderr。
// bin 为命令名；args 为命令参数；home_env_key 为工具根目录环境变量名；home_dir 为工具根目录。
fn run_plugin_cli_raw(
    bin: &str,
    args: &[&str],
    home_env_key: &str,
    home_dir: &str,
) -> Result<PluginCliOutput, String> {
    // expanded_home 存储展开后的工具根目录，确保 ~ 能被 CLI 正确识别。
    let expanded_home = expand_home(home_dir);
    // output 为插件 CLI 命令执行结果；注入 home 环境变量以显式命中用户当前配置目录。
    let output = command_with_path(bin)
        .env(home_env_key, expanded_home)
        .args(args)
        .output()
        .map_err(|e| format!("执行 {} CLI 失败（请确认已安装 {}）: {}", bin, bin, e))?;
    // stdout 存储命令标准输出文本。
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    // stderr 存储命令标准错误文本。
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    // merged_output 存储失败时要原样透传给调用方的合并结果。
    let merged_output = format!("{}\n{}", stdout, stderr).trim().to_string();
    if output.status.success() {
        Ok(PluginCliOutput { stdout, stderr })
    } else {
        Err(format!("执行命令失败:\n{}", merged_output)
            .trim()
            .to_string())
    }
}

// 执行插件相关 CLI 命令并返回合并后的可读输出。
// bin 为命令名；args 为命令参数；home_env_key 为工具根目录环境变量名；home_dir 为工具根目录。
fn run_plugin_cli(
    bin: &str,
    args: &[&str],
    home_env_key: &str,
    home_dir: &str,
) -> Result<String, String> {
    // output 存储拆分后的 CLI 输出，供更新命令复用原有“stdout+stderr 合并返回”行为。
    let output = run_plugin_cli_raw(bin, args, home_env_key, home_dir)?;
    // merged_output 存储合并后的可读结果，供错误回显与前端展示复用。
    let merged_output = format!("{}\n{}", output.stdout, output.stderr)
        .trim()
        .to_string();
    Ok(merged_output)
}

// 检查 Claude 已安装插件是否存在可用更新。
// claude_home 为 Claude 配置根目录，用于让 CLI 指向用户当前选择的 Claude 环境。
#[tauri::command]
pub fn check_claude_plugin_updates(claude_home: String) -> Result<PluginUpdateCheckResult, String> {
    // output 存储 claude plugin list --json --available 的原始 stdout/stderr。
    let output = run_plugin_cli_raw(
        "claude",
        &["plugin", "list", "--json", "--available"],
        "CLAUDE_HOME",
        &claude_home,
    )?;
    parse_claude_plugin_update_check_output(&output.stdout, &output.stderr)
}

// 检查 Codex 已安装插件是否存在可用更新。
// codex_home 为 Codex 配置根目录，用于让 CLI 指向用户当前选择的 Codex 环境。
#[tauri::command]
pub fn check_codex_plugin_updates(codex_home: String) -> Result<PluginUpdateCheckResult, String> {
    // expanded_home 存储展开后的 Codex home，CLI 失败时用于本地 fallback。
    let expanded_home = expand_home(&codex_home);
    // output 存储 codex plugin list --available --json 的原始 stdout/stderr。
    let output = run_plugin_cli_raw(
        "codex",
        &["plugin", "list", "--available", "--json"],
        "CODEX_HOME",
        &codex_home,
    );
    let output = match output {
        Ok(output) => output,
        Err(error) => return build_codex_fallback_result(&expanded_home, &error),
    };
    parse_codex_plugin_update_check_output(&output.stdout, &output.stderr)
}

// 读取已安装插件列表（解析 ~/.claude/plugins/installed_plugins.json）
#[tauri::command]
pub fn list_claude_plugins(claude_home: String) -> Result<Vec<PluginInfo>, String> {
    // path 为 installed_plugins.json 绝对路径
    let path = expand_home(&claude_home)
        .join("plugins")
        .join("installed_plugins.json");
    if !path.exists() {
        return Ok(vec![]);
    }
    // content 为文件 JSON 文本
    let content = std::fs::read_to_string(&path).map_err(|e| format!("读取插件列表失败: {}", e))?;
    // root 为顶层 JSON 对象
    let root: serde_json::Value =
        serde_json::from_str(&content).map_err(|e| format!("解析插件列表失败: {}", e))?;
    // result 累积所有插件信息
    let mut result: Vec<PluginInfo> = vec![];
    // plugins 节点形如 { "name@market": [ { ... } ] }
    if let Some(plugins) = root.get("plugins").and_then(|p| p.as_object()) {
        for (full_name, installs) in plugins {
            // marketplace 从 "name@market" 中截取 @ 之后部分
            let marketplace = full_name.split('@').nth(1).unwrap_or("").to_string();
            // 每个插件可能有多条安装记录（不同 scope），逐条展开
            if let Some(arr) = installs.as_array() {
                for inst in arr {
                    result.push(PluginInfo {
                        name: full_name.clone(),
                        marketplace: marketplace.clone(),
                        version: inst
                            .get("version")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string(),
                        scope: inst
                            .get("scope")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string(),
                        install_path: inst
                            .get("installPath")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string(),
                        installed_at: inst
                            .get("installedAt")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string(),
                        last_updated: inst
                            .get("lastUpdated")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string(),
                        git_commit_sha: inst
                            .get("gitCommitSha")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string(),
                    });
                }
            }
        }
    }
    // 按名称排序，保证展示稳定
    result.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(result)
}

// 读取市场列表（解析 ~/.claude/plugins/known_marketplaces.json）
#[tauri::command]
pub fn list_claude_marketplaces(claude_home: String) -> Result<Vec<MarketplaceInfo>, String> {
    // path 为 known_marketplaces.json 绝对路径
    let path = expand_home(&claude_home)
        .join("plugins")
        .join("known_marketplaces.json");
    if !path.exists() {
        return Ok(vec![]);
    }
    // content 为文件 JSON 文本
    let content = std::fs::read_to_string(&path).map_err(|e| format!("读取市场列表失败: {}", e))?;
    // root 为顶层 JSON 对象，键为市场名
    let root: serde_json::Value =
        serde_json::from_str(&content).map_err(|e| format!("解析市场列表失败: {}", e))?;
    // result 累积市场信息
    let mut result: Vec<MarketplaceInfo> = vec![];
    if let Some(obj) = root.as_object() {
        for (name, val) in obj {
            // source 节点描述来源类型与地址
            let source = val.get("source");
            result.push(MarketplaceInfo {
                name: name.clone(),
                source_type: source
                    .and_then(|s| s.get("source"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                source: source
                    .and_then(|s| s.get("url").or_else(|| s.get("source")))
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                install_location: val
                    .get("installLocation")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                last_updated: val
                    .get("lastUpdated")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
            });
        }
    }
    result.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(result)
}

// 手动更新插件：通过 claude CLI 执行插件更新命令
// plugin_name 为插件全名，scope 为安装作用域（user / project）
// 返回 CLI 的输出文本，供前端展示更新结果
#[tauri::command]
pub fn update_claude_plugin(plugin_name: String, scope: String) -> Result<String, String> {
    // args 累积传给 claude CLI 的参数
    // 使用 claude CLI 的 plugin 子命令触发更新，避免手动操作 git/缓存导致状态不一致
    let mut args: Vec<String> = vec!["plugin".into(), "update".into(), plugin_name];
    // scope 非空时显式传 -s，保证 project 作用域插件更新到正确位置（默认 user 会更新错对象）
    if !scope.trim().is_empty() {
        args.push("-s".into());
        args.push(scope);
    }
    // output 为 claude plugin update 命令的执行结果；command_with_path 注入登录 shell 的真实 PATH
    let output = command_with_path("claude")
        .args(&args)
        .output()
        .map_err(|e| format!("执行 claude CLI 失败（请确认已安装 claude）: {}", e))?;
    // stdout / stderr 合并为可读文本返回前端
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    if output.status.success() {
        Ok(format!("{}\n{}", stdout, stderr).trim().to_string())
    } else {
        Err(format!("更新失败:\n{}\n{}", stdout, stderr)
            .trim()
            .to_string())
    }
}

// 更新市场：通过 claude CLI 刷新指定市场的插件目录
#[tauri::command]
pub fn update_claude_marketplace(marketplace_name: String) -> Result<String, String> {
    // output 为 claude marketplace update 命令执行结果；command_with_path 注入真实 PATH
    let output = command_with_path("claude")
        .args(["plugin", "marketplace", "update", &marketplace_name])
        .output()
        .map_err(|e| format!("执行 claude CLI 失败（请确认已安装 claude）: {}", e))?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    if output.status.success() {
        Ok(format!("{}\n{}", stdout, stderr).trim().to_string())
    } else {
        Err(format!("更新失败:\n{}\n{}", stdout, stderr)
            .trim()
            .to_string())
    }
}

// 通过官方 Codex CLI 安装指定 marketplace 中的插件，从而完成插件升级。
// plugin_id 为插件名或完整 ID；marketplace 为目标 marketplace 名称。
#[tauri::command]
pub fn update_codex_plugin(plugin_id: String, marketplace: String) -> Result<String, String> {
    // default_home 存储当前进程中的 CODEX_HOME；未设置时回退到默认 ~/.codex。
    let default_home = std::env::var("CODEX_HOME").unwrap_or_else(|_| "~/.codex".to_string());
    // plugin_arg 存储传给 Codex CLI 的插件选择器。
    let plugin_arg = plugin_id.trim().to_string();
    // marketplace_arg 存储清理后的 marketplace 参数。
    let marketplace_arg = marketplace.trim().to_string();
    // args 存储传给 codex plugin add 的参数列表。
    let mut args = vec!["plugin", "add", plugin_arg.as_str(), "--json"];
    // 当调用方传入裸插件名时，显式追加 marketplace，避免多个 marketplace 同名插件时安装到错误来源。
    if !marketplace_arg.is_empty() && !plugin_arg.contains('@') {
        args.push("--marketplace");
        args.push(marketplace_arg.as_str());
    }
    run_plugin_cli("codex", &args, "CODEX_HOME", &default_home)
}

// 通过官方 Codex CLI 刷新 marketplace 快照。
// marketplace_name 为待刷新的 marketplace 名称；为空时表示升级全部已配置 marketplace。
#[tauri::command]
pub fn update_codex_marketplace(marketplace_name: String) -> Result<String, String> {
    // default_home 存储当前进程中的 CODEX_HOME；未设置时回退到默认 ~/.codex。
    let default_home = std::env::var("CODEX_HOME").unwrap_or_else(|_| "~/.codex".to_string());
    // normalized_name 存储去除空白后的 marketplace 名称。
    let normalized_name = marketplace_name.trim().to_string();
    // args 存储传给 codex plugin marketplace upgrade 的参数列表。
    let mut args = vec!["plugin", "marketplace", "upgrade", "--json"];
    // 前端若未指定具体名称，则走 CLI 的“升级全部 marketplace”语义。
    if !normalized_name.is_empty() {
        args.push(normalized_name.as_str());
    }
    run_plugin_cli("codex", &args, "CODEX_HOME", &default_home)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    // 验证 Claude plugin list --json --available 输出能解析为统一更新信息
    #[test]
    fn test_parse_claude_plugin_update_json() {
        // json 存储 Claude CLI 返回的插件列表样例
        let json = r#"{
          "installed": [
            {
              "id": "superpowers@superpowers-dev",
              "version": "6.0.3",
              "scope": "user",
              "enabled": true,
              "installPath": "/tmp/superpowers/6.0.3",
              "lastUpdated": "2026-06-29T08:10:22.693Z"
            }
          ],
          "available": [
            {
              "pluginId": "superpowers@superpowers-dev",
              "name": "superpowers",
              "marketplaceName": "superpowers-dev",
              "version": "6.0.4",
              "source": "./"
            }
          ]
        }"#;

        // result 存储解析后的统一更新检查结果
        let result = parse_claude_plugin_update_json(json).expect("Claude 插件 JSON 应能解析");
        assert_eq!(result.plugins.len(), 1);
        assert_eq!(result.plugins[0].id, "superpowers@superpowers-dev");
        assert_eq!(result.plugins[0].current_version, "6.0.3");
        assert_eq!(result.plugins[0].available_version, "6.0.4");
        assert_eq!(result.plugins[0].update_status, "newer");
    }

    // 验证 Codex plugin list --json --available 输出能解析为统一更新信息
    #[test]
    fn test_parse_codex_plugin_update_json() {
        // json 存储 Codex CLI 返回的插件列表样例
        let json = r#"{
          "installed": [
            {
              "id": "browser@openai-bundled",
              "name": "browser",
              "marketplace": "openai-bundled",
              "version": "1.0.0",
              "enabled": true,
              "install_path": "/tmp/browser/1.0.0"
            }
          ],
          "available": [
            {
              "id": "browser@openai-bundled",
              "name": "browser",
              "marketplace": "openai-bundled",
              "version": "1.1.0",
              "source": "./browser"
            }
          ]
        }"#;

        // result 存储解析后的统一更新检查结果
        let result = parse_codex_plugin_update_json(json).expect("Codex 插件 JSON 应能解析");
        assert_eq!(result.plugins.len(), 1);
        assert_eq!(result.plugins[0].id, "browser@openai-bundled");
        assert_eq!(result.plugins[0].marketplace, "openai-bundled");
        assert_eq!(result.plugins[0].update_status, "newer");
    }

    // 验证更新检查只会解析 stdout 中的 JSON，不会被 stderr warning 污染。
    #[test]
    fn test_parse_claude_plugin_update_check_output_ignores_stderr_warning() {
        // stdout 存储 Claude CLI 成功时返回的 JSON 文本。
        let stdout = r#"{
          "installed": [
            {
              "id": "superpowers@superpowers-dev",
              "version": "6.0.3",
              "scope": "user",
              "enabled": true,
              "installPath": "/tmp/superpowers/6.0.3",
              "lastUpdated": "2026-06-29T08:10:22.693Z"
            }
          ],
          "available": [
            {
              "pluginId": "superpowers@superpowers-dev",
              "version": "6.0.4"
            }
          ]
        }"#;
        // stderr 存储 CLI 成功时额外打印的 warning 文本。
        let stderr = "warning: using cached marketplace index";

        // result 存储基于 stdout/stderr 构造出的统一更新检查结果。
        let result = parse_claude_plugin_update_check_output(stdout, stderr)
            .expect("stderr warning 不应污染 Claude 更新检查 JSON 解析");
        assert_eq!(result.raw_output, stdout);
        assert_eq!(result.plugins[0].available_version, "6.0.4");
    }

    // 验证 Codex 更新检查同样只解析 stdout，并保留 warning 作为诊断信息。
    #[test]
    fn test_parse_codex_plugin_update_check_output_ignores_stderr_warning() {
        // stdout 存储 Codex CLI 成功时返回的 JSON 文本。
        let stdout = r#"{
          "installed": [
            {
              "id": "browser@openai-bundled",
              "name": "browser",
              "marketplace": "openai-bundled",
              "version": "1.0.0",
              "enabled": true,
              "install_path": "/tmp/browser/1.0.0",
              "last_updated": "2026-06-29T08:10:22.693Z"
            }
          ],
          "available": [
            {
              "id": "browser@openai-bundled",
              "version": "1.1.0"
            }
          ]
        }"#;
        // stderr 存储 CLI 成功时额外打印的 warning 文本。
        let stderr = "warning: marketplace metadata is stale";

        // result 存储基于 stdout/stderr 构造出的统一更新检查结果。
        let result = parse_codex_plugin_update_check_output(stdout, stderr)
            .expect("stderr warning 不应污染 Codex 更新检查 JSON 解析");
        assert_eq!(result.raw_output, stdout);
        assert_eq!(result.plugins[0].update_status, "newer");
    }

    // 验证 Codex CLI 因 marketplace 快照损坏失败时，后端仍能从本地配置/cache 回退展示已安装插件。
    #[test]
    fn test_build_codex_fallback_result_reads_config_and_cache() {
        // dir 存储隔离的临时 Codex home。
        let dir = std::env::temp_dir().join(format!("vac_codex_fallback_{}", std::process::id()));
        // codex_home 存储临时 Codex home 的字符串形式。
        let codex_home = dir.to_string_lossy().to_string();
        // plugin_dir 存储模拟的插件安装目录。
        let plugin_dir = dir
            .join("plugins")
            .join("cache")
            .join("superpowers-dev")
            .join("superpowers")
            .join("6.0.3")
            .join(".codex-plugin");
        std::fs::create_dir_all(&plugin_dir).unwrap();
        std::fs::write(
            plugin_dir.join("plugin.json"),
            r#"{
              "name": "superpowers",
              "version": "6.0.3",
              "interface": { "displayName": "Superpowers" }
            }"#,
        )
        .unwrap();
        std::fs::write(
            dir.join("config.toml"),
            r#"
              [marketplaces.superpowers-dev]
              source_type = "local"
              source = "/missing/superpowers"

              [plugins."superpowers@superpowers-dev"]
              enabled = true
            "#,
        )
        .unwrap();

        // result 存储从本地配置/cache 构造出的 Codex fallback 结果。
        let result = build_codex_fallback_result(
            Path::new(&codex_home),
            "执行命令失败:\nmarketplace root does not contain a supported manifest",
        )
        .expect("fallback 应能读取本地 Codex 插件 cache");

        assert_eq!(result.tool, "codex");
        assert_eq!(result.plugins.len(), 1);
        assert_eq!(result.plugins[0].id, "superpowers@superpowers-dev");
        assert_eq!(result.plugins[0].current_version, "6.0.3");
        assert_eq!(result.plugins[0].available_version, "");
        assert_eq!(result.plugins[0].update_status, "unknown");
        assert!(result
            .diagnostics
            .contains("marketplace root does not contain a supported manifest"));

        let _ = std::fs::remove_dir_all(&dir);
    }

    // 验证后端插件版本比较会把同号预发布升级正式版识别为可更新，保持与前端提示一致。
    #[test]
    fn test_compare_versions_treats_prerelease_as_older_than_stable() {
        assert_eq!(compare_versions("1.0.0-beta.1", "1.0.0"), "newer");
        assert_eq!(compare_versions("1.0.0", "1.0.0-beta.1"), "different");
    }
}
