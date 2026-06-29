// 插件管理模块：解析 Claude 已安装插件与市场，支持手动触发更新
use super::util::{command_with_path, expand_home};
use serde::{Deserialize, Serialize};

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

// 读取已安装插件列表（解析 ~/.claude/plugins/installed_plugins.json）
#[tauri::command]
pub fn list_claude_plugins(claude_home: String) -> Result<Vec<PluginInfo>, String> {
    // path 为 installed_plugins.json 绝对路径
    let path = expand_home(&claude_home).join("plugins").join("installed_plugins.json");
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
            let marketplace = full_name
                .split('@')
                .nth(1)
                .unwrap_or("")
                .to_string();
            // 每个插件可能有多条安装记录（不同 scope），逐条展开
            if let Some(arr) = installs.as_array() {
                for inst in arr {
                    result.push(PluginInfo {
                        name: full_name.clone(),
                        marketplace: marketplace.clone(),
                        version: inst.get("version").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                        scope: inst.get("scope").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                        install_path: inst.get("installPath").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                        installed_at: inst.get("installedAt").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                        last_updated: inst.get("lastUpdated").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                        git_commit_sha: inst.get("gitCommitSha").and_then(|v| v.as_str()).unwrap_or("").to_string(),
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
    let path = expand_home(&claude_home).join("plugins").join("known_marketplaces.json");
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
                install_location: val.get("installLocation").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                last_updated: val.get("lastUpdated").and_then(|v| v.as_str()).unwrap_or("").to_string(),
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
        Err(format!("更新失败:\n{}\n{}", stdout, stderr).trim().to_string())
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
        Err(format!("更新失败:\n{}\n{}", stdout, stderr).trim().to_string())
    }
}
