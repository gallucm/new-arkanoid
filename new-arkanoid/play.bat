@echo off
setlocal
pushd "%~dp0" || exit /b 1

where node.exe >nul 2>&1 || goto missing_node
where npm.cmd >nul 2>&1 || goto missing_node

if not exist "node_modules\electron\dist\electron.exe" (
    call npm ci --include=dev
    if errorlevel 1 goto done
)

call npm run desktop
goto done

:missing_node
echo Instala Node.js con npm para jugar. 1>&2
popd
exit /b 1

:done
set "result=%errorlevel%"
popd
exit /b %result%
