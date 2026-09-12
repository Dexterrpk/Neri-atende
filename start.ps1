$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host ">> Backend em http://localhost:8001"
$backend = Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$PSScriptRoot\backend'; .\.venv\Scripts\Activate.ps1; uvicorn server:app --host 0.0.0.0 --port 8001" -PassThru

Write-Host ">> Frontend em http://localhost:3000"
$frontend = Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$PSScriptRoot\frontend'; corepack enable; yarn dev --host 0.0.0.0 --port 3000" -PassThru

Write-Host "Atende IA iniciado. Feche as duas janelas para parar."
Wait-Process -Id $backend.Id
