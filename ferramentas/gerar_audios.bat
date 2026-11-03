@echo off
chcp 65001 >nul
cd /d "%~dp0.."
echo Gerando todos os audios do app...
python ferramentas\gerar_audios.py %*
echo.
echo Pronto. Os audios estao na pasta "audio".
pause
