# 发布指南

本项目同时发布到 GitHub 与 npm：先推送仓库和 tag，等 CI 通过后再发布 npm 包。

## 一次性准备

1. Node.js ≥ 22.12、npm ≥ 10。
2. 登录 npm：`npm login`，然后用 `npm whoami` 确认能看到用户名。
3. 确认 GitHub 推送凭据可用（HTTPS 下通常是 Git Credential Manager）：`git ls-remote --heads origin` 不报错即可。
4. 在仓库根目录安装开发依赖：`npm install`。`prepublishOnly` 会运行测试，需要仓库里能解析到 React。

## 每次发布

### 1. 确认版本

- `package.json` 的 `version` 与 `CHANGELOG.md` 对应小节一致。
- tag 已创建并指向 HEAD。本仓库的 `v1.0.0` 已就绪；从零开始或需要重建时执行：

  ```powershell
  git tag -a v1.0.0 -m "dsh-ui-deai 1.0.0"
  ```

  如果内容在打 tag 后又改过、且该版本尚未发布，把 tag 移到新提交：

  ```powershell
  git tag -f -a v1.0.0 -m "dsh-ui-deai 1.0.0"
  ```

  版本一旦发布到 npm，就不要再移动或复用这个 tag / 版本号。

### 2. 预检

```powershell
npm run release:check
```

脚本会检查：工作区干净、分支为 main、tag 指向 HEAD、origin 可达、npm 已登录、目标版本未被占用，并运行 `npm run check`、`npm test`、`npm run test:client`。任一项失败会以退出码 1 结束，并打印需要修复的项。

只想快速检查元信息、不跑测试时可用 `-SkipTests`：

```powershell
pwsh -NoProfile -File tools/release-check.ps1 -SkipTests
```

### 3. 推送仓库与 tag

```powershell
git push -u origin main
git push origin v1.0.0
```

首次推送后打开 <https://github.com/Ricardo200310/dsh-ui-deai/actions>，确认 ubuntu 与 windows 两个任务的 `check`、`test`、`test:client` 全部通过，再继续发布。

### 4. 发布 npm

```powershell
npm publish
```

`prepublishOnly` 会再次执行 `check`、`test`、`test:client`，失败则中止发布。若账号开启 2FA，按提示输入 OTP，也可以：

```powershell
npm publish --otp=123456
```

> 不要在 DSH 的沙箱会话里执行发布：npm 需要写用户缓存，沙箱会报 `EPERM`。请使用普通终端。

发布前想先看会打包哪些文件，可以执行 `npm publish --dry-run` 或 `npm pack --dry-run`。

### 5. 验证

```powershell
npm view dsh-ui-deai version
npm view dsh-ui-deai dist.tarball
```

再在临时目录安装一次，确认文件白名单完整：

```powershell
$dir = Join-Path $env:TEMP ('dsh-ui-deai-check-' + [guid]::NewGuid())
New-Item -ItemType Directory $dir | Out-Null
Push-Location $dir
npm init -y | Out-Null
npm install dsh-ui-deai@1.0.0
node -e "import('dsh-ui-deai').then(m => console.log(m.name, m.inject))"
Pop-Location
Remove-Item -Recurse -Force $dir
```

### 6. GitHub Release（可选）

在仓库的 Releases 页面基于 `v1.0.0` 创建发布，或使用 GitHub CLI：

```powershell
gh release create v1.0.0 --title "dsh-ui-deai 1.0.0" --notes-file CHANGELOG.md
```

## 回滚

- **npm**：发布后 72 小时内可 `npm unpublish dsh-ui-deai@1.0.0`；超过 72 小时只能 `npm deprecate` 并发布新版本。不要复用已发布的版本号。
- **tag**：确认远端 tag 需要撤销时：

  ```powershell
  git push origin :refs/tags/v1.0.0
  git tag -d v1.0.0
  ```

  修复后重新打 tag 并推送。
- **GitHub**：强推前先确认没有其他人基于该提交工作；本项目尚未发布时可以直接修正历史。

## 注意

- 不要把 npm token 写进仓库；含 token 的 `.npmrc` 不要提交。
- `package.json` 的 `files` 白名单决定发布内容，测试、`.test-runtime/`、`.profile-backups/` 和 `.tmp/` 不会进入 npm 包。
- `docs/` 会随包发布，因此本文件也会出现在 npm 包里。
- 若 `git push` 或预检的 `git ls-remote` 报 `Connection was reset` / 超时，先确认网络或代理可用（例如 `git config --global http.proxy http://127.0.0.1:7890`），再重试。
