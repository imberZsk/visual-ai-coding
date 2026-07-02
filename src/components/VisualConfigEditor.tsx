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
import { Badge, Button, Card, LoadingIcon } from "./ui";
import FieldRenderer from "./visual-config/FieldRenderer";
import type { VisualConfigField, VisualConfigSchema } from "./visual-config/schemaTypes";

interface VisualConfigEditorProps {
  spec: ConfigFileSpec; // spec 存储配置文件描述。
  schema: VisualConfigSchema; // schema 存储当前文件对应的可视化 schema。
}

interface FieldRenderState {
  field: VisualConfigField; // field 存储当前待渲染的 schema 字段。
  value: unknown; // value 存储该字段在当前配置草稿中的值。
  isSet: boolean; // isSet 标记该字段是否已经显式写入配置。
}

type FieldSortOrder = "configured" | "unset" | "schema";

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

// 将单个字段值写入或删除到配置对象副本中。
// source 参数存储原始配置对象，path 参数存储字段路径，value 参数存储待写入的新值。
function writeFieldValue(
  source: Record<string, unknown>,
  path: string,
  value: unknown
): Record<string, unknown> {
  return value === undefined
    ? deleteValueAtPath(source, path)
    : setValueAtPath(source, path, value);
}

// 判断两个配置字段值在结构上是否一致。
// left 参数存储当前草稿值，right 参数存储最近保存的基线值。
function areFieldValuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true;
  }

  try {
    // leftText 存储左侧值的 JSON 表示，用于比较数组和对象字段。
    const leftText = JSON.stringify(left);
    // rightText 存储右侧值的 JSON 表示，用于比较数组和对象字段。
    const rightText = JSON.stringify(right);
    return leftText === rightText;
  } catch {
    return false;
  }
}

// 将未知字段值格式化为适合只读展示的文本。
// value 参数存储未知字段当前值，供高级字段区域展示实际内容。
function formatUnknownFieldValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  return JSON.stringify(value, null, 2) ?? "";
}

// 判断控件是否属于不常改的复杂结构控件。
// control 参数存储字段控件类型。
function isComplexControl(control: VisualConfigField["control"]): boolean {
  return control === "json-value" || control === "json-object" || control === "toml-object";
}

// 判断字段是否应该默认收进“更多配置”。
// fieldState 参数存储字段元数据和值状态。
function isUncommonUnsetField(fieldState: FieldRenderState): boolean {
  return (
    !fieldState.isSet &&
    (fieldState.field.sensitive ||
      fieldState.field.risk !== "normal" ||
      isComplexControl(fieldState.field.control))
  );
}

// normalizeHiddenFieldPaths 返回去重后的隐藏字段路径数组，保持用户配置文件可读。
// paths 参数存储可能包含重复项的字段路径列表。
function normalizeHiddenFieldPaths(paths: string[]): string[] {
  return Array.from(new Set(paths));
}

// 按当前排序模式比较字段状态，同时保持同一状态内的 schema 原始顺序。
// left 参数存储左侧字段状态，right 参数存储右侧字段状态，sortOrder 参数存储当前排序模式。
function compareFieldState(
  left: FieldRenderState,
  right: FieldRenderState,
  sortOrder: FieldSortOrder
): number {
  if (sortOrder === "schema") {
    return 0;
  }

  if (left.isSet === right.isSet) {
    return 0;
  }

  if (sortOrder === "configured") {
    return left.isSet ? -1 : 1;
  }

  return left.isSet ? 1 : -1;
}

