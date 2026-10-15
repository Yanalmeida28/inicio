@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Instalar.ps1"
if errorlevel 1 (
 echo Falha na instalacao. Confira a permissao do Windows e tente novamente.
) else (
 echo Conector v2 instalado. No DistriHub, busque a impressora e teste o modo Personalizado direto.
)
pause
