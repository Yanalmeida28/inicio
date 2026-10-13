$ErrorActionPreference = 'Stop'
$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object System.Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)) {
 Start-Process powershell.exe -Verb RunAs -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',('"' + $PSCommandPath + '"')) -Wait
 exit
}
$installDir = Join-Path $env:LOCALAPPDATA 'DistriHub-Print'
New-Item -ItemType Directory -Path $installDir -Force | Out-Null
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
Write-Host 'Conector instalado. No DistriHub, abra Configuracoes > Impressora de cupons > Buscar impressoras.'
Read-Host 'Pressione Enter para fechar'
