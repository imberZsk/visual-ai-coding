// 应用偏好持久化：所有可配置项落盘到 ~/.visualAiCoding/preferences.json。
import { existsSync, mkdirSync, readFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { atomicWrite } from "./util.js";

// defaultPreferences 创建应用偏好的默认值。
export function defaultPreferences() {
  return {
    theme: "dark",
    vscode_path: "code",
    claude_home: join(homedir(), ".claude"),
    codex_home: join(homedir(), ".codex"),
    last_active_tab: "",
    hidden_visual_config_fields: {},
  };
}

// appConfigDir 返回应用配置目录，并确保目录存在。
export function appConfigDir() {
  // dir 存储应用专属配置目录路径。
  const dir = join(homedir(), ".visualAiCoding");
  mkdirSync(dir, { recursive: true });
  return dir;
}

// preferencesPath 返回 preferences.json 的完整路径。
export function preferencesPath() {
  return join(appConfigDir(), "preferences.json");
}

// normalizePreferences 用默认值修补旧版本偏好缺失字段。
// value 参数存储从磁盘解析出的偏好对象。
function normalizePreferences(value) {
  return {
    ...defaultPreferences(),
    ...(value && typeof value === "object" ? value : {}),
    hidden_visual_config_fields:
      value?.hidden_visual_config_fields && typeof value.hidden_visual_config_fields === "object"
        ? value.hidden_visual_config_fields
        : {},
  };
}

// getPreferences 读取应用偏好；文件不存在时写入默认值。
export function getPreferences() {
  // path 存储偏好文件路径。
  const path = preferencesPath();
  if (!existsSync(path)) {
    // prefs 存储首次启动使用的默认偏好。
    const prefs = defaultPreferences();
    savePreferences(prefs);
    return prefs;
  }

  try {
    // content 存储偏好文件原始 JSON 文本。
    const content = readFileSync(path, "utf8");
    return normalizePreferences(JSON.parse(content));
  } catch {
    // backupPath 存储损坏偏好的备份路径，避免回退默认值时覆盖用户原内容。
    const backupPath = path.replace(/\.json$/, ".json.corrupted");
    try {
      renameSync(path, backupPath);
    } catch {
      // 备份失败不阻塞启动，后续保存仍会写出可用偏好。
    }
    return defaultPreferences();
  }
}

// savePreferences 保存应用偏好到 preferences.json。
// prefs 参数存储完整偏好对象。
export function savePreferences(prefs) {
  // json 存储格式化后的偏好 JSON，便于用户手动查看。
  const json = JSON.stringify(normalizePreferences(prefs), null, 2);
  atomicWrite(preferencesPath(), json);
}
