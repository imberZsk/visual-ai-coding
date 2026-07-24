# 发布检查清单

- 只有用户明确要求时才修改版本、CHANGELOG、tag 或 Release；普通规则与文档改动不升版本。
- 发布时 `package.json`、CHANGELOG、tag 与安装包版本保持一致。
- 发布前运行 lint、typecheck、完整测试、构建与 Electron 冒烟验证。
- macOS 产物为 arm64 DMG，Windows 为 x64 Setup 与 portable EXE。
- 发布后用 `gh release view <tag> --json assets,url` 确认 Release 与目标资产真实存在。
