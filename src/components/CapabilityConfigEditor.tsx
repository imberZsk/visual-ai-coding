// 能力配置编辑器：按能力页筛选可视化 schema 字段，并复用完整配置读写逻辑。
import type { ConfigFileSpec } from "../config";
import type { VisualConfigGroup, VisualConfigSchema } from "./visual-config/schemaTypes";
import VisualConfigEditor from "./VisualConfigEditor";

export interface CapabilityConfigEditorProps {
  spec: ConfigFileSpec; // spec 存储底层配置文件描述。
  schema: VisualConfigSchema; // schema 存储底层配置文件的完整可视化 schema。
  title: string; // title 存储能力页中该配置卡片的展示标题。
  description: string; // description 存储能力页中该配置卡片的说明文案。
  fieldPaths: string[]; // fieldPaths 存储该能力页需要展示的 schema 字段路径。
}

// filterSchemaByFieldPaths 按字段路径筛选 schema，并保留原始分组顺序。
// schema 参数存储完整配置 schema，fieldPaths 参数存储能力页允许展示的字段路径。
export function filterSchemaByFieldPaths(
  schema: VisualConfigSchema,
  fieldPaths: string[]
): VisualConfigSchema {
  // allowedPathSet 存储允许展示的字段路径集合，用于快速判断字段是否命中能力页。
  const allowedPathSet = new Set(fieldPaths);
  // groups 存储筛选后仍包含字段的 schema 分组。
  const groups: VisualConfigGroup[] = schema.groups
    .map((group) => ({
      ...group,
      fields: group.fields.filter((field) => allowedPathSet.has(field.path)),
    }))
    .filter((group) => group.fields.length > 0);

  return {
    ...schema,
    groups,
  };
}

// CapabilityConfigEditor 渲染指定能力相关字段，同时保存完整配置对象以保留未展示字段。
export default function CapabilityConfigEditor({
  spec,
  schema,
  title,
  description,
  fieldPaths,
}: CapabilityConfigEditorProps) {
  // filteredSchema 存储只包含当前能力相关字段的 schema。
  const filteredSchema = filterSchemaByFieldPaths(schema, fieldPaths);
  // capabilitySpec 存储能力页覆盖标题和说明后的配置文件描述。
  const capabilitySpec: ConfigFileSpec = {
    ...spec,
    title,
    desc: description,
  };

  return <VisualConfigEditor spec={capabilitySpec} schema={filteredSchema} />;
}
