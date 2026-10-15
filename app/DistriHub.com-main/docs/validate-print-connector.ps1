$ErrorActionPreference = 'Stop'
$source = Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot '../tools/print-connector/Conector.ps1')
$match = [regex]::Match($source, "(?s)-TypeDefinition @'\r?\n(.*?)\r?\n'@")
if (-not $match.Success) { throw 'Embedded C# not found' }
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition $match.Groups[1].Value
# Only compile the connector. Never start its listener or call Print / PrintImage.
foreach ($file in @('Conector.ps1','Instalar.ps1')) {
 $parseErrors = $null
 $tokens = $null
 [System.Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot "../tools/print-connector/$file"), [ref]$tokens, [ref]$parseErrors) | Out-Null
 if ($parseErrors.Count) { throw ($parseErrors | Out-String) }
}
Write-Output 'Connector C# compiled and PowerShell scripts parsed; no printer accessed.'
