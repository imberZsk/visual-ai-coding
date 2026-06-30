import { useEffect, useMemo, useState } from "react";
import * as TOML from "smol-toml";
import { readConfigFile, saveConfigFile, openInVscode, revealInFinder } from "../api";
import type { ConfigFileSpec } from "../config";
import { useAppStore } from "../store";
import type { ConfigFile } from "../types";
import {
  deleteValueAtPath,
  getValueAtPath,
  listUnknownTopLevelKeys,
  setValueAtPath,
} from "../utils/configPath";
import { Badge, Button, Card } from "./ui";
import FieldRenderer from "./visual-config/FieldRenderer";
import type { VisualConfigSchema } from "./visual-config/schemaTypes";

interface VisualConfigEditorProps {
  spec: ConfigFileSpec; // spec 存储配置文件描述。
  schema: VisualConfigSchema; // schema 存储当前文件对应的可视化 schema。
}

// 拼接工具根目录与相对子路径。
// home 参数存储工具根目录，relPath 参数存储配置文件相对子路径。
function joinPath(home: string, relPath: string): string {
  // base 存储去掉末尾斜杠后的根路径。
  const base = home.replace(/\/+$/, "");
  return `${base}/${relPath}`;
}

// 将配置文本解析为对象结构。
// content 参数存储原始配置文本，format 参数存储配置格式。
function parseConfigContent(content: string, format: "json" | "toml"): Record<string, unknown> {
  if (!content.trim()) {
    return {};
  }

  if (format === "json") {
    return JSON.parse(content) as Record<string, unknown>;
  }

  return TOML.parse(content) as Record<string, unknown>;
}

// 将配置对象序列化为文件文本。
// value 参数存储当前配置对象，format 参数存储配置格式。
function serializeConfigContent(
  value: Record<string, unknown>,
  format: "json" | "toml"
): string {
  if (format === "json") {
    return `${JSON.stringify(value, null, 2)}\n`;
  }

  return TOML.stringify(value);
}

// 将未知字段值格式化为适合只读展示的文本。
// value 参数存储未知字段当前值，供高级字段区域展示实际内容。
function formatUnknownFieldValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  return JSON.stringify(value, null, 2) ?? "";
}

