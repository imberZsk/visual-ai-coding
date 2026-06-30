// 可视化配置文件格式，区分 JSON 与 TOML 渲染路径。
export type VisualConfigFormat = "json" | "toml";

// 可视化字段控件类型，供后续表单层按字段类型选择控件。
export type VisualConfigControl =
  | "switch"
  | "text"
  | "number"
  | "select"
  | "string-list"
  | "json-value"
  | "json-object"
  | "toml-object";

// 可视化字段风险级别，用于后续 UI 决定提示文案与危险样式。
export type VisualConfigRisk = "normal" | "sensitive" | "danger" | "experimental";

// VisualConfigOption 描述 select 类字段的单个可选项。
export interface VisualConfigOption {
  value: string; // value 存储写回配置文件的真实枚举值。
  label: string; // label 存储界面展示给用户的选项名称。
  description?: string; // description 存储选项额外说明文本。
}

// VisualConfigField 描述一个可编辑配置字段及其展示元数据。
export interface VisualConfigField {
  path: string; // path 存储字段在配置对象中的点分路径。
  title: string; // title 存储字段在界面上的展示标题。
  description: string; // description 存储字段用途和行为说明。
  control: VisualConfigControl; // control 存储字段适用的控件类型。
  defaultValue?: unknown; // defaultValue 存储字段默认值，供未设置态展示。
  options?: VisualConfigOption[]; // options 存储 select 控件可用的枚举选项。
  scope: string; // scope 存储字段允许在哪些配置层级生效。
  risk: VisualConfigRisk; // risk 存储字段的风险等级。
  sensitive?: boolean; // sensitive 标记字段值是否应默认脱敏显示。
}

// VisualConfigGroup 描述一组相关配置字段的分组元数据。
export interface VisualConfigGroup {
  id: string; // id 存储分组的稳定标识符。
  title: string; // title 存储分组展示标题。
  description: string; // description 存储分组级别的说明文本。
  fields: VisualConfigField[]; // fields 存储该分组下的全部字段定义。
}

// VisualConfigSchema 描述单个配置文件的完整可视化 schema。
export interface VisualConfigSchema {
  id: string; // id 存储 schema 的稳定标识符。
  title: string; // title 存储 schema 展示标题。
  format: VisualConfigFormat; // format 存储配置文件的实际序列化格式。
  groups: VisualConfigGroup[]; // groups 存储 schema 中的全部字段分组。
}
