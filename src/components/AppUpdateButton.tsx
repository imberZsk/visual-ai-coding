import { Button, message, Tooltip } from 'antd'
import { useEffect, useState } from 'react'

/** 自动检查并呈现应用更新按钮。 */
export default function AppUpdateButton() {
  // version 存储检测到的新版本号。
  const [version, setVersion] = useState<string | null>(null)
  // downloading 标记安装包是否正在下载。
  const [downloading, setDownloading] = useState(false)
  // downloaded 标记安装包是否已下载完成。
  const [downloaded, setDownloaded] = useState(false)
  useEffect(() => {
    // mounted 标记组件是否仍挂载。
    let mounted = true
    void window.api
      ?.checkAppUpdate()
      .then((result) => {
        if (mounted && result.available && result.version) {
          setVersion(result.version)
          setDownloaded(Boolean(result.downloaded))
        }
      })
      .catch(() => undefined)
    /** 清理异步检查副作用。 */
    return () => {
      mounted = false
    }
  }, [])
  /** 下载或安装更新；下载结束前保持 loading。 */
  const handleClick = async () => {
    if (downloaded) {
      await window.api?.installAppUpdate()
      return
    }
    setDownloading(true)
    try {
      await window.api?.downloadAppUpdate()
      setDownloaded(true)
      message.success('更新已下载，可以安装')
    } catch (error) {
      message.error(error instanceof Error ? error.message : '更新下载失败')
    } finally {
      setDownloading(false)
    }
  }
  if (!version) return null
  return (
    <Tooltip title={`新版本 v${version}`}>
      <Button
        className="fixed right-4 top-4 z-50"
        size="small"
        type="primary"
        loading={downloading}
        onClick={() => void handleClick()}
      >
        {downloaded ? '安装并重启' : '下载更新'}
      </Button>
    </Tooltip>
  )
}
