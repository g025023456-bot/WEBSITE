# Monday-morning reminder popup: send the newsletter (after approval).
Add-Type -AssemblyName PresentationFramework
$msg = [IO.File]::ReadAllText((Join-Path $PSScriptRoot "monday-reminder.txt"), [Text.Encoding]::UTF8)
[System.Windows.MessageBox]::Show($msg, "Newsletter", "OK", "Information") | Out-Null

# open the drafts folder so everything is at hand
$drafts = Join-Path (Split-Path $PSScriptRoot -Parent) "טיוטות"
if (Test-Path $drafts) { Start-Process explorer.exe $drafts }
