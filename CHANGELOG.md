# 变更记录

本项目遵循语义化版本；0.x 期间接口仍可能调整。

## 1.0.0 — 2026-11-06

首个公开版本。

- 新增 `ui_deai_audit`：15 条规则、6 个分类的源码静态扫描，输出 `文件:行:列`、建议与分数。
- 新增 `ui_deai_direction`、`ui_deai_pass`：记录设计方向与分类处理进度，保留修改或保留理由。
- 新增 `ui_deai_snapshot`、`ui_deai_story`：保存网页 HTML/PNG，或将阶段清单渲染为 MP4。
- 新增 `/dsh-ui-deai [源码路径]` 命令、浮窗面板、设置页与 HTTP API。
- 审查状态保存在 `$DSH_HOME/dsh-ui-deai/`：同一目标重扫保留方向与进度，换目标重置。
- 面板补充 `aria-modal`、焦点进入/归还与 Tab 焦点循环；轮询在内容未变化时不再重渲染。
- 工具注册纳入 `ctx.effect`，重新加载插件时正确释放。
- 修复 Windows 上安装器把 junction 判为普通目录、导致重复安装误报的问题。

### 已知限制

- 扫描为文本启发式，不解析组件树、不计算对比度；分数不代表设计或可访问性验收。
- 截图与视频功能需要 Playwright、Chromium，视频另需 ffmpeg。
