@echo off

setlocal

call %ODM_PATH%\win32env.bat
python %*

endlocal