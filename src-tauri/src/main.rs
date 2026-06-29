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
    list_claude_marketplaces, list_claude_plugins, update_claude_marketplace, update_claude_plugin,
};
// 系统集成命令
use commands::system::{detect_tools, open_in_vscode, reveal_in_finder};

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
            update_claude_plugin,
            update_claude_marketplace,
            detect_tools,
            open_in_vscode,
            reveal_in_finder
        ])
        .run(tauri::generate_context!())
        .expect("启动 Tauri 应用失败");
}
