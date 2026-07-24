# 踩坑记录

- Finder 启动的 macOS GUI 进程 PATH 很精简；外部 CLI 必须通过 `runCommand`/`buildCommandEnv` 使用登录 shell 环境。
- 配置写入使用 `atomicWrite`，不得改回直接覆盖，避免中途崩溃损坏用户配置。
- schema 未识别字段必须保留；不能因可视化表单不认识就静默删除 Claude/Codex 新字段。
- 异步检查和更新任务存入 Zustand；不能仅保存在会随 tab 卸载的局部 state。
- 乐观更新偏好失败时必须回滚，不能让内存状态与磁盘状态分裂。
- Vite 端口 5274 被非 HTTP 服务占用时应阻止启动，不能误复用。
- 修改主题时使用语义色变量并运行现有主题、初始主题与动画脚本测试。
