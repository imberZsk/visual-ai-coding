// 配置文件编辑器：加载单个配置文件，提供编辑、保存（含语法校验）、在 VSCode 打开、Finder 定位
import { useEffect, useState } from "react";
import type { ConfigFileSpec } from "../config";
import type { ConfigFile } from "../types";
import { readConfigFile, saveConfigFile, openInVscode, revealInFinder } from "../api";
import { useAppStore } from "../store";
import { Card, Button, Badge, LoadingIcon } from "./ui";

// 拼接工具根目录与相对路径，得到配置文件绝对路径
// home 为工具根目录（claude_home / codex_home），relPath 为相对子路径
function joinPath(home: string, relPath: string): string {
  // 去掉 home 末尾分隔符，避免出现重复斜杠
  const base = home.replace(/\/+$/, "");
  return `${base}/${relPath}`;
}

// 单个配置文件编辑器组件
export default function ConfigEditor({ spec }: { spec: ConfigFileSpec }) {
  // prefs 为应用偏好，用于取工具根目录与 VSCode 路径
  const prefs = useAppStore((s) => s.prefs);
  // file 为已加载的配置文件内容；null 表示尚未加载
  const [file, setFile] = useState<ConfigFile | null>(null);
  // draft 为编辑器中的草稿文本
  const [draft, setDraft] = useState("");
  // saving 标记保存进行中
  const [saving, setSaving] = useState(false);
  // message 为操作结果提示（成功或错误）
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  // loading 标记文件加载中
  const [loading, setLoading] = useState(true);

  // 计算配置文件的绝对路径
  const home = spec.tool === "claude" ? prefs?.claude_home || "" : prefs?.codex_home || "";
  const absPath = joinPath(home, spec.relPath);

  // 加载配置文件内容
  const load = async () => {
    setLoading(true);
    setMessage(null);
    try {
      // loaded 为后端读取的文件结构
      const loaded = await readConfigFile(spec.id, spec.title, absPath, spec.readonly);
      setFile(loaded);
      setDraft(loaded.content);
    } catch (e) {
      setMessage({ type: "err", text: String(e) });
    } finally {
      setLoading(false);
    }
  };

  // spec 或路径变化时重新加载
  useEffect(() => {
    if (home) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec.id, home]);

  // 保存草稿到磁盘（后端做语法校验）
  const handleSave = async () => {
    if (!file) return;
    setSaving(true);
    setMessage(null);
    try {
      await saveConfigFile(file.path, draft, file.format);
      setMessage({ type: "ok", text: "已保存" });
      // 保存成功后刷新文件状态（exists 等）
      await load();
    } catch (e) {
      setMessage({ type: "err", text: String(e) });
    } finally {
      setSaving(false);
    }
  };

  // 在 VSCode 打开该文件
  const handleOpenVscode = async () => {
    try {
      await openInVscode(prefs?.vscode_path || "code", file?.path || absPath);
    } catch (e) {
      setMessage({ type: "err", text: String(e) });
    }
  };

  // 在 Finder 中定位该文件
  const handleReveal = async () => {
    try {
      await revealInFinder(file?.path || absPath);
    } catch (e) {
      setMessage({ type: "err", text: String(e) });
    }
  };

  // draft 是否相对已加载内容有改动
  const dirty = file !== null && draft !== file.content;

  return (
    <Card>
      {/* 文件标题行：标题 + 状态徽章 + 操作按钮 */}
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-text-main">{spec.title}</span>
            {/* 格式徽章 */}
            <Badge tone="info">{file?.format || spec.relPath.split(".").pop()}</Badge>
            {/* 只读徽章 */}
            {spec.readonly && <Badge tone="warning">只读</Badge>}
            {/* 文件不存在提示 */}
            {file && !file.exists && <Badge tone="neutral">文件不存在</Badge>}
            {/* 未保存改动提示 */}
            {dirty && <Badge tone="success">未保存</Badge>}
          </div>
          <div className="mt-1 truncate text-xs text-text-muted" title={absPath}>
            {spec.desc} · {absPath}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button onClick={handleReveal} variant="ghost" title="在 Finder 中显示">
            Finder
          </Button>
          <Button onClick={handleOpenVscode} variant="default" title="在 VSCode 打开">
            VSCode
          </Button>
          {/* 只读文件不提供保存 */}
          {!spec.readonly && (
            <Button onClick={handleSave} variant="primary" disabled={!dirty} loading={saving}>
              保存
            </Button>
          )}
        </div>
      </div>

      {/* 内容编辑区 */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-text-muted">
          <LoadingIcon className="h-3.5 w-3.5" />
          <span>加载中…</span>
        </div>
      ) : (
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          readOnly={spec.readonly}
          spellCheck={false}
          className="h-72 w-full resize-y rounded-lg border border-border bg-surface p-3 font-mono text-xs leading-relaxed text-text-main outline-none focus:border-accent read-only:opacity-80"
          placeholder={file?.exists ? "" : "文件不存在，保存后将创建"}
        />
      )}

      {/* 操作结果提示 */}
      {message && (
        <div
          className={`mt-2 text-xs ${
            message.type === "ok" ? "text-green-500" : "text-red-500"
          }`}
        >
          {message.text}
        </div>
      )}
    </Card>
  );
}
