/** 从动态导入结果中解析更新器；`updaterModule` 是 CommonJS/ESM 模块命名空间。 */
export function resolveAutoUpdater(updaterModule) {
  // commonJsExports 存储 CommonJS 包在不同打包环境中的导出对象。
  const commonJsExports =
    updaterModule?.default || updaterModule?.['module.exports']
  // Bug 修复：打包后更新器可能只挂在默认导出下，不能假设命名导出始终存在。
  return updaterModule?.autoUpdater || commonJsExports?.autoUpdater || null
}

/** 加载打包环境更新器；参数分别为导入函数和是否已打包。 */
export async function loadAutoUpdater(importUpdater, isPackaged) {
  if (!isPackaged) return null
  try {
    // updaterModule 存储动态导入得到的模块命名空间。
    const updaterModule = await importUpdater()
    return resolveAutoUpdater(updaterModule)
  } catch {
    // 更新能力加载失败不能阻断桌面应用启动。
    return null
  }
}

/** 注册应用更新 IPC；参数分别为 IPC 注册器、更新器和是否已打包。 */
export function registerAppUpdater(ipcMain, updater, isPackaged) {
  // downloaded 存储安装包是否已完整下载。
  let downloaded = false
  // downloadPromise 存储进行中的下载任务，避免重复下载。
  let downloadPromise = null
  if (updater) {
    updater.autoDownload = false
    updater.autoInstallOnAppQuit = false
  }
  ipcMain.handle('app-update:check', async () => {
    // 业务场景：开发环境不访问发布服务。
    if (!isPackaged || !updater) return { available: false }
    try {
      // result 存储 GitHub Release 检查结果。
      const result = await updater.checkForUpdates()
      // version 存储远端最新版本号。
      const version = result?.updateInfo?.version
      return result?.isUpdateAvailable && version
        ? { available: true, version, downloaded }
        : { available: false }
    } catch {
      // 公开 Release 只保留用户安装包时可能没有更新元数据，检查失败应降级而不是影响应用使用。
      return { available: false }
    }
  })
  ipcMain.handle('app-update:download', async () => {
    if (!updater) throw new Error('应用更新模块不可用')
    // 业务场景：重复点击复用同一下载任务。
    if (!downloadPromise) {
      downloadPromise = updater
        .downloadUpdate()
        .then(() => {
          downloaded = true
          return { downloaded: true }
        })
        .finally(() => {
          downloadPromise = null
        })
    }
    return downloadPromise
  })
  ipcMain.handle('app-update:install', () => {
    if (!updater) throw new Error('应用更新模块不可用')
    if (!downloaded) throw new Error('更新尚未下载完成')
    updater.quitAndInstall(false, true)
    return true
  })
}
