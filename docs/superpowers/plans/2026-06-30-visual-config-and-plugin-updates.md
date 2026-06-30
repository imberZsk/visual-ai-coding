# Visual Config And Plugin Updates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build visual editors for Claude `settings.json` and Codex `config.toml`, plus Claude and Codex plugin update checks and update actions.

**Architecture:** Keep configuration editing in frontend pure utilities and reusable React components, with static schema metadata for Claude and Codex. Keep plugin discovery and update execution in Rust Tauri commands so CLI execution, PATH handling, stdout, and stderr remain centralized. Reuse existing `ConfigEditor` and plugin page patterns where possible, while adding focused modules for visual field rendering and tool-agnostic plugin update status.

**Tech Stack:** Tauri 1.5, Rust 2021, React 18, TypeScript 5.3, Tailwind CSS, Vitest, React Testing Library, serde_json, toml 0.8.

## Global Constraints

- 与用户交流始终使用中文。
- 函数/方法必须添加注释说明用途和关键参数含义，每个函数/方法都要加。
- 变量必须添加注释说明该变量用来存储什么数据，每个变量都要加。
- 分支条件逻辑非显而易见时，注释说明该分支处理的业务场景。
- 复杂算法或 workaround 注释说明 WHY，而不是 WHAT。
- 可视化保存会生成规范化 JSON / TOML，不保证保留 TOML 注释、空行和原始键顺序。
- 未知字段、未来新增字段、自定义字段必须保留，并在“高级字段”区域可查看和编辑。
- 插件 marketplace 更新和插件安装必须通过官方 CLI 执行，不手写 git 更新逻辑。
- 一个工具的配置解析或插件检查失败时，只影响对应区块，不阻断其他页面或工具。
- 每个实现任务遵循 TDD：先写失败测试，确认失败，再写最小实现，再跑通过。
- 前端 UI 保持现有 Tailwind / `Card` / `Button` / `Badge` 风格，不引入新的设计系统。

---

## File Structure

- `package.json`: add `test` script and frontend test dependencies.
- `vite.config.ts`: add Vitest config for jsdom.
- `tsconfig.json`: include `vitest/globals` types for test files.
- `src/test/setup.ts`: install jest-dom matchers.
- `src/components/ui.tsx`: extend shared controls with compact inputs/selects only if needed by visual editor.
- `src/components/VisualConfigEditor.tsx`: load a `ConfigFileSpec`, render visual/raw tabs, save through existing `saveConfigFile`.
- `src/components/visual-config/FieldRenderer.tsx`: render one schema field by control type.
- `src/components/visual-config/schemaTypes.ts`: shared visual schema and value-state types.
- `src/config/claudeSettingsSchema.ts`: Claude known settings field metadata.
- `src/config/codexConfigSchema.ts`: Codex known config field metadata.
- `src/utils/configPath.ts`: pure helpers for reading/writing nested config paths, unknown-field extraction, sensitive masking.
- `src/utils/configPath.test.ts`: tests for path, unknown, and sensitive helpers.
- `src/utils/versionCompare.ts`: pure helper for semver-like plugin version comparison.
- `src/utils/versionCompare.test.ts`: tests for update status comparison.
- `src/components/VisualConfigEditor.test.tsx`: tests visual/raw editor behavior.
- `src/pages/ClaudePage.tsx`: use visual editor for `claude-settings`, keep generic editor for other files.
- `src/pages/CodexPage.tsx`: use visual editor for `codex-config`, keep generic editor for other files.
- `src/types.ts`: add tool-agnostic plugin update and visual config types.
- `src/api.ts`: add plugin update check and Codex update command wrappers.
- `src/pages/PluginsPage.tsx`: render Claude and Codex plugin sections with update status.
- `src-tauri/src/commands/plugins.rs`: add parser helpers, tool-agnostic update structs, Claude update check, Codex update check, Codex marketplace/plugin update commands.
- `src-tauri/src/commands/mod.rs`: keep plugin command module exported.
- `src-tauri/src/main.rs`: register new plugin commands.

---

### Task 1: Frontend Test Harness And Pure Helpers

**Files:**
- Modify: `package.json`
- Modify: `vite.config.ts`
- Modify: `tsconfig.json`
- Create: `src/test/setup.ts`
- Create: `src/utils/configPath.ts`
- Create: `src/utils/configPath.test.ts`
- Create: `src/utils/versionCompare.ts`
- Create: `src/utils/versionCompare.test.ts`

**Interfaces:**
- Consumes: none.
- Produces:
  - `getValueAtPath(source: unknown, path: string): unknown`
  - `setValueAtPath<T>(source: T, path: string, value: unknown): T`
  - `deleteValueAtPath<T>(source: T, path: string): T`
  - `listUnknownTopLevelKeys(source: Record<string, unknown>, knownPaths: string[]): string[]`
  - `isSensitiveKey(key: string): boolean`
  - `maskSensitiveValue(value: unknown): string`
  - `comparePluginVersions(current: string, available: string): "newer" | "same" | "different" | "unknown"`

- [ ] **Step 1: Install frontend test dependencies**

Run:

```bash
npm install -D vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

Expected: `package.json` and `package-lock.json` gain the dev dependencies.

- [ ] **Step 1.5: Add test scripts and Vitest config before RED runs**

Modify `package.json` scripts:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "tauri": "tauri",
    "tauri:dev": "tauri dev",
    "tauri:build": "tauri build",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

Modify `vite.config.ts`:

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite 与 Vitest 配置：固定 Tauri 开发端口，并为 React 组件测试启用 jsdom。
export default defineConfig({
  plugins: [react()],
  // 防止 Tauri 开发环境清屏，保留 Rust 端日志。
  clearScreen: false,
  server: {
    // port 存储 Tauri 前端开发服务器固定端口。
    port: 1420,
    strictPort: true,
    watch: {
      // ignored 存储不触发前端热更新的 Rust 文件匹配规则。
      ignored: ["**/src-tauri/**"],
    },
  },
  test: {
    // environment 存储 React Testing Library 所需的浏览器模拟环境。
    environment: "jsdom",
    // setupFiles 存储 Vitest 启动时加载的测试初始化文件。
    setupFiles: "src/test/setup.ts",
    // globals 存储是否启用全局 describe/it/expect。
    globals: true,
  },
});
```

Modify `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

Create `src/test/setup.ts`:

```typescript
// jest-dom 扩展 Vitest 的 DOM 断言能力，例如 toBeInTheDocument。
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 2: Add the failing config path tests**

Create `src/utils/configPath.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import {
  deleteValueAtPath,
  getValueAtPath,
  isSensitiveKey,
  listUnknownTopLevelKeys,
  maskSensitiveValue,
  setValueAtPath,
} from "./configPath";

describe("configPath helpers", () => {
  it("reads nested object paths and quoted path segments", () => {
    // sourceConfig 存储包含普通嵌套 key 和带点号 key 的配置对象。
    const sourceConfig = {
      permissions: { defaultMode: "bypassPermissions" },
      plugins: { "browser@openai-bundled": { enabled: true } },
    };

    expect(getValueAtPath(sourceConfig, "permissions.defaultMode")).toBe(
      "bypassPermissions"
    );
    expect(getValueAtPath(sourceConfig, 'plugins."browser@openai-bundled".enabled')).toBe(
      true
    );
  });

  it("writes nested object paths without mutating the original object", () => {
    // sourceConfig 存储写入前的原始配置对象。
    const sourceConfig = { permissions: { allow: [] as string[] } };
    // nextConfig 存储写入后的新配置对象。
    const nextConfig = setValueAtPath(
      sourceConfig,
      "permissions.defaultMode",
      "default"
    );

    expect(nextConfig).toEqual({
      permissions: { allow: [], defaultMode: "default" },
    });
    expect(sourceConfig).toEqual({ permissions: { allow: [] } });
  });

  it("deletes nested values and leaves sibling values intact", () => {
    // sourceConfig 存储包含待删除字段和保留字段的配置对象。
    const sourceConfig = {
      permissions: { allow: ["Bash(ls)"], defaultMode: "default" },
    };
    // nextConfig 存储删除 defaultMode 后的配置对象。
    const nextConfig = deleteValueAtPath(sourceConfig, "permissions.defaultMode");

    expect(nextConfig).toEqual({ permissions: { allow: ["Bash(ls)"] } });
  });

  it("lists top-level keys not covered by known schema paths", () => {
    // sourceConfig 存储带已知字段和未知字段的配置对象。
    const sourceConfig = {
      model: "gpt-5.5",
      permissions: { defaultMode: "default" },
      customFutureFlag: true,
    };
    // knownPaths 存储 schema 已声明支持的字段路径。
    const knownPaths = ["model", "permissions.defaultMode"];

    expect(listUnknownTopLevelKeys(sourceConfig, knownPaths)).toEqual([
      "customFutureFlag",
    ]);
  });

  it("detects and masks sensitive keys", () => {
    expect(isSensitiveKey("ANTHROPIC_AUTH_TOKEN")).toBe(true);
    expect(isSensitiveKey("jira_password")).toBe(true);
    expect(isSensitiveKey("model")).toBe(false);
    expect(maskSensitiveValue("secret-value")).toBe("••••••");
    expect(maskSensitiveValue("")).toBe("");
  });
});
```

- [ ] **Step 3: Run config path tests to verify RED**

Run:

```bash
npm test -- src/utils/configPath.test.ts
```

Expected: FAIL because `src/utils/configPath.ts` does not exist yet, or because the exported helper functions are missing.

- [ ] **Step 4: Add the failing version comparison tests**

Create `src/utils/versionCompare.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { comparePluginVersions } from "./versionCompare";

describe("comparePluginVersions", () => {
  it("detects semver updates", () => {
    expect(comparePluginVersions("1.2.3", "1.3.0")).toBe("newer");
    expect(comparePluginVersions("1.2.3", "1.2.3")).toBe("same");
  });

  it("detects prerelease updates using semver-like ordering", () => {
    expect(comparePluginVersions("0.3.0-alpha10", "0.3.0-alpha11")).toBe(
      "newer"
    );
  });

  it("marks non-semver unequal versions as different", () => {
    expect(comparePluginVersions("local-dev", "remote-dev")).toBe("different");
    expect(comparePluginVersions("", "1.0.0")).toBe("unknown");
  });
});
```

- [ ] **Step 5: Run version tests to verify RED**

Run:

```bash
npm test -- src/utils/versionCompare.test.ts
```

Expected: FAIL because `src/utils/versionCompare.ts` does not exist yet.

- [ ] **Step 6: Implement config path helpers**

Create `src/utils/configPath.ts`:

