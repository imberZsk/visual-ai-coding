// 应用全局状态：偏好、工具状态、主题，集中管理供各页面消费
import { create } from "zustand";
import type {
  PluginUpdateCheckResult,
  Preferences,
  ToolPluginInfo,
  ToolStatus,
} from "./types";
import {
  checkClaudePluginUpdates,
  checkCodexPluginUpdates,
  getPreferences,
  savePreferences as apiSavePreferences,
  detectTools,
  updateClaudePlugin,
  updateCodexMarketplace,
  updateCodexPlugin,
} from "./api";

// PluginToolId 表示插件页支持检查更新的工具标识。
type PluginToolId = "claude" | "codex";

// PluginUpdateFeedback 描述单条插件更新操作的执行阶段与反馈文本。
interface PluginUpdateFeedback {
  target: string; // target 存储当前更新中的插件名称或最近更新完成的插件名称。
  phase: "loading" | "ok" | "err"; // phase 存储更新阶段，控制提示条颜色与文案。
  text: string; // text 存储 CLI 输出或错误信息。
}

// PluginToolCheckState 描述单个工具区块的检查结果。
interface PluginToolCheckState {
  loading: boolean; // loading 标记该工具插件检查是否进行中。
  result: PluginUpdateCheckResult | null; // result 存储该工具最新一次检查结果。
  error: string; // error 存储该工具检查失败的原因文本。
}

// PluginUpdateOperation 描述正在执行的单个插件更新任务。
interface PluginUpdateOperation {
  loading: boolean; // loading 标记该插件更新是否仍在执行。
  promise: Promise<void>; // promise 存储本次更新任务，供重复点击复用。
}

// PluginPageState 描述插件页跨组件生命周期保留的异步状态。
interface PluginPageState {
  claude: PluginToolCheckState; // claude 存储 Claude 插件检查状态。
  codex: PluginToolCheckState; // codex 存储 Codex 插件检查状态。
  refreshingAll: boolean; // refreshingAll 标记顶部“刷新全部”是否正在执行。
  update: PluginUpdateFeedback | null; // update 存储当前插件更新操作的反馈信息。
  checking: Partial<Record<PluginToolId, Promise<void>>>; // checking 存储各工具正在执行的检查 Promise。
  updating: Record<string, PluginUpdateOperation>; // updating 存储各插件正在执行的更新 Promise。
}

// createEmptyPluginToolCheckState 创建单个工具的空检查状态。
function createEmptyPluginToolCheckState(): PluginToolCheckState {
  return { loading: false, result: null, error: "" };
}

// createInitialPluginPageState 创建插件页 store 初始状态。
function createInitialPluginPageState(): PluginPageState {
  return {
    claude: createEmptyPluginToolCheckState(),
    codex: createEmptyPluginToolCheckState(),
    refreshingAll: false,
    update: null,
    checking: {},
    updating: {},
  };
}

// pluginUpdateKey 生成单插件更新任务 key，用工具和安装信息区分同名插件。
// tool 为插件所属工具，plugin 为后端返回的插件信息。
function pluginUpdateKey(tool: PluginToolId, plugin: ToolPluginInfo): string {
  return [tool, plugin.id, plugin.scope, plugin.install_path].join("::");
}

// cleanUpdatingMap 返回移除指定 key 后的新更新任务映射。
// updating 存储当前所有更新任务，key 为需要移除的任务标识。
function cleanUpdatingMap(
  updating: Record<string, PluginUpdateOperation>,
  key: string
): Record<string, PluginUpdateOperation> {
  // nextUpdating 存储拷贝后的更新任务映射，避免直接修改 zustand 当前状态。
  const nextUpdating = { ...updating };
  delete nextUpdating[key];
  return nextUpdating;
}

// 全局状态结构
interface AppState {
  // 应用偏好；null 表示尚未加载
  prefs: Preferences | null;
  // 本机工具探测结果
  tools: ToolStatus[];
  // 偏好是否加载完成
  loaded: boolean;
  pluginPage: PluginPageState; // pluginPage 存储插件页跨 tab 保留的检查与更新状态。
  // 加载偏好与工具状态（应用启动时调用一次）
  init: () => Promise<void>;
  // 更新部分偏好字段并持久化
  updatePrefs: (patch: Partial<Preferences>) => Promise<void>;
  // 重新探测工具状态
  refreshTools: () => Promise<void>;
  // 检查指定工具的插件更新状态
  checkPluginUpdates: (tool: PluginToolId) => Promise<void>;
  // 并行检查 Claude 与 Codex 插件更新状态
  checkAllPluginUpdates: () => Promise<void>;
  // 更新指定工具下的单个插件
  updatePlugin: (tool: PluginToolId, plugin: ToolPluginInfo) => Promise<void>;
}

