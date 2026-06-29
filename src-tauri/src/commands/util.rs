// 公共工具模块：路径展开、原子写入、登录 shell PATH 解析
// 这些能力被 settings / plugins / system 多个命令模块共享，集中维护避免重复实现
use std::path::PathBuf;
use std::process::Command;
use std::sync::OnceLock;

// 缓存登录 shell 解析出的真实 PATH，避免每次调用都启动一次 shell
static LOGIN_PATH: OnceLock<Option<String>> = OnceLock::new();

// 将 ~ / ~/xxx 前缀展开为用户主目录绝对路径
// 仅处理 "~" 或 "~/" 开头的路径；"~otheruser/x" 这类形式原样返回，避免错误拼接
pub fn expand_home(p: &str) -> PathBuf {
    // 精确匹配 "~"（整体即主目录）
    if p == "~" {
        if let Some(home) = dirs::home_dir() {
            return home;
        }
        return PathBuf::from(p);
    }
    // 仅当以 "~/" 开头时才视为主目录相对路径
    if let Some(rest) = p.strip_prefix("~/") {
        if let Some(home) = dirs::home_dir() {
            return home.join(rest);
        }
    }
    PathBuf::from(p)
}

// 原子写入文件：先写同目录临时文件，再 rename 覆盖目标
// WHY：fs::write 会先截断再写，写入中途崩溃/断电会损坏原配置文件（如 settings.json）；
// 同一文件系统内的 rename 是原子操作，能保证目标文件要么是旧内容、要么是完整新内容
pub fn atomic_write(path: &std::path::Path, content: &str) -> Result<(), String> {
    // parent 为目标文件所在目录，临时文件必须与目标同目录以保证 rename 原子性
    let parent = path
        .parent()
        .ok_or_else(|| "无法确定目标文件所在目录".to_string())?;
    // 确保父目录存在
    if !parent.exists() {
        std::fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {}", e))?;
    }
    // tmp 为临时文件路径，文件名带 .tmp 后缀，与目标同目录
    let file_name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("config");
    let tmp = parent.join(format!(".{}.tmp", file_name));
    // 先写入临时文件
    std::fs::write(&tmp, content).map_err(|e| format!("写入临时文件失败: {}", e))?;
    // 原子替换目标文件
    std::fs::rename(&tmp, path).map_err(|e| {
        // rename 失败时清理临时文件，避免残留
        let _ = std::fs::remove_file(&tmp);
        format!("替换目标文件失败: {}", e)
    })?;
    Ok(())
}

// 解析登录 shell 的真实 PATH 并缓存
// WHY：macOS 上从 Finder 双击启动的 GUI 应用只继承极简 PATH（/usr/bin:/bin 等），
// 不读取 ~/.zshrc 等配置，导致 claude/code 等安装在 ~/.local/bin、homebrew、nvm 下的 CLI 探测不到。
// 通过启动一次登录交互式 shell 读取 $PATH，拿到与用户终端一致的真实 PATH
fn login_path() -> Option<String> {
    LOGIN_PATH
        .get_or_init(|| {
            // shell 为用户默认 shell，未设置时回退 /bin/zsh（macOS 默认）
            let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
            // 以登录交互式 shell 执行 echo $PATH，读取用户完整 PATH 配置
            let output = Command::new(&shell)
                .args(["-lic", "echo $PATH"])
                .output()
                .ok()?;
            if !output.status.success() {
                return None;
            }
            // path 为解析出的 PATH 文本
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if path.is_empty() {
                None
            } else {
                Some(path)
            }
        })
        .clone()
}

// 构造一个 PATH 已修正的 Command
// 在登录 shell PATH 解析成功时，用其覆盖子进程 PATH，保证能找到用户安装的 CLI
pub fn command_with_path(bin: &str) -> Command {
    // cmd 为待执行命令
    let mut cmd = Command::new(bin);
    // 解析成功则注入真实 PATH，失败则沿用进程默认 PATH（不致命）
    if let Some(path) = login_path() {
        cmd.env("PATH", path);
    }
    cmd
}

#[cfg(test)]
mod tests {
    use super::*;

    // 验证 "~" 整体被展开为用户主目录
    #[test]
    fn test_expand_home_root_tilde() {
        // home 为当前用户主目录
        let home = dirs::home_dir().expect("测试环境应能取到主目录");
        assert_eq!(expand_home("~"), home);
    }

    // 验证 "~/xxx" 被展开为主目录下的相对路径
    #[test]
    fn test_expand_home_tilde_slash() {
        let home = dirs::home_dir().expect("测试环境应能取到主目录");
        assert_eq!(expand_home("~/.codex"), home.join(".codex"));
    }

    // 验证 "~otheruser/x" 这类形式不被错误展开（原样返回）
    #[test]
    fn test_expand_home_other_user_untouched() {
        assert_eq!(expand_home("~otheruser/x"), PathBuf::from("~otheruser/x"));
    }

    // 验证绝对路径原样返回
    #[test]
    fn test_expand_home_absolute() {
        assert_eq!(expand_home("/etc/hosts"), PathBuf::from("/etc/hosts"));
    }

    // 验证原子写入能创建新文件并写入完整内容
    #[test]
    fn test_atomic_write_creates_file() {
        // dir 为临时测试目录
        let dir = std::env::temp_dir().join(format!("vac_test_{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        // target 为目标文件路径
        let target = dir.join("nested").join("conf.json");
        atomic_write(&target, "{\"a\":1}").expect("原子写入应成功");
        // 读回内容应与写入一致
        let read_back = std::fs::read_to_string(&target).unwrap();
        assert_eq!(read_back, "{\"a\":1}");
        // 清理测试目录
        let _ = std::fs::remove_dir_all(&dir);
    }

    // 验证原子写入能覆盖已有文件
    #[test]
    fn test_atomic_write_overwrites() {
        let dir = std::env::temp_dir().join(format!("vac_test_ow_{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let target = dir.join("conf.toml");
        atomic_write(&target, "old").unwrap();
        atomic_write(&target, "new content").unwrap();
        assert_eq!(std::fs::read_to_string(&target).unwrap(), "new content");
        let _ = std::fs::remove_dir_all(&dir);
    }
}