```typescript
// 配置路径片段，用于定位 JSON/TOML 对象中的嵌套字段。
type PathSegment = string;

// 判断输入值是否是可按 key 访问的普通对象。
// value 为待判断的未知数据。
function isRecord(value: unknown): value is Record<string, unknown> {
  // 只有非 null 且非数组的 object 才能作为配置对象递归访问。
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// 深拷贝 JSON/TOML 可表达的数据，避免写入时修改原对象。
// value 为需要复制的配置数据。
function cloneConfigValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

// 将 a.b."c.d" 形式的路径拆成配置 key 片段。
// path 为 schema 中声明的字段路径，双引号内允许包含点号。
export function parseConfigPath(path: string): PathSegment[] {
  // segments 存储解析出的路径片段。
  const segments: PathSegment[] = [];
  // current 存储正在读取的路径片段。
  let current = "";
  // inQuotes 标记当前是否处于双引号包裹的 key 内。
  let inQuotes = false;

  for (const char of path) {
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === "." && !inQuotes) {
      segments.push(current);
      current = "";
      continue;
    }
    current += char;
  }

  if (current.length > 0) {
    segments.push(current);
  }

  return segments;
}

// 从配置对象中按路径读取值。
// source 为配置对象，path 为点分路径。
export function getValueAtPath(source: unknown, path: string): unknown {
  // segments 存储 path 拆分后的逐级 key。
  const segments = parseConfigPath(path);
  // cursor 存储当前读取到的层级值。
  let cursor = source;

  for (const segment of segments) {
    if (!isRecord(cursor)) {
      return undefined;
    }
    cursor = cursor[segment];
  }

  return cursor;
}

// 向配置对象中按路径写入值，并返回新对象。
// source 为原始配置对象，path 为点分路径，value 为要写入的新值。
export function setValueAtPath<T>(source: T, path: string, value: unknown): T {
  // nextSource 存储复制后的配置对象，后续修改只发生在副本上。
  const nextSource = cloneConfigValue(source);
  // segments 存储 path 拆分后的逐级 key。
  const segments = parseConfigPath(path);
  // cursor 存储当前写入所在的父对象。
  let cursor = nextSource as Record<string, unknown>;

  segments.forEach((segment, index) => {
    // isLastSegment 标记当前 key 是否是最终写入位置。
    const isLastSegment = index === segments.length - 1;
    if (isLastSegment) {
      cursor[segment] = value;
      return;
    }

    if (!isRecord(cursor[segment])) {
      cursor[segment] = {};
    }
    cursor = cursor[segment] as Record<string, unknown>;
  });

  return nextSource;
}

// 从配置对象中按路径删除值，并返回新对象。
// source 为原始配置对象，path 为点分路径。
export function deleteValueAtPath<T>(source: T, path: string): T {
  // nextSource 存储复制后的配置对象，后续删除只发生在副本上。
  const nextSource = cloneConfigValue(source);
  // segments 存储 path 拆分后的逐级 key。
  const segments = parseConfigPath(path);
  // cursor 存储待删除字段的父对象。
  let cursor = nextSource as Record<string, unknown>;

  for (let index = 0; index < segments.length - 1; index += 1) {
    // segment 存储当前层级的 key。
    const segment = segments[index];
    if (!isRecord(cursor[segment])) {
      return nextSource;
    }
    cursor = cursor[segment] as Record<string, unknown>;
  }

  delete cursor[segments[segments.length - 1]];
  return nextSource;
}

// 找出 schema 未覆盖的顶层 key。
// source 为配置对象，knownPaths 为 schema 已支持字段路径列表。
export function listUnknownTopLevelKeys(
  source: Record<string, unknown>,
  knownPaths: string[]
): string[] {
  // knownTopLevelKeys 存储 schema 覆盖到的顶层 key。
  const knownTopLevelKeys = new Set(
    knownPaths.map((path) => parseConfigPath(path)[0]).filter(Boolean)
  );

  return Object.keys(source).filter((key) => !knownTopLevelKeys.has(key));
}

// 判断字段名是否像敏感字段。
// key 为配置字段名或环境变量名。
export function isSensitiveKey(key: string): boolean {
  // normalizedKey 存储小写后的 key，便于大小写无关匹配。
  const normalizedKey = key.toLowerCase();
  return (
    normalizedKey.includes("token") ||
    normalizedKey.includes("password") ||
    normalizedKey.includes("secret") ||
    normalizedKey.includes("api_key") ||
    normalizedKey.endsWith("_key")
  );
}

// 将敏感值转换为界面默认展示文本。
// value 为真实配置值。
export function maskSensitiveValue(value: unknown): string {
  if (value === "" || value === undefined || value === null) {
    return "";
  }
  return "••••••";
}
```

- [ ] **Step 7: Implement version comparison helper**

Create `src/utils/versionCompare.ts`:

```typescript
// 插件版本比较结果，用于判断 UI 中显示已最新、可更新或版本不同。
export type PluginVersionComparison = "newer" | "same" | "different" | "unknown";

// 解析 semver 或 semver prerelease 版本为可比较片段。
// version 为 CLI 或 marketplace 返回的版本文本。
function parseVersion(version: string):
  | { mainParts: number[]; prereleaseParts: string[] }
  | null {
  // match 存储 semver-like 正则匹配结果。
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/);
  if (!match) {
    return null;
  }

  return {
    mainParts: [Number(match[1]), Number(match[2]), Number(match[3])],
    prereleaseParts: match[4] ? match[4].split(".") : [],
  };
}

// 比较两个 prerelease 片段。
// currentParts 为当前版本 prerelease 片段，availableParts 为可用版本 prerelease 片段。
function comparePrereleaseParts(
  currentParts: string[],
  availableParts: string[]
): number {
  if (currentParts.length === 0 && availableParts.length === 0) {
    return 0;
  }
  if (currentParts.length === 0) {
    return -1;
  }
  if (availableParts.length === 0) {
    return 1;
  }

  // maxLength 存储需要逐项比较的最大片段数量。
  const maxLength = Math.max(currentParts.length, availableParts.length);
  for (let index = 0; index < maxLength; index += 1) {
    // currentPart 存储当前版本在该位置的 prerelease 片段。
    const currentPart = currentParts[index] ?? "";
    // availablePart 存储可用版本在该位置的 prerelease 片段。
    const availablePart = availableParts[index] ?? "";
    if (currentPart === availablePart) {
      continue;
    }

    // currentNumber 存储可解析为数字的当前片段。
    const currentNumber = Number(currentPart);
    // availableNumber 存储可解析为数字的可用片段。
    const availableNumber = Number(availablePart);
    if (!Number.isNaN(currentNumber) && !Number.isNaN(availableNumber)) {
      return availableNumber - currentNumber;
    }
    return availablePart.localeCompare(currentPart);
  }

  return 0;
}

// 比较当前插件版本和市场可用版本。
// current 为已安装版本，available 为 marketplace 可用版本。
export function comparePluginVersions(
  current: string,
  available: string
): PluginVersionComparison {
  if (!current.trim() || !available.trim()) {
    return "unknown";
  }
  if (current === available) {
    return "same";
  }

  // currentParsed 存储当前版本解析结果。
  const currentParsed = parseVersion(current);
  // availableParsed 存储可用版本解析结果。
  const availableParsed = parseVersion(available);
  if (!currentParsed || !availableParsed) {
    return "different";
  }

  for (let index = 0; index < 3; index += 1) {
    // delta 存储可用版本主版本片段减当前版本片段后的差值。
    const delta = availableParsed.mainParts[index] - currentParsed.mainParts[index];
    if (delta > 0) {
      return "newer";
    }
    if (delta < 0) {
      return "different";
    }
  }

  return comparePrereleaseParts(
    currentParsed.prereleaseParts,
    availableParsed.prereleaseParts
  ) > 0
    ? "newer"
    : "different";
}
```

- [ ] **Step 8: Run frontend helper tests to verify GREEN**

Run:

```bash
npm test -- src/utils/configPath.test.ts src/utils/versionCompare.test.ts
```

Expected: PASS for all helper tests.

- [ ] **Step 9: Commit Task 1**

Run:

```bash
git add package.json package-lock.json vite.config.ts tsconfig.json src/test/setup.ts src/utils/configPath.ts src/utils/configPath.test.ts src/utils/versionCompare.ts src/utils/versionCompare.test.ts
git commit -m "test: add visual config helper test harness"
```

---

### Task 2: Visual Config Schema Metadata

**Files:**
- Create: `src/components/visual-config/schemaTypes.ts`
- Create: `src/config/claudeSettingsSchema.ts`
- Create: `src/config/codexConfigSchema.ts`
- Create: `src/config/visualConfigSchemas.test.ts`

**Interfaces:**
- Consumes:
  - `VisualConfigField.path`
- Produces:
  - `VisualConfigControl = "switch" | "text" | "number" | "select" | "string-list" | "json-object" | "toml-object"`
  - `VisualConfigField`
  - `VisualConfigGroup`
  - `VisualConfigSchema`
  - `CLAUDE_SETTINGS_SCHEMA: VisualConfigSchema`
  - `CODEX_CONFIG_SCHEMA: VisualConfigSchema`

- [ ] **Step 1: Write failing schema coverage tests**

Create `src/config/visualConfigSchemas.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { CLAUDE_SETTINGS_SCHEMA } from "./claudeSettingsSchema";
import { CODEX_CONFIG_SCHEMA } from "./codexConfigSchema";

describe("visual config schemas", () => {
  it("covers required Claude settings groups and fields", () => {
    // claudePaths 存储 Claude schema 声明的字段路径。
    const claudePaths = CLAUDE_SETTINGS_SCHEMA.groups.flatMap((group) =>
      group.fields.map((field) => field.path)
    );

    expect(CLAUDE_SETTINGS_SCHEMA.format).toBe("json");
    expect(claudePaths).toEqual(
      expect.arrayContaining([
        "model",
        "fallbackModel",
        "effortLevel",
        "permissions.defaultMode",
        "permissions.allow",
        "permissions.deny",
        "env",
        "hooks",
        "mcpServers",
        "enabledPlugins",
        "extraKnownMarketplaces",
        "autoUpdates",
        "autoUpdatesChannel",
        "statusLine",
      ])
    );
  });

  it("covers required Codex config groups and fields", () => {
    // codexPaths 存储 Codex schema 声明的字段路径。
    const codexPaths = CODEX_CONFIG_SCHEMA.groups.flatMap((group) =>
      group.fields.map((field) => field.path)
    );

    expect(CODEX_CONFIG_SCHEMA.format).toBe("toml");
    expect(codexPaths).toEqual(
      expect.arrayContaining([
        "model_provider",
        "model",
        "review_model",
        "model_reasoning_effort",
        "disable_response_storage",
        "sandbox_mode",
        "approval_policy",
        "network_access",
        "notify",
        "features",
        "desktop",
        "tui",
        "mcp_servers",
        "plugins",
        "marketplaces",
        "projects",
      ])
    );
  });

  it("marks sensitive object fields", () => {
    // claudeFields 存储 Claude schema 中的全部字段定义。
    const claudeFields = CLAUDE_SETTINGS_SCHEMA.groups.flatMap((group) => group.fields);
    // envField 存储 env 字段定义。
    const envField = claudeFields.find((field) => field.path === "env");

    expect(envField?.sensitive).toBe(true);
  });
});
```

- [ ] **Step 2: Run schema tests to verify RED**

Run:

```bash
npm test -- src/config/visualConfigSchemas.test.ts
```

Expected: FAIL because schema files do not exist.

- [ ] **Step 3: Implement schema type definitions**

Create `src/components/visual-config/schemaTypes.ts`:

