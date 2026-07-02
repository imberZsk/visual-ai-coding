import { useCallback, useEffect, useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import { createClaudeOutputStyle, listClaudeOutputStyles } from "../../api";
import type { ClaudeOutputStyleInfo, ClaudeOutputStyleListResult } from "../../types";
import { Button, LoadingIcon } from "../ui";

interface ClaudeOutputStyleFieldProps {
  value: string; // value 存储 settings.json 中当前 outputStyle 字符串值。
  claudeHome: string; // claudeHome 存储 Claude 配置根目录，用于扫描 output-styles 目录。
  onChange: (value: string | undefined) => void; // onChange 用于把新的 outputStyle 值回传父组件。
}

// normalizeStyleName 负责清理 output style 名称两侧空白。
// value 参数存储用户输入或配置文件读取到的原始风格名称。
function normalizeStyleName(value: string): string {
  return value.trim();
}

// buildStyleFilePath 拼出某个自定义 output style 的预期 Markdown 文件路径。
// directory 参数存储 output-styles 目录，name 参数存储 output style 名称。
function buildStyleFilePath(directory: string, name: string): string {
  // baseDirectory 存储去掉末尾斜杠后的 output-styles 目录。
  const baseDirectory = directory.replace(/\/+$/, "");
  return `${baseDirectory}/${name}.md`;
}

// findStyleByName 在候选列表中查找指定 output style。
// styles 参数存储后端返回的候选项，name 参数存储要查找的风格名。
function findStyleByName(
  styles: ClaudeOutputStyleInfo[],
  name: string
): ClaudeOutputStyleInfo | undefined {
  return styles.find((style) => style.name === name);
}

// renderKindLabel 返回 output style 来源的中文标签。
// kind 参数存储后端返回的风格来源。
function renderKindLabel(kind: ClaudeOutputStyleInfo["kind"]): string {
  return kind === "builtin" ? "内置" : "自定义";
}

// Claude outputStyle 专用字段：展示已知风格、缺失状态，并可创建自定义 Markdown 文件。
// value 是当前配置值，claudeHome 用于调用后端扫描/创建命令。
export default function ClaudeOutputStyleField({
  value,
  claudeHome,
  onChange,
}: ClaudeOutputStyleFieldProps) {
  // result 存储最近一次扫描到的 output style 列表结果。
  const [result, setResult] = useState<ClaudeOutputStyleListResult | null>(null);
  // loading 标记当前是否正在扫描 output style。
  const [loading, setLoading] = useState(false);
  // creating 标记当前是否正在创建自定义 output style 文件。
  const [creating, setCreating] = useState(false);
  // error 存储扫描或创建失败时的错误消息。
  const [error, setError] = useState<string | null>(null);
  // selectedName 存储当前配置值规范化后的风格名称。
  const selectedName = normalizeStyleName(value);
  // styleOptions 存储当前可供选择的内置与自定义 output style 列表。
  const styleOptions = result?.styles ?? [];
  // knownStyle 存储当前配置值对应的已知风格；不存在时为 undefined。
  const knownStyle = useMemo(
    () => findStyleByName(styleOptions, selectedName),
    [selectedName, styleOptions]
  );
  // missingSelectedStyle 标记当前配置值是否引用了不存在的自定义风格。
  const missingSelectedStyle = selectedName !== "" && result !== null && !knownStyle && !loading;
  // selectedStylePath 存储当前自定义风格应创建或已存在的 Markdown 文件路径。
  const selectedStylePath =
    result && selectedName !== "" ? buildStyleFilePath(result.directory, selectedName) : "";
  // selectValue 存储下拉框当前值，缺失风格也保留为当前值以避免视觉上丢失配置。
  const selectValue = selectedName === "" ? "" : selectedName;

  // refreshStyles 负责重新扫描内置与自定义 output style 列表。
  const refreshStyles = useCallback(async () => {
    if (!claudeHome) {
      setResult(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // nextResult 存储后端扫描得到的新 output style 列表。
      const nextResult = await listClaudeOutputStyles(claudeHome);
      setResult(nextResult);
    } catch (scanError) {
      setError(String(scanError));
    } finally {
      setLoading(false);
    }
  }, [claudeHome]);

  useEffect(() => {
    void refreshStyles();
  }, [refreshStyles]);

  // handleInputChange 负责响应用户直接输入 output style 名称。
  // event 参数存储输入框变更事件。
  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    // nextName 存储用户输入的新风格名称。
    const nextName = event.target.value;
    onChange(nextName.trim() === "" ? undefined : nextName);
  }

  // handleSelectChange 负责响应用户从已知风格下拉框中选择。
  // event 参数存储下拉框变更事件。
  function handleSelectChange(event: ChangeEvent<HTMLSelectElement>) {
    // nextName 存储用户选中的风格名称，空串代表取消设置。
    const nextName = event.target.value;
    onChange(nextName === "" ? undefined : nextName);
  }

  // handleCreateStyle 负责为当前缺失的 output style 创建 Markdown 文件。
  async function handleCreateStyle() {
    if (!selectedName || !claudeHome) {
      return;
    }

    setCreating(true);
    setError(null);

    try {
      await createClaudeOutputStyle(claudeHome, selectedName);
      await refreshStyles();
    } catch (createError) {
      setError(String(createError));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        <label className="block min-w-0 text-xs font-medium text-text-muted">
          风格名称
          <input
            aria-label="输出风格名称"
            className="mt-1 w-full rounded-lg border border-border bg-panel px-3 py-2 text-sm text-text-main outline-none focus:border-accent"
            value={value}
            onChange={handleInputChange}
          />
        </label>
        <label className="block min-w-0 text-xs font-medium text-text-muted">
          已知风格
          <select
            aria-label="选择已存在输出风格"
            className="mt-1 w-full rounded-lg border border-border bg-panel px-3 py-2 text-sm text-text-main outline-none focus:border-accent"
            value={selectValue}
            onChange={handleSelectChange}
          >
            <option value="">未设置</option>
            {missingSelectedStyle && <option value={selectedName}>{selectedName}（未找到）</option>}
            {styleOptions.map((style) => (
              <option key={`${style.kind}:${style.name}`} value={style.name}>
                {style.name}（{renderKindLabel(style.kind)}）
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading && (
        <div className="inline-flex items-center gap-2 text-xs text-text-muted">
          <LoadingIcon className="h-3.5 w-3.5" />
          <span>扫描中…</span>
        </div>
      )}

      {!loading && error && <div className="text-xs text-red-500">{error}</div>}

      {!loading && !error && selectedName === "" && (
        <div className="text-xs text-text-muted">未设置</div>
      )}

      {!loading && !error && knownStyle && (
        <div className="rounded-lg border border-border bg-panel px-3 py-2">
          <div className="text-sm font-medium text-text-main">
            {knownStyle.kind === "custom" ? "已找到自定义风格" : "已找到内置风格"}
          </div>
          <div className="mt-1 text-xs text-text-muted">{knownStyle.description}</div>
          {knownStyle.path && (
            <div className="mt-1 break-all font-mono text-xs text-text-muted">
              {knownStyle.path}
            </div>
          )}
        </div>
      )}

      {!loading && !error && missingSelectedStyle && (
        <div className="rounded-lg border border-amber-400/50 bg-amber-500/10 px-3 py-2">
          <div className="text-sm font-medium text-text-main">“{selectedName}”未找到</div>
          <div className="mt-1 break-all font-mono text-xs text-text-muted">
            {selectedStylePath}
          </div>
          <Button
            className="mt-2 rounded-md px-3 py-1.5 text-xs"
            loading={creating}
            onClick={handleCreateStyle}
            variant="primary"
          >
            {creating ? "创建中…" : `创建“${selectedName}”风格文件`}
          </Button>
        </div>
      )}

      {!loading && !error && result?.diagnostics && !missingSelectedStyle && (
        <div className="text-xs text-text-muted">{result.diagnostics}</div>
      )}
    </div>
  );
}
