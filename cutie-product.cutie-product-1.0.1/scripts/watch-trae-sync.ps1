param(
  [switch]$Once
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$syncScript = Join-Path $PSScriptRoot 'sync-trae-extension.cmd'
$debounceMs = 700

function Invoke-CompileAndSync {
  $timestamp = Get-Date -Format 'HH:mm:ss'
  Write-Host "[$timestamp] compiling Cutie..." -ForegroundColor Cyan
  & npm.cmd run compile
  $compileExit = $LASTEXITCODE

  if ($compileExit -ne 0) {
    Write-Host "[$timestamp] compile failed; syncing last good output anyway." -ForegroundColor Yellow
  }

  & cmd.exe /c $syncScript
  $syncExit = $LASTEXITCODE
  if ($syncExit -ne 0) {
    throw "Trae sync failed with exit code $syncExit."
  }

  $endStamp = Get-Date -Format 'HH:mm:ss'
  if ($compileExit -eq 0) {
    Write-Host "[$endStamp] Trae is synced and ready for reload." -ForegroundColor Green
  } else {
    Write-Host "[$endStamp] Trae synced, but TypeScript still has errors." -ForegroundColor Yellow
  }
}

function Register-Watcher {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Name,
    [bool]$IncludeSubdirectories = $false
  )

  if (-not (Test-Path $Path)) {
    return $null
  }

  $watcher = New-Object System.IO.FileSystemWatcher
  $watcher.Path = $Path
  $watcher.Filter = '*'
  $watcher.IncludeSubdirectories = $IncludeSubdirectories
  $watcher.NotifyFilter = [System.IO.NotifyFilters]'FileName, DirectoryName, LastWrite, CreationTime, Size'
  $watcher.EnableRaisingEvents = $true

  $ids = @(
    "trae-watch-$Name-changed",
    "trae-watch-$Name-created",
    "trae-watch-$Name-deleted",
    "trae-watch-$Name-renamed"
  )

  Register-ObjectEvent -InputObject $watcher -EventName Changed -SourceIdentifier $ids[0] | Out-Null
  Register-ObjectEvent -InputObject $watcher -EventName Created -SourceIdentifier $ids[1] | Out-Null
  Register-ObjectEvent -InputObject $watcher -EventName Deleted -SourceIdentifier $ids[2] | Out-Null
  Register-ObjectEvent -InputObject $watcher -EventName Renamed -SourceIdentifier $ids[3] | Out-Null

  return [pscustomobject]@{
    Watcher = $watcher
    EventIds = $ids
  }
}

$registrations = @()

try {
  Invoke-CompileAndSync
  if ($Once) {
    exit 0
  }

  $registrations += Register-Watcher -Path (Join-Path $repoRoot 'src') -Name 'src' -IncludeSubdirectories $true
  $registrations += Register-Watcher -Path (Join-Path $repoRoot 'assets') -Name 'assets' -IncludeSubdirectories $true
  $registrations += Register-Watcher -Path (Join-Path $repoRoot 'resources') -Name 'resources' -IncludeSubdirectories $true
  $registrations += Register-Watcher -Path (Join-Path $repoRoot 'tests') -Name 'tests' -IncludeSubdirectories $true
  $registrations += Register-Watcher -Path $repoRoot -Name 'root'
  $registrations = @($registrations | Where-Object { $_ -ne $null })

  Write-Host "Watching Cutie for Trae sync..." -ForegroundColor Cyan
  Write-Host "Save changes, then reload Trae when you want to see them." -ForegroundColor DarkGray
  Write-Host "Press Ctrl+C to stop." -ForegroundColor DarkGray

  $pending = $false
  $lastEvent = Get-Date

  while ($true) {
    $event = Wait-Event -Timeout 1
    if ($event) {
      $sourceArgs = $event.SourceEventArgs
      $fullPath = ''
      if ($sourceArgs -and $sourceArgs.PSObject.Properties['FullPath']) {
        $fullPath = [string]$sourceArgs.FullPath
      } elseif ($sourceArgs -and $sourceArgs.PSObject.Properties['OldFullPath']) {
        $fullPath = [string]$sourceArgs.OldFullPath
      }

      $leaf = if ($fullPath) { Split-Path $fullPath -Leaf } else { '' }
      $isRootMetadata = $leaf -in @('package.json', 'tsconfig.json')
      $shouldIgnore =
        ($fullPath -match '\\out\\') -or
        ($fullPath -match '\\node_modules\\') -or
        ($fullPath -match '\\\.git\\') -or
        ($fullPath -match '\\\.vscode\\') -or
        ($fullPath -match '\\\.cursor\\') -or
        ($leaf -like '*.vsix') -or
        ($leaf -eq '.vsixmanifest') -or
        ($fullPath -eq $repoRoot -and -not $isRootMetadata)

      Remove-Event -EventIdentifier $event.EventIdentifier | Out-Null

      if ($shouldIgnore) {
        continue
      }

      $pending = $true
      $lastEvent = Get-Date
      continue
    }

    if ($pending -and ((Get-Date) - $lastEvent).TotalMilliseconds -ge $debounceMs) {
      $pending = $false
      Invoke-CompileAndSync
    }
  }
}
finally {
  foreach ($registration in $registrations) {
    foreach ($eventId in $registration.EventIds) {
      Unregister-Event -SourceIdentifier $eventId -ErrorAction SilentlyContinue
      Remove-Event -SourceIdentifier $eventId -ErrorAction SilentlyContinue
    }
    if ($registration.Watcher) {
      $registration.Watcher.EnableRaisingEvents = $false
      $registration.Watcher.Dispose()
    }
  }
}
