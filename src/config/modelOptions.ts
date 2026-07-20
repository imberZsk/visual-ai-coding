import type { VisualConfigOption } from "../components/visual-config/schemaTypes";

// CLAUDE_MODEL_OPTIONS 存储 Claude 相关模型字段的下拉候选值。
export const CLAUDE_MODEL_OPTIONS: VisualConfigOption[] = [
  { value: "sonnet5", label: "sonnet5" },
  { value: "claude-sonnet-5", label: "claude-sonnet-5" },
  { value: "opus4.8", label: "opus4.8" },
  { value: "claude-opus-4-8", label: "claude-opus-4-8" },
  { value: "fable", label: "fable" },
  { value: "claude-fable-5", label: "claude-fable-5" },
  { value: "sonnet", label: "sonnet" },
  { value: "opus", label: "opus" },
  { value: "haiku", label: "haiku" },
];

// CODEX_MODEL_OPTIONS 存储 Codex 相关模型字段的下拉候选值。
export const CODEX_MODEL_OPTIONS: VisualConfigOption[] = [
  { value: "gpt-5.5", label: "gpt-5.5" },
  { value: "gpt-5.4", label: "gpt-5.4" },
  { value: "gpt-5.4-mini", label: "gpt-5.4-mini" },
  { value: "gpt-5.3-codex-spark", label: "gpt-5.3-codex-spark" },
  { value: "gpt-5-codex", label: "gpt-5-codex" },
  { value: "gpt-5", label: "gpt-5" },
  { value: "o3", label: "o3" },
  { value: "o4-mini", label: "o4-mini" },
];
