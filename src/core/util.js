// Electron 后端公共工具：路径展开、原子写入、登录 shell PATH 解析与子进程执行。
import { execFile, execFileSync, spawn } from "node:child_process";
import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

// cachedLoginPath 缓存登录 shell 解析出的 PATH，避免频繁启动 shell。
let cachedLoginPath = undefined;

// expandHome 将 ~ / ~/xxx 前缀展开为用户主目录绝对路径。
// input 参数存储用户配置或文件路径文本；~otheruser 形式保持原样。
export function expandHome(input) {
  // pathText 存储归一化后的输入文本。
  const pathText = String(input || "");
  if (pathText === "~") {
    return homedir();
  }
  if (pathText.startsWith("~/")) {
    return join(homedir(), pathText.slice(2));
  }
  return pathText;
}

// atomicWrite 原子写入文件：先写同目录临时文件，再 rename 覆盖目标。
// filePath 参数存储目标路径，content 参数存储完整文件内容。
export function atomicWrite(filePath, content) {
  // targetPath 存储展开后的目标文件路径。
  const targetPath = expandHome(filePath);
  // parentDir 存储目标文件父目录，临时文件必须与目标同目录以保证 rename 原子性。
  const parentDir = dirname(targetPath);
  // fileName 存储目标文件名，用于构造隐藏临时文件名。
  const fileName = targetPath.split("/").pop() || "config";
  // tempPath 存储同目录临时文件路径。
  const tempPath = join(parentDir, `.${fileName}.tmp`);

  mkdirSync(parentDir, { recursive: true });
  writeFileSync(tempPath, content, "utf8");

  try {
    renameSync(tempPath, targetPath);
  } catch (error) {
    // WHY：rename 失败时清理临时文件，避免下次保存误读残留内容。
    rmSync(tempPath, { force: true });
    throw new Error(`替换目标文件失败: ${error.message}`);
  }
}

// resolveLoginPath 读取登录 shell 中的 PATH，用于修正 macOS GUI 应用的精简环境。
// env 参数存储进程环境，测试可注入；返回空字符串表示降级使用当前 PATH。
export function resolveLoginPath(env = process.env) {
  if (cachedLoginPath !== undefined) {
    return cachedLoginPath;
  }

  // shellPath 存储用户默认 shell，缺失时按 macOS 默认 zsh 处理。
  const shellPath = env.SHELL || "/bin/zsh";
  try {
    // output 存储登录交互式 shell 输出的 PATH 文本。
    const output = execFileSync(shellPath, ["-lic", "echo $PATH"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    cachedLoginPath = output || "";
  } catch {
    cachedLoginPath = "";
  }

  return cachedLoginPath;
}

// buildCommandEnv 构造修正 PATH 后的子进程环境。
// extraEnv 参数存储调用方希望额外注入的环境变量。
export function buildCommandEnv(extraEnv = {}) {
  // loginPath 存储登录 shell 解析出的真实 PATH。
  const loginPath = resolveLoginPath();
  return {
    ...process.env,
    ...(loginPath ? { PATH: loginPath } : {}),
    ...extraEnv,
  };
}

// runCommand 执行外部命令并返回 stdout/stderr，失败时抛出包含输出的错误。
// bin 参数存储可执行文件名，args 参数存储命令参数，options 参数存储 cwd/env 等选项。
export function runCommand(bin, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    // childEnv 存储修正 PATH 并合并调用方变量后的环境。
    const childEnv = buildCommandEnv(options.env || {});
    execFile(
      bin,
      args,
      {
        cwd: options.cwd,
        env: childEnv,
        maxBuffer: options.maxBuffer || 1024 * 1024 * 20,
      },
      (error, stdout, stderr) => {
        // stdoutText 存储标准输出文本。
        const stdoutText = String(stdout || "");
        // stderrText 存储标准错误文本。
        const stderrText = String(stderr || "");

        if (error) {
          // message 存储合并后的错误文本，尽量保留 CLI 原始诊断。
          const message = `${stdoutText}\n${stderrText}`.trim() || error.message;
          // wrappedError 存储带 stdout/stderr 的错误对象，便于上层 fallback。
          const wrappedError = new Error(message);
          wrappedError.stdout = stdoutText;
          wrappedError.stderr = stderrText;
          reject(wrappedError);
          return;
        }

        resolve({ stdout: stdoutText, stderr: stderrText });
      },
    );
  });
}

// spawnDetached 启动无需等待完成的外部命令。
// bin 参数存储可执行文件名，args 参数存储命令参数。
export function spawnDetached(bin, args = []) {
  // child 存储已启动的子进程句柄。
  const child = spawn(bin, args, {
    env: buildCommandEnv(),
    detached: true,
    stdio: "ignore",
  });
  child.unref();
}
