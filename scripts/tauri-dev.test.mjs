import { describe, expect, it } from "vitest";
import { buildTauriDevArgs, buildTauriDevConfig } from "./tauri-dev.mjs";

// 该测试套件用于验证 Tauri dev wrapper 会把同一个动态端口同步给 Tauri 与 Vite。
describe("tauri dev wrapper", () => {
  // 该回调用于验证 Tauri devPath 与 beforeDevCommand 使用同一个端口。
  it("builds a matching Tauri devPath and Vite command", () => {
    // config 存储注入给 Tauri CLI 的动态配置。
    const config = buildTauriDevConfig("127.0.0.1", 1421);

    expect(config).toEqual({
      build: {
        devPath: "http://127.0.0.1:1421",
        beforeDevCommand:
          "npm run dev -- --host 127.0.0.1 --port 1421 --strictPort",
      },
    });
  });

  // 该回调用于验证 wrapper 会保留用户传给 tauri dev 的额外参数。
  it("passes through Tauri dev args after injecting dynamic config", () => {
    // args 存储传给 Tauri CLI 的最终参数。
    const args = buildTauriDevArgs(["--verbose"], "127.0.0.1", 1421);
    // configIndex 存储 --config 参数在最终参数列表中的位置。
    const configIndex = args.indexOf("--config");
    // configText 存储序列化后的 Tauri 覆盖配置。
    const configText = args[configIndex + 1];

    expect(args.slice(0, configIndex)).toEqual(["dev", "--verbose"]);
    expect(JSON.parse(configText).build.devPath).toBe("http://127.0.0.1:1421");
  });
});
