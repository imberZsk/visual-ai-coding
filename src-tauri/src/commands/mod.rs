// 命令模块聚合：将各功能域的 Tauri 命令统一对外暴露
pub mod util; // 公共工具：路径展开、原子写入、登录 shell PATH 解析
pub mod preferences; // 应用偏好持久化（~/.visualAiCoding）
pub mod settings; // Claude / Codex 配置文件读写
pub mod plugins; // Claude / Codex 插件列表与更新
pub mod system; // 系统集成（VSCode 打开、工具探测）
