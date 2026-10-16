@echo off

setlocal

call "%ODX_PATH%\win32env.bat"
python %*

endlocal
