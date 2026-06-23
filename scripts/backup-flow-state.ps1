param(
  [string]$OutputDir = "backups",
  [string]$ApiBase = "https://app.frostbitefeeders.com/api/flow"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $OutputDir)) {
  New-Item -ItemType Directory -Path $OutputDir | Out-Null
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$path = Join-Path $OutputDir "flow-state-$stamp.json"

$headers = @{
  "x-tenant-id" = "frostbite"
}

Invoke-WebRequest -Uri "$ApiBase/state" -Headers $headers -OutFile $path | Out-Null
$json = Get-Content -Raw $path | ConvertFrom-Json
$binCount = 0
if ($json.payload -and $json.payload.bins) {
  $binCount = ($json.payload.bins.PSObject.Properties | Measure-Object).Count
}

Write-Host "Backed up Flow shared state to $path"
Write-Host "State id: $($json.id)"
Write-Host "Bins: $binCount"