// 可视化配置编辑器：在 raw 与 visual 两种视图之间切换，并保留未知字段。
// spec 描述文件位置和只读属性，schema 描述可视化字段分组和控件。
export default function VisualConfigEditor({ spec, schema }: VisualConfigEditorProps) {
  // prefs 存储应用偏好，用于获取工具根目录和 VSCode CLI 路径。
  const prefs = useAppStore((state) => state.prefs);
  // file 存储当前已加载配置文件。
  const [file, setFile] = useState<ConfigFile | null>(null);
  // rawDraft 存储原始文本编辑草稿。
  const [rawDraft, setRawDraft] = useState("");
  // configDraft 存储可视化表单对应的配置对象。
  const [configDraft, setConfigDraft] = useState<Record<string, unknown>>({});
  // baselineRawText 存储最近一次成功加载后的原始文本基线，用于 raw 模式判断是否真的修改过。
  const [baselineRawText, setBaselineRawText] = useState("");
  // baselineVisualText 存储最近一次成功加载后的规范化文本基线，用于 visual 模式避免因格式化差异误报未保存。
  const [baselineVisualText, setBaselineVisualText] = useState("");
  // activeView 存储当前展示的是可视化还是原始文本视图。
  const [activeView, setActiveView] = useState<"visual" | "raw">("visual");
  // saving 标记当前是否正在保存。
  const [saving, setSaving] = useState(false);
  // loading 标记当前是否正在读取文件。
  const [loading, setLoading] = useState(true);
  // message 存储操作成功或失败提示。
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  // parseError 存储当前 raw 内容无法解析为 schema 格式时的错误信息。
  const [parseError, setParseError] = useState<string | null>(null);
  // home 存储当前工具配置根目录。
  const home = spec.tool === "claude" ? prefs?.claude_home || "" : prefs?.codex_home || "";
  // absPath 存储配置文件绝对路径。
  const absPath = joinPath(home, spec.relPath);
  // knownPaths 存储 schema 已覆盖的字段路径集合。
  const knownPaths = useMemo(
    () => schema.groups.flatMap((group) => group.fields.map((field) => field.path)),
    [schema]
  );
  // unknownKeys 存储 schema 未覆盖但配置中真实存在的顶层字段。
  const unknownKeys = useMemo(
    () => listUnknownTopLevelKeys(configDraft, knownPaths),
    [configDraft, knownPaths]
  );
  // dirty 标记当前编辑状态是否相对磁盘内容发生变化。
  const dirty =
    file !== null &&
    ((activeView === "raw" && rawDraft !== baselineRawText) ||
      (activeView === "visual" &&
        serializeConfigContent(configDraft, schema.format) !== baselineVisualText));

  // applyParsedDraft 负责把解析成功的对象同步到 visual 状态，并清理解析错误。
  // content 参数存储原始配置文本。
  function applyParsedDraft(content: string): Record<string, unknown> {
    // parsedConfig 存储解析后的配置对象。
    const parsedConfig = parseConfigContent(content, schema.format);
    setConfigDraft(parsedConfig);
    setParseError(null);
    return parsedConfig;
  }

  // load 负责从后端读取配置，并初始化 raw / visual 双份草稿。
  async function load() {
    setLoading(true);
    setMessage(null);

    try {
      // loadedFile 存储后端读取到的配置文件内容。
      const loadedFile = await readConfigFile(spec.id, spec.title, absPath, spec.readonly);
      setFile(loadedFile);
      setRawDraft(loadedFile.content);
      setBaselineRawText(loadedFile.content);

      try {
        // parsedConfig 存储当前文件解析后的结构化配置，用来计算 visual 模式的规范化基线。
        const parsedConfig = applyParsedDraft(loadedFile.content);
        // normalizedVisualText 存储按当前格式规范化后的文本，避免 visual 模式把纯格式差异误判成脏数据。
        const normalizedVisualText = serializeConfigContent(parsedConfig, schema.format);
        setBaselineVisualText(normalizedVisualText);
        setActiveView("visual");
      } catch (error) {
        // 读取到损坏配置时，业务上优先回退 raw 模式，让用户至少还能直接修文本。
        setParseError(String(error));
        setConfigDraft({});
        setBaselineVisualText("");
        setActiveView("raw");
      }
    } catch (error) {
      setMessage({ type: "err", text: String(error) });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (home) {
      void load();
    }
  }, [absPath, home, spec.id, spec.readonly, spec.relPath, spec.title]);

  // handleFieldChange 负责更新单个可视化字段，并立刻同步 raw 草稿以保持两视图一致。
  // path 参数存储字段路径，value 参数存储字段新值。
  function handleFieldChange(path: string, value: unknown) {
    setConfigDraft((currentConfig) => {
      // nextConfig 存储写入单个字段后的新配置对象。
      const nextConfig = setValueAtPath(currentConfig, path, value);
      setRawDraft(serializeConfigContent(nextConfig, schema.format));
      return nextConfig;
    });
  }

  // handleFieldUnset 负责删除单个可视化字段，并同步 raw 草稿。
  // path 参数存储要删除的字段路径。
  function handleFieldUnset(path: string) {
    setConfigDraft((currentConfig) => {
      // nextConfig 存储删除字段后的新配置对象。
      const nextConfig = deleteValueAtPath(currentConfig, path);
      setRawDraft(serializeConfigContent(nextConfig, schema.format));
      return nextConfig;
    });
  }

  // handleSwitchToVisual 负责从 raw 视图切回可视化视图，并在切换前校验 raw 草稿是否可解析。
  async function handleSwitchToVisual() {
    try {
      applyParsedDraft(rawDraft);
      setActiveView("visual");
    } catch (error) {
      // 用户手动改坏 raw 内容时，保留在 raw 视图并明确提示，避免切视图时把内容丢掉。
      setParseError(String(error));
      setMessage({ type: "err", text: "当前原始配置无法解析，已保留在原始文本视图" });
      setActiveView("raw");
    }
  }

  // handleSave 负责保存当前视图对应的草稿内容。
  async function handleSave() {
    if (!file) {
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      // content 存储本次将写回磁盘的配置文本。
      const content =
        activeView === "raw" ? rawDraft : serializeConfigContent(configDraft, schema.format);
      await saveConfigFile(file.path, content, file.format);
      setMessage({ type: "ok", text: "已保存" });
      await load();
    } catch (error) {
      setMessage({ type: "err", text: String(error) });
    } finally {
      setSaving(false);
    }
  }

  // handleOpenVscode 负责在 VSCode 中打开当前配置文件。
  async function handleOpenVscode() {
    try {
      await openInVscode(prefs?.vscode_path || "code", file?.path || absPath);
    } catch (error) {
      setMessage({ type: "err", text: String(error) });
    }
  }

  // handleReveal 负责在 Finder 中定位当前配置文件。
  async function handleReveal() {
    try {
      await revealInFinder(file?.path || absPath);
    } catch (error) {
      setMessage({ type: "err", text: String(error) });
    }
  }

  return (
    <Card>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-text-main">{spec.title}</span>
            <Badge tone="info">{schema.format}</Badge>
            {spec.readonly && <Badge tone="warning">只读</Badge>}
            {file && !file.exists && <Badge tone="neutral">文件不存在</Badge>}
            {dirty && <Badge tone="success">未保存</Badge>}
            {parseError && <Badge tone="warning">解析失败</Badge>}
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
          <Button
            onClick={() => {
              void handleSwitchToVisual();
            }}
            variant={activeView === "visual" ? "primary" : "default"}
            disabled={loading}
          >
            可视化
          </Button>
          <Button
            onClick={() => setActiveView("raw")}
            variant={activeView === "raw" ? "primary" : "default"}
            disabled={loading}
          >
            原始文本
          </Button>
          {!spec.readonly && (
            <Button onClick={handleSave} variant="primary" disabled={saving || !dirty}>
              {saving ? "保存中…" : "保存"}
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="py-8 text-center text-sm text-text-muted">加载中…</div>
      ) : parseError && activeView === "raw" ? (
        <div>
          <div className="mb-2">
            <div className="text-sm text-red-500">配置解析失败</div>
            <div className="text-xs text-text-muted">{parseError}</div>
          </div>
          <textarea
            className="h-72 w-full resize-y rounded-lg border border-border bg-surface p-3 font-mono text-xs leading-relaxed text-text-main outline-none focus:border-accent"
            value={rawDraft}
            onChange={(event) => setRawDraft(event.target.value)}
          />
        </div>
      ) : activeView === "visual" ? (
        <div className="space-y-5">
          {schema.groups.map((group) => (
            <section key={group.id}>
              <div className="mb-2">
                <h3 className="text-sm font-medium text-text-main">{group.title}</h3>
                <p className="text-xs text-text-muted">{group.description}</p>
              </div>
              <div className="space-y-3">
                {group.fields.map((field) => {
                  // fieldValue 存储当前字段路径对应的值。
                  const fieldValue = getValueAtPath(configDraft, field.path);
                  return (
                    <FieldRenderer
                      key={field.path}
                      field={field}
                      value={fieldValue}
                      isSet={fieldValue !== undefined}
                      onChange={(value) => handleFieldChange(field.path, value)}
                      onUnset={() => handleFieldUnset(field.path)}
                    />
                  );
                })}
              </div>
            </section>
          ))}
          <section>
            <h3 className="mb-2 text-sm font-medium text-text-main">高级字段</h3>
            <div className="rounded-lg border border-dashed border-border p-3 text-xs text-text-muted">
              {unknownKeys.length === 0 ? (
                <div>没有未知字段</div>
              ) : (
                <div className="space-y-3">
                  {unknownKeys.map((key) => {
                    // unknownValue 存储当前未知字段在配置对象中的真实值。
                    const unknownValue = getValueAtPath(configDraft, key);
                    // unknownValueText 存储格式化后的未知字段文本，用于只读展示实际内容。
                    const unknownValueText = formatUnknownFieldValue(unknownValue);

                    return (
                      <div key={key} className="rounded-lg border border-border bg-surface p-3">
                        <div className="mb-2">
                          <Badge tone="neutral">{key}</Badge>
                        </div>
                        <pre className="overflow-x-auto whitespace-pre-wrap break-all font-mono text-xs leading-relaxed text-text-main">
                          {unknownValueText}
                        </pre>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        </div>
      ) : (
        <textarea
          className="h-72 w-full resize-y rounded-lg border border-border bg-surface p-3 font-mono text-xs leading-relaxed text-text-main outline-none focus:border-accent"
          value={rawDraft}
          onChange={(event) => setRawDraft(event.target.value)}
        />
      )}

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