// 创建全局 store
export const useAppStore = create<AppState>((set, get) => ({
  prefs: null,
  tools: [],
  loaded: false,
  pluginPage: createInitialPluginPageState(),

  // 初始化：并行加载偏好与工具探测
  init: async () => {
    const [prefs, tools] = await Promise.all([getPreferences(), detectTools()]);
    set({ prefs, tools, loaded: true });
  },

  // 合并补丁到现有偏好并落盘
  updatePrefs: async (patch) => {
    // current 为当前偏好，未加载时忽略本次更新
    const current = get().prefs;
    if (!current) return;
    // next 为合并后的完整偏好
    const next = { ...current, ...patch };
    // 先乐观更新内存状态，保证界面即时响应
    set({ prefs: next });
    try {
      await apiSavePreferences(next);
    } catch (e) {
      // 落盘失败时回滚内存状态，避免 UI 显示与磁盘不一致（如主题已切换但未持久化）
      set({ prefs: current });
      throw e;
    }
  },

  // 重新探测工具状态
  refreshTools: async () => {
    const tools = await detectTools();
    set({ tools });
  },

  // 检查指定工具的插件更新状态；已有同工具检查时复用 Promise，避免重复启动 CLI。
  checkPluginUpdates: (tool) => {
    // existingPromise 存储当前工具已在执行的检查 Promise。
    const existingPromise = get().pluginPage.checking[tool];
    if (existingPromise) {
      // 同一个工具的检查正在进行时直接复用，满足按钮防重复业务要求。
      return existingPromise;
    }

    // home 存储当前工具对应的配置根目录。
    const home =
      tool === "claude" ? get().prefs?.claude_home || "" : get().prefs?.codex_home || "";

    if (!home) {
      set((state) => ({
        pluginPage: {
          ...state.pluginPage,
          [tool]: { loading: false, result: null, error: "" },
        },
      }));
      return Promise.resolve();
    }

    set((state) => ({
      pluginPage: {
        ...state.pluginPage,
        [tool]: { ...state.pluginPage[tool], loading: true, error: "" },
      },
    }));

    // promise 存储本次工具检查任务，写入 store 后可跨组件生命周期复用。
    const promise = (async () => {
      try {
        // result 存储后端返回的插件检查结果。
        const result =
          tool === "claude"
            ? await checkClaudePluginUpdates(home)
            : await checkCodexPluginUpdates(home);
        set((state) => ({
          pluginPage: {
            ...state.pluginPage,
            [tool]: { loading: false, result, error: "" },
          },
        }));
      } catch (error) {
        set((state) => ({
          pluginPage: {
            ...state.pluginPage,
            [tool]: { loading: false, result: null, error: String(error) },
          },
        }));
      } finally {
        set((state) => ({
          pluginPage: {
            ...state.pluginPage,
            checking: { ...state.pluginPage.checking, [tool]: undefined },
          },
        }));
      }
    })();

    set((state) => ({
      pluginPage: {
        ...state.pluginPage,
        checking: { ...state.pluginPage.checking, [tool]: promise },
      },
    }));

    return promise;
  },

  // 并行检查两个工具插件状态；顶部按钮 loading 只覆盖自身，不替换列表内容。
  checkAllPluginUpdates: async () => {
    if (get().pluginPage.refreshingAll) {
      // 全量刷新正在进行时复用两个工具已有任务，避免重复点击启动新检查。
      await Promise.allSettled([
        get().pluginPage.checking.claude || Promise.resolve(),
        get().pluginPage.checking.codex || Promise.resolve(),
      ]);
      return;
    }

    set((state) => ({
      pluginPage: { ...state.pluginPage, refreshingAll: true },
    }));
    try {
      await Promise.allSettled([
        get().checkPluginUpdates("claude"),
        get().checkPluginUpdates("codex"),
      ]);
    } finally {
      set((state) => ({
        pluginPage: { ...state.pluginPage, refreshingAll: false },
      }));
    }
  },

  // 更新指定工具下的单个插件；相同插件已有任务时复用 Promise，避免重复拉取。
  updatePlugin: (tool, plugin) => {
    // key 存储当前插件更新任务的唯一标识。
    const key = pluginUpdateKey(tool, plugin);
    // existingOperation 存储已存在的同插件更新任务。
    const existingOperation = get().pluginPage.updating[key];
    if (existingOperation) {
      // 同一个插件更新正在进行时直接复用，避免重复执行安装命令。
      return existingOperation.promise;
    }

    set((state) => ({
      pluginPage: {
        ...state.pluginPage,
        update: { target: plugin.id, phase: "loading", text: "" },
      },
    }));

    // promise 存储本次插件更新任务，供按钮 loading 和防重复逻辑共享。
    const promise = (async () => {
      try {
        if (tool === "claude") {
          // output 存储 Claude CLI 返回的更新输出。
          const output = await updateClaudePlugin(plugin.id, plugin.scope);
          set((state) => ({
            pluginPage: {
              ...state.pluginPage,
              update: { target: plugin.id, phase: "ok", text: output || "更新完成" },
            },
          }));
          await get().checkPluginUpdates("claude");
          return;
        }

        // Codex 插件更新依赖 marketplace 先刷新，否则本地索引可能仍指向旧版本。
        const marketplaceOutput = await updateCodexMarketplace(plugin.marketplace);
        // pluginOutput 存储 Codex CLI 返回的插件更新输出。
        const pluginOutput = await updateCodexPlugin(plugin.id, plugin.marketplace);
        set((state) => ({
          pluginPage: {
            ...state.pluginPage,
            update: {
              target: plugin.id,
              phase: "ok",
              text: [marketplaceOutput, pluginOutput].filter(Boolean).join("\n"),
            },
          },
        }));
        await get().checkPluginUpdates("codex");
      } catch (error) {
        set((state) => ({
          pluginPage: {
            ...state.pluginPage,
            update: { target: plugin.id, phase: "err", text: String(error) },
          },
        }));
      } finally {
        set((state) => ({
          pluginPage: {
            ...state.pluginPage,
            updating: cleanUpdatingMap(state.pluginPage.updating, key),
          },
        }));
      }
    })();

    set((state) => ({
      pluginPage: {
        ...state.pluginPage,
        updating: {
          ...state.pluginPage.updating,
          [key]: { loading: true, promise },
        },
      },
    }));

    return promise;
  },
}));
