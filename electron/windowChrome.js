// 自定义窗口外观配置：移除重复原生标题栏，同时保留各平台系统窗口控件。

// MACOS_TRAFFIC_LIGHT_POSITION 存储隐藏标题栏后 macOS 交通灯的位置。
const MACOS_TRAFFIC_LIGHT_POSITION = { x: 16, y: 16 }

/**
 * 获取当前平台使用的 Electron 标题栏配置。
 * @param {NodeJS.Platform} platform - Electron 当前运行平台
 * @returns {object} 可合并到 BrowserWindow 构造参数的标题栏选项
 */
export function getWindowChromeOptions(platform = process.platform) {
  if (platform === 'darwin') {
    return {
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: MACOS_TRAFFIC_LIGHT_POSITION,
    }
  }

  return {
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#141414',
      symbolColor: '#f5f5f5',
      height: 40,
    },
  }
}
