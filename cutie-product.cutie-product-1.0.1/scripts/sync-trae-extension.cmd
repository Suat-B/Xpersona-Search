@echo off
setlocal

set "SOURCE=%~dp0.."
set "TARGET=%USERPROFILE%\.trae\extensions\cutie-product.cutie-product-1.0.77"

if not exist "%TARGET%" (
  echo Trae target folder was not found:
  echo   %TARGET%
  exit /b 1
)

robocopy "%SOURCE%" "%TARGET%" /MIR ^
  /XD ".git" ".vscode" ".cursor" "_install_1.0.63_fresh" "_install_1.0.64_fresh" ^
  /XF ".vsixmanifest" "*.vsix" ^
  /NFL /NDL /NJH /NJS /NP

set "RC=%ERRORLEVEL%"
if %RC% GEQ 8 exit /b %RC%

echo Synced Cutie into Trae:
echo   %TARGET%
exit /b 0
