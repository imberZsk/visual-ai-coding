import { describe, expect, it } from "vitest";
import {
  buildViteArgs,
  findAvailablePort,
  resolveDevServerAction,
} from "./dev-or-reuse.mjs";

// 该测试套件用于验证 Electron 渲染进程 dev server 遇到端口冲突时的决策行为。
describe("resolveDevServerAction", () => {
  // 该回调用于验证端口已有可访问 dev server 时直接复用，避免 Electron dev 因重复启动 Vite 失败。
  it("reuses an existing reachable dev server", async () => {
    // action 存储端口占用且 HTTP 可访问时的脚本决策结果。
    const action = await resolveDevServerAction({
      host: "127.0.0.1",
      port: 5273,
      isPortInUse: async () => true,
      isHttpReachable: async () => true,
    });

    expect(action).toBe("reuse");
  });

  // 该回调用于验证端口空闲时仍然正常启动 Vite。
  it("starts Vite when the configured port is free", async () => {
    // action 存储端口空闲时的脚本决策结果。
    const action = await resolveDevServerAction({
      host: "127.0.0.1",
      port: 5273,
      isPortInUse: async () => false,
      isHttpReachable: async () => false,
    });

    expect(action).toBe("start");
  });

  // 该回调用于验证默认端口被占用时会向后寻找下一个可用端口。
  it("selects the next free port when the default port is occupied", async () => {
    // checkedPorts 存储测试期间被探测过的端口序列。
    const checkedPorts = [];
    // selectedPort 存储脚本从起始端口向后找到的可用端口。
    const selectedPort = await findAvailablePort({
      host: "127.0.0.1",
      startPort: 5273,
      isPortInUse: async (_host, port) => {
        checkedPorts.push(port);
        return port === 5273;
      },
    });

    expect(selectedPort).toBe(5274);
    expect(checkedPorts).toEqual([5273, 5274]);
  });

  // 该回调用于验证启动 Vite 时会显式传入选中的端口并保持 strictPort。
  it("builds Vite args with the selected host and port", () => {
    // args 存储传给 Vite CLI 的最终参数。
    const args = buildViteArgs(["--clearScreen", "false"], "127.0.0.1", 5274);

    expect(args).toEqual([
      "--clearScreen",
      "false",
      "--host",
      "127.0.0.1",
      "--port",
      "5274",
      "--strictPort",
    ]);
  });

  // 该回调用于验证端口被非 HTTP 服务占用时仍返回 blocked，避免 Electron 连到错误服务。
  it("blocks when the configured port is occupied by a non-dev-server process", async () => {
    // action 存储端口占用但 HTTP 不可访问时的脚本决策结果。
    const action = await resolveDevServerAction({
      host: "127.0.0.1",
      port: 5273,
      isPortInUse: async () => true,
      isHttpReachable: async () => false,
    });

    expect(action).toBe("blocked");
  });
});
