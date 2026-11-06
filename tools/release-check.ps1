<#
.SYNOPSIS
  dsh-ui-deai 发布前预检。只做检查，不推送、不发布。

.DESCRIPTION
  依次检查：
  1. 工作区干净、分支为 main、tag v<version> 指向 HEAD
  2. origin 可达，并显示远端 main 与本地 HEAD 的关系
  3. npm 已登录，且目标版本尚未发布
  4. npm run check / test / test:client 全部通过
  全部通过后打印上传命令；任一项失败以退出码 1 结束。

.EXAMPLE
  npm run release:check

.EXAMPLE
  pwsh -NoProfile -File tools/release-check.ps1 -SkipTests
#>
[CmdletBinding()]
param(
  [switch]$SkipTests
)

$ErrorActionPreference = 'Stop'
if (Test-Path variable:PSNativeCommandUseErrorActionPreference) {
  $PSNativeCommandUseErrorActionPreference = $false
}

$root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $root

# 通过 npm.cmd 调用，避免 & npm 命中 npm.ps1 时参数被错误传递。
$npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $npmCommand) { $npmCommand = Get-Command npm -ErrorAction SilentlyContinue }
if (-not $npmCommand) {
  Write-Host '找不到 npm，请确认 Node.js 已安装并在 PATH 中。' -ForegroundColor Red
  exit 1
}
$npmExe = $npmCommand.Source

$script:failed = $false

function Write-Step([string]$Text) {
  Write-Host ''
  Write-Host "== $Text ==" -ForegroundColor Cyan
}
function Write-Pass([string]$Text) { Write-Host "  OK   $Text" -ForegroundColor Green }
function Write-Warn([string]$Text) { Write-Host "  WARN $Text" -ForegroundColor Yellow }
function Write-Fail([string]$Text) {
  Write-Host "  FAIL $Text" -ForegroundColor Red
  $script:failed = $true
}
function Invoke-Capture([string]$File, [string[]]$Arguments) {
  try {
    $output = & $File @Arguments 2>&1 | Out-String
    return [pscustomobject]@{ Code = $LASTEXITCODE; Text = $output.Trim() }
  } catch {
    return [pscustomobject]@{ Code = -1; Text = $_.Exception.Message }
  }
}

# ---- 1. 本地状态 ----
Write-Step '1/4 本地状态'

$status = Invoke-Capture git @('status', '--porcelain')
if ($status.Code -ne 0) {
  Write-Fail "git status 执行失败：$($status.Text)"
} elseif ($status.Text) {
  Write-Fail "工作区不干净，请先提交或清理：`n$($status.Text)"
} else {
  Write-Pass '工作区干净'
}

$branch = Invoke-Capture git @('rev-parse', '--abbrev-ref', 'HEAD')
if ($branch.Code -ne 0) {
  Write-Fail '无法读取当前分支'
} elseif ($branch.Text -ne 'main') {
  Write-Warn "当前分支为 $($branch.Text)，发布流程假设 main"
} else {
  Write-Pass '当前分支 main'
}

$pkg = Get-Content -LiteralPath (Join-Path $root 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$version = [string]$pkg.version
$tag = "v$version"
Write-Host "  版本：$($pkg.name)@$version（tag $tag）"

$head = Invoke-Capture git @('rev-parse', 'HEAD')
$tagCommit = Invoke-Capture git @('rev-list', '-n', '1', $tag)
if ($tagCommit.Code -ne 0) {
  Write-Fail "缺少 tag $tag。创建：git tag -a $tag -m `"$($pkg.name) $version`""
} elseif ($head.Code -ne 0) {
  Write-Fail '无法读取 HEAD'
} elseif ($tagCommit.Text -ne $head.Text) {
  Write-Fail "tag $tag 指向 $($tagCommit.Text.Substring(0, 7))，不是 HEAD $($head.Text.Substring(0, 7))"
} else {
  Write-Pass "tag $tag 指向 HEAD"
}

# ---- 2. 远端 ----
Write-Step '2/4 远端'

$remote = Invoke-Capture git @('remote', 'get-url', 'origin')
if ($remote.Code -ne 0) {
  Write-Fail '没有 origin 远端'
} else {
  Write-Pass "origin = $($remote.Text)"
}

$heads = Invoke-Capture git @('ls-remote', '--heads', 'origin')
if ($heads.Code -ne 0) {
  # GitHub 连接偶发 reset，重试一次再判定失败。
  Start-Sleep -Seconds 2
  $heads = Invoke-Capture git @('ls-remote', '--heads', 'origin')
}
if ($heads.Code -ne 0) {
  Write-Fail "无法访问 origin，请检查网络或推送凭据：$($heads.Text)"
} else {
  $mainLine = @($heads.Text -split "`n" | Where-Object { $_ -match 'refs/heads/main\s*$' })
  if ($mainLine.Count -eq 0) {
    Write-Pass '远端尚无 main 分支，将首次推送'
  } else {
    $remoteSha = ($mainLine[0] -split '\s+')[0]
    if ($head.Code -eq 0 -and $remoteSha -eq $head.Text) {
      Write-Pass '远端 main 与本地 HEAD 一致'
    } else {
      Write-Warn "远端 main 为 $($remoteSha.Substring(0, 7))，推送会更新远端"
    }
  }
}

# ---- 3. 本地验证 ----
Write-Step '3/4 本地验证'

if ($SkipTests) {
  Write-Warn '已跳过 check / test / test:client（-SkipTests）'
} else {
  foreach ($name in @('check', 'test', 'test:client')) {
    $run = Invoke-Capture $npmExe @('run', $name)
    if ($run.Code -ne 0) {
      Write-Fail "npm run $name 失败：`n$($run.Text)"
    } else {
      Write-Pass "npm run $name"
    }
  }
}

# ---- 4. npm ----
Write-Step '4/4 npm 登录与版本'

$who = Invoke-Capture $npmExe @('whoami')
if ($who.Code -ne 0) {
  $firstLine = ($who.Text -split "`n")[0].Trim()
  Write-Fail "未登录 npm，请先执行 npm login（当前：$firstLine）"
} else {
  Write-Pass "npm 已登录：$($who.Text)"
}

$view = Invoke-Capture $npmExe @('view', "$($pkg.name)@$version", 'version')
if ($view.Code -eq 0) {
  Write-Fail "npm 上已存在 $($pkg.name)@$version，请提升版本后再发布"
} elseif ($view.Text -match 'E404') {
  Write-Pass "npm 上不存在 $($pkg.name)@$version，可发布"
} else {
  Write-Fail "无法查询 npm registry：`n$($view.Text)"
}

# ---- 结论 ----
Write-Step '结论'
if ($script:failed) {
  Write-Host '预检未通过：修复上面的 FAIL 后重新执行 npm run release:check。' -ForegroundColor Red
  exit 1
}

Write-Host '预检通过。按顺序执行：' -ForegroundColor Green
Write-Host ''
Write-Host '  git push -u origin main'
Write-Host "  git push origin $tag"
Write-Host '  # 等 GitHub Actions 通过：https://github.com/Ricardo200310/dsh-ui-deai/actions'
Write-Host '  npm publish'
Write-Host "  npm view $($pkg.name) version"
Write-Host ''
exit 0
