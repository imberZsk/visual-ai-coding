# 图标文件目录

此目录用于存放应用图标文件。

## 所需图标

Tauri 需要以下图标文件：

- `32x32.png` - 32x32 像素 PNG 图标
- `128x128.png` - 128x128 像素 PNG 图标
- `128x128@2x.png` - 256x256 像素 PNG 图标（高分辨率）
- `icon.icns` - macOS 应用图标
- `icon.ico` - Windows 应用图标

## 生成图标

你可以使用 Tauri CLI 自动生成所有需要的图标格式：

```bash
npm run tauri icon /path/to/your/icon.png
```

注意：源图标应该是至少 1024x1024 像素的 PNG 文件。
