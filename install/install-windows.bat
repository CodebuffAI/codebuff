@echo off
setlocal EnableExtensions

rem Install a local Freebuff build on Windows.
rem Override these variables before running to install a fork or branch:
rem   set FREEBUFF_REPO_URL=https://github.com/viniciusdebruin/freebuff.git
rem   set FREEBUFF_BRANCH=contrib/engine-recovery

if not defined FREEBUFF_REPO_URL set "FREEBUFF_REPO_URL=https://github.com/CodebuffAI/freebuff.git"
if not defined FREEBUFF_BRANCH set "FREEBUFF_BRANCH=main"
if not defined FREEBUFF_SOURCE_DIR set "FREEBUFF_SOURCE_DIR=%USERPROFILE%\.local\share\freebuff-source"
if not defined FREEBUFF_BIN_DIR set "FREEBUFF_BIN_DIR=%LOCALAPPDATA%\Freebuff\bin"

where git >nul 2>nul
if errorlevel 1 (
  echo Git is required. Install Git for Windows and run this script again.
  exit /b 1
)

where bun >nul 2>nul
if errorlevel 1 (
  echo Bun is required. Install Bun for Windows and run this script again.
  echo See https://bun.sh/docs/installation
  exit /b 1
)

if not exist "%FREEBUFF_SOURCE_DIR%\.git" (
  if exist "%FREEBUFF_SOURCE_DIR%" (
    echo %FREEBUFF_SOURCE_DIR% exists but is not a Git repository.
    echo Choose another FREEBUFF_SOURCE_DIR and run this script again.
    exit /b 1
  )

  echo Cloning %FREEBUFF_REPO_URL% (%FREEBUFF_BRANCH%)...
  git clone --depth 1 --branch "%FREEBUFF_BRANCH%" "%FREEBUFF_REPO_URL%" "%FREEBUFF_SOURCE_DIR%"
  if errorlevel 1 goto :error
) else (
  echo Updating source checkout in %FREEBUFF_SOURCE_DIR%...
  git -C "%FREEBUFF_SOURCE_DIR%" fetch --depth 1 origin "%FREEBUFF_BRANCH%"
  if errorlevel 1 goto :error

  git -C "%FREEBUFF_SOURCE_DIR%" show-ref --verify --quiet "refs/heads/%FREEBUFF_BRANCH%"
  if errorlevel 1 (
    git -C "%FREEBUFF_SOURCE_DIR%" checkout -b "%FREEBUFF_BRANCH%" "origin/%FREEBUFF_BRANCH%"
  ) else (
    git -C "%FREEBUFF_SOURCE_DIR%" checkout "%FREEBUFF_BRANCH%"
  )
  if errorlevel 1 goto :error

  git -C "%FREEBUFF_SOURCE_DIR%" pull --ff-only origin "%FREEBUFF_BRANCH%"
  if errorlevel 1 goto :error
)

echo Installing dependencies...
pushd "%FREEBUFF_SOURCE_DIR%"
call bun install --frozen-lockfile
if errorlevel 1 (
  popd
  goto :error
)

echo Building Freebuff for Windows...
call bun run build:freebuff
if errorlevel 1 (
  popd
  goto :error
)
popd

if not exist "%FREEBUFF_SOURCE_DIR%\cli\bin\freebuff.exe" (
  echo Build did not produce freebuff.exe.
  goto :error
)
if not exist "%FREEBUFF_SOURCE_DIR%\cli\bin\tree-sitter.wasm" (
  echo Build did not produce tree-sitter.wasm.
  goto :error
)

if not exist "%FREEBUFF_BIN_DIR%" mkdir "%FREEBUFF_BIN_DIR%"
copy /Y "%FREEBUFF_SOURCE_DIR%\cli\bin\freebuff.exe" "%FREEBUFF_BIN_DIR%\freebuff.exe" >nul
copy /Y "%FREEBUFF_SOURCE_DIR%\cli\bin\tree-sitter.wasm" "%FREEBUFF_BIN_DIR%\tree-sitter.wasm" >nul
if errorlevel 1 goto :error

set "PATH=%FREEBUFF_BIN_DIR%;%PATH%"

rem Add the install directory to the current user's PATH without setx PATH truncation.
powershell -NoProfile -ExecutionPolicy Bypass -Command "$dir=[IO.Path]::GetFullPath('%FREEBUFF_BIN_DIR%'); $current=[Environment]::GetEnvironmentVariable('Path','User'); $parts=@($current -split ';' | Where-Object { $_ -and $_.Trim() }); if (-not ($parts -contains $dir)) { [Environment]::SetEnvironmentVariable('Path', (($parts + $dir) -join ';'), 'User') }"
if errorlevel 1 echo Could not update the persistent user PATH. The current terminal can still run Freebuff.

echo.
echo Freebuff installed at %FREEBUFF_BIN_DIR%\freebuff.exe
"%FREEBUFF_BIN_DIR%\freebuff.exe" --version
echo Open a new terminal before running: freebuff
exit /b 0

:error
echo.
echo Freebuff installation failed.
exit /b 1
