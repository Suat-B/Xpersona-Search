# Opens Cursor with Cutie loaded from source (no VSIX).
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts/open-extension-dev-host.ps1
#   powershell -ExecutionPolicy Bypass -File scripts/open-extension-dev-host.ps1 "C:\path\to\workspace"
$ErrorActionPreference = "Stop"
$extRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$workspace = if ($args.Count -ge 1 -and $args[0]) { $args[0] } else { (Get-Location).Path }
Write-Host "Extension (from source): $extRoot"
Write-Host "Workspace folder:        $workspace"
& cursor --extensionDevelopmentPath="$extRoot" "$workspace"
