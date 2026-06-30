// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// 引入命令模块（包含所有功能域的 Tauri 命令处理器）
mod commands;

// 偏好持久化命令
use commands::preferences::{get_preferences, save_preferences};
// 配置文件读写与目录浏览命令
use commands::settings::{list_dir, read_config_file, save_config_file};
// 插件与市场命令
use commands::plugins::{
    check_claude_plugin_updates, check_codex_plugin_updates, list_claude_marketplaces,
    list_claude_plugins, update_claude_marketplace, update_claude_plugin, update_codex_marketplace,
    update_codex_plugin,
};
// Skill 扫描命令
use commands::skills::list_skills;
// 系统集成命令
use commands::system::{
    check_tool_latest_version, detect_tools, open_in_vscode, reveal_in_finder, update_tool_cli,
};

// 应用入口：初始化 Tauri 并注册所有前端可调用命令
fn main() {
    tauri::Builder::default()
        // 注册前端通过 invoke 调用的命令处理器
        .invoke_handler(tauri::generate_handler![
            get_preferences,
            save_preferences,
            read_config_file,
            save_config_file,
            list_dir,
            list_claude_plugins,
            list_claude_marketplaces,
            check_claude_plugin_updates,
            check_codex_plugin_updates,
            update_claude_plugin,
            update_claude_marketplace,
            update_codex_plugin,
            update_codex_marketplace,
            list_skills,
            check_tool_latest_version,
            update_tool_cli,
            detect_tools,
            open_in_vscode,
            reveal_in_finder
        ])
        .run(tauri::generate_context!())
        .expect("启动 Tauri 应用失败");
}
