import { useEffect, useState } from "react";
import { Badge } from "../ui";
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

// 判断当前字段是否属于对象类编辑控件。
// control 参数存储字段控件类型。
function isObjectControl(control: VisualConfigField["control"]): boolean {
  return control === "json-object" || control === "toml-object";
}

// 判断当前字段是否使用 JSON textarea 控件。
// control 参数存储字段控件类型。
function isJsonTextareaControl(control: VisualConfigField["control"]): boolean {
  return control === "json-value" || isObjectControl(control);
}

// 判断当前字段是否适合使用大弹窗编辑。
// control 参数存储字段控件类型。
function isModalEditorControl(control: VisualConfigField["control"]): boolean {
  return control === "string-list" || isJsonTextareaControl(control);
}

// 将字段路径转换为测试与 DOM 标识可用的短横线格式。
// path 参数存储 schema 字段路径。
function toDomId(path: string): string {
  return path.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

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
}: FieldRendererProps) {
  // shouldRenderDetails 标记详情内容是否仍需挂载，收起时保留到动画结束再卸载。
  const [shouldRenderDetails, setShouldRenderDetails] = useState(expanded);
  // modalOpen 标记大编辑弹窗是否打开。
  const [modalOpen, setModalOpen] = useState(false);
  // modalDraft 存储大编辑弹窗中的文本草稿。
  const [modalDraft, setModalDraft] = useState("");
  // modalError 存储大编辑弹窗校验失败时的错误提示。
  const [modalError, setModalError] = useState<string | null>(null);
  // valueText 存储基础文本/数字/select 输入框使用的字符串值。
  const valueText = toInputText(value);
  // detailsDomId 存储详情区域的 DOM 标识后缀。
  const detailsDomId = toDomId(field.path);
  // detailsClass 存储详情区域按展开状态计算出的动画样式。
  const detailsClass = expanded
    ? "mt-3 grid grid-rows-[1fr] opacity-100 transition-[grid-template-rows,opacity,margin-top] duration-200 ease-out"
    : "mt-0 grid grid-rows-[0fr] opacity-0 transition-[grid-template-rows,opacity,margin-top] duration-200 ease-out";
  // detailsContentClass 存储详情内容按展开状态计算出的淡入位移样式。
  const detailsContentClass = expanded
    ? "min-h-0 overflow-hidden translate-y-0 transition-[transform,opacity] duration-200 ease-out"
    : "min-h-0 overflow-hidden -translate-y-1 transition-[transform,opacity] duration-150 ease-in";
  // modalPreviewText 存储弹窗按钮旁边展示的字段当前内容预览。
  const modalPreviewText = isJsonTextareaControl(field.control)
    ? toJsonDraft(value) || "未设置"
    : Array.isArray(value) && value.length > 0
    ? value.join("\n")
    : "未设置";
  // selectOptions 存储 select 控件的静态候选项。
  const selectOptions = field.options ?? [];
  // hasCurrentSelectOption 标记当前 select 值是否已经包含在 schema 候选项中。
  const hasCurrentSelectOption = selectOptions.some((option) => option.value === valueText);
  // shouldShowCurrentSelectOption 标记是否需要临时补一个当前自定义值，避免未知模型显示为空。
  const shouldShowCurrentSelectOption =
    field.control === "select" && valueText !== "" && !hasCurrentSelectOption;

  useEffect(() => {
    if (expanded) {
      setShouldRenderDetails(true);
      return;
    }

    // timer 存储收起动画结束后卸载详情内容的定时器。
    const timer = window.setTimeout(() => {
      setShouldRenderDetails(false);
    }, 200);

    return () => {
      window.clearTimeout(timer);
    };
  }, [expanded]);

  // openModalEditor 负责打开大编辑弹窗并初始化草稿。
  function openModalEditor() {
    setModalDraft(
      isJsonTextareaControl(field.control)
        ? toJsonDraft(value)
        : Array.isArray(value)
        ? value.join("\n")
        : ""
    );
    setModalError(null);
    setModalOpen(true);
  }

  // closeModalEditor 负责关闭大编辑弹窗。
  function closeModalEditor() {
    setModalOpen(false);
    setModalError(null);
  }

  // applyModalEditor 负责校验并应用大弹窗中的编辑草稿。
  function applyModalEditor() {
    if (field.control === "string-list") {
      // nextListValue 存储按行拆分并去空后的字符串数组。
      const nextListValue = modalDraft.split("\n").filter((line) => line.trim());
      onChange(nextListValue.length === 0 ? undefined : nextListValue);
      closeModalEditor();
      return;
    }

    if (!modalDraft.trim()) {
      onChange(undefined);
      closeModalEditor();
      return;
    }

    try {
      // parsedValue 存储大弹窗 JSON 成功解析后的值。
      const parsedValue = JSON.parse(modalDraft) as unknown;

      if (
        isObjectControl(field.control) &&
        (typeof parsedValue !== "object" ||
          parsedValue === null ||
          Array.isArray(parsedValue))
      ) {
        setModalError("请输入 JSON 对象");
        return;
      }

      onChange(parsedValue);
      closeModalEditor();
    } catch (error) {
      setModalError(String(error));
    }
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div className="flex items-start justify-between gap-3">
        <button
          aria-label={`${field.title} 配置项`}
          aria-expanded={expanded}
          className="min-w-0 flex-1 rounded-md text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/50"
          type="button"
          onClick={onToggle}
        >
          <span className="flex flex-wrap items-center gap-2">
            <span
              aria-hidden="true"
              className={`h-2 w-2 rotate-[-45deg] border-b-2 border-r-2 border-accent transition-transform ${
                expanded ? "rotate-45" : ""
              }`}
            />
            <span className="text-sm font-medium text-text-main">{field.title}</span>
            <Badge tone={isSet ? "success" : "neutral"}>{isSet ? "已设置" : "未设置"}</Badge>
            {field.risk !== "normal" && (
              <Badge tone={field.risk === "danger" ? "warning" : "info"}>{field.risk}</Badge>
            )}
            {field.sensitive && <Badge tone="warning">敏感</Badge>}
          </span>
          <span className="mt-1 block text-xs text-text-muted">{field.description}</span>
          <span className="mt-1 block text-xs text-text-muted">范围：{field.scope}</span>
        </button>
        {isSet && (
          <div className="flex shrink-0 items-center gap-2">
            <button
              className="text-xs text-text-muted hover:text-text-main"
              type="button"
              onClick={onUnset}
            >
              取消设置
            </button>
            <button
              className="text-xs text-text-muted hover:text-text-main"
              type="button"
              onClick={onToggleHidden}
            >
              {hidden ? `取消隐藏${field.title}` : `隐藏${field.title}`}
            </button>
          </div>
        )}
        {!isSet && (
          <button
            className="shrink-0 text-xs text-text-muted hover:text-text-main"
            type="button"
            onClick={onToggleHidden}
          >
            {hidden ? `取消隐藏${field.title}` : `隐藏${field.title}`}
          </button>
        )}
      </div>

      {shouldRenderDetails && (
        <div
          data-expanded={expanded ? "true" : "false"}
          data-testid={`field-details-${detailsDomId}`}
          className={detailsClass}
        >
          <div className={detailsContentClass}>
            {field.control === "switch" && (
              <label className="inline-flex items-center gap-2 text-sm text-text-main">
                <input
                  checked={Boolean(value)}
                  className="h-4 w-4"
                  type="checkbox"
                  onChange={(event) => onChange(event.target.checked)}
                />
                打开
              </label>
            )}

            {field.control === "select" && (
              <select
                className="w-full rounded-lg border border-border bg-panel px-3 py-2 text-sm text-text-main outline-none focus:border-accent"
                value={valueText}
                onChange={(event) => {
                  // nextValue 存储下拉框选中的原始字符串，空串代表回到未设置态。
                  const nextValue = event.target.value;
                  onChange(nextValue === "" ? undefined : nextValue);
                }}
              >
                <option value="">未设置</option>
                {shouldShowCurrentSelectOption && (
                  <option value={valueText}>{valueText}（当前值）</option>
                )}
                {selectOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            )}

            {field.control === "text" && (
              <input
                className="w-full rounded-lg border border-border bg-panel px-3 py-2 text-sm text-text-main outline-none focus:border-accent"
                value={valueText}
                onChange={(event) => onChange(event.target.value)}
              />
            )}

            {field.control === "number" && (
              <input
                className="w-full rounded-lg border border-border bg-panel px-3 py-2 text-sm text-text-main outline-none focus:border-accent"
                type="number"
                value={valueText}
                onChange={(event) => {
                  // nextValue 存储数字输入框中的原始文本，空串代表用户希望回到未设置态而不是数字 0。
                  const nextValue = event.target.value;
                  onChange(nextValue === "" ? undefined : Number(nextValue));
                }}
              />
            )}

            {isModalEditorControl(field.control) && (
              <div className="rounded-lg border border-dashed border-border bg-panel p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-text-main">大窗口编辑</div>
                    <div className="mt-1 line-clamp-2 whitespace-pre-wrap break-all font-mono text-xs text-text-muted">
                      {modalPreviewText}
                    </div>
                  </div>
                  <button
                    className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-text-main transition-colors hover:bg-surface"
                    type="button"
                    onClick={openModalEditor}
                  >
                    打开{field.title}编辑
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {modalOpen && (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-6"
          role="dialog"
          aria-label={`编辑${field.title}`}
        >
          <div className="flex max-h-[86vh] w-full max-w-4xl flex-col rounded-xl border border-border bg-panel shadow-2xl">
            <div className="border-b border-border px-5 py-4">
              <div className="text-base font-semibold text-text-main">编辑{field.title}</div>
              <div className="mt-1 text-xs text-text-muted">{field.description}</div>
            </div>
            <div className="min-h-0 flex-1 p-5">
              <textarea
                aria-label={`${field.title} 内容`}
                className="h-[52vh] w-full resize-none rounded-lg border border-border bg-surface p-4 font-mono text-sm leading-relaxed text-text-main outline-none focus:border-accent"
                value={modalDraft}
                onChange={(event) => setModalDraft(event.target.value)}
              />
              {modalError && <div className="mt-2 text-xs text-red-500">{modalError}</div>}
            </div>
            <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
              <button
                className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-text-main transition-colors hover:bg-surface"
                type="button"
                onClick={closeModalEditor}
              >
                取消
              </button>
              <button
                className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
                type="button"
                onClick={applyModalEditor}
              >
                应用到配置
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
