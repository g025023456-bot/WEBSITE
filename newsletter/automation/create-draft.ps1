# Weekly newsletter draft generator. Runs headless Claude with the prompt
# from draft-prompt.md. Scheduled for Sunday mornings via Task Scheduler.
$ErrorActionPreference = "Stop"

# repo root = two levels above this script (automation -> newsletter -> root)
$repo = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
Set-Location $repo

$logDir = Join-Path $PSScriptRoot "logs"
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }
$log = Join-Path $logDir ("{0:yyyy-MM-dd}.log" -f (Get-Date))

# Find the Claude CLI: standalone install first, then the VS Code extension binary
$exe = $null
$cmd = Get-Command claude -ErrorAction SilentlyContinue
if ($cmd) { $exe = $cmd.Source }
if (-not $exe) {
    $ext = Get-ChildItem "$env:USERPROFILE\.vscode\extensions\anthropic.claude-code-*\resources\native-binary\claude.exe" -ErrorAction SilentlyContinue |
        Sort-Object FullName -Descending | Select-Object -First 1
    if ($ext) { $exe = $ext.FullName }
}
if (-not $exe) {
    "ERROR: claude CLI not found" | Out-File $log -Encoding utf8
    exit 1
}

# UTF-8 for the Hebrew prompt piped over stdin
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$OutputEncoding = [Text.Encoding]::UTF8

git pull 2>&1 | Out-File $log -Encoding utf8 -Append

$prompt = [IO.File]::ReadAllText((Join-Path $PSScriptRoot "draft-prompt.md"), [Text.Encoding]::UTF8)

$prompt | & $exe -p --permission-mode acceptEdits --allowedTools "WebSearch,WebFetch" 2>&1 |
    Out-File $log -Encoding utf8 -Append

"exit code: $LASTEXITCODE" | Out-File $log -Encoding utf8 -Append
