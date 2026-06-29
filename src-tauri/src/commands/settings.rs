// 配置文件读写模块：统一读取/保存 Claude 与 Codex 的各类配置文件
use super::util::{atomic_write, expand_home};
use serde::{Deserialize, Serialize};
use std::path::Path;

// 单个配置文件的描述与内容，供前端可视化展示与编辑
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ConfigFile {
    // 文件逻辑标识，如 "claude-settings"、"codex-config"
    pub id: String,
    // 展示用标题，如 "settings.json"
    pub title: String,
    // 文件绝对路径
    pub path: String,
    // 文件格式：json / toml / text，前端据此选择高亮与校验方式
    pub format: String,
    // 文件原始文本内容；文件不存在时为空字符串
    pub content: String,
    // 文件是否存在于磁盘
    pub exists: bool,
    // 是否为只读（如大型 sqlite、日志等不应编辑的文件）
    pub readonly: bool,
}

// 根据文件扩展名推断格式，用于前端编辑器高亮与校验
fn detect_format(path: &Path) -> String {
    // ext 为小写扩展名
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    match ext.as_str() {
        // JSON 系列配置
        "json" => "json".to_string(),
        // TOML 配置（Codex config.toml）
        "toml" => "toml".to_string(),
        // 其余按纯文本处理
        _ => "text".to_string(),
    }
}

// 读取单个配置文件为 ConfigFile 结构
#[tauri::command]
pub fn read_config_file(id: String, title: String, path: String, readonly: bool) -> Result<ConfigFile, String> {
    // abs 为展开后的绝对路径
    let abs = expand_home(&path);
    // exists 标记文件是否存在
    let exists = abs.exists();
    // content 为文件文本内容，不存在时为空
    let content = if exists {
        std::fs::read_to_string(&abs).map_err(|e| format!("读取 {} 失败: {}", path, e))?
    } else {
        String::new()
    };
    Ok(ConfigFile {
        id,
        title,
        path: abs.to_string_lossy().to_string(),
        format: detect_format(&abs),
        content,
        exists,
        readonly,
    })
}

// 按格式校验配置内容的语法合法性；抽成纯函数便于单元测试
// format 为 json / toml / text，content 为待校验文本
fn validate_content(content: &str, format: &str) -> Result<(), String> {
    match format {
        // JSON 校验：必须能解析为合法 JSON 值
        "json" => {
            serde_json::from_str::<serde_json::Value>(content)
                .map_err(|e| format!("JSON 格式错误: {}", e))?;
        }
        // TOML 校验：必须能解析为合法 TOML 值
        "toml" => {
            content
                .parse::<toml::Value>()
                .map_err(|e| format!("TOML 格式错误: {}", e))?;
        }
        // 纯文本不校验
        _ => {}
    }
    Ok(())
}

// 保存配置文件内容；保存前按格式做语法校验，避免写入非法配置
#[tauri::command]
pub fn save_config_file(path: String, content: String, format: String) -> Result<(), String> {
    // abs 为展开后的绝对路径
    let abs = expand_home(&path);
    // 校验内容合法性，防止写坏配置导致工具无法启动
    validate_content(&content, &format)?;
    // 原子写入：避免写入中途崩溃损坏原配置文件
    atomic_write(&abs, &content)?;
    Ok(())
}

// 列出目录下的条目（文件/子目录），用于可视化浏览 ~/.claude、~/.codex 结构
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DirEntryInfo {
    // 条目名称
    pub name: String,
    // 条目绝对路径
    pub path: String,
    // 是否为目录
    pub is_dir: bool,
    // 文件大小（字节），目录为 0
    pub size: u64,
}

// 列出指定目录下的直接子条目（不递归）
#[tauri::command]
pub fn list_dir(path: String) -> Result<Vec<DirEntryInfo>, String> {
    // abs 为展开后的绝对路径
    let abs = expand_home(&path);
    if !abs.exists() {
        return Ok(vec![]);
    }
    // entries 累积目录下的条目信息
    let mut entries: Vec<DirEntryInfo> = vec![];
    // rd 为目录读取迭代器
    let rd = std::fs::read_dir(&abs).map_err(|e| format!("读取目录失败: {}", e))?;
    for item in rd {
        // entry 为单个目录项
        let entry = match item {
            Ok(e) => e,
            // 跳过读取失败的单项，保证整体不中断
            Err(_) => continue,
        };
        // meta 为条目元数据
        let meta = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };
        entries.push(DirEntryInfo {
            name: entry.file_name().to_string_lossy().to_string(),
            path: entry.path().to_string_lossy().to_string(),
            is_dir: meta.is_dir(),
            size: if meta.is_dir() { 0 } else { meta.len() },
        });
    }
    // 目录在前、文件在后，同类按名称排序，便于浏览
    entries.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });
    Ok(entries)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    // 验证 ~ 前缀被正确展开为用户主目录绝对路径
    #[test]
    fn test_expand_home_with_tilde() {
        // home 为当前用户主目录，作为预期前缀
        let home = dirs::home_dir().expect("测试环境应能取到主目录");
        // expanded 为展开 ~/.claude 后的结果
        let expanded = expand_home("~/.claude");
        assert_eq!(expanded, home.join(".claude"));
    }

    // 验证不含 ~ 的绝对路径原样返回
    #[test]
    fn test_expand_home_absolute() {
        assert_eq!(expand_home("/tmp/foo"), PathBuf::from("/tmp/foo"));
    }

    // 验证扩展名到格式的映射
    #[test]
    fn test_detect_format() {
        assert_eq!(detect_format(Path::new("a/settings.json")), "json");
        assert_eq!(detect_format(Path::new("a/config.toml")), "toml");
        assert_eq!(detect_format(Path::new("a/CLAUDE.md")), "text");
        assert_eq!(detect_format(Path::new("a/noext")), "text");
    }

    // 验证合法 JSON 通过校验
    #[test]
    fn test_validate_json_ok() {
        assert!(validate_content(r#"{"a": 1}"#, "json").is_ok());
    }

    // 验证非法 JSON 被拒绝
    #[test]
    fn test_validate_json_err() {
        assert!(validate_content("{not json}", "json").is_err());
    }

    // 验证合法 TOML 通过校验
    #[test]
    fn test_validate_toml_ok() {
        assert!(validate_content("model = \"gpt-5\"", "toml").is_ok());
    }

    // 验证非法 TOML 被拒绝
    #[test]
    fn test_validate_toml_err() {
        assert!(validate_content("= = =", "toml").is_err());
    }

    // 验证纯文本格式不做校验，任何内容均通过
    #[test]
    fn test_validate_text_passthrough() {
        assert!(validate_content("任意内容 {[(", "text").is_ok());
    }
}
