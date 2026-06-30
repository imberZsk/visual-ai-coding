// 系统集成模块：在 VSCode 打开路径、探测本机 AI 工具版本与状态
use super::util::{command_with_path, expand_home};
use serde::{Deserialize, Serialize};
use std::process::Command;

// 单个 AI 工具的探测结果，供前端展示安装状态
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ToolStatus {
    // 工具标识，如 "claude" / "codex"
    pub id: String,
    // 展示名称
    pub name: String,
    // 是否在 PATH 中检测到该 CLI
    pub installed: bool,
    // 探测到的版本文本，未安装时为空
    pub version: String,
    // CLI 可执行文件路径，未安装时为空
    pub path: String,
}

// 工具最新版本查询结果，供前端判断本机 CLI 是否可更新
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ToolLatestVersion {
    // tool_id 存储工具标识，如 claude / codex
    pub tool_id: String,
    // package_name 存储用于查询最新版的 npm 包名
    pub package_name: String,
    // latest_version 存储 npm registry 返回的 latest 版本号
    pub latest_version: String,
}

// 在 VSCode 中打开指定文件或目录
// vscode_path 为 code CLI 路径（默认 "code"），target 为要打开的文件/目录
#[tauri::command]
pub fn open_in_vscode(vscode_path: String, target: String) -> Result<(), String> {
    // abs 为展开后的目标绝对路径
    let abs = expand_home(&target);
    // bin 为 code CLI，可执行名或绝对路径
    let bin = if vscode_path.trim().is_empty() {
        "code".to_string()
    } else {
        vscode_path
    };
    // 用修正 PATH 的命令调用 code CLI，保证 GUI 启动时也能定位到 code
    command_with_path(&bin)
        .arg(abs.to_string_lossy().to_string())
        .spawn()
        .map_err(|e| format!("调用 VSCode 失败（请确认 '{}' 可用）: {}", bin, e))?;
    Ok(())
}

// 在系统文件管理器（macOS Finder）中显示指定路径
#[tauri::command]
pub fn reveal_in_finder(target: String) -> Result<(), String> {
    // abs 为展开后的绝对路径
    let abs = expand_home(&target);
    // macOS 用 open -R 在 Finder 中定位文件
    Command::new("open")
        .arg("-R")
        .arg(abs.to_string_lossy().to_string())
        .spawn()
        .map_err(|e| format!("打开 Finder 失败: {}", e))?;
    Ok(())
}

// 探测单个 CLI 工具的版本：执行 `<bin> --version`
fn probe_tool(id: &str, name: &str, bin: &str) -> ToolStatus {
    // which 用于解析 CLI 在 PATH 中的绝对路径（用修正 PATH 保证 GUI 启动时一致）
    let resolved = command_with_path("which").arg(bin).output();
    // path 为解析出的可执行路径，未找到为空
    let path = match resolved {
        Ok(out) if out.status.success() => String::from_utf8_lossy(&out.stdout).trim().to_string(),
        _ => String::new(),
    };
    // 未找到可执行文件，直接返回未安装状态
    if path.is_empty() {
        return ToolStatus {
            id: id.to_string(),
            name: name.to_string(),
            installed: false,
            version: String::new(),
            path: String::new(),
        };
    }
    // version 通过 --version 获取，失败时留空但仍标记已安装
    let version = match command_with_path(bin).arg("--version").output() {
        Ok(out) => String::from_utf8_lossy(&out.stdout).trim().to_string(),
        Err(_) => String::new(),
    };
    ToolStatus {
        id: id.to_string(),
        name: name.to_string(),
        installed: true,
        version,
        path,
    }
}

// 探测本机已安装的 AI 工具（Claude Code CLI、Codex CLI）
#[tauri::command]
pub fn detect_tools() -> Result<Vec<ToolStatus>, String> {
    // 返回固定两个工具的探测结果，顺序稳定便于前端展示
    Ok(vec![
        probe_tool("claude", "Claude Code", "claude"),
        probe_tool("codex", "Codex CLI", "codex"),
    ])
}

