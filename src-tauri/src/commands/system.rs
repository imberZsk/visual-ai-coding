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
        Ok(out) if out.status.success() => {
            String::from_utf8_lossy(&out.stdout).trim().to_string()
        }
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
