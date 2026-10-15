$ErrorActionPreference = 'Stop'
$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object System.Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)) {
 $installer = Start-Process powershell.exe -Verb RunAs -WindowStyle Hidden -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',('"' + $PSCommandPath + '"')) -Wait -PassThru
 exit $installer.ExitCode
}
$installDir = Join-Path $env:LOCALAPPDATA 'DistriHub-Print'
New-Item -ItemType Directory -Path $installDir -Force | Out-Null
$connectorPath = Join-Path $installDir 'Conector.ps1'
# Stop only this installed connector so an upgrade actually replaces the listener.
$connectorPattern = '(?i)-File\s+"?' + [regex]::Escape($connectorPath) + '"?(?:\s|$)'
Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" | Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -match $connectorPattern } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop }
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'Conector.ps1') -Destination (Join-Path $installDir 'Conector.ps1') -Force
Unblock-File -LiteralPath (Join-Path $installDir 'Conector.ps1')
& netsh http add urlacl url=http://localhost:17891/ ("user=" + $identity.Name) | Out-Null
$startupDir = [Environment]::GetFolderPath('Startup')
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut((Join-Path $startupDir 'Conector DistriHub.lnk'))
$shortcut.TargetPath = Join-Path $PSHOME 'powershell.exe'
$shortcut.Arguments = '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + (Join-Path $installDir 'Conector.ps1') + '"'
$shortcut.WindowStyle = 7
$shortcut.Save()
Start-Process -FilePath $shortcut.TargetPath -ArgumentList $shortcut.Arguments -WindowStyle Hidden
Write-Host 'Conector v2 instalado. No DistriHub, busque a impressora e teste o modo personalizado direto.'
