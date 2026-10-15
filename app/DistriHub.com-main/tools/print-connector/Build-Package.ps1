$ErrorActionPreference = 'Stop'
$packageFiles = @('Conector.ps1','Instalar.ps1','Instalar.cmd','LEIA-ME.txt') | ForEach-Object { Join-Path $PSScriptRoot $_ }
$destination = Join-Path $PSScriptRoot '../../public/downloads/Conector-DistriHub.zip'
Compress-Archive -LiteralPath $packageFiles -DestinationPath $destination -Force
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($destination)
try {
 foreach ($file in $packageFiles) {
  $entry = $zip.GetEntry([System.IO.Path]::GetFileName($file))
  if (-not $entry) { throw "Missing package file: $file" }
  $reader = New-Object System.IO.StreamReader($entry.Open())
  try { $packaged = $reader.ReadToEnd() } finally { $reader.Dispose() }
  if ($packaged -cne [System.IO.File]::ReadAllText($file)) { throw "Package mismatch: $file" }
 }
} finally { $zip.Dispose() }
Get-FileHash -LiteralPath $destination -Algorithm SHA256 | Select-Object Hash
