# 安全策略

## 支持版本

仅维护 `main` 分支上的最新版本。安全修复会优先合入 `main` 并记录在 changelog。

## 报告漏洞

请通过 GitHub Security Advisory 私下报告，不要先公开复现细节。报告应包含受影响版本、复现步骤、影响范围和建议修复方向。

## 安全边界

本项目是本地 Electron 桌面应用。渲染进程保持 `contextIsolation: true` 与 `nodeIntegration: false`，本地文件和系统能力必须通过受限 preload API 访问。新增网络能力必须在 PR 中说明用途、数据范围和关闭方式。

发布包当前未签名。请只从本仓库 GitHub Releases 下载，并按操作系统提示核验来源。
