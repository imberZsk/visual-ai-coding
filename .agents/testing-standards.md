# 测试规范

- 测试只覆盖本次新增或修改行为；修复 Bug 时先增加可复现用例。
- 核心配置、插件和 Skill 测试使用临时目录与注入依赖，不访问用户真实 `~/.claude`、`~/.codex`。
- UI 使用 Vitest、jsdom 与 Testing Library，按用户行为断言，不绑定无关内部实现。
- IPC 测试 mock `ipcMain` 与系统依赖；完整启动链路由 `verify:boot` 验证。
- 异步任务测试覆盖去重、切页持续、成功与失败回滚；不使用任意 sleep。
- 平台和 PATH 逻辑通过注入环境覆盖 GUI 启动与不同平台分支。
