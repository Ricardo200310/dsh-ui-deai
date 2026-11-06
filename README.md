# dsh-ui-deai

[![CI](https://github.com/Ricardo200310/dsh-ui-deai/actions/workflows/ci.yml/badge.svg)](https://github.com/Ricardo200310/dsh-ui-deai/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

DeepSeek Harness 的界面审查插件：扫描前端源码里的模板化表达与交互问题，定位到 `文件:行`，记录设计约束与验收条件，并在浮窗面板中跟踪处理进度。

![审查面板](docs/panel.png)

> **English** — dsh-ui-deai is a plugin for [DeepSeek Harness](https://github.com/deepseek-ai) that scans front-end sources for template-generated UI patterns (gradient text, colored glows, pill everything, emoji icons, filler copy, `transition-all`), reports every hit as `file:line` with a concrete fix, and keeps a design direction plus per-category progress. It can also capture before/after screenshots and a staged MP4. The interface is Chinese. The scan is a text heuristic: the score is a review aid, not a design verdict, and the plugin never edits your code by itself.

## 能力

- `ui_deai_audit`：源码扫描，返回文件位置、规则提示、建议与静态分数。
- `ui_deai_direction`：记录产品用途、使用者、页面任务、保留约束、调整计划和验收条件。
- `ui_deai_pass`：管理内容、层级、一致性、交互、可访问性、装饰六个分类的状态。
- `ui_deai_snapshot`：保存网页 HTML 与 PNG，区分调整前后。
- `ui_deai_story`：将阶段页面清单渲染成 MP4。
- `/dsh-ui-deai [源码路径]`：从命令行发起审查。
- 右下角浮窗与设置页：查看问题、设计方向、进度、截图和视频。

插件提供审查与记录工具；目标项目的代码调整由使用技能的助手完成。状态独立保存在 `$DSH_HOME/dsh-ui-deai/`，默认位于用户目录的 `.dsh/dsh-ui-deai/`。

## 环境要求

- Node.js ≥ 22.12。
- 一个提供 `tools`、`skills`、`commands`、`webServer`、`slots` 服务的 DSH 宿主。React 由宿主提供。

## 安装

在此包所在目录执行：

```powershell
node tools/install-profile.mjs desktop
```

安装器会备份 profile 配置、创建指向当前目录的链接，并将 `dsh-ui-deai` 加入 `dsh.profile.bundles`。之后重启宿主或重新加载插件。请保留这个目录，链接安装依赖它；移动目录后需要重新执行安装器。

本项目的文件夹位置可以自选；显示名称、包名、技能名与命令名均为 `dsh-ui-deai`。若此前安装过另一个界面审查插件，先在宿主中停用该插件，避免同时显示两个面板。

## 使用

```text
ui_deai_audit({"path":"D:\\work\\app\\src\\page.tsx"})
ui_deai_direction({"audience":"团队管理员","task":"确认待处理事项","keep":["保留现有品牌色"],"acceptance":["键盘可完成主要操作"]})
ui_deai_pass({"pass":"interaction","status":"done","note":"补全错误和重试反馈"})
```

`path` 会被解析为绝对路径，相对路径以**宿主进程的工作目录**为基准；不确定时请直接传绝对路径。

同一目标重新扫描会保留已记录的方向和进度。切换到其他文件、目录或 include 范围会重置当前审查。失败的扫描不会覆盖已有结果。

截图需要工作项目安装 Playwright 与 Chromium：

```powershell
npm install --no-save playwright
npx playwright install chromium
```

视频另需 ffmpeg。视频清单格式和截图限制见 [捕获说明](skills/dsh-ui-deai/references/capture.md)。

## 评分边界

分数越高，命中的静态规则越少。100 分只代表本次没有触发规则，不能证明界面设计、可访问性或业务功能已经通过验收。扫描使用文本启发式，不解析组件树、不计算对比度、不证明符合任何可访问性标准；报告会标记跳过文件及扫描范围限制。

- 共 15 条规则，归入内容、层级、一致性、交互、可访问性、装饰六个分类。
- 默认最多扫描 400 个文件，单文件上限 512 KiB，目录深度上限 16。
- 自动排除隐藏目录、依赖、构建产物、压缩代码和声明文件。
- `.ui-deai-ignore` 支持一行一个路径模式、`*` 通配符和 `#` 注释，不是完整的 Git ignore 语法。
- 评分按规则严重度与命中次数累计扣分；扫描失败或没有可扫描文件时记 0 分，不视为通过。

## HTTP API

| 路由 | 用途 |
| --- | --- |
| GET `/dsh-ui-deai/api/state` | 当前状态 |
| POST `/dsh-ui-deai/api/audit` | `{ path?, include?, maxFiles? }` |
| POST `/dsh-ui-deai/api/pass` | `{ pass, status, note? }` |
| POST `/dsh-ui-deai/api/clear` | 清空当前审查记录 |
| GET `/dsh-ui-deai/api/report.md` | Markdown 报告 |
| GET `/dsh-ui-deai/api/artifact/<name>` | PNG 或 MP4，支持单段 Range 请求 |

接口供本地受信任的 DSH 环境使用，不单独实现用户认证；不要把它直接暴露到公共网络。清空记录不会删除此前生成的文件。

## 开发与验证

```powershell
npm install
npm run check
npm test
npm run test:client
```

`test:client` 使用真实 React 与 ReactDOM 服务端渲染，并检查两个 UI 入口均有内容。可选 `npm run test:browser` 使用 Playwright 验证实际浏览器面板及截图；ffmpeg 可用时额外验证视频。运行前请按上面的方式安装 Playwright 与 Chromium。

`npm run preview` 从本地示例生成 `.preview/` 静态预览。它使用真实 React，不需要真实 DSH 状态。测试也可从 `.test-runtime/node_modules` 解析 React 依赖。

发布内容由 package.json 的 `files` 白名单控制：开发缓存、测试和预览不随 npm 包发布，因此 `npm test`、`npm run check`、`npm run preview` 需要在源码仓库中运行。

发布到 npm 与 GitHub 的完整步骤、预检脚本和回滚方式见 [docs/RELEASING.md](docs/RELEASING.md)。`npm run release:check` 会在上传前检查版本、tag、远端、npm 登录状态和测试；`npm publish` 也会由 `prepublishOnly` 自动执行 `check`、`test` 与 `test:client`。

## 目录

- `lib/`：宿主入口、浏览器面板和审查引擎。
- `skills/dsh-ui-deai/`：技能说明、复核资料与捕获脚本。
- `assets/`：项目 SVG 图标。
- `docs/`：README 截图。
- `test/`：规则、状态、HTTP、真实 React 及浏览器验证。
- `tools/`：安装、语法检查、预览等开发工具。

## 已知限制

- 规则基于文本启发式，可能误报或漏报；跨组件标签、动态样式和运行时内容需要人工复核。
- 截图保存的是当前视口的静态副本：伪元素、网页字体、视频和复杂画布可能与原页面不同，表单不保留原应用行为。
- 安装器在 Windows 上创建 junction，移动或删除项目目录前请先在宿主中停用插件。
- 界面与文档为中文。

## 许可

本项目采用 MIT。外部运行依赖的许可见各依赖自身声明；集成关系见 [NOTICE.md](NOTICE.md)。
