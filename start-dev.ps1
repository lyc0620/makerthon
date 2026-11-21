# 현풍 지도 (DB 파트) 한 번에 켜기
# 사용법 (PowerShell, 이 폴더에서):  .\start-dev.ps1          ← 서버 2개 켜고 브라우저 열기
#                                     .\start-dev.ps1 -Demo    ← 발표용 예시 사람 4명도 같이 띄우기
# 끄려면 새로 열린 PowerShell 창들을 닫으면 돼요.
param([switch]$Demo)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$backend = Join-Path $root "backend"
$frontend = Join-Path $root "frontend"

foreach ($cmd in "uv", "npm") {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
        Write-Host "$cmd 가 설치돼 있지 않아요. README의 준비물을 먼저 설치해 주세요." -ForegroundColor Red
        exit 1
    }
}

Write-Host "1/4 백엔드 준비 중..." -ForegroundColor Cyan
Push-Location $backend
uv sync --quiet
if (-not (Test-Path ".env")) { Copy-Item ".env.example" ".env"; Write-Host "  .env 를 예시에서 만들었어요 (개발 모드)" }
uv run alembic upgrade head
uv run python -m seed.db_sample | Out-Null
Pop-Location

Write-Host "2/4 프론트엔드 준비 중..." -ForegroundColor Cyan
if (-not (Test-Path (Join-Path $frontend "node_modules"))) {
    Push-Location $frontend; npm install; Pop-Location
}

Write-Host "3/4 서버 켜는 중 (새 창 2개가 열려요)..." -ForegroundColor Cyan
Start-Process powershell -WorkingDirectory $backend -ArgumentList "-NoExit", "-Command", "`$host.UI.RawUI.WindowTitle='현풍지도 백엔드'; uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000"
Start-Process powershell -WorkingDirectory $frontend -ArgumentList "-NoExit", "-Command", "`$host.UI.RawUI.WindowTitle='현풍지도 프론트'; npm run dev"

if ($Demo) {
    Start-Sleep -Seconds 4
    Start-Process powershell -WorkingDirectory $backend -ArgumentList "-NoExit", "-Command", "`$host.UI.RawUI.WindowTitle='현풍지도 예시 사람'; `$env:PYTHONIOENCODING='utf-8'; uv run python -m seed.demo_presence"
}

Write-Host "4/4 브라우저 여는 중..." -ForegroundColor Cyan
Start-Sleep -Seconds 4
Start-Process "http://localhost:5173"
Write-Host "다 됐어요! 화면: http://localhost:5173   API 문서: http://127.0.0.1:8000/docs" -ForegroundColor Green
