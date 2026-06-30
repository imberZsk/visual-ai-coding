// 应用偏好持久化模块：所有可配置项落盘到 ~/.visualAiCoding/preferences.json
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

// 应用偏好数据结构：持久化到 ~/.visualAiCoding/preferences.json
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Preferences {
    // 主题模式：light / dark / system
    #[serde(default = "default_theme")]
    pub theme: String,
    // VSCode 可执行文件路径，用于"在 VSCode 打开"功能
    #[serde(default = "default_vscode_path")]
    pub vscode_path: String,
    // Claude Code 配置根目录，默认 ~/.claude
    #[serde(default = "default_claude_home")]
    pub claude_home: String,
    // Codex 配置根目录，默认 ~/.codex
    #[serde(default = "default_codex_home")]
    pub codex_home: String,
    // 上次激活的页面/标签，便于恢复界面状态
    #[serde(default)]
    pub last_active_tab: String,
}

// 默认主题：跟随系统
fn default_theme() -> String {
    "system".to_string()
}

// 默认 VSCode CLI 路径（用户机器已确认安装在 /usr/local/bin/code）
fn default_vscode_path() -> String {
    "code".to_string()
}

// 默认 Claude 配置目录：~/.claude
fn default_claude_home() -> String {
    home_subdir(".claude")
}

// 默认 Codex 配置目录：~/.codex
fn default_codex_home() -> String {
    home_subdir(".codex")
}

// 拼接用户主目录下的子目录绝对路径
fn home_subdir(sub: &str) -> String {
    // dirs::home_dir 在 macOS 上返回 /Users/<name>
    dirs::home_dir()
        .map(|h| h.join(sub).to_string_lossy().to_string())
        .unwrap_or_else(|| format!("~/{}", sub))
}

impl Default for Preferences {
    // 提供全字段默认值，首次启动无配置文件时使用
    fn default() -> Self {
        Preferences {
            theme: default_theme(),
            vscode_path: default_vscode_path(),
            claude_home: default_claude_home(),
            codex_home: default_codex_home(),
            last_active_tab: String::new(),
        }
    }
}

// 返回应用配置目录 ~/.visualAiCoding，并确保其存在
fn app_config_dir() -> Result<PathBuf, String> {
    // base 为用户主目录
    let base = dirs::home_dir().ok_or_else(|| "无法定位用户主目录".to_string())?;
    // dir 为应用专属配置目录
    let dir = base.join(".visualAiCoding");
    if !dir.exists() {
        // 首次运行时创建配置目录
        std::fs::create_dir_all(&dir).map_err(|e| format!("创建配置目录失败: {}", e))?;
    }
    Ok(dir)
}

// 返回 preferences.json 的完整路径
fn preferences_path() -> Result<PathBuf, String> {
    Ok(app_config_dir()?.join("preferences.json"))
}

// 读取应用偏好；文件不存在时返回默认值并落盘
#[tauri::command]
pub fn get_preferences() -> Result<Preferences, String> {
    // path 为偏好文件路径
    let path = preferences_path()?;
    if !path.exists() {
        // 首次启动：写入默认值，保证后续读到稳定结构
        let def = Preferences::default();
        save_preferences(def.clone())?;
        return Ok(def);
    }
    // content 为偏好文件原始 JSON 文本
    let content = std::fs::read_to_string(&path).map_err(|e| format!("读取偏好失败: {}", e))?;
    // 反序列化偏好；整体解析失败时先备份坏文件再回退默认值
    match serde_json::from_str::<Preferences>(&content) {
        Ok(prefs) => Ok(prefs),
        Err(_) => {
            // WHY：直接回退默认值后，下一次 save 会覆盖坏文件导致原内容彻底丢失；
            // 先把坏文件改名为 .corrupted 备份，给用户留下手动恢复的机会
            let backup = path.with_extension("json.corrupted");
            let _ = std::fs::rename(&path, &backup);
            Ok(Preferences::default())
        }
    }
}

// 保存应用偏好到 preferences.json
#[tauri::command]
pub fn save_preferences(prefs: Preferences) -> Result<(), String> {
    // path 为偏好文件路径
    let path = preferences_path()?;
    // json 为格式化后的偏好文本，便于用户手动查看
    let json =
        serde_json::to_string_pretty(&prefs).map_err(|e| format!("序列化偏好失败: {}", e))?;
    // 原子写入：避免写入中途崩溃损坏偏好文件
    super::util::atomic_write(&path, &json)?;
    Ok(())
}
