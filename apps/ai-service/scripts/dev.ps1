$serviceRoot = Split-Path -Parent $PSScriptRoot
Set-Location $serviceRoot
& (Join-Path $serviceRoot '.venv\Scripts\python.exe') -m uvicorn app.main:app --reload --port 8000
