$ServiceRoot = Split-Path -Parent $PSScriptRoot
Set-Location -Path $ServiceRoot

$PythonPath = Join-Path -Path $ServiceRoot -ChildPath ".venv\Scripts\python.exe"
$Worker = Start-Process -FilePath $PythonPath `
  -ArgumentList @("-m", "celery", "-A", "app.core.celery_app:celery_app", "worker", "--loglevel=info", "--pool=solo") `
  -WorkingDirectory $ServiceRoot `
  -WindowStyle Hidden `
  -PassThru

try {
  & $PythonPath -m uvicorn app.main:app --reload --port 8000
} finally {
  if (!$Worker.HasExited) { Stop-Process -Id $Worker.Id }
}
