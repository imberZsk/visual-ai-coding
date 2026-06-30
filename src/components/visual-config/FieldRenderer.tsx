import { useEffect, useState } from "react";
import { Badge } from "../ui";
import type { VisualConfigField } from "./schemaTypes";

interface FieldRendererProps {
  field: VisualConfigField; // field 存储当前渲染的 schema 字段。
  value: unknown; // value 存储当前字段当前值。
  isSet: boolean; // isSet 标记该字段是否已在配置中显式设置。
  onChange: (value: unknown) => void; // onChange 用于把解析成功的新值回传给父组件。
  onUnset: () => void; // onUnset 用于删除当前字段配置。
}

// 将任意值转换为普通文本输入框可显示的字符串。
// value 参数存储字段的当前值。
function toInputText(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }
  return String(value);
}

// 将对象类字段的当前值转换为 textarea 初始文本。
// value 参数存储字段当前值。
function toObjectDraft(value: unknown): string {
  if (value === undefined) {
    return "";
  }
  return JSON.stringify(value ?? {}, null, 2);
}

// 判断当前字段是否属于对象类编辑控件。
// control 参数存储字段控件类型。
function isObjectControl(control: VisualConfigField["control"]): boolean {
  return control === "json-object" || control === "toml-object";
}

// 渲染单个可视化配置字段。
// field 描述字段元数据，value 为当前值，onChange / onUnset 负责把用户操作传回父组件。
export default function FieldRenderer({
  field,
  value,
  isSet,
  onChange,
  onUnset,
}: FieldRendererProps) {
  // objectDraft 存储对象类字段 textarea 当前草稿文本。
  const [objectDraft, setObjectDraft] = useState(toObjectDraft(value));
  // objectError 存储对象类字段解析失败时的错误提示。
  const [objectError, setObjectError] = useState<string | null>(null);
  // valueText 存储基础文本/数字/select 输入框使用的字符串值。
  const valueText = toInputText(value);

  useEffect(() => {
    if (isObjectControl(field.control)) {
      setObjectDraft(toObjectDraft(value));
      setObjectError(null);
    }
  }, [field.control, value]);

  // handleObjectChange 负责在对象类字段中安全解析用户输入，避免半截 JSON 导致父组件状态损坏。
  // nextDraft 参数存储 textarea 最新文本。
  function handleObjectChange(nextDraft: string) {
    setObjectDraft(nextDraft);

    // 用户正在清空对象字段时，允许直接回写空对象，便于从复杂配置退回默认状态。
    if (!nextDraft.trim()) {
      setObjectError(null);
      onChange({});
      return;
    }

    try {
      // parsedValue 存储对象 textarea 成功解析后的值。
      const parsedValue = JSON.parse(nextDraft) as unknown;

      // 对象类控件的业务语义是编辑映射结构，因此需要拒绝数组和标量，避免写出不符合 schema 预期的值。
      if (
        typeof parsedValue !== "object" ||
        parsedValue === null ||
        Array.isArray(parsedValue)
      ) {
        setObjectError("请输入 JSON 对象");
        return;
      }

      setObjectError(null);
      onChange(parsedValue);
    } catch (error) {
      setObjectError(String(error));
    }
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-text-main">{field.title}</span>
            <Badge tone={isSet ? "success" : "neutral"}>{isSet ? "已设置" : "未设置"}</Badge>
            {field.risk !== "normal" && (
              <Badge tone={field.risk === "danger" ? "warning" : "info"}>{field.risk}</Badge>
            )}
            {field.sensitive && <Badge tone="warning">敏感</Badge>}
          </div>
          <p className="mt-1 text-xs text-text-muted">{field.description}</p>
          <p className="mt-1 text-xs text-text-muted">范围：{field.scope}</p>
        </div>
        {isSet && (
          <button
            className="shrink-0 text-xs text-text-muted hover:text-text-main"
            type="button"
            onClick={onUnset}
          >
            取消设置
          </button>
        )}
      </div>

      <div className="mt-3">
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
            onChange={(event) => onChange(event.target.value)}
          >
            <option value="">未设置</option>
            {(field.options ?? []).map((option) => (
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
            onChange={(event) => onChange(Number(event.target.value))}
          />
        )}

        {field.control === "string-list" && (
          <textarea
            className="h-24 w-full resize-y rounded-lg border border-border bg-panel p-3 font-mono text-xs text-text-main outline-none focus:border-accent"
            value={Array.isArray(value) ? value.join("\n") : ""}
            onChange={(event) =>
              onChange(event.target.value.split("\n").filter((line) => line.trim()))
            }
          />
        )}

        {isObjectControl(field.control) && (
          <>
            <textarea
              className="h-36 w-full resize-y rounded-lg border border-border bg-panel p-3 font-mono text-xs text-text-main outline-none focus:border-accent"
              value={objectDraft}
              onChange={(event) => handleObjectChange(event.target.value)}
            />
            {objectError && <div className="mt-2 text-xs text-red-500">{objectError}</div>}
          </>
        )}
      </div>
    </div>
  );
}