```typescript
// 可视化配置文件格式。
export type VisualConfigFormat = "json" | "toml";

// 可视化字段控件类型。
export type VisualConfigControl =
  | "switch"
  | "text"
  | "number"
  | "select"
  | "string-list"
  | "json-object"
  | "toml-object";

// 可视化字段风险级别，用于展示提示徽章。
export type VisualConfigRisk = "normal" | "sensitive" | "danger" | "experimental";

// 枚举选项定义。
export interface VisualConfigOption {
  value: string; // value 存储写入配置文件的真实值。
  label: string; // label 存储界面展示文本。
  description?: string; // description 存储该选项的说明。
}

// 单个可视化配置字段定义。
export interface VisualConfigField {
  path: string; // path 存储配置字段的点分路径。
  title: string; // title 存储界面展示名称。
  description: string; // description 存储字段用途说明。
  control: VisualConfigControl; // control 存储字段使用的表单控件类型。
  defaultValue?: unknown; // defaultValue 存储官方默认值。
  options?: VisualConfigOption[]; // options 存储枚举字段的可选值。
  scope: string; // scope 存储字段适用范围说明。
  risk: VisualConfigRisk; // risk 存储字段风险等级。
  sensitive?: boolean; // sensitive 标记字段值是否默认脱敏展示。
}

// 配置字段分组定义。
export interface VisualConfigGroup {
  id: string; // id 存储分组稳定标识。
  title: string; // title 存储分组展示名称。
  description: string; // description 存储分组说明。
  fields: VisualConfigField[]; // fields 存储该分组下的字段列表。
}

// 单个配置文件的可视化 schema。
export interface VisualConfigSchema {
  id: string; // id 存储 schema 稳定标识。
  title: string; // title 存储 schema 展示名称。
  format: VisualConfigFormat; // format 存储对应配置文件格式。
  groups: VisualConfigGroup[]; // groups 存储全部字段分组。
}
```

- [ ] **Step 4: Implement Claude settings schema**

Create `src/config/claudeSettingsSchema.ts`:

```typescript
import type { VisualConfigSchema } from "../components/visual-config/schemaTypes";

// CLAUDE_SETTINGS_SCHEMA 存储 Claude settings.json 的已知字段元数据。
export const CLAUDE_SETTINGS_SCHEMA: VisualConfigSchema = {
  id: "claude-settings",
  title: "Claude settings.json",
  format: "json",
  groups: [
    {
      id: "model",
      title: "模型与推理",
      description: "控制 Claude Code 会话默认使用的模型、fallback 模型和响应详细程度。",
      fields: [
        {
          path: "model",
          title: "默认模型",
          description: "Claude Code 默认使用的模型别名或完整模型名。",
          control: "text",
          scope: "用户级、项目级、本地级均可覆盖。",
          risk: "normal",
        },
        {
          path: "fallbackModel",
          title: "Fallback 模型",
          description: "默认模型不可用时尝试使用的备用模型。",
          control: "text",
          scope: "用户级、项目级、本地级均可覆盖。",
          risk: "normal",
        },
        {
          path: "effortLevel",
          title: "推理强度",
          description: "控制 Claude Code 在任务中投入的推理强度。",
          control: "select",
          options: [
            { value: "low", label: "low" },
            { value: "medium", label: "medium" },
            { value: "high", label: "high" },
            { value: "xhigh", label: "xhigh" },
            { value: "max", label: "max" },
          ],
          scope: "用户级、项目级、本地级均可覆盖。",
          risk: "normal",
        },
        {
          path: "prompt_suggestions",
          title: "提示建议",
          description: "控制会话是否生成下一步提示建议。",
          control: "switch",
          scope: "用户级配置。",
          risk: "experimental",
        },
        {
          path: "verbose",
          title: "详细输出",
          description: "控制 CLI 是否默认启用详细输出。",
          control: "switch",
          scope: "用户级、项目级、本地级均可覆盖。",
          risk: "normal",
        },
      ],
    },
    {
      id: "permissions",
      title: "权限",
      description: "控制工具允许、拒绝和默认权限模式。",
      fields: [
        {
          path: "permissions.defaultMode",
          title: "默认权限模式",
          description: "新会话默认采用的权限模式。",
          control: "select",
          options: [
            { value: "default", label: "default" },
            { value: "acceptEdits", label: "acceptEdits" },
            { value: "bypassPermissions", label: "bypassPermissions" },
            { value: "plan", label: "plan" },
          ],
          scope: "用户级、项目级、本地级均可覆盖。",
          risk: "danger",
        },
        {
          path: "permissions.allow",
          title: "允许规则",
          description: "允许直接执行的工具或命令规则。",
          control: "string-list",
          defaultValue: [],
          scope: "用户级、项目级、本地级均可覆盖。",
          risk: "danger",
        },
        {
          path: "permissions.deny",
          title: "拒绝规则",
          description: "始终拒绝执行的工具或命令规则。",
          control: "string-list",
          defaultValue: [],
          scope: "用户级、项目级、本地级均可覆盖。",
          risk: "normal",
        },
        {
          path: "permissions.ask",
          title: "询问规则",
          description: "执行前需要确认的工具或命令规则。",
          control: "string-list",
          defaultValue: [],
          scope: "用户级、项目级、本地级均可覆盖。",
          risk: "normal",
        },
      ],
    },
    {
      id: "runtime",
      title: "运行时与扩展",
      description: "控制环境变量、Hooks、MCP、工具列表、插件和市场。",
      fields: [
        {
          path: "env",
          title: "环境变量",
          description: "启动 Claude Code 时注入的环境变量。",
          control: "json-object",
          scope: "用户级、项目级、本地级均可覆盖。",
          risk: "sensitive",
          sensitive: true,
        },
        {
          path: "hooks",
          title: "Hooks",
          description: "按生命周期事件执行的命令 hook 配置。",
          control: "json-object",
          scope: "用户级、项目级、本地级均可覆盖。",
          risk: "danger",
        },
        {
          path: "mcpServers",
          title: "MCP Servers",
          description: "Claude Code 可连接的 MCP server 配置。",
          control: "json-object",
          scope: "用户级、项目级、本地级均可覆盖。",
          risk: "sensitive",
          sensitive: true,
        },
        {
          path: "allowedTools",
          title: "允许工具",
          description: "默认启用的内置工具列表。",
          control: "string-list",
          scope: "用户级、项目级、本地级均可覆盖。",
          risk: "danger",
        },
        {
          path: "disallowedTools",
          title: "禁用工具",
          description: "默认禁用的内置工具列表。",
          control: "string-list",
          scope: "用户级、项目级、本地级均可覆盖。",
          risk: "normal",
        },
        {
          path: "tools",
          title: "工具集合",
          description: "指定会话可使用的内置工具集合。",
          control: "string-list",
          scope: "用户级、项目级、本地级均可覆盖。",
          risk: "danger",
        },
        {
          path: "enabledPlugins",
          title: "启用插件",
          description: "按插件 ID 控制是否启用已安装插件。",
          control: "json-object",
          scope: "用户级配置。",
          risk: "normal",
        },
        {
          path: "disabledPlugins",
          title: "禁用插件",
          description: "按插件 ID 控制是否禁用已安装插件。",
          control: "json-object",
          scope: "用户级配置。",
          risk: "normal",
        },
        {
          path: "extraKnownMarketplaces",
          title: "额外市场",
          description: "Claude Code 额外识别的插件市场配置。",
          control: "json-object",
          scope: "用户级配置。",
          risk: "normal",
        },
      ],
    },
    {
      id: "updates-ui",
      title: "更新与界面",
      description: "控制自动更新、状态栏和界面行为。",
      fields: [
        {
          path: "autoUpdates",
          title: "自动更新",
          description: "控制 Claude Code 是否自动检查并应用更新。",
          control: "switch",
          scope: "用户级配置。",
          risk: "normal",
        },
        {
          path: "autoUpdatesChannel",
          title: "更新渠道",
          description: "控制自动更新使用的发布渠道。",
          control: "select",
          options: [
            { value: "stable", label: "stable" },
            { value: "latest", label: "latest" },
          ],
          scope: "用户级配置。",
          risk: "normal",
        },
        {
          path: "statusLine",
          title: "状态栏",
          description: "自定义 Claude Code 状态栏渲染方式。",
          control: "json-object",
          scope: "用户级配置。",
          risk: "normal",
        },
      ],
    },
  ],
};
```

- [ ] **Step 5: Implement Codex config schema**

Create `src/config/codexConfigSchema.ts`:

```typescript
import type { VisualConfigSchema } from "../components/visual-config/schemaTypes";

// CODEX_CONFIG_SCHEMA 存储 Codex config.toml 的已知字段元数据。
export const CODEX_CONFIG_SCHEMA: VisualConfigSchema = {
  id: "codex-config",
  title: "Codex config.toml",
  format: "toml",
  groups: [
    {
      id: "model-provider",
      title: "模型与 Provider",
      description: "控制 Codex 默认模型、评审模型和 provider 连接信息。",
      fields: [
        {
          path: "model_provider",
          title: "模型 Provider",
          description: "选择默认模型提供方。",
          control: "text",
          scope: "用户级配置；项目级配置不应覆盖 provider。",
          risk: "normal",
        },
        {
          path: "model",
          title: "默认模型",
          description: "Codex agent 默认使用的模型。",
          control: "text",
          scope: "用户级、项目级配置。",
          risk: "normal",
        },
        {
          path: "review_model",
          title: "评审模型",
          description: "Codex review 命令默认使用的模型。",
          control: "text",
          scope: "用户级、项目级配置。",
          risk: "normal",
        },
        {
          path: "model_providers",
          title: "Provider 详情",
          description: "Provider URL、wire API、认证方式和 websocket 能力。",
          control: "toml-object",
          scope: "用户级配置；包含机器本地和认证相关设置。",
          risk: "sensitive",
          sensitive: true,
        },
      ],
    },
    {
      id: "runtime-policy",
      title: "运行策略",
      description: "控制推理、响应存储、沙箱、审批、网络和通知。",
      fields: [
        {
          path: "model_reasoning_effort",
          title: "推理强度",
          description: "控制模型推理投入程度。",
          control: "select",
          options: [
            { value: "minimal", label: "minimal" },
            { value: "low", label: "low" },
            { value: "medium", label: "medium" },
            { value: "high", label: "high" },
            { value: "xhigh", label: "xhigh" },
            { value: "max", label: "max" },
          ],
          scope: "用户级、项目级配置。",
          risk: "normal",
        },
        {
          path: "disable_response_storage",
          title: "禁用响应存储",
          description: "控制是否禁止服务端保存响应内容。",
          control: "switch",
          scope: "用户级配置。",
          risk: "normal",
        },
        {
          path: "sandbox_mode",
          title: "沙箱模式",
          description: "控制 agent 执行命令时的文件系统访问范围。",
          control: "select",
          options: [
            { value: "read-only", label: "read-only" },
            { value: "workspace-write", label: "workspace-write" },
            { value: "danger-full-access", label: "danger-full-access" },
          ],
          scope: "用户级、项目级配置。",
          risk: "danger",
        },
        {
          path: "approval_policy",
          title: "审批策略",
          description: "控制命令执行前是否需要用户审批。",
          control: "select",
          options: [
            { value: "untrusted", label: "untrusted" },
            { value: "on-request", label: "on-request" },
            { value: "never", label: "never" },
          ],
          scope: "用户级、项目级配置。",
          risk: "danger",
        },
        {
          path: "network_access",
          title: "网络访问",
          description: "控制 Codex 是否启用网络访问。",
          control: "select",
          options: [
            { value: "enabled", label: "enabled" },
            { value: "disabled", label: "disabled" },
          ],
          scope: "用户级、项目级配置。",
          risk: "danger",
        },
        {
          path: "sandbox_permissions",
          title: "沙箱权限",
          description: "对沙箱能力进行额外声明。",
          control: "string-list",
          scope: "用户级、项目级配置。",
          risk: "danger",
        },
        {
          path: "notify",
          title: "通知命令",
          description: "回合结束时执行的通知命令。",
          control: "string-list",
          scope: "用户级配置；通常是机器本地路径。",
          risk: "sensitive",
        },
      ],
    },
    {
      id: "extensions-ui",
      title: "扩展与界面",
      description: "控制功能开关、桌面设置、TUI、MCP、插件、市场和项目 trust。",
      fields: [
        {
          path: "features",
          title: "功能开关",
          description: "Codex 实验或渐进发布功能开关。",
          control: "toml-object",
          scope: "用户级配置。",
          risk: "experimental",
        },
        {
          path: "desktop",
          title: "Desktop 设置",
          description: "Codex 桌面应用相关设置。",
          control: "toml-object",
          scope: "用户级配置。",
          risk: "experimental",
        },
        {
          path: "tui",
          title: "TUI 设置",
          description: "Codex CLI 终端界面设置。",
          control: "toml-object",
          scope: "用户级配置。",
          risk: "normal",
        },
        {
          path: "mcp_servers",
          title: "MCP Servers",
          description: "Codex 可连接的 MCP server 配置。",
          control: "toml-object",
          scope: "用户级配置；包含机器本地路径和环境变量。",
          risk: "sensitive",
          sensitive: true,
        },
        {
          path: "plugins",
          title: "插件",
          description: "Codex 已安装插件启用状态。",
          control: "toml-object",
          scope: "用户级配置。",
          risk: "normal",
        },
        {
          path: "marketplaces",
          title: "插件市场",
          description: "Codex 插件市场来源和更新时间。",
          control: "toml-object",
          scope: "用户级配置。",
          risk: "normal",
        },
        {
          path: "projects",
          title: "项目信任",
          description: "项目路径到 trust_level 的映射。",
          control: "toml-object",
          scope: "用户级配置。",
          risk: "danger",
        },
      ],
    },
  ],
};
```

