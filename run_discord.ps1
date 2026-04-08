# Open Discord using PowerShell
$discordPath = "$env:LOCALAPPDATA\Discord\Update.exe"
if (Test-Path $discordPath) {
    Start-Process -FilePath $discordPath -ArgumentList "--processStart", "Discord.exe"
    Write-Host "Discord is starting..."
} else {
    Write-Host "Discord not found at expected location. Trying alternative locations..."
    
    # Try alternative Discord locations
    $altPaths = @(
        "$env:LOCALAPPDATA\Discord\app-*\Discord.exe",
        "$env:APPDATA\Discord\Discord.exe",
        "C:\Program Files\Discord\Discord.exe",
        "C:\Program Files (x86)\Discord\Discord.exe"
    )
    
    $found = $false
    foreach ($path in $altPaths) {
        $files = Get-ChildItem -Path $path -ErrorAction SilentlyContinue
        if ($files) {
            Start-Process -FilePath $files[0].FullName
            Write-Host "Discord started from: $($files[0].FullName)"
            $found = $true
                            break
        }
    }
    
    if (-not $found) {
        Write-Host "Discord not found. Please install Discord or check if it's already running."
    }
}