@echo off
chcp 65001 >nul
cd /d "%~dp0.."
echo Gerando as amostras de voz...
python ferramentas\gerar_audios.py --amostras
echo.
echo Pronto. Ouca os arquivos na pasta "amostras-de-voz".
pause
