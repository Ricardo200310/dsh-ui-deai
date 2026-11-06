# 截图与阶段演示

## 网页保存

调用 `ui_deai_snapshot`，指定 HTTP(S) URL、HTML 输出路径、主题、视口以及 before/after。

输出同名 HTML 和 PNG。HTML 将当前视口的计算样式内联，并尝试内联图片和背景资源；无法下载的资源保留绝对地址并写入脚本日志。脚本、内嵌页面和外部样式表不会保留，表单不提供原应用功能。伪元素、网页字体、视频和复杂画布可能与原页面不同。保存后以 PNG 为参照检查 HTML。

目标页面应是用户允许保存的内容。需要登录的页面应由用户提供可访问的预览地址，本工具不读取浏览器个人资料。

## 视频清单

`ui_deai_story` 的 file 参数指向 JSON，路径相对于该 JSON：

```json
{
  "width": 1080,
  "height": 1080,
  "steps": [
    {"label": "调整前", "file": "before.html", "duration": 2},
    {"label": "梳理信息层级", "file": "hierarchy.html", "duration": 2},
    {"label": "完成", "file": "after.html", "duration": 3}
  ]
}
```

清单允许 2–12 个阶段，每阶段 0.5–15 秒。工具依次渲染各页面、加上阶段标签，再编码为 MP4；它展示阶段静态画面，不自动推导中间改动或生成 CSS 变形动画。`wide: true` 使用 1920×1080。

Playwright 与 Chromium 由工作项目提供；ffmpeg 必须在 PATH 中。特殊环境可设置 `CHROME_PATH`、`UI_DEAI_FFMPEG_PATH`，或将 `UI_DEAI_PLAYWRIGHT_PATH` 指向能够解析 Playwright 的 package.json。宿主使用 Electron 时可用 `DSH_NODE_PATH` 指定 Node。
