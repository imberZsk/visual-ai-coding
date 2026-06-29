// 应用全局状态：偏好、工具状态、主题，集中管理供各页面消费
import { create } from "zustand";
import type { Preferences, ToolStatus } from "./types";
import {
  getPreferences,
  savePreferences as apiSavePreferences,
  detectTools,
} from "./api";

// 全局状态结构
interface AppState {
  // 应用偏好；null 表示尚未加载
  prefs: Preferences | null;
  // 本机工具探测结果
  tools: ToolStatus[];
  // 偏好是否加载完成
  loaded: boolean;
  // 加载偏好与工具状态（应用启动时调用一次）
  init: () => Promise<void>;
  // 更新部分偏好字段并持久化
  updatePrefs: (patch: Partial<Preferences>) => Promise<void>;
  // 重新探测工具状态
  refreshTools: () => Promise<void>;
}

// 创建全局 store
export const useAppStore = create<AppState>((set, get) => ({
  prefs: null,
  tools: [],
  loaded: false,

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
}));
