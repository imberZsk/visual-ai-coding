# Task 4 Report

## RED

- 按 brief 原样执行 `cd src-tauri && cargo test commands::plugins::tests::test_parse_claude_plugin_update_json commands::plugins::tests::test_parse_codex_plugin_update_json` 时，Cargo 直接报错：`unexpected argument 'commands::plugins::tests::test_parse_codex_plugin_update_json' found`，说明该命令写法本身不被 `cargo test` 支持。
- 为了完成 brief Step 2 的真实 RED 验证，改用等价过滤串命令 `cd src-tauri && cargo test commands::plugins::tests::test_parse_`。
- RED 结果：编译失败，缺少 `parse_claude_plugin_update_json` 与 `parse_codex_plugin_update_json` 两个函数，符合 TDD 预期。

## GREEN

- 新增统一结构体：`PluginUpdateCheckResult`、`ToolPluginInfo`。
- 新增解析与比较 helper：`parse_claude_plugin_update_json`、`parse_codex_plugin_update_json`、`parse_json_root`、`json_string`、`json_bool`、`compare_versions`、`version_numeric_parts`。
- 新增命令：
  - `check_claude_plugin_updates(claude_home: String)`
  - `check_codex_plugin_updates(codex_home: String)`
  - `update_codex_plugin(plugin_id: String, marketplace: String)`
  - `update_codex_marketplace(marketplace_name: String)`
- 在 `src-tauri/src/main.rs` 注册以上新命令。

## Test Output Summary

- `cd src-tauri && cargo test commands::plugins::tests::test_parse_`
  - 2 tests passed
- `cd src-tauri && cargo test commands::plugins`
  - 2 tests passed
- `cd src-tauri && cargo test`
  - 16 tests passed
- 现存 warning：
  - `block v0.1.6` future incompatibility warning（已有依赖告警，本任务未处理）

## File Changes

- 修改 `src-tauri/src/commands/plugins.rs`
  - 新增统一插件更新结果结构
  - 新增 Claude/Codex 更新检查解析逻辑
  - 新增 Codex plugin / marketplace 更新命令
  - 新增 2 个 parser tests
- 修改 `src-tauri/src/main.rs`
  - 注册新增 Tauri commands

## Self Review

- 使用官方 CLI 完成 marketplace 升级与插件安装，没有手写 git 更新逻辑。
- Claude 与 Codex 的更新检查分成独立命令，任一工具检查失败时都会直接返回该命令错误，不会吞掉错误或影响另一个命令。
- 版本比较采用 semver-like 数字段比较，空版本返回 `unknown`，同版本返回 `same`，可用版本更高返回 `newer`。
- 已尽量遵守当前代码风格，并按 AGENTS 要求为新增函数、变量和关键分支补充中文注释。

## Concerns

- `update_codex_plugin` 目前通过官方 `codex plugin add` 触发安装/升级；依据本机 CLI help，这就是官方提供的插件安装入口，但是否在“已安装同名插件”场景下始终表现为升级，仍依赖 Codex CLI 自身语义，当前仓库内没有集成测试可覆盖。
- `check_*_plugin_updates` 依赖 CLI `--json --available` 返回结构与 brief 样例一致；如果未来 CLI JSON 字段名变化，需要同步调整 parser。
- 由于 brief 没有要求新增 Tauri 集成测试，本次仅覆盖 parser 层测试，命令执行层依赖手工 CLI 合约。