// 根据工具标识返回对应 npm 包名。
// tool_id 为前端传入的工具标识，目前支持 claude / codex。
fn npm_package_for_tool(tool_id: &str) -> Option<&'static str> {
    match tool_id {
        "claude" => Some("@anthropic-ai/claude-code"),
        "codex" => Some("@openai/codex"),
        _ => None,
    }
}

// 解析 npm view 输出中的版本号。
// stdout 为 npm view <package> version 的标准输出字节。
fn parse_latest_version_stdout(stdout: &[u8]) -> Result<String, String> {
    // version 存储去掉换行与空白后的版本文本。
    let version = String::from_utf8_lossy(stdout).trim().to_string();
    if version.is_empty() {
        return Err("npm 未返回版本号".to_string());
    }

    Ok(version)
}

// 构造 npm 全局更新工具 CLI 的参数。
// package_name 为要安装到全局环境的 npm 包名。
fn build_update_tool_args(package_name: &str) -> Vec<&str> {
    vec![
        "install",
        "-g",
        package_name,
        "--registry=https://registry.npmjs.org",
    ]
}

// 查询指定工具在 npm registry 上的最新版本。
// tool_id 为工具标识，前端用该结果和本机版本比较后展示是否可更新。
#[tauri::command]
pub fn check_tool_latest_version(tool_id: String) -> Result<ToolLatestVersion, String> {
    // package_name 存储工具对应的 npm 包名。
    let package_name = npm_package_for_tool(&tool_id)
        .ok_or_else(|| format!("不支持查询 {} 的最新版本", tool_id))?;
    // output 存储 npm view 命令执行结果，registry 固定为官方源避免本机镜像滞后。
    let output = command_with_path("npm")
        .arg("view")
        .arg(package_name)
        .arg("version")
        .arg("--registry=https://registry.npmjs.org")
        .output()
        .map_err(|error| format!("查询 {} 最新版本失败: {}", package_name, error))?;

    if !output.status.success() {
        // stderr 存储 npm 查询失败时的错误文本。
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            format!("查询 {} 最新版本失败", package_name)
        } else {
            stderr
        });
    }

    // latest_version 存储解析后的最新版本号。
    let latest_version = parse_latest_version_stdout(&output.stdout)?;
    Ok(ToolLatestVersion {
        tool_id,
        package_name: package_name.to_string(),
        latest_version,
    })
}

// 更新指定工具 CLI 到 npm registry 最新版本。
// tool_id 为工具标识，后端会映射到对应 npm 包并执行全局安装。
#[tauri::command]
pub fn update_tool_cli(tool_id: String) -> Result<String, String> {
    // package_name 存储工具对应的 npm 包名。
    let package_name =
        npm_package_for_tool(&tool_id).ok_or_else(|| format!("不支持更新 {} 的 CLI", tool_id))?;
    // args 存储 npm install -g 的完整参数。
    let args = build_update_tool_args(package_name);
    // output 存储 npm 全局安装命令的执行结果。
    let output = command_with_path("npm")
        .args(args)
        .output()
        .map_err(|error| format!("更新 {} 失败: {}", package_name, error))?;

    if !output.status.success() {
        // stderr 存储 npm 更新失败时的错误文本。
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            format!("更新 {} 失败", package_name)
        } else {
            stderr
        });
    }

    // stdout 存储 npm 更新成功时的输出文本。
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Ok(if stdout.is_empty() {
        format!("{} 已更新到最新版本", package_name)
    } else {
        stdout
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_npm_package_for_tool_maps_claude_code() {
        assert_eq!(
            npm_package_for_tool("claude").unwrap(),
            "@anthropic-ai/claude-code"
        );
    }

    #[test]
    fn test_parse_latest_version_stdout_trims_output() {
        assert_eq!(
            parse_latest_version_stdout(b"2.1.196\n").unwrap(),
            "2.1.196"
        );
    }

    #[test]
    fn test_build_update_tool_args_uses_global_install_and_official_registry() {
        assert_eq!(
            build_update_tool_args("@anthropic-ai/claude-code"),
            vec![
                "install",
                "-g",
                "@anthropic-ai/claude-code",
                "--registry=https://registry.npmjs.org"
            ]
        );
    }
}