- [ ] **Step 6: Run schema tests to verify GREEN**

Run:

```bash
npm test -- src/config/visualConfigSchemas.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 2**

Run:

```bash
git add src/components/visual-config/schemaTypes.ts src/config/claudeSettingsSchema.ts src/config/codexConfigSchema.ts src/config/visualConfigSchemas.test.ts
git commit -m "feat: define visual config schemas"
```

---

### Task 3: Visual Config Editor Components

**Files:**
- Create: `src/components/visual-config/FieldRenderer.tsx`
- Create: `src/components/VisualConfigEditor.tsx`
- Create: `src/components/VisualConfigEditor.test.tsx`
- Modify: `src/pages/ClaudePage.tsx`
- Modify: `src/pages/CodexPage.tsx`

**Interfaces:**
- Consumes:
  - `VisualConfigSchema`
  - `ConfigFileSpec`
  - `readConfigFile(id, title, path, readonly)`
  - `saveConfigFile(path, content, format)`
  - `getValueAtPath`
  - `setValueAtPath`
  - `listUnknownTopLevelKeys`
- Produces:
  - `FieldRenderer({ field, value, isSet, onChange, onUnset })`
  - `VisualConfigEditor({ spec, schema })`

- [ ] **Step 1: Write failing VisualConfigEditor tests**

Create `src/components/VisualConfigEditor.test.tsx`:

```typescript
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConfigFileSpec } from "../config";
import type { VisualConfigSchema } from "./visual-config/schemaTypes";
import VisualConfigEditor from "./VisualConfigEditor";

// invokeMock 存储 Tauri invoke 的测试替身。
const invokeMock = vi.fn();

