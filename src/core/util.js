// Electron 后端公共工具：路径展开、原子写入、登录 shell PATH 解析与子进程执行。
import { execFile, spawn } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, join, posix, win32 } from 'node:path'
import { homedir } from 'node:os'

// MACOS_CODEX_APP_RESOURCE_PATHS 存储可能随桌面应用分发 Codex CLI 的系统级资源目录。
const MACOS_CODEX_APP_RESOURCE_PATHS = [
  '/Applications/ChatGPT.app/Contents/Resources',
  '/Applications/Codex.app/Contents/Resources',
]
// CODEX_EXECUTABLE_NAME 存储用于验证候选资源目录的 Codex CLI 文件名。
const CODEX_EXECUTABLE_NAME = 'codex'
// CLAUDE_EXECUTABLE_NAME 存储用于验证 Volta 目录的 Claude CLI 文件名。
const CLAUDE_EXECUTABLE_NAME = 'claude'

// cachedLoginPath 缓存登录 shell 解析出的 PATH，undefined 表示尚未初始化，null 表示初始化中（进行中的 Promise）。
let cachedLoginPath = undefined
// loginPathPromise 存储正在进行的 PATH 解析 Promise，防止并发重复启动 shell。
let loginPathPromise = null

// expandHome 将 ~ / ~/xxx 前缀展开为用户主目录绝对路径。
// input 参数存储用户配置或文件路径文本；~otheruser 形式保持原样。
export function expandHome(input) {
  // pathText 存储归一化后的输入文本。
  const pathText = String(input || '')
  if (pathText === '~') {
    return homedir()
  }
  if (pathText.startsWith('~/')) {
    return join(homedir(), pathText.slice(2))
  }
  return pathText
}

// atomicWrite 原子写入文件：先写同目录临时文件，再 rename 覆盖目标。
// filePath 参数存储目标路径，content 参数存储完整文件内容。
export function atomicWrite(filePath, content) {
  // targetPath 存储展开后的目标文件路径。
  const targetPath = expandHome(filePath)
  // parentDir 存储目标文件父目录，临时文件必须与目标同目录以保证 rename 原子性。
  const parentDir = dirname(targetPath)
  // fileName 存储目标文件名，用于构造隐藏临时文件名。
  const fileName = basename(targetPath) || 'config'
  // tempPath 存储同目录临时文件路径。
  const tempPath = join(parentDir, `.${fileName}.tmp`)

  mkdirSync(parentDir, { recursive: true })
  writeFileSync(tempPath, content, 'utf8')

  try {
    renameSync(tempPath, targetPath)
  } catch (error) {
    // WHY：rename 失败时清理临时文件，避免下次保存误读残留内容。
    rmSync(tempPath, { force: true })
    throw new Error(`替换目标文件失败: ${error.message}`, { cause: error })
  }
}

// resolveLoginPath 异步读取登录 shell 中的 PATH，修正 macOS GUI 应用的精简环境。
// env 参数存储进程环境，测试时可注入；返回空字符串表示降级使用当前 PATH。
// WHY 用 Promise 而非 execFileSync：登录 shell（尤其加载 nvm/homebrew 的 zshrc）
// 耗时可达 300ms-2s，同步执行期间主进程事件循环完全冻结，所有窗口无响应。
export function resolveLoginPath(env = process.env) {
  // 已有缓存直接返回
  if (cachedLoginPath !== undefined) {
    return Promise.resolve(cachedLoginPath)
  }
  // 已有正在进行的解析 Promise，复用同一个，避免并发重复启动 shell
  if (loginPathPromise) {
    return loginPathPromise
  }

  // shellPath 存储用户默认 shell，缺失时按 macOS 默认 zsh 处理。
  const shellPath = env.SHELL || '/bin/zsh'
  loginPathPromise = new Promise((resolve) => {
    execFile(
      shellPath,
      ['-lic', 'echo $PATH'],
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 5000,
      },
      (err, stdout) => {
        // output 存储登录交互式 shell 输出的 PATH 文本
        cachedLoginPath = err ? '' : stdout.trim() || ''
        loginPathPromise = null
        resolve(cachedLoginPath)
      }
    )
  })

  return loginPathPromise
}

// warmLoginPath 在应用启动时提前预热 PATH 缓存，避免首次命令执行时等待 shell 初始化。
// 供 main.js 在 app.whenReady() 后立即调用，不阻塞窗口创建。
export function warmLoginPath() {
  return resolveLoginPath()
}

