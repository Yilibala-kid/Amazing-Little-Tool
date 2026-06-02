@echo off
setlocal

rem Clean LaTeX build artifacts under this folder.
rem Keeps source files, PDFs, images, and project configuration files.

set "ROOT=%~dp0"

echo Cleaning LaTeX build artifacts in:
echo %ROOT%
echo.

for %%E in (
  aux
  bbl
  bcf
  blg
  fdb_latexmk
  fls
  idx
  ilg
  ind
  lof
  log
  lot
  nav
  out
  run.xml
  snm
  synctex
  synctex.gz
  toc
  vrb
  xdv
) do (
  for /r "%ROOT%" %%F in (*.%%E) do (
    if exist "%%F" (
      echo Deleting %%F
      del /f /q "%%F" 2>nul
    )
  )
)

for /r "%ROOT%" %%F in (*.synctex.gz(busy) *.synctex(busy) xelatex*.fls) do (
  if exist "%%F" (
    echo Deleting %%F
    del /f /q "%%F" 2>nul
  )
)

echo.
echo Done. If any file was open in a PDF viewer or editor, close it and run this script again.

endlocal
