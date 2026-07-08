import {
  Alert,
  Button as AntButton,
  Collapse,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Switch,
  type CollapseProps,
} from "antd";
import { useEffect, useState } from "react";
import type { ChangeEvent, MouseEvent } from "react";
import { Badge } from "../ui";
import ClaudeOutputStyleField from "./ClaudeOutputStyleField";
import type { VisualConfigField } from "./schemaTypes";

interface FieldRendererProps {
  field: VisualConfigField; // field 存储当前渲染的 schema 字段。
  value: unknown; // value 存储当前字段当前值。
  isSet: boolean; // isSet 标记该字段是否已在配置中显式设置。
  expanded: boolean; // expanded 标记当前字段详情区是否展开。
  onChange: (value: unknown) => void; // onChange 用于把解析成功的新值回传给父组件。
  onUnset: () => void; // onUnset 用于删除当前字段配置。
  onToggle: () => void; // onToggle 用于切换当前字段的收起或展开状态。
  hidden: boolean; // hidden 标记该字段是否被用户手动隐藏到更多配置区域。
  onToggleHidden: () => void; // onToggleHidden 用于切换该字段的手动隐藏状态。
  home: string; // home 存储当前工具配置根目录，供需要目录上下文的专用控件使用。
  showSaveButton: boolean; // showSaveButton 标记当前字段是否需要展示就地保存按钮。
  saveDisabled: boolean; // saveDisabled 标记当前字段保存按钮是否禁用。
  saving: boolean; // saving 标记当前字段是否正在保存。
  onSave: () => void; // onSave 用于保存当前字段改动。
  onValidationChange: (valid: boolean) => void; // onValidationChange 用于把内联编辑器格式状态同步给父组件。
}

interface InlineEditorParseResult {
  ok: boolean; // ok 标记 textarea 草稿是否已成功解析。
  value?: unknown; // value 存储解析成功后应写入字段的值。
  error?: string; // error 存储解析失败时展示给用户的错误信息。
}

// 将任意值转换为普通文本输入框可显示的字符串。
// value 参数存储字段的当前值。
function toInputText(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }
  return String(value);
}

// 将 JSON textarea 字段的当前值转换为初始文本。
// value 参数存储字段当前值。
function toJsonDraft(value: unknown): string {
  if (value === undefined) {
    return "";
  }
  return JSON.stringify(value, null, 2) ?? "";
}

// 将内联 textarea 字段的当前值转换为编辑草稿。
// control 参数存储字段控件类型，value 参数存储字段当前值。
function toInlineEditorDraft(control: VisualConfigField["control"], value: unknown): string {
  if (control === "string-list") {
    // listText 存储字符串列表按行展开后的文本，便于用户直接批量编辑。
    const listText = Array.isArray(value) ? value.map((item) => String(item)).join("\n") : "";
    return listText;
  }

  return toJsonDraft(value);
}

// 将任意字段值转换为 Ant Design InputNumber 可消费的数值。
// value 参数存储字段当前值，可能来自 JSON/TOML 解析或用户草稿。
function toInputNumberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    // parsedNumber 存储字符串转成数字后的结果，用于兼容历史文本草稿。
    const parsedNumber = Number(value);
    return Number.isNaN(parsedNumber) ? null : parsedNumber;
  }

  return null;
}

// 判断当前字段是否属于对象类编辑控件。
// control 参数存储字段控件类型。
function isObjectControl(control: VisualConfigField["control"]): boolean {
  return control === "json-object" || control === "toml-object";
}

// 将字段默认值格式化为便于用户阅读的文本。
// value 参数存储 schema 中声明的官方默认值，可能是布尔、数字、字符串、数组或对象。
function formatDefaultValueText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "boolean" || typeof value === "number") {
    return String(value);
  }

  // jsonText 存储对象、数组等复合默认值序列化后的文本，供只读展示。
  const jsonText = JSON.stringify(value);
  return jsonText ?? String(value);
}

// 判断当前字段是否使用 JSON textarea 控件。
// control 参数存储字段控件类型。
function isJsonTextareaControl(control: VisualConfigField["control"]): boolean {
  return control === "json-value" || isObjectControl(control);
}

// 判断当前字段是否适合使用内联大文本框编辑。
// control 参数存储字段控件类型。
function isInlineTextEditorControl(control: VisualConfigField["control"]): boolean {
  return control === "string-list" || isJsonTextareaControl(control);
}