// 可视化配置编辑器：在 raw 与 visual 两种视图之间切换，并保留未知字段。
// spec 描述文件位置和只读属性，schema 描述可视化字段分组和控件。
export default function VisualConfigEditor({ spec, schema }: VisualConfigEditorProps) {
  // prefs 存储应用偏好，用于获取工具根目录和 VSCode CLI 路径。
  const prefs = useAppStore((state) => state.prefs);
  // updatePrefs 存储更新应用偏好的 store 方法，用于持久化用户隐藏的配置项。
  const updatePrefs = useAppStore((state) => state.updatePrefs);
  // file 存储当前已加载配置文件。
  const [file, setFile] = useState<ConfigFile | null>(null);
  // rawDraft 存储原始文本编辑草稿。
  const [rawDraft, setRawDraft] = useState("");
  // configDraft 存储可视化表单对应的配置对象。
  const [configDraft, setConfigDraft] = useState<Record<string, unknown>>({});
  // baselineConfigDraft 存储最近一次已保存到磁盘的结构化配置，用于判断单个字段是否有未保存改动。
  const [baselineConfigDraft, setBaselineConfigDraft] = useState<Record<string, unknown>>({});
  // baselineRawText 存储最近一次成功加载后的原始文本基线，用于 raw 模式判断是否真的修改过。
  const [baselineRawText, setBaselineRawText] = useState("");
  // baselineVisualText 存储最近一次成功加载后的规范化文本基线，用于 visual 模式避免因格式化差异误报未保存。
  const [baselineVisualText, setBaselineVisualText] = useState("");
  // activeView 存储当前展示的是可视化还是原始文本视图。
  const [activeView, setActiveView] = useState<"visual" | "raw">("visual");
  // saving 标记当前是否正在保存。
  const [saving, setSaving] = useState(false);
  // savingFieldPath 存储当前正在单独保存的字段路径，空值表示没有字段级保存进行中。
  const [savingFieldPath, setSavingFieldPath] = useState<string | null>(null);
  // loading 标记当前是否正在读取文件。
  const [loading, setLoading] = useState(true);
  // message 存储操作成功或失败提示。
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  // parseError 存储当前 raw 内容无法解析为 schema 格式时的错误信息。
  const [parseError, setParseError] = useState<string | null>(null);
  // expandedFieldPath 存储当前唯一展开的字段路径，null 表示所有字段收起；同一时刻只允许展开一项，专注单个配置。
  const [expandedFieldPath, setExpandedFieldPath] = useState<string | null>(null);
  // showMoreFields 标记是否展示低频、敏感或复杂的未设置字段。
  const [showMoreFields, setShowMoreFields] = useState(false);
  // showUnknownFields 标记是否展示 schema 尚未覆盖的高级字段。
  const [showUnknownFields, setShowUnknownFields] = useState(false);
  // fieldSortOrder 存储可视化字段当前排序模式。
  const [fieldSortOrder, setFieldSortOrder] = useState<FieldSortOrder>("configured");
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
  // hiddenFieldPathSet 存储当前 schema 中被用户手动隐藏的字段路径集合。
  const hiddenFieldPathSet = useMemo(
    () => new Set(prefs?.hidden_visual_config_fields?.[schema.id] ?? []),
    [prefs?.hidden_visual_config_fields, schema.id]
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
    setExpandedFieldPath(null);
    setShowMoreFields(false);
    setShowUnknownFields(false);

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
        setBaselineConfigDraft(parsedConfig);
        setBaselineVisualText(normalizedVisualText);
        setActiveView("visual");
      } catch (error) {
        // 读取到损坏配置时，业务上优先回退 raw 模式，让用户至少还能直接修文本。
        setParseError(String(error));
        setConfigDraft({});
        setBaselineConfigDraft({});
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

  useEffect(() => {
    // handleRefreshShortcut 负责拦截系统刷新快捷键，并改为刷新当前配置文件内容。
    // event 参数存储键盘事件。
    function handleRefreshShortcut(event: KeyboardEvent) {
      // isRefreshShortcut 标记用户是否按下 Command+R 或 Ctrl+R。
      const isRefreshShortcut =
        (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "r";

      if (!isRefreshShortcut) {
        return;
      }

      event.preventDefault();

      if (home && !loading) {
        void load();
      }
    }

    window.addEventListener("keydown", handleRefreshShortcut);

    return () => {
      window.removeEventListener("keydown", handleRefreshShortcut);
    };
  }, [absPath, home, loading, schema.format, spec.id, spec.readonly, spec.relPath, spec.title]);

  // handleFieldChange 负责更新单个可视化字段，并立刻同步 raw 草稿以保持两视图一致。
  // path 参数存储字段路径，value 参数存储字段新值。
  function handleFieldChange(path: string, value: unknown) {
    setConfigDraft((currentConfig) => {
      // nextConfig 存储写入单个字段后的新配置对象。
      const nextConfig = writeFieldValue(currentConfig, path, value);
      setRawDraft(serializeConfigContent(nextConfig, schema.format));
      return nextConfig;
    });
  }

  // handleFieldUnset 负责删除单个可视化字段，并同步 raw 草稿。
  // path 参数存储要删除的字段路径。
  function handleFieldUnset(path: string) {
    setConfigDraft((currentConfig) => {
      // nextConfig 存储删除字段后的新配置对象。
      const nextConfig = writeFieldValue(currentConfig, path, undefined);
      setRawDraft(serializeConfigContent(nextConfig, schema.format));
      return nextConfig;
    });
  }

  // toggleFieldExpanded 负责切换单个配置项的展开状态；WHY：产品要求同一时刻只专注一项配置，
  // 所以点击已展开项时收起，点击其他项时会自动收起前一项并只展开当前项。
  // path 参数存储需要切换的字段路径。
  function toggleFieldExpanded(path: string) {
    setExpandedFieldPath((currentPath) => (currentPath === path ? null : path));
  }

  // toggleFieldHidden 负责把字段移入或移出“更多配置”，并持久化到应用偏好。
  // path 参数存储需要隐藏或取消隐藏的字段路径。
  function toggleFieldHidden(path: string) {
    // currentHiddenFields 存储当前 schema 已隐藏的字段路径列表。
    const currentHiddenFields = prefs?.hidden_visual_config_fields?.[schema.id] ?? [];
    // currentHiddenSet 存储当前 schema 已隐藏字段路径集合，用于切换指定字段。
    const currentHiddenSet = new Set(currentHiddenFields);

    if (currentHiddenSet.has(path)) {
      currentHiddenSet.delete(path);
    } else {
      currentHiddenSet.add(path);
    }

    // nextHiddenFields 存储切换后的字段路径列表。
    const nextHiddenFields = normalizeHiddenFieldPaths(Array.from(currentHiddenSet));
    // nextHiddenFieldMap 存储写回偏好的完整隐藏字段映射，避免浅合并覆盖其他 schema。
    const nextHiddenFieldMap = {
      ...(prefs?.hidden_visual_config_fields ?? {}),
      [schema.id]: nextHiddenFields,
    };

    void updatePrefs({ hidden_visual_config_fields: nextHiddenFieldMap });
  }

  // toggleMoreFields 负责切换低频配置区域的展示状态。
  function toggleMoreFields() {
    setShowMoreFields((currentShowMoreFields) => {
      // currentShowMoreFields 存储低频配置区域当前是否展示。
      return !currentShowMoreFields;
    });
  }

  // toggleUnknownFields 负责切换高级字段区域的展示状态。
  function toggleUnknownFields() {
    setShowUnknownFields((currentShowUnknownFields) => {
      // currentShowUnknownFields 存储高级字段区域当前是否展示。
      return !currentShowUnknownFields;
    });
  }

  // handleRefresh 负责响应用户点击刷新按钮，重新读取当前配置文件。
  function handleRefresh() {
    if (!home || loading) {
      return;
    }

    void load();
  }

  // isFieldDirty 判断单个字段是否相对最近保存的磁盘基线发生变化。
  // path 参数存储待检查的字段路径。
  function isFieldDirty(path: string): boolean {
    // currentValue 存储当前可视化草稿中的字段值。
    const currentValue = getValueAtPath(configDraft, path);
    // savedValue 存储最近一次已保存到磁盘的字段值。
    const savedValue = getValueAtPath(baselineConfigDraft, path);
    return !areFieldValuesEqual(currentValue, savedValue);
  }

  // renderSortButton 负责渲染字段排序切换按钮。
  // sortOrder 参数存储按钮对应的排序模式，label 参数存储按钮展示文案。
  function renderSortButton(sortOrder: FieldSortOrder, label: string) {
    // active 标记该排序按钮是否为当前选中状态。
    const active = fieldSortOrder === sortOrder;
    // activeClass 存储该排序按钮按选中状态计算出的样式。
    const activeClass = active
      ? "bg-accent text-white shadow-sm"
      : "text-text-muted hover:bg-surface hover:text-text-main";

    return (
      <button
        key={sortOrder}
        aria-pressed={active}
        className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${activeClass}`}
        type="button"
        onClick={() => setFieldSortOrder(sortOrder)}
      >
        {label}
      </button>
    );
  }

  // renderField 负责渲染带折叠状态的单个字段。
  // fieldState 参数存储字段元数据、当前值和设置状态。
  function renderField(fieldState: FieldRenderState) {
    // fieldHidden 标记当前字段是否被用户手动隐藏到更多配置区域。
    const fieldHidden = hiddenFieldPathSet.has(fieldState.field.path);
    // fieldDirty 标记当前字段是否有未保存改动。
    const fieldDirty = isFieldDirty(fieldState.field.path);
    // fieldSaving 标记当前字段是否正在单独保存。
    const fieldSaving = savingFieldPath === fieldState.field.path;
    // fieldSaveDisabled 标记当前字段保存按钮是否应禁用。
    const fieldSaveDisabled =
      !fieldDirty || loading || saving || savingFieldPath !== null || spec.readonly;

    return (
      <FieldRenderer
        key={fieldState.field.path}
        field={fieldState.field}
        value={fieldState.value}
        isSet={fieldState.isSet}
        expanded={expandedFieldPath === fieldState.field.path}
        onChange={(value) => handleFieldChange(fieldState.field.path, value)}
        onUnset={() => handleFieldUnset(fieldState.field.path)}
        onToggle={() => toggleFieldExpanded(fieldState.field.path)}
        hidden={fieldHidden}
        onToggleHidden={() => toggleFieldHidden(fieldState.field.path)}
        home={home}
        showSaveButton={!spec.readonly}
        saveDisabled={fieldSaveDisabled}
        saving={fieldSaving}
        onSave={() => {
          void handleFieldSave(fieldState.field.path, fieldState.field.title);
        }}
      />
    );
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
      setRawDraft(content);
      setBaselineRawText(content);

      try {
        // savedConfig 存储刚保存内容的结构化对象，用于同步可视化草稿和规范化基线。
        const savedConfig = parseConfigContent(content, schema.format);
        // normalizedSavedText 存储刚保存内容按当前格式重新序列化后的文本基线。
        const normalizedSavedText = serializeConfigContent(savedConfig, schema.format);
        setConfigDraft(savedConfig);
        setBaselineConfigDraft(savedConfig);
        setBaselineVisualText(normalizedSavedText);
        setParseError(null);
      } catch (error) {
        // raw 视图允许用户保存不可切回 visual 的草稿时，保留错误状态给切换视图时继续提示。
        setParseError(String(error));
      }

      setMessage({ type: "ok", text: "已保存" });
    } catch (error) {
      setMessage({ type: "err", text: String(error) });
    } finally {
      setSaving(false);
    }
  }

  // handleFieldSave 负责只保存单个可视化字段，并保留其他字段的未保存草稿状态。
  // path 参数存储要保存的字段路径，title 参数存储字段标题用于提示用户保存结果。
  async function handleFieldSave(path: string, title: string) {
    if (!file || spec.readonly || saving || savingFieldPath !== null) {
      return;
    }

    // fieldValue 存储当前草稿里要写入磁盘的单字段值。
    const fieldValue = getValueAtPath(configDraft, path);
    // nextSavedConfig 存储只合并当前字段后的磁盘目标配置，避免误提交其他未保存字段。
    const nextSavedConfig = writeFieldValue(baselineConfigDraft, path, fieldValue);
    // content 存储本次字段级保存实际写回磁盘的完整配置文本。
    const content = serializeConfigContent(nextSavedConfig, schema.format);

    setSavingFieldPath(path);
    setMessage(null);

    try {
      await saveConfigFile(file.path, content, file.format);
      setBaselineConfigDraft(nextSavedConfig);
      setBaselineRawText(content);
      setBaselineVisualText(content);
      setMessage({ type: "ok", text: `已保存${title}` });
    } catch (error) {
      setMessage({ type: "err", text: String(error) });
    } finally {
      setSavingFieldPath(null);
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
          <Button onClick={handleRefresh} variant="default" loading={loading} title="重新读取当前配置">
            <span aria-hidden="true">↻</span>
            刷新
          </Button>
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
            <Button
              onClick={handleSave}
              variant="primary"
              disabled={savingFieldPath !== null || !dirty}
              loading={saving}
            >
              保存
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-text-muted">
          <LoadingIcon className="h-3.5 w-3.5" />
          <span>加载中…</span>
        </div>
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
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface/60 px-3 py-2">
            <span className="text-xs text-text-muted">排序</span>
            <div className="inline-flex rounded-lg border border-border bg-panel p-0.5">
              {renderSortButton("configured", "已设置优先")}
              {renderSortButton("unset", "未设置优先")}
              {renderSortButton("schema", "默认顺序")}
            </div>
          </div>
          {schema.groups.map((group) => {
            // fieldStates 存储当前分组所有字段的渲染状态。
            const fieldStates = group.fields.map((field) => {
              // fieldValue 存储当前字段路径对应的值。
              const fieldValue = getValueAtPath(configDraft, field.path);
              return {
                field,
                value: fieldValue,
                isSet: fieldValue !== undefined,
              };
            });
            // primaryFieldStates 存储默认展示的字段，已设置字段会排在未设置字段之前。
            const primaryFieldStates = fieldStates
              .filter(
                (fieldState) =>
                  !hiddenFieldPathSet.has(fieldState.field.path) &&
                  !isUncommonUnsetField(fieldState)
              )
              .sort((leftFieldState, rightFieldState) =>
                compareFieldState(leftFieldState, rightFieldState, fieldSortOrder)
              );
            // moreFieldStates 存储默认隐藏的低频未设置字段，以及用户手动隐藏的字段。
            const moreFieldStates = fieldStates
              .filter(
                (fieldState) =>
                  hiddenFieldPathSet.has(fieldState.field.path) ||
                  isUncommonUnsetField(fieldState)
              )
              .sort((leftFieldState, rightFieldState) =>
                compareFieldState(leftFieldState, rightFieldState, fieldSortOrder)
              );

            return (
              <section key={group.id}>
                <div className="mb-2">
                  <h3 className="text-sm font-medium text-text-main">{group.title}</h3>
                  <p className="text-xs text-text-muted">{group.description}</p>
                </div>
                <div className="space-y-3">
                  {primaryFieldStates.map((fieldState) => renderField(fieldState))}
                  {moreFieldStates.length > 0 && (
                    <div className="rounded-lg border border-dashed border-border bg-surface/60 p-3">
                      <button
                        aria-expanded={showMoreFields}
                        className="text-xs font-medium text-accent hover:text-text-main"
                        type="button"
                        onClick={toggleMoreFields}
                      >
                        {showMoreFields
                          ? `隐藏更多配置（${moreFieldStates.length}）`
                          : `显示更多配置（${moreFieldStates.length}）`}
                      </button>
                      {showMoreFields && (
                        <div className="mt-3 space-y-3">
                          {moreFieldStates.map((fieldState) => renderField(fieldState))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </section>
            );
          })}
          <section>
            <div className="mb-2 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-medium text-text-main">高级字段</h3>
                <p className="text-xs text-text-muted">未被当前 schema 覆盖的配置会保留在这里。</p>
              </div>
              <button
                aria-expanded={showUnknownFields}
                className="shrink-0 text-xs font-medium text-accent hover:text-text-main"
                type="button"
                onClick={toggleUnknownFields}
              >
                {showUnknownFields ? "隐藏高级字段" : "显示高级字段"}
              </button>
            </div>
            {showUnknownFields && (
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
            )}
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