// buildCommandEnv 异步构造修正 PATH 后的子进程环境。
// extraEnv 参数存储调用方希望额外注入的环境变量；runtime 参数允许测试注入平台、主目录与文件探测能力。
export async function buildCommandEnv(extraEnv = {}, runtime = {}) {
  // loginPath 存储登录 shell 解析出的真实 PATH。
  const loginPath = await resolveLoginPath()
  // platform 存储当前运行平台，决定是否探测 macOS 桌面应用内置 CLI。
  const platform = runtime.platform || process.platform
  // homeDir 存储当前用户主目录，用于定位用户级 Applications 目录。
  const homeDir = runtime.homeDir || homedir()
  // voltaBinPath 存储当前用户 Volta CLI 目录，测试和多用户环境不依赖固定主目录。
  const voltaBinPath = posix.join(homeDir, '.volta', 'bin')
  // fileExists 存储可执行文件存在性检查函数，测试时可注入隔离真实文件系统。
  const fileExists = runtime.fileExists || existsSync
  // pathDelimiter 存储目标平台的 PATH 分隔符，确保平台注入测试不受宿主系统影响。
  const pathDelimiter = platform === 'win32' ? win32.delimiter : posix.delimiter
  // commandPath 存储调用方 PATH、登录 shell PATH 或当前进程 PATH 中优先级最高的有效值。
  const commandPath = extraEnv.PATH || loginPath || process.env.PATH || ''
  // commandPathEntries 存储 PATH 中已有目录，用于调整优先级并追加桌面应用资源目录。
  const commandPathEntries = commandPath.split(pathDelimiter).filter(Boolean)

  // Bug 修复：登录 shell 同时加载 nvm 与 Volta 时可能优先命中 nvm 旧版本，导致更新结果与终端不一致；
  // 仅在 Volta 的 Claude shim 存在时置顶，未使用 Volta 的机器保持原 PATH 行为。
  // hasVoltaAiCli 标记 Volta 是否实际管理至少一个目标 AI CLI。
  const hasVoltaAiCli =
    platform === 'darwin' &&
    (fileExists(join(voltaBinPath, CLAUDE_EXECUTABLE_NAME)) ||
      fileExists(join(voltaBinPath, CODEX_EXECUTABLE_NAME)))
  if (hasVoltaAiCli) {
    const voltaIndex = commandPathEntries.indexOf(voltaBinPath)
    if (voltaIndex >= 0) {
      commandPathEntries.splice(voltaIndex, 1)
    }
    commandPathEntries.unshift(voltaBinPath)
  }

  if (platform === 'darwin') {
    // userApplicationsPath 存储当前用户安装 macOS 应用的目录。
    const userApplicationsPath = posix.join(homeDir, 'Applications')
    // codexResourcePaths 存储系统级与用户级桌面应用可能包含 Codex CLI 的资源目录。
    const codexResourcePaths = [
      ...MACOS_CODEX_APP_RESOURCE_PATHS,
      posix.join(userApplicationsPath, 'ChatGPT.app', 'Contents', 'Resources'),
      posix.join(userApplicationsPath, 'Codex.app', 'Contents', 'Resources'),
    ]
    // resourcePath 存储当前正在检查的桌面应用资源目录。
    for (const resourcePath of codexResourcePaths) {
      // bundledCodexPath 存储当前候选桌面应用内置 Codex CLI 的完整路径。
      const bundledCodexPath = posix.join(resourcePath, CODEX_EXECUTABLE_NAME)
      // Bug 修复：Finder 启动时登录 shell PATH 不包含桌面应用资源目录，导致概览误报未安装且 Marketplace spawn ENOENT；
      // 仅在内置 CLI 真实存在时补入 PATH，避免为普通安装或其他平台注入无效目录。
      if (
        fileExists(bundledCodexPath) &&
        !commandPathEntries.includes(resourcePath)
      ) {
        commandPathEntries.push(resourcePath)
      }
    }
  }

  // resolvedCommandPath 存储补充桌面应用内置 CLI 目录后的最终 PATH。
  const resolvedCommandPath = commandPathEntries.join(pathDelimiter)
  return {
    ...process.env,
    ...extraEnv,
    ...(resolvedCommandPath ? { PATH: resolvedCommandPath } : {}),
  }
}

// runCommand 执行外部命令并返回 stdout/stderr，失败时抛出包含输出的错误。
// bin 参数存储可执行文件名，args 参数存储命令参数，options 参数存储 cwd/env 等选项。
export async function runCommand(bin, args = [], options = {}) {
  // childEnv 存储修正 PATH 并合并调用方变量后的环境。
  const childEnv = await buildCommandEnv(options.env || {})
  return new Promise((resolve, reject) => {
    execFile(
      bin,
      args,
      {
        cwd: options.cwd,
        env: childEnv,
        maxBuffer: options.maxBuffer || 1024 * 1024 * 20,
        timeout: options.timeout,
      },
      (error, stdout, stderr) => {
        // stdoutText 存储标准输出文本。
        const stdoutText = String(stdout || '')
        // stderrText 存储标准错误文本。
        const stderrText = String(stderr || '')

        if (error) {
          // message 存储合并后的错误文本，尽量保留 CLI 原始诊断。
          const message = `${stdoutText}\n${stderrText}`.trim() || error.message
          // wrappedError 存储带 stdout/stderr 的错误对象，便于上层 fallback。
          const wrappedError = new Error(message)
          wrappedError.stdout = stdoutText
          wrappedError.stderr = stderrText
          reject(wrappedError)
          return
        }

        resolve({ stdout: stdoutText, stderr: stderrText })
      }
    )
  })
}

// spawnDetached 启动无需等待完成的外部命令。
// bin 参数存储可执行文件名，args 参数存储命令参数。
export async function spawnDetached(bin, args = []) {
  // childEnv 存储修正 PATH 并合并后的环境。
  const childEnv = await buildCommandEnv()
  // child 存储已启动的子进程句柄。
  const child = spawn(bin, args, {
    env: childEnv,
    detached: true,
    stdio: 'ignore',
  })
  child.unref()
}