// 解析内联 textarea 草稿为字段值。
// field 参数存储字段元数据，draft 参数存储 textarea 当前文本。
function parseInlineEditorDraft(
  field: VisualConfigField,
  draft: string
): InlineEditorParseResult {
  if (field.control === "string-list") {
    // listValue 存储按行拆分并过滤空行后的字符串数组。
    const listValue = draft.split("\n").filter((line) => line.trim());
    return { ok: true, value: listValue.length === 0 ? undefined : listValue };
  }

  if (!draft.trim()) {
    return { ok: true, value: undefined };
  }

  try {
    // parsedValue 存储 JSON textarea 成功解析后的值。
    const parsedValue = JSON.parse(draft) as unknown;

    if (
      isObjectControl(field.control) &&
      (typeof parsedValue !== "object" || parsedValue === null || Array.isArray(parsedValue))
    ) {
      return { ok: false, error: "请输入 JSON 对象" };
    }

    return { ok: true, value: parsedValue };
  } catch (error) {
    return { ok: false, error: `JSON 格式不正确：${String(error)}` };
  }
}

// 将字段路径转换为测试与 DOM 标识可用的短横线格式。
// path 参数存储 schema 字段路径。
function toDomId(path: string): string {
  return path.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

// stopCollapseExtraClick 阻止字段操作按钮点击冒泡到 Collapse header。
// event 参数存储按钮区域的鼠标事件。
function stopCollapseExtraClick(event: MouseEvent<HTMLElement>) {
  event.stopPropagation();
}

// FIELD_DETAILS_CLOSE_UNMOUNT_DELAY_MS 存储关闭动画期间保留详情内容的时间，略长于 AntD motionDurationMid。
const FIELD_DETAILS_CLOSE_UNMOUNT_DELAY_MS = 260;

// 渲染单个可视化配置字段。
// field 描述字段元数据，value 为当前值，onChange / onUnset 负责把用户操作传回父组件。
export default function FieldRenderer({
  field,
  value,
  isSet,
  expanded,
  onChange,
  onUnset,
  onToggle,
  hidden,
  onToggleHidden,
  home,
  showSaveButton,
  saveDisabled,
  saving,
  onSave,
  onValidationChange,
}: FieldRendererProps) {
  // inlineDraft 存储内联大文本框中的编辑草稿。
  const [inlineDraft, setInlineDraft] = useState("");
  // inlineError 存储内联大文本框解析失败时的错误提示。
  const [inlineError, setInlineError] = useState<string | null>(null);
  // inlineEditing 标记用户是否正在输入，避免合法输入被父级格式化结果打断光标位置。
  const [inlineEditing, setInlineEditing] = useState(false);
  // shouldRenderDetails 标记详情内容是否需要挂载；关闭时延迟卸载以便 AntD Collapse 正常测量并完成收起动画。
  const [shouldRenderDetails, setShouldRenderDetails] = useState(expanded);
  // detailsDomId 存储详情区域的 DOM 标识后缀。
  const detailsDomId = toDomId(field.path);
  // shouldMountDetails 标记当前是否需要真实挂载字段详情内容；WHY：收起项不创建 AntD 表单控件和大对象预览，避免页面展示时卡顿。
  const shouldMountDetails = expanded || shouldRenderDetails;
  // detailsClass 存储详情区域样式；动画交给 Ant Design Collapse，避免内外两套动画叠加造成展开中途停顿。
  const detailsClass = "overflow-visible";
  // animationState 存储详情区域状态，便于测试确认不再存在延迟 opening，同时关闭期间保留 closing 内容。
  const animationState = expanded ? "open" : shouldRenderDetails ? "closing" : "closed";

  useEffect(() => {
    if (expanded) {
      setShouldRenderDetails(true);
      return;
    }

    if (!shouldRenderDetails) {
      return;
    }

    // unmountTimer 存储关闭动画结束后卸载详情内容的定时器；WHY：立即卸载会让 AntD Collapse 收起时量不到内容高度。
    const unmountTimer = window.setTimeout(() => {
      setShouldRenderDetails(false);
    }, FIELD_DETAILS_CLOSE_UNMOUNT_DELAY_MS);

    return () => {
      window.clearTimeout(unmountTimer);
    };
  }, [expanded, shouldRenderDetails]);

  useEffect(() => {
    if (!isInlineTextEditorControl(field.control) || !shouldMountDetails || inlineEditing) {
      return;
    }

    setInlineDraft(toInlineEditorDraft(field.control, value));
    setInlineError(null);
    onValidationChange(true);
  }, [field.control, inlineEditing, onValidationChange, shouldMountDetails, value]);

  // applyInlineEditorDraft 负责解析内联 textarea 草稿，成功时立即同步到字段值。
  // nextDraft 参数存储当前 textarea 文本。
  function applyInlineEditorDraft(nextDraft: string) {
    // parseResult 存储当前草稿解析结果，用于决定是否更新父级配置草稿。
    const parseResult = parseInlineEditorDraft(field, nextDraft);

    if (!parseResult.ok) {
      setInlineError(parseResult.error ?? "内容格式不正确");
      onValidationChange(false);
      return;
    }

    setInlineError(null);
    onValidationChange(true);
    onChange(parseResult.value);
  }

  // handleInlineEditorChange 负责响应内联 textarea 输入。
  // event 参数存储 textarea change 事件。
  function handleInlineEditorChange(event: ChangeEvent<HTMLTextAreaElement>) {
    // nextDraft 存储用户输入后的完整 textarea 文本。
    const nextDraft = event.target.value;
    setInlineEditing(true);
    setInlineDraft(nextDraft);
    applyInlineEditorDraft(nextDraft);
  }

  // handleInlineEditorBlur 负责在编辑结束后允许父级规范化文本重新同步到 textarea。
  function handleInlineEditorBlur() {
    if (inlineError) {
      // 用户离开非法 JSON 时保留草稿，避免失焦后被旧配置覆盖。
      return;
    }

    setInlineEditing(false);
  }

  // formatInlineEditorDraft 负责把当前 JSON 草稿格式化为标准缩进。
  function formatInlineEditorDraft() {
    // parseResult 存储格式化前的解析结果，避免把错误 JSON 写回字段。
    const parseResult = parseInlineEditorDraft(field, inlineDraft);

    if (!parseResult.ok) {
      setInlineError(parseResult.error ?? "内容格式不正确");
      onValidationChange(false);
      return;
    }

    // formattedDraft 存储格式化后的 JSON 文本，undefined 对应空字段。
    const formattedDraft = JSON.stringify(parseResult.value, null, 2) ?? "";
    setInlineDraft(formattedDraft);
    setInlineError(null);
    onValidationChange(true);
    onChange(parseResult.value);
  }

  // handleCollapseChange 负责把 Ant Design Collapse 的展开变化同步给父组件。
  function handleCollapseChange() {
    onToggle();
  }

  // renderFieldHeader 渲染配置项折叠头部。
  function renderFieldHeader() {
    // fieldStateLabel 存储字段设置状态的中文文案，避免状态只靠颜色表达。
    const fieldStateLabel = isSet ? "已设置" : "未设置";
    // fieldStateValue 存储字段设置状态的 DOM 语义值，供样式和测试识别。
    const fieldStateValue = isSet ? "set" : "unset";
    // fieldStateClassName 存储字段状态标识的最终样式类，仅让状态胶囊表达绿色确认感。
    const fieldStateClassName = [
      "visual-config-field-state rounded-full px-2 py-0.5 text-xs",
      isSet ? "visual-config-field-state--set" : "visual-config-field-state--unset",
    ].join(" ");

    return (
      <div className="min-w-0 pr-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="visual-config-field-title text-sm font-semibold">
            {field.title}
          </span>
          <span className="visual-config-field-key rounded px-1.5 py-0.5 font-mono text-xs">
            {field.path}
          </span>
          <span className={fieldStateClassName} data-state={fieldStateValue}>
            {fieldStateLabel}
          </span>
          {field.risk !== "normal" && (
            <Badge tone={field.risk === "danger" ? "warning" : "info"}>{field.risk}</Badge>
          )}
          {field.sensitive && <Badge tone="warning">敏感</Badge>}
        </div>
        <div className="visual-config-field-meta mt-2 text-xs">
          <div className="leading-5">{field.description}</div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>范围：{field.scope}</span>
            {field.defaultValue !== undefined && (
              <span>默认值：{formatDefaultValueText(field.defaultValue)}</span>
            )}
          </div>
        </div>
      </div>
    );
  }

  // renderFieldActions 渲染配置项右侧的保存、取消设置与隐藏操作。
  function renderFieldActions() {
    return (
      <Space
        className="visual-config-field-actions justify-end"
        size={4}
        wrap
        onClick={stopCollapseExtraClick}
      >
        {showSaveButton && (
          <AntButton
            aria-label={`保存${field.title}`}
            disabled={saveDisabled}
            loading={saving}
            size="small"
            type="primary"
            onClick={onSave}
          >
            保存
          </AntButton>
        )}
        {isSet && (
          <AntButton size="small" type="text" onClick={onUnset}>
            取消设置
          </AntButton>
        )}
        <AntButton size="small" type="text" onClick={onToggleHidden}>
          {hidden ? `取消隐藏${field.title}` : `隐藏${field.title}`}
        </AntButton>
      </Space>
    );
  }

  // renderFieldControl 渲染展开后的字段编辑控件。
  function renderFieldControl() {
    if (field.control === "switch") {
      return (
        <Switch
          aria-label="打开"
          checked={Boolean(value)}
          checkedChildren="打开"
          unCheckedChildren="关闭"
          onChange={(checked) => onChange(checked)}
        />
      );
    }

    if (field.control === "select") {
      // valueText 存储 Select 控件当前值的文本形式。
      const valueText = toInputText(value);
      // selectOptions 存储 select 控件的静态候选项。
      const selectOptions = field.options ?? [];
      // hasCurrentSelectOption 标记当前 select 值是否已经包含在 schema 候选项中。
      const hasCurrentSelectOption = selectOptions.some((option) => option.value === valueText);
      // shouldShowCurrentSelectOption 标记是否需要临时补一个当前自定义值，避免未知模型显示为空。
      const shouldShowCurrentSelectOption = valueText !== "" && !hasCurrentSelectOption;
      // renderedSelectOptions 存储 Ant Design Select 使用的候选项，包含必要时补入的当前自定义值。
      const renderedSelectOptions = [
        ...(shouldShowCurrentSelectOption
          ? [{ value: valueText, label: `${valueText}（当前值）` }]
          : []),
        ...selectOptions.map((option) => ({
          value: option.value,
          label: option.description ? `${option.label} · ${option.description}` : option.label,
        })),
      ];

      return (
        <Select
          allowClear
          className="w-full"
          options={renderedSelectOptions}
          placeholder="未设置"
          value={valueText === "" ? undefined : valueText}
          onChange={(nextValue) => onChange(nextValue === undefined ? undefined : nextValue)}
        />
      );
    }

    if (field.control === "text") {
      // valueText 存储文本输入框当前值。
      const valueText = toInputText(value);

      return (
        <Input
          value={valueText}
          onChange={(event) => onChange(event.target.value)}
        />
      );
    }

    if (field.control === "claude-output-style") {
      // valueText 存储 outputStyle 专用控件当前值。
      const valueText = toInputText(value);

      return (
        <ClaudeOutputStyleField
          value={valueText}
          claudeHome={home}
          onChange={(nextValue) => onChange(nextValue)}
        />
      );
    }

    if (field.control === "number") {
      // numberValue 存储数字输入控件使用的受控数值，空值用 null 表示。
      const numberValue = toInputNumberValue(value);

      return (
        <InputNumber
          className="w-full"
          value={numberValue}
          onChange={(nextValue) => onChange(nextValue === null ? undefined : nextValue)}
        />
      );
    }

    if (isInlineTextEditorControl(field.control)) {
      // inlinePlaceholder 存储内联 textarea 的示例占位文本。
      const inlinePlaceholder =
        field.control === "string-list" ? "每行一个值" : "{\n  \"key\": \"value\"\n}";
      // showFormatButton 标记当前控件是否展示 JSON 格式化按钮。
      const showFormatButton = isJsonTextareaControl(field.control);

      return (
        <div className="visual-config-inline-editor space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-medium text-text-muted">
              {field.control === "string-list" ? "列表文本" : "JSON 文本"}
            </span>
            {showFormatButton && (
              <AntButton size="small" type="text" onClick={formatInlineEditorDraft}>
                格式化
              </AntButton>
            )}
          </div>
          <Input.TextArea
            aria-label={`${field.title} 内容`}
            className="visual-config-inline-textarea"
            placeholder={inlinePlaceholder}
            spellCheck={false}
            value={inlineDraft}
            onBlur={handleInlineEditorBlur}
            onChange={handleInlineEditorChange}
            onFocus={() => setInlineEditing(true)}
          />
          {inlineError && <Alert message={inlineError} showIcon type="error" />}
        </div>
      );
    }

    return null;
  }

  // renderFieldDetails 渲染展开后的字段详情区；收起状态不会调用，避免提前创建重控件。
  function renderFieldDetails() {
    return (
      <div
        data-expanded={expanded ? "true" : "false"}
        data-animation-state={animationState}
        data-testid={`field-details-${detailsDomId}`}
        className={detailsClass}
      >
        <Form layout="vertical" className="m-0">
          <Form.Item label="当前值" className="mb-0">
            {renderFieldControl()}
          </Form.Item>
        </Form>
      </div>
    );
  }

  // collapseItems 存储 Ant Design Collapse 的单项配置。
  const collapseItems: CollapseProps["items"] = [
    {
      key: field.path,
      label: renderFieldHeader(),
      children: shouldMountDetails ? renderFieldDetails() : null,
      extra: renderFieldActions(),
    },
  ];

  return (
    <Collapse
      activeKey={expanded ? [field.path] : []}
      className="visual-config-field"
      items={collapseItems}
      onChange={handleCollapseChange}
    />
  );
}
