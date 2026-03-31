param(
  [Parameter(Mandatory = $true)]
  [string]$Task,

  [string]$Mode = "debug",

  [string]$Workspace,

  [string]$Out,

  [switch]$UnsafeCwd
)

$args = @(
  "--prefix", "sdk/playground-ai-cli",
  "exec", "binary",
  "--",
  "debug-runtime",
  $Task,
  "--mode", $Mode
)

if ($Workspace) {
  $args += @("--workspace", $Workspace)
}

if ($Out) {
  $args += @("--out", $Out)
}

if ($UnsafeCwd) {
  $args += "--unsafe-cwd"
}

Write-Host "Running Binary IDE safe runtime debug..." -ForegroundColor Cyan
Write-Host ("npm " + ($args -join " ")) -ForegroundColor DarkGray

& npm @args
$exitCode = $LASTEXITCODE

if ($exitCode -ne 0) {
  exit $exitCode
}