vi.mock("@tauri-apps/api/tauri", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

vi.mock("../store", () => ({
  useAppStore: (selector: (state: unknown) => unknown) =>
    selector({
      prefs: {
        claude_home: "/Users/test/.claude",
        codex_home: "/Users/test/.codex",
        vscode_path: "code",
      },
    }),
}));

// spec 存储测试用配置文件描述。
const spec: ConfigFileSpec = {
  id: "claude-settings",
  title: "settings.json",
  relPath: "settings.json",
  tool: "claude",
  readonly: false,
  desc: "Claude settings",
};

// schema 存储测试用可视化字段 schema。
const schema: VisualConfigSchema = {
  id: "claude-settings",
  title: "Claude settings",
  format: "json",
  groups: [
    {
      id: "model",
      title: "模型",
      description: "模型设置",
      fields: [
        {
          path: "model",
          title: "默认模型",
          description: "默认模型说明",
          control: "text",
          scope: "用户级",
          risk: "normal",
        },
        {
          path: "autoUpdates",
          title: "自动更新",
          description: "自动更新说明",
          control: "switch",
          scope: "用户级",
          risk: "normal",
        },
      ],
    },
  ],
};

describe("VisualConfigEditor", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockResolvedValue({
      id: "claude-settings",
      title: "settings.json",
      path: "/Users/test/.claude/settings.json",
      format: "json",
      content: JSON.stringify({ model: "opus", customFutureFlag: true }, null, 2),
      exists: true,
      readonly: false,
    });
  });

  it("renders known fields and unknown advanced fields", async () => {
    render(<VisualConfigEditor spec={spec} schema={schema} />);

    expect(await screen.findByText("默认模型")).toBeInTheDocument();
    expect(screen.getByDisplayValue("opus")).toBeInTheDocument();
    expect(screen.getByText("高级字段")).toBeInTheDocument();
    expect(screen.getByText("customFutureFlag")).toBeInTheDocument();
  });

  it("saves visual edits while preserving unknown fields", async () => {
    render(<VisualConfigEditor spec={spec} schema={schema} />);

    // input 存储默认模型输入框。
    const input = await screen.findByDisplayValue("opus");
    fireEvent.change(input, { target: { value: "sonnet" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("save_config_file", {
        path: "/Users/test/.claude/settings.json",
        content: expect.stringContaining('"model": "sonnet"'),
        format: "json",
      });
    });
    // saveCall 存储保存命令的调用参数。
    const saveCall = invokeMock.mock.calls.find((call) => call[0] === "save_config_file");
    // content 存储保存时生成的配置文本。
    const content = saveCall?.[1]?.content as string;
    expect(content).toContain('"customFutureFlag": true');
  });

  it("falls back to raw view when parsing fails", async () => {
    invokeMock.mockResolvedValueOnce({
      id: "claude-settings",
      title: "settings.json",
      path: "/Users/test/.claude/settings.json",
      format: "json",
      content: "{not json}",
      exists: true,
      readonly: false,
    });

    render(<VisualConfigEditor spec={spec} schema={schema} />);

    expect(await screen.findByText("配置解析失败")).toBeInTheDocument();
    expect(screen.getByDisplayValue("{not json}")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run component tests to verify RED**

Run:

```bash
npm test -- src/components/VisualConfigEditor.test.tsx
```

Expected: FAIL because `VisualConfigEditor` does not exist.

- [ ] **Step 3: Implement FieldRenderer**

Create `src/components/visual-config/FieldRenderer.tsx` with these responsibilities:

```typescript
import type { VisualConfigField } from "./schemaTypes";

interface FieldRendererProps {
  field: VisualConfigField; // field 存储当前渲染的 schema 字段。
  value: unknown; // value 存储当前字段值。
  isSet: boolean; // isSet 标记字段是否存在于配置文件中。
  onChange: (value: unknown) => void; // onChange 用于把新值传回父组件。
  onUnset: () => void; // onUnset 用于删除当前字段。
}

// 将未知值转换为输入框可展示的字符串。
// value 为来自配置文件的字段值。
function toInputText(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }
  return String(value);
}

// 渲染单个可视化配置字段。
// field 描述字段元数据，value 是当前配置值，onChange / onUnset 将用户修改传回父组件。
export default function FieldRenderer({
  field,
  value,
  isSet,
  onChange,
  onUnset,
}: FieldRendererProps) {
  // valueText 存储输入控件使用的字符串值。
  const valueText = toInputText(value);
  // objectText 存储对象控件使用的 JSON 文本。
  const objectText =
    field.control === "json-object" || field.control === "toml-object"
      ? JSON.stringify(value ?? {}, null, 2)
      : "";

  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-text-main">{field.title}</span>
            <span className="rounded-md bg-border/60 px-2 py-0.5 text-xs text-text-muted">
              {isSet ? "已设置" : "未设置"}
            </span>
            {field.risk !== "normal" && (
              <span className="rounded-md bg-amber-500/15 px-2 py-0.5 text-xs text-amber-500">
                {field.risk}
              </span>
            )}
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

        {(field.control === "json-object" || field.control === "toml-object") && (
          <textarea
            className="h-36 w-full resize-y rounded-lg border border-border bg-panel p-3 font-mono text-xs text-text-main outline-none focus:border-accent"
            value={objectText}
            onChange={(event) => onChange(JSON.parse(event.target.value))}
          />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Implement VisualConfigEditor**

Create `src/components/VisualConfigEditor.tsx` with these behaviors:

- Load config through `readConfigFile`.
- Parse JSON with `JSON.parse`.
- Parse TOML with the `smol-toml` frontend dependency so Codex visual editing can read and write `config.toml` in the same component as Claude JSON editing:

Run:

```bash
npm install smol-toml
```

Implementation outline:

```typescript
import { useEffect, useMemo, useState } from "react";
import * as TOML from "smol-toml";
import type { ConfigFileSpec } from "../config";
import type { ConfigFile } from "../types";
import { readConfigFile, saveConfigFile } from "../api";
import { useAppStore } from "../store";
import { Button, Card, Badge } from "./ui";
import FieldRenderer from "./visual-config/FieldRenderer";
import type { VisualConfigSchema } from "./visual-config/schemaTypes";
import {
  deleteValueAtPath,
  getValueAtPath,
  listUnknownTopLevelKeys,
  setValueAtPath,
} from "../utils/configPath";

interface VisualConfigEditorProps {
  spec: ConfigFileSpec; // spec 存储配置文件描述。
  schema: VisualConfigSchema; // schema 存储可视化字段元数据。
}

// 拼接工具根目录与相对子路径。
// home 为工具配置根目录，relPath 为配置文件相对子路径。
function joinPath(home: string, relPath: string): string {
  // base 存储去掉末尾斜杠后的根路径。
  const base = home.replace(/\/+$/, "");
  return `${base}/${relPath}`;
}

// 将配置文本解析为对象。
// content 为原始配置文本，format 为配置文件格式。
function parseConfigContent(content: string, format: "json" | "toml"): Record<string, unknown> {
  if (!content.trim()) {
    return {};
  }
  if (format === "json") {
    return JSON.parse(content) as Record<string, unknown>;
  }
  return TOML.parse(content) as Record<string, unknown>;
}

// 将配置对象序列化为配置文本。
// value 为配置对象，format 为配置文件格式。
function serializeConfigContent(value: Record<string, unknown>, format: "json" | "toml"): string {
  if (format === "json") {
    return `${JSON.stringify(value, null, 2)}\n`;
  }
  return TOML.stringify(value);
}

// 可视化配置编辑器组件。
// spec 描述文件路径和只读状态，schema 描述可视化字段。
export default function VisualConfigEditor({ spec, schema }: VisualConfigEditorProps) {
  // prefs 存储应用偏好，用于读取工具配置目录。
  const prefs = useAppStore((state) => state.prefs);
  // file 存储后端读取到的配置文件内容。
  const [file, setFile] = useState<ConfigFile | null>(null);
  // rawDraft 存储原始文本编辑草稿。
  const [rawDraft, setRawDraft] = useState("");
  // configDraft 存储可视化表单对应的配置对象。
  const [configDraft, setConfigDraft] = useState<Record<string, unknown>>({});
  // activeView 存储当前视图。
  const [activeView, setActiveView] = useState<"visual" | "raw">("visual");
  // loading 标记加载状态。
  const [loading, setLoading] = useState(true);
  // saving 标记保存状态。
  const [saving, setSaving] = useState(false);
  // message 存储成功或错误提示。
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  // parseError 存储配置解析错误。
  const [parseError, setParseError] = useState<string | null>(null);

  // home 存储当前工具的配置根目录。
  const home = spec.tool === "claude" ? prefs?.claude_home || "" : prefs?.codex_home || "";
  // absPath 存储配置文件绝对路径。
  const absPath = joinPath(home, spec.relPath);

  // knownPaths 存储 schema 覆盖的字段路径。
  const knownPaths = useMemo(
    () => schema.groups.flatMap((group) => group.fields.map((field) => field.path)),
    [schema]
  );
  // unknownKeys 存储 schema 未覆盖的顶层字段。
  const unknownKeys = listUnknownTopLevelKeys(configDraft, knownPaths);

  // load 读取并解析配置文件。
  async function load() {
    setLoading(true);
    setMessage(null);
    try {
      // loadedFile 存储后端读取的文件内容。
      const loadedFile = await readConfigFile(spec.id, spec.title, absPath, spec.readonly);
      setFile(loadedFile);
      setRawDraft(loadedFile.content);
      try {
        // parsedConfig 存储解析后的配置对象。
        const parsedConfig = parseConfigContent(loadedFile.content, schema.format);
        setConfigDraft(parsedConfig);
        setParseError(null);
      } catch (error) {
        setParseError(String(error));
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
  }, [spec.id, home]);

  // handleFieldChange 更新单个可视化字段。
  // path 为字段路径，value 为字段新值。
  function handleFieldChange(path: string, value: unknown) {
    setConfigDraft((currentConfig) => setValueAtPath(currentConfig, path, value));
  }

  // handleFieldUnset 删除单个可视化字段。
  // path 为字段路径。
  function handleFieldUnset(path: string) {
    setConfigDraft((currentConfig) => deleteValueAtPath(currentConfig, path));
  }

  // handleSave 保存当前视图中的配置草稿。
  async function handleSave() {
    if (!file) {
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      // content 存储将写入磁盘的配置文本。
      const content =
        activeView === "raw"
          ? rawDraft
          : serializeConfigContent(configDraft, schema.format);
      await saveConfigFile(file.path, content, file.format);
      setMessage({ type: "ok", text: "已保存" });
      await load();
    } catch (error) {
      setMessage({ type: "err", text: String(error) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-text-main">{spec.title}</span>
            <Badge tone="info">{schema.format}</Badge>
            {parseError && <Badge tone="warning">解析失败</Badge>}
          </div>
          <div className="mt-1 truncate text-xs text-text-muted" title={absPath}>
            {spec.desc} · {absPath}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant={activeView === "visual" ? "primary" : "default"}
            onClick={() => setActiveView("visual")}
            disabled={Boolean(parseError)}
          >
            可视化
          </Button>
          <Button
            variant={activeView === "raw" ? "primary" : "default"}
            onClick={() => setActiveView("raw")}
          >
            原始文本
          </Button>
          <Button onClick={handleSave} variant="primary" disabled={saving}>
            {saving ? "保存中…" : "保存"}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="py-8 text-center text-sm text-text-muted">加载中…</div>
      ) : parseError ? (
        <div>
          <div className="mb-2 text-sm text-red-500">配置解析失败：{parseError}</div>
          <textarea
            className="h-72 w-full resize-y rounded-lg border border-border bg-surface p-3 font-mono text-xs text-text-main outline-none focus:border-accent"
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
                {group.fields.map((field) => (
                  <FieldRenderer
                    key={field.path}
                    field={field}
                    value={getValueAtPath(configDraft, field.path)}
                    isSet={getValueAtPath(configDraft, field.path) !== undefined}
                    onChange={(value) => handleFieldChange(field.path, value)}
                    onUnset={() => handleFieldUnset(field.path)}
                  />
                ))}
              </div>
            </section>
          ))}
          <section>
            <h3 className="mb-2 text-sm font-medium text-text-main">高级字段</h3>
            <div className="space-y-2 text-xs text-text-muted">
              {unknownKeys.length === 0 ? (
                <div>没有未知字段</div>
              ) : (
                unknownKeys.map((key) => <div key={key}>{key}</div>)
              )}
            </div>
          </section>
        </div>
      ) : (
        <textarea
          className="h-72 w-full resize-y rounded-lg border border-border bg-surface p-3 font-mono text-xs text-text-main outline-none focus:border-accent"
          value={rawDraft}
          onChange={(event) => setRawDraft(event.target.value)}
        />
      )}

      {message && (
        <div className={message.type === "ok" ? "mt-2 text-xs text-green-500" : "mt-2 text-xs text-red-500"}>
          {message.text}
        </div>
      )}
    </Card>
  );
}
```

- [ ] **Step 5: Integrate VisualConfigEditor into Claude and Codex pages**

Modify `src/pages/ClaudePage.tsx`:

```typescript
// Claude Code 配置页：可视化展示并编辑 ~/.claude 下的各类配置文件
import { CLAUDE_CONFIG_FILES } from "../config";
import { CLAUDE_SETTINGS_SCHEMA } from "../config/claudeSettingsSchema";
import { PageHeader } from "../components/ui";
import ConfigEditor from "../components/ConfigEditor";
import VisualConfigEditor from "../components/VisualConfigEditor";

// Claude Code 配置页组件
export default function ClaudePage() {
  return (
    <div className="p-6">
      <PageHeader
        title="Claude Code"
        subtitle="可视化管理 ~/.claude 下的核心配置文件"
      />
      <div className="space-y-4">
        {CLAUDE_CONFIG_FILES.map((spec) =>
          spec.id === "claude-settings" ? (
            <VisualConfigEditor key={spec.id} spec={spec} schema={CLAUDE_SETTINGS_SCHEMA} />
          ) : (
            <ConfigEditor key={spec.id} spec={spec} />
          )
        )}
      </div>
    </div>
  );
}
```

Modify `src/pages/CodexPage.tsx`:

```typescript
// Codex 配置页：可视化展示并编辑 ~/.codex 下的各类配置文件
import { CODEX_CONFIG_FILES } from "../config";
import { CODEX_CONFIG_SCHEMA } from "../config/codexConfigSchema";
import { PageHeader } from "../components/ui";
import ConfigEditor from "../components/ConfigEditor";
import VisualConfigEditor from "../components/VisualConfigEditor";

// Codex 配置页组件
export default function CodexPage() {
  return (
    <div className="p-6">
      <PageHeader
        title="Codex"
        subtitle="可视化管理 ~/.codex 下的核心配置文件（CLI 与 App 共用）"
      />
      <div className="space-y-4">
        {CODEX_CONFIG_FILES.map((spec) =>
          spec.id === "codex-config" ? (
            <VisualConfigEditor key={spec.id} spec={spec} schema={CODEX_CONFIG_SCHEMA} />
          ) : (
            <ConfigEditor key={spec.id} spec={spec} />
          )
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Run component tests to verify GREEN**

Run:

```bash
npm test -- src/components/VisualConfigEditor.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Run frontend build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 8: Commit Task 3**

Run:

```bash
git add package.json package-lock.json src/components/visual-config/FieldRenderer.tsx src/components/VisualConfigEditor.tsx src/components/VisualConfigEditor.test.tsx src/pages/ClaudePage.tsx src/pages/CodexPage.tsx
git commit -m "feat: add visual config editor"
```

---

### Task 4: Rust Plugin Update Check Commands

**Files:**
- Modify: `src-tauri/src/commands/plugins.rs`
- Modify: `src-tauri/src/main.rs`

**Interfaces:**
- Consumes:
  - `command_with_path("claude")`
  - `command_with_path("codex")`
- Produces Tauri commands:
  - `check_claude_plugin_updates(claude_home: String) -> Result<PluginUpdateCheckResult, String>`
  - `check_codex_plugin_updates(codex_home: String) -> Result<PluginUpdateCheckResult, String>`
  - `update_codex_plugin(plugin_id: String, marketplace: String) -> Result<String, String>`
  - `update_codex_marketplace(marketplace_name: String) -> Result<String, String>`

- [ ] **Step 1: Write failing Rust parser tests**

Append tests to `src-tauri/src/commands/plugins.rs` test module:

```rust
// 验证 Claude plugin list --json --available 输出能解析为统一更新信息
#[test]
fn test_parse_claude_plugin_update_json() {
    // json 存储 Claude CLI 返回的插件列表样例
    let json = r#"{
      "installed": [
        {
          "id": "superpowers@superpowers-dev",
          "version": "6.0.3",
          "scope": "user",
          "enabled": true,
          "installPath": "/tmp/superpowers/6.0.3",
          "lastUpdated": "2026-06-29T08:10:22.693Z"
        }
      ],
      "available": [
        {
          "pluginId": "superpowers@superpowers-dev",
          "name": "superpowers",
          "marketplaceName": "superpowers-dev",
          "version": "6.0.4",
          "source": "./"
        }
      ]
    }"#;

    // result 存储解析后的统一更新检查结果
    let result = parse_claude_plugin_update_json(json).expect("Claude 插件 JSON 应能解析");
    assert_eq!(result.plugins.len(), 1);
    assert_eq!(result.plugins[0].id, "superpowers@superpowers-dev");
    assert_eq!(result.plugins[0].current_version, "6.0.3");
    assert_eq!(result.plugins[0].available_version, "6.0.4");
    assert_eq!(result.plugins[0].update_status, "newer");
}

// 验证 Codex plugin list --json --available 输出能解析为统一更新信息
#[test]
fn test_parse_codex_plugin_update_json() {
    // json 存储 Codex CLI 返回的插件列表样例
    let json = r#"{
      "installed": [
        {
          "id": "browser@openai-bundled",
          "name": "browser",
          "marketplace": "openai-bundled",
          "version": "1.0.0",
          "enabled": true,
          "install_path": "/tmp/browser/1.0.0"
        }
      ],
      "available": [
        {
          "id": "browser@openai-bundled",
          "name": "browser",
          "marketplace": "openai-bundled",
          "version": "1.1.0",
          "source": "./browser"
        }
      ]
    }"#;

    // result 存储解析后的统一更新检查结果
    let result = parse_codex_plugin_update_json(json).expect("Codex 插件 JSON 应能解析");
    assert_eq!(result.plugins.len(), 1);
    assert_eq!(result.plugins[0].id, "browser@openai-bundled");
    assert_eq!(result.plugins[0].marketplace, "openai-bundled");
    assert_eq!(result.plugins[0].update_status, "newer");
}
```

- [ ] **Step 2: Run Rust tests to verify RED**

Run:

```bash
cd src-tauri && cargo test commands::plugins::tests::test_parse_claude_plugin_update_json commands::plugins::tests::test_parse_codex_plugin_update_json
```

Expected: FAIL because parser functions and unified structs do not exist.

- [ ] **Step 3: Add unified plugin update structs and parser helpers**

Modify `src-tauri/src/commands/plugins.rs`:

```rust
// 插件更新检查结果，供前端展示单个工具的插件状态
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PluginUpdateCheckResult {
    // tool 存储工具标识：claude 或 codex
    pub tool: String,
    // plugins 存储已安装插件及其可用版本信息
    pub plugins: Vec<ToolPluginInfo>,
    // raw_output 存储 CLI 原始 stdout，解析异常时便于排查
    pub raw_output: String,
}

// 单个工具插件的统一展示信息
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ToolPluginInfo {
    // id 存储插件完整 ID，如 browser@openai-bundled
    pub id: String,
    // name 存储插件短名称
    pub name: String,
    // marketplace 存储 marketplace 名称
    pub marketplace: String,
    // current_version 存储当前已安装版本
    pub current_version: String,
    // available_version 存储 marketplace 中可用版本
    pub available_version: String,
    // scope 存储安装作用域，Codex 无 scope 时为空
    pub scope: String,
    // enabled 标记插件是否启用
    pub enabled: bool,
    // install_path 存储插件安装路径
    pub install_path: String,
    // last_updated 存储最近更新时间
    pub last_updated: String,
    // update_status 存储更新状态：same / newer / different / unknown
    pub update_status: String,
}

// 比较 semver-like 版本文本，返回统一更新状态。
// current 为已安装版本，available 为 marketplace 可用版本。
fn compare_versions(current: &str, available: &str) -> String {
    if current.trim().is_empty() || available.trim().is_empty() {
        return "unknown".to_string();
    }
    if current == available {
        return "same".to_string();
    }

    // current_parts 存储当前版本的主版本数字片段
    let current_parts: Vec<u64> = current
        .split('-')
        .next()
        .unwrap_or("")
        .split('.')
        .filter_map(|part| part.parse::<u64>().ok())
        .collect();
    // available_parts 存储可用版本的主版本数字片段
    let available_parts: Vec<u64> = available
        .split('-')
        .next()
        .unwrap_or("")
        .split('.')
        .filter_map(|part| part.parse::<u64>().ok())
        .collect();

    if current_parts.len() == 3 && available_parts.len() == 3 {
        for index in 0..3 {
            if available_parts[index] > current_parts[index] {
                return "newer".to_string();
            }
            if available_parts[index] < current_parts[index] {
                return "different".to_string();
            }
        }
    }

    "different".to_string()
}

// 从 name@marketplace 形式中提取短名称。
// id 为插件完整 ID。
fn plugin_short_name(id: &str) -> String {
    id.split('@').next().unwrap_or(id).to_string()
}

// 从 name@marketplace 形式中提取 marketplace。
// id 为插件完整 ID。
fn plugin_marketplace(id: &str) -> String {
    id.split('@').nth(1).unwrap_or("").to_string()
}

// 解析 Claude plugin list --json --available 输出。
// content 为 CLI stdout JSON 文本。
fn parse_claude_plugin_update_json(content: &str) -> Result<PluginUpdateCheckResult, String> {
    // root 存储解析后的 JSON 根对象
    let root: serde_json::Value =
        serde_json::from_str(content).map_err(|e| format!("解析 Claude 插件 JSON 失败: {}", e))?;
    // available_versions 存储 pluginId 到 marketplace 可用版本的映射
    let mut available_versions = std::collections::HashMap::<String, String>::new();

    if let Some(available) = root.get("available").and_then(|value| value.as_array()) {
        for item in available {
            // id 存储 marketplace 返回的插件完整 ID
            let id = item
                .get("pluginId")
                .and_then(|value| value.as_str())
                .unwrap_or("")
                .to_string();
            // version 存储 marketplace 返回的可用版本
            let version = item
                .get("version")
                .and_then(|value| value.as_str())
                .unwrap_or("")
                .to_string();
            if !id.is_empty() {
                available_versions.insert(id, version);
            }
        }
    }

    // plugins 存储统一后的已安装插件信息
    let mut plugins = Vec::<ToolPluginInfo>::new();
    if let Some(installed) = root.get("installed").and_then(|value| value.as_array()) {
        for item in installed {
            // id 存储已安装插件完整 ID
            let id = item.get("id").and_then(|value| value.as_str()).unwrap_or("").to_string();
            // current_version 存储已安装版本
            let current_version = item
                .get("version")
                .and_then(|value| value.as_str())
                .unwrap_or("")
                .to_string();
            // available_version 存储 marketplace 可用版本
            let available_version = available_versions.get(&id).cloned().unwrap_or_default();

            plugins.push(ToolPluginInfo {
                name: plugin_short_name(&id),
                marketplace: plugin_marketplace(&id),
                update_status: compare_versions(&current_version, &available_version),
                id,
                current_version,
                available_version,
                scope: item.get("scope").and_then(|value| value.as_str()).unwrap_or("").to_string(),
                enabled: item.get("enabled").and_then(|value| value.as_bool()).unwrap_or(false),
                install_path: item
                    .get("installPath")
                    .and_then(|value| value.as_str())
                    .unwrap_or("")
                    .to_string(),
                last_updated: item
                    .get("lastUpdated")
                    .and_then(|value| value.as_str())
                    .unwrap_or("")
                    .to_string(),
            });
        }
    }

    Ok(PluginUpdateCheckResult {
        tool: "claude".to_string(),
        plugins,
        raw_output: content.to_string(),
    })
}
```

Add `parse_codex_plugin_update_json` and JSON access helpers:

```rust
// 从 JSON 对象中读取多个候选 key 的字符串值。
// value 为 JSON 对象，keys 为按优先级排列的候选字段名。
fn read_string_any(value: &serde_json::Value, keys: &[&str]) -> String {
    for key in keys {
        // found 存储当前候选 key 对应的 JSON 字符串
        let found = value.get(*key).and_then(|item| item.as_str());
        if let Some(text) = found {
            return text.to_string();
        }
    }
    String::new()
}

// 从 JSON 对象中读取多个候选 key 的 bool 值。
// value 为 JSON 对象，keys 为按优先级排列的候选字段名。
fn read_bool_any(value: &serde_json::Value, keys: &[&str]) -> bool {
    for key in keys {
        // found 存储当前候选 key 对应的 JSON bool
        let found = value.get(*key).and_then(|item| item.as_bool());
        if let Some(flag) = found {
            return flag;
        }
    }
    false
}

// 解析 Codex plugin list --json --available 输出。
// content 为 CLI stdout JSON 文本。
fn parse_codex_plugin_update_json(content: &str) -> Result<PluginUpdateCheckResult, String> {
    // root 存储解析后的 JSON 根对象
    let root: serde_json::Value =
        serde_json::from_str(content).map_err(|e| format!("解析 Codex 插件 JSON 失败: {}", e))?;
    // available_versions 存储插件完整 ID 到 marketplace 可用版本的映射
    let mut available_versions = std::collections::HashMap::<String, String>::new();
    // available_marketplaces 存储插件完整 ID 到 marketplace 名称的映射
    let mut available_marketplaces = std::collections::HashMap::<String, String>::new();

    if let Some(available) = root.get("available").and_then(|value| value.as_array()) {
        for item in available {
            // id 存储 marketplace 返回的插件完整 ID
            let id = read_string_any(item, &["id", "pluginId", "plugin_id"]);
            // version 存储 marketplace 返回的可用版本
            let version = read_string_any(item, &["version"]);
            // marketplace 存储 marketplace 名称
            let marketplace = read_string_any(item, &["marketplace", "marketplaceName", "marketplace_name"]);
            if !id.is_empty() {
                available_versions.insert(id.clone(), version);
                available_marketplaces.insert(id, marketplace);
            }
        }
    }

    // plugins 存储统一后的已安装插件信息
    let mut plugins = Vec::<ToolPluginInfo>::new();
    if let Some(installed) = root.get("installed").and_then(|value| value.as_array()) {
        for item in installed {
            // id 存储已安装插件完整 ID
            let id = read_string_any(item, &["id", "pluginId", "plugin_id"]);
            // current_version 存储已安装版本
            let current_version = read_string_any(item, &["version"]);
            // available_version 存储 marketplace 可用版本
            let available_version = available_versions.get(&id).cloned().unwrap_or_default();
            // marketplace 存储已安装记录或 marketplace 记录中的市场名
            let marketplace = {
                // installed_marketplace 存储已安装记录中的市场名
                let installed_marketplace =
                    read_string_any(item, &["marketplace", "marketplaceName", "marketplace_name"]);
                if installed_marketplace.is_empty() {
                    available_marketplaces.get(&id).cloned().unwrap_or_else(|| plugin_marketplace(&id))
                } else {
                    installed_marketplace
                }
            };

            plugins.push(ToolPluginInfo {
                name: {
                    // name 存储已安装记录中的短名称，缺失时从完整 ID 推导
                    let name = read_string_any(item, &["name"]);
                    if name.is_empty() { plugin_short_name(&id) } else { name }
                },
                marketplace,
                update_status: compare_versions(&current_version, &available_version),
                id,
                current_version,
                available_version,
                scope: read_string_any(item, &["scope"]),
                enabled: read_bool_any(item, &["enabled"]),
                install_path: read_string_any(item, &["installPath", "install_path"]),
                last_updated: read_string_any(item, &["lastUpdated", "last_updated"]),
            });
        }
    }

    Ok(PluginUpdateCheckResult {
        tool: "codex".to_string(),
        plugins,
        raw_output: content.to_string(),
    })
}
```

- [ ] **Step 4: Add Tauri commands**

Add commands in `src-tauri/src/commands/plugins.rs`:

```rust
// 检查 Claude 插件更新状态。
// claude_home 为 Claude 配置根目录；该参数保留给前端统一调用和未来按目录注入环境使用。
#[tauri::command]
pub fn check_claude_plugin_updates(claude_home: String) -> Result<PluginUpdateCheckResult, String> {
    // _claude_home 存储调用方传入的 Claude 配置根目录，当前 CLI 自动读取默认目录。
    let _claude_home = claude_home;
    // output 存储 CLI 执行结果
    let output = command_with_path("claude")
        .args(["plugin", "list", "--json", "--available"])
        .output()
        .map_err(|e| format!("执行 claude CLI 失败（请确认已安装 claude）: {}", e))?;
    // stdout 存储 CLI 标准输出
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    // stderr 存储 CLI 标准错误
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    if !output.status.success() {
        return Err(format!("检查 Claude 插件更新失败:\n{}\n{}", stdout, stderr).trim().to_string());
    }
    parse_claude_plugin_update_json(&stdout)
}

// 检查 Codex 插件更新状态。
// codex_home 为 Codex 配置根目录；该参数保留给前端统一调用和未来按目录注入 CODEX_HOME 使用。
#[tauri::command]
pub fn check_codex_plugin_updates(codex_home: String) -> Result<PluginUpdateCheckResult, String> {
    // _codex_home 存储调用方传入的 Codex 配置根目录，当前 CLI 自动读取默认目录。
    let _codex_home = codex_home;
    // output 存储 CLI 执行结果
    let output = command_with_path("codex")
        .args(["plugin", "list", "--json", "--available"])
        .output()
        .map_err(|e| format!("执行 codex CLI 失败（请确认已安装 codex）: {}", e))?;
    // stdout 存储 CLI 标准输出
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    // stderr 存储 CLI 标准错误
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    if !output.status.success() {
        return Err(format!("检查 Codex 插件更新失败:\n{}\n{}", stdout, stderr).trim().to_string());
    }
    parse_codex_plugin_update_json(&stdout)
}

// 刷新 Codex 指定 marketplace。
// marketplace_name 为 Codex 配置中的 marketplace 名称。
#[tauri::command]
pub fn update_codex_marketplace(marketplace_name: String) -> Result<String, String> {
    // output 存储 CLI 执行结果
    let output = command_with_path("codex")
        .args(["plugin", "marketplace", "upgrade", &marketplace_name, "--json"])
        .output()
        .map_err(|e| format!("执行 codex CLI 失败（请确认已安装 codex）: {}", e))?;
    // stdout 存储 CLI 标准输出
    let stdout = String::from_utf8_lossy(&output.stdout);
    // stderr 存储 CLI 标准错误
    let stderr = String::from_utf8_lossy(&output.stderr);
    if output.status.success() {
        Ok(format!("{}\n{}", stdout, stderr).trim().to_string())
    } else {
        Err(format!("更新 Codex marketplace 失败:\n{}\n{}", stdout, stderr).trim().to_string())
    }
}

// 重新安装 Codex 插件以拉取 marketplace 中的最新版本。
// plugin_id 为插件短名或完整 ID，marketplace 为 marketplace 名称。
#[tauri::command]
pub fn update_codex_plugin(plugin_id: String, marketplace: String) -> Result<String, String> {
    // selector 存储 codex plugin add 接受的插件选择器。
    let selector = if plugin_id.contains('@') {
        plugin_id
    } else {
        format!("{}@{}", plugin_id, marketplace)
    };
    // output 存储 CLI 执行结果
    let output = command_with_path("codex")
        .args(["plugin", "add", &selector, "--json"])
        .output()
        .map_err(|e| format!("执行 codex CLI 失败（请确认已安装 codex）: {}", e))?;
    // stdout 存储 CLI 标准输出
    let stdout = String::from_utf8_lossy(&output.stdout);
    // stderr 存储 CLI 标准错误
    let stderr = String::from_utf8_lossy(&output.stderr);
    if output.status.success() {
        Ok(format!("{}\n{}", stdout, stderr).trim().to_string())
    } else {
        Err(format!("更新 Codex 插件失败:\n{}\n{}", stdout, stderr).trim().to_string())
    }
}
```

- [ ] **Step 5: Register commands in main**

Modify imports and handler in `src-tauri/src/main.rs`:

```rust
use commands::plugins::{
    check_claude_plugin_updates, check_codex_plugin_updates, list_claude_marketplaces,
    list_claude_plugins, update_claude_marketplace, update_claude_plugin,
    update_codex_marketplace, update_codex_plugin,
};
```

Add to `generate_handler!`:

```rust
check_claude_plugin_updates,
check_codex_plugin_updates,
update_codex_marketplace,
update_codex_plugin,
```

- [ ] **Step 6: Run Rust tests to verify GREEN**

Run:

```bash
cd src-tauri && cargo test commands::plugins
```

Expected: PASS.

- [ ] **Step 7: Commit Task 4**

Run:

```bash
git add src-tauri/src/commands/plugins.rs src-tauri/src/main.rs
git commit -m "feat: add plugin update check commands"
```

---

### Task 5: Frontend Plugin Update API And UI

**Files:**
- Modify: `src/types.ts`
- Modify: `src/api.ts`
- Modify: `src/pages/PluginsPage.tsx`
- Create: `src/pages/PluginsPage.test.tsx`

**Interfaces:**
- Consumes:
  - `check_claude_plugin_updates(claudeHome)`
  - `check_codex_plugin_updates(codexHome)`
  - `update_claude_plugin(pluginName, scope)`
  - `update_claude_marketplace(marketplaceName)`
  - `update_codex_plugin(pluginId, marketplace)`
  - `update_codex_marketplace(marketplaceName)`
- Produces:
  - `PluginUpdateCheckResult`
  - `ToolPluginInfo`
  - plugin UI sections for Claude and Codex.

- [ ] **Step 1: Write failing PluginsPage tests**

Create `src/pages/PluginsPage.test.tsx`:

```typescript
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PluginsPage from "./PluginsPage";

// invokeMock 存储 Tauri invoke 的测试替身。
const invokeMock = vi.fn();

vi.mock("@tauri-apps/api/tauri", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

vi.mock("../store", () => ({
  useAppStore: (selector: (state: unknown) => unknown) =>
    selector({
      prefs: {
        claude_home: "/Users/test/.claude",
        codex_home: "/Users/test/.codex",
      },
    }),
}));

describe("PluginsPage", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockImplementation((command: string) => {
      if (command === "check_claude_plugin_updates") {
        return Promise.resolve({
          tool: "claude",
          raw_output: "{}",
          plugins: [
            {
              id: "superpowers@superpowers-dev",
              name: "superpowers",
              marketplace: "superpowers-dev",
              current_version: "6.0.3",
              available_version: "6.0.4",
              scope: "user",
              enabled: true,
              install_path: "/tmp/superpowers",
              last_updated: "2026-06-29T08:10:22.693Z",
              update_status: "newer",
            },
          ],
        });
      }
      if (command === "check_codex_plugin_updates") {
        return Promise.resolve({
          tool: "codex",
          raw_output: "{}",
          plugins: [
            {
              id: "browser@openai-bundled",
              name: "browser",
              marketplace: "openai-bundled",
              current_version: "1.0.0",
              available_version: "1.0.0",
              scope: "",
              enabled: true,
              install_path: "/tmp/browser",
              last_updated: "",
              update_status: "same",
            },
          ],
        });
      }
      return Promise.resolve([]);
    });
  });

  it("renders Claude and Codex plugin update sections", async () => {
    render(<PluginsPage />);

    expect(await screen.findByText("Claude 插件")).toBeInTheDocument();
    expect(screen.getByText("Codex 插件")).toBeInTheDocument();
    expect(screen.getByText("superpowers@superpowers-dev")).toBeInTheDocument();
    expect(screen.getByText("browser@openai-bundled")).toBeInTheDocument();
    expect(screen.getByText("可更新")).toBeInTheDocument();
    expect(screen.getByText("已最新")).toBeInTheDocument();
  });

  it("keeps Claude section visible when Codex check fails", async () => {
    invokeMock.mockImplementation((command: string) => {
      if (command === "check_claude_plugin_updates") {
        return Promise.resolve({
          tool: "claude",
          raw_output: "{}",
          plugins: [],
        });
      }
      if (command === "check_codex_plugin_updates") {
        return Promise.reject("检查 Codex 插件更新失败");
      }
      return Promise.resolve([]);
    });

    render(<PluginsPage />);

    await waitFor(() => {
      expect(screen.getByText("Claude 插件")).toBeInTheDocument();
      expect(screen.getByText("Codex 插件检查失败")).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run PluginsPage tests to verify RED**

Run:

```bash
npm test -- src/pages/PluginsPage.test.tsx
```

Expected: FAIL because new API wrappers and UI are not implemented.

- [ ] **Step 3: Add frontend types**

Modify `src/types.ts`:

```typescript
// 工具插件更新状态
export type PluginUpdateStatus = "same" | "newer" | "different" | "unknown";

// 工具无关插件信息，对应 Rust ToolPluginInfo
export interface ToolPluginInfo {
  id: string; // 插件完整 ID
  name: string; // 插件短名称
  marketplace: string; // marketplace 名称
  current_version: string; // 当前安装版本
  available_version: string; // marketplace 可用版本
  scope: string; // 安装作用域，Codex 为空
  enabled: boolean; // 是否启用
  install_path: string; // 安装路径
  last_updated: string; // 最近更新时间
  update_status: PluginUpdateStatus; // 更新状态
}

// 插件更新检查结果，对应 Rust PluginUpdateCheckResult
export interface PluginUpdateCheckResult {
  tool: "claude" | "codex"; // 工具标识
  plugins: ToolPluginInfo[]; // 插件列表
  raw_output: string; // CLI 原始输出
}
```

- [ ] **Step 4: Add API wrappers**

Modify `src/api.ts`:

```typescript
import type {
  PluginUpdateCheckResult,
} from "./types";

// 检查 Claude 插件更新状态
export function checkClaudePluginUpdates(
  claudeHome: string
): Promise<PluginUpdateCheckResult> {
  return invoke("check_claude_plugin_updates", { claudeHome });
}

// 检查 Codex 插件更新状态
export function checkCodexPluginUpdates(
  codexHome: string
): Promise<PluginUpdateCheckResult> {
  return invoke("check_codex_plugin_updates", { codexHome });
}

// 刷新 Codex 指定 marketplace
export function updateCodexMarketplace(marketplaceName: string): Promise<string> {
  return invoke("update_codex_marketplace", { marketplaceName });
}

// 更新 Codex 指定插件
export function updateCodexPlugin(
  pluginId: string,
  marketplace: string
): Promise<string> {
  return invoke("update_codex_plugin", { pluginId, marketplace });
}
```

- [ ] **Step 5: Replace PluginsPage with dual tool update UI**

Replace `src/pages/PluginsPage.tsx` with this structure, preserving existing imports only when they still appear in the file:

```typescript
// 插件管理页：展示 Claude 与 Codex 插件版本状态，支持检查和拉取更新
import { useEffect, useState } from "react";
import type {
  PluginUpdateCheckResult,
  PluginUpdateStatus,
  ToolPluginInfo,
} from "../types";
import {
  checkClaudePluginUpdates,
  checkCodexPluginUpdates,
  revealInFinder,
  updateClaudePlugin,
  updateCodexMarketplace,
  updateCodexPlugin,
} from "../api";
import { useAppStore } from "../store";
import { PageHeader, Card, Badge, Button, EmptyState } from "../components/ui";

interface UpdateState {
  target: string; // target 存储正在更新或刚完成更新的插件名称。
  phase: "loading" | "ok" | "err"; // phase 存储更新阶段。
  text: string; // text 存储 CLI 输出或错误文本。
}

interface ToolSectionState {
  loading: boolean; // loading 标记该工具插件检查是否进行中。
  result: PluginUpdateCheckResult | null; // result 存储该工具插件检查结果。
  error: string; // error 存储该工具插件检查失败原因。
}

interface PluginToolSectionProps {
  title: string; // title 存储工具区块标题。
  state: ToolSectionState; // state 存储该工具插件检查状态。
  onRefresh: () => void; // onRefresh 用于重新检查该工具插件状态。
  onUpdate: (plugin: ToolPluginInfo) => void; // onUpdate 用于拉取单个插件更新。
}

// 根据插件更新状态返回界面文案。
// status 为后端计算出的更新状态。
function updateStatusLabel(status: PluginUpdateStatus): string {
  if (status === "newer") {
    return "可更新";
  }
  if (status === "same") {
    return "已最新";
  }
  if (status === "different") {
    return "版本不同";
  }
  return "未知";
}

// 根据插件更新状态返回徽章色调。
// status 为后端计算出的更新状态。
function updateStatusTone(status: PluginUpdateStatus): "neutral" | "success" | "warning" | "info" {
  if (status === "newer") {
    return "warning";
  }
  if (status === "same") {
    return "success";
  }
  if (status === "different") {
    return "info";
  }
  return "neutral";
}

// 渲染单个工具的插件更新状态区块。
// title 为工具标题，state 为检查结果，onRefresh / onUpdate 为交互回调。
function PluginToolSection({ title, state, onRefresh, onUpdate }: PluginToolSectionProps) {
  return (
    <section className="mb-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-text-main">{title}</h2>
        <Button onClick={onRefresh} variant="default" disabled={state.loading}>
          {state.loading ? "检查中…" : "检查更新"}
        </Button>
      </div>

      {state.error && (
        <div className="mb-3 rounded-lg border border-red-500/40 p-3 text-xs text-red-500">
          <div className="font-medium">{title}检查失败</div>
          <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap font-mono">
            {state.error}
          </pre>
        </div>
      )}

      {state.loading ? (
        <div className="py-8 text-center text-sm text-text-muted">加载中…</div>
      ) : !state.result || state.result.plugins.length === 0 ? (
        <EmptyState text="未发现已安装插件" />
      ) : (
        <div className="space-y-3">
          {state.result.plugins.map((plugin) => (
            <Card key={`${state.result?.tool}-${plugin.id}-${plugin.scope}-${plugin.install_path}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-text-main">{plugin.id}</span>
                    <Badge tone="info">v{plugin.current_version || "—"}</Badge>
                    <Badge tone={updateStatusTone(plugin.update_status)}>
                      {updateStatusLabel(plugin.update_status)}
                    </Badge>
                    {plugin.scope && <Badge tone="neutral">{plugin.scope}</Badge>}
                    <Badge tone={plugin.enabled ? "success" : "neutral"}>
                      {plugin.enabled ? "已启用" : "已禁用"}
                    </Badge>
                  </div>
                  <div className="mt-1 space-y-0.5 text-xs text-text-muted">
                    <div>市场：{plugin.marketplace || "—"}</div>
                    <div>最新版本：{plugin.available_version || "—"}</div>
                    <div>最近更新：{plugin.last_updated || "—"}</div>
                    <div className="truncate" title={plugin.install_path}>
                      路径：{plugin.install_path || "—"}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    onClick={() => revealInFinder(plugin.install_path).catch(console.error)}
                    variant="ghost"
                    disabled={!plugin.install_path}
                  >
                    Finder
                  </Button>
                  <Button
                    onClick={() => onUpdate(plugin)}
                    variant="primary"
                    disabled={plugin.update_status === "same"}
                  >
                    拉取更新
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}

// 插件管理页组件
export default function PluginsPage() {
  // claudeHome 存储 Claude 配置根目录。
  const claudeHome = useAppStore((state) => state.prefs?.claude_home || "");
  // codexHome 存储 Codex 配置根目录。
  const codexHome = useAppStore((state) => state.prefs?.codex_home || "");
  // claudeState 存储 Claude 插件检查状态。
  const [claudeState, setClaudeState] = useState<ToolSectionState>({
    loading: true,
    result: null,
    error: "",
  });
  // codexState 存储 Codex 插件检查状态。
  const [codexState, setCodexState] = useState<ToolSectionState>({
    loading: true,
    result: null,
    error: "",
  });
  // update 存储当前插件更新操作状态。
  const [update, setUpdate] = useState<UpdateState | null>(null);

  // loadClaude 检查 Claude 插件更新状态。
  async function loadClaude() {
    if (!claudeHome) {
      return;
    }
    setClaudeState((state) => ({ ...state, loading: true, error: "" }));
    try {
      // result 存储 Claude 插件检查结果。
      const result = await checkClaudePluginUpdates(claudeHome);
      setClaudeState({ loading: false, result, error: "" });
    } catch (error) {
      setClaudeState({ loading: false, result: null, error: String(error) });
    }
  }

  // loadCodex 检查 Codex 插件更新状态。
  async function loadCodex() {
    if (!codexHome) {
      return;
    }
    setCodexState((state) => ({ ...state, loading: true, error: "" }));
    try {
      // result 存储 Codex 插件检查结果。
      const result = await checkCodexPluginUpdates(codexHome);
      setCodexState({ loading: false, result, error: "" });
    } catch (error) {
      setCodexState({ loading: false, result: null, error: String(error) });
    }
  }

  // loadAll 并行检查 Claude 与 Codex 插件状态。
  async function loadAll() {
    await Promise.allSettled([loadClaude(), loadCodex()]);
  }

  useEffect(() => {
    void loadAll();
  }, [claudeHome, codexHome]);

  // handleUpdateClaude 拉取 Claude 插件更新。
  // plugin 为需要更新的 Claude 插件。
  async function handleUpdateClaude(plugin: ToolPluginInfo) {
    setUpdate({ target: plugin.id, phase: "loading", text: "" });
    try {
      // output 存储 Claude CLI 更新输出。
      const output = await updateClaudePlugin(plugin.id, plugin.scope);
      setUpdate({ target: plugin.id, phase: "ok", text: output || "更新完成" });
      await loadClaude();
    } catch (error) {
      setUpdate({ target: plugin.id, phase: "err", text: String(error) });
    }
  }

  // handleUpdateCodex 拉取 Codex 插件更新。
  // plugin 为需要更新的 Codex 插件。
  async function handleUpdateCodex(plugin: ToolPluginInfo) {
    setUpdate({ target: plugin.id, phase: "loading", text: "" });
    try {
      // marketplaceOutput 存储 marketplace 刷新输出。
      const marketplaceOutput = await updateCodexMarketplace(plugin.marketplace);
      // pluginOutput 存储 Codex 插件安装/更新输出。
      const pluginOutput = await updateCodexPlugin(plugin.id, plugin.marketplace);
      setUpdate({
        target: plugin.id,
        phase: "ok",
        text: [marketplaceOutput, pluginOutput].filter(Boolean).join("\n"),
      });
      await loadCodex();
    } catch (error) {
      setUpdate({ target: plugin.id, phase: "err", text: String(error) });
    }
  }

  return (
    <div className="p-6">
      <PageHeader
        title="插件"
        subtitle="管理 Claude Code 与 Codex 插件，检查可用版本并拉取更新"
        actions={
          <Button onClick={loadAll} variant="default">
            刷新全部
          </Button>
        }
      />

      {update && (
        <div
          className={`mb-4 rounded-lg border p-3 text-xs ${
            update.phase === "err"
              ? "border-red-500/40 text-red-500"
              : update.phase === "ok"
              ? "border-green-500/40 text-green-500"
              : "border-border text-text-muted"
          }`}
        >
          <div className="font-medium">
            {update.phase === "loading"
              ? `正在更新 ${update.target}…`
              : `${update.target} 更新${update.phase === "ok" ? "成功" : "失败"}`}
          </div>
          {update.text && (
            <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap font-mono">
              {update.text}
            </pre>
          )}
        </div>
      )}

      <PluginToolSection
        title="Claude 插件"
        state={claudeState}
        onRefresh={loadClaude}
        onUpdate={handleUpdateClaude}
      />
      <PluginToolSection
        title="Codex 插件"
        state={codexState}
        onRefresh={loadCodex}
        onUpdate={handleUpdateCodex}
      />
    </div>
  );
}
```

The status helper in this replacement is:

```typescript
// 根据插件更新状态返回界面文案。
// status 为后端计算出的更新状态。
function updateStatusLabel(status: PluginUpdateStatus): string {
  if (status === "newer") {
    return "可更新";
  }
  if (status === "same") {
    return "已最新";
  }
  if (status === "different") {
    return "版本不同";
  }
  return "未知";
}
```

- [ ] **Step 6: Run PluginsPage tests to verify GREEN**

Run:

```bash
npm test -- src/pages/PluginsPage.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Run frontend build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 8: Commit Task 5**

Run:

```bash
git add src/types.ts src/api.ts src/pages/PluginsPage.tsx src/pages/PluginsPage.test.tsx
git commit -m "feat: show plugin update status"
```

---

### Task 6: End-To-End Verification And Polish

**Files:**
- Modify files touched by Tasks 1-5 only when verification finds issues.
- Modify: `功能清单.md`
- Modify: `README.md`

**Interfaces:**
- Consumes all previous task outputs.
- Produces a verified, user-facing implementation with clean build and tests.

- [ ] **Step 1: Run all frontend tests**

Run:

```bash
npm test
```

Expected: PASS for all frontend tests.

- [ ] **Step 2: Run frontend build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 3: Run Rust tests**

Run:

```bash
cd src-tauri && cargo test
```

Expected: PASS.

- [ ] **Step 4: Run manual CLI smoke checks**

Run:

```bash
claude plugin list --json --available >/tmp/visual-aicoding-claude-plugins.json
codex plugin list --json --available >/tmp/visual-aicoding-codex-plugins.json
```

Expected:

- Claude command exits 0 and writes JSON.
- Codex command may fail if a configured marketplace snapshot is invalid; if it fails, the app must display “Codex 插件检查失败” while Claude plugin UI still renders.

- [ ] **Step 5: Start development server for UI smoke test**

Run:

```bash
npm run dev
```

Expected: Vite starts on `http://localhost:1420`.

Open the app through Tauri if needed:

```bash
npm run tauri:dev
```

Expected checks:

- Claude page renders `settings.json` with “可视化 / 原始文本” tabs.
- Codex page renders `config.toml` with “可视化 / 原始文本” tabs.
- Unknown fields show in “高级字段”.
- Plugins page renders Claude and Codex sections.
- A Codex plugin check failure is contained to the Codex section.

- [ ] **Step 6: Update user-facing docs**

Update both docs so they mention visual config editing and plugin update status:

```markdown
README.md
功能清单.md
```

Add concise notes that Claude and Codex config files support visual editing and that plugin pages show update status.

- [ ] **Step 7: Final git status check**

Run:

```bash
git status --short
```

Expected: only intended changes are listed.

- [ ] **Step 8: Commit Task 6**

Run:

```bash
git add README.md 功能清单.md
git commit -m "docs: document visual config updates"
```

---

## Self-Review

Spec coverage:

- Claude `settings.json` visual editing: Tasks 2 and 3.
- Codex `config.toml` visual editing: Tasks 2 and 3.
- Unknown field preservation: Tasks 1 and 3.
- Sensitive field masking metadata: Tasks 1 and 2.
- Claude plugin update status and update action: Tasks 4 and 5.
- Codex plugin update status and marketplace/add update action: Tasks 4 and 5.
- Tool-specific failure isolation: Tasks 4 and 5.
- Verification commands: Task 6.

Placeholder scan:

- No placeholder markers are intentionally present.
- Steps with implementation changes include concrete code blocks or exact command behavior.

Type consistency:

- Frontend `ToolPluginInfo` matches Rust `ToolPluginInfo`.
- Frontend `PluginUpdateCheckResult` matches Rust `PluginUpdateCheckResult`.
- `comparePluginVersions` frontend result values match Rust `compare_versions` result strings: `same`, `newer`, `different`, `unknown`.
