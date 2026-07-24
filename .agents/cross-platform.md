# 跨平台约束

- 目标平台为 macOS arm64 与 Windows x64；路径、shell、外部应用和打包改动必须检查两端。
- 路径使用 Node `path` API，不拼接分隔符；动态路径覆盖空格、中文和特殊字符。
- 平台判断集中在纯函数或系统边界，并通过注入 `darwin`/`win32` 测试。
- Windows workflow 中使用 Bash 特性时显式指定 `shell: bash`。
- 不把 macOS 的 `open`、AppleScript 或 POSIX 引号规则直接用于 Windows。
- 打包配置变更同时检查 DMG、Windows Setup 和 portable 产物。
