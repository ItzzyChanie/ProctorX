$ServiceRoot = Split-Path -Parent $PSScriptRoot
Set-Location -Path $ServiceRoot

$PythonPath = Join-Path -Path $ServiceRoot -ChildPath ".venv\Scripts\python.exe"
& $PythonPath -m uvicorn app.main:app --reload --port 8000
