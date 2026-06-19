param(
  [switch]$SkipLive,
  [switch]$CheckReadOnlyApi
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$failures = New-Object System.Collections.Generic.List[string]

$expected = @{
  RecoveryCommit = '8905de7b8c628c8d419ac306524ae1634588686b'
  RecoveryTag = 'recovery-2026-06-19'
  LiveUrl = 'https://app.frostbitefeeders.com/inventory-test/'
  LiveTitle = 'Frostbite Flow'
  LiveSha256 = '35DB9A1DCF90CCC60F95C5E14AE968E5FF7D4C3D9E564A01CBDF5BC10705FCAB'
  CsvSourceSha256 = '420C32AEDE4E14B78EB8F45A16E5157C7C6E06D21997623DE4D80BAE4FB1D4A1'
  LegacySourceHashes = @{
    'index.html' = '33F85413362533599B4F0F6985D9FC327AC8034DFE99C14F3F381449B8A18017'
    'qr-labels.html' = '82A7AABFC63FCF47E50577C088B2CF753A66E778FAF207A4F76DF784A52E9135'
    'supabase-schema.sql' = '1E665A156B42841B28CF115A7DCCD80AEA7D45A92B6A7DF7CE6583C9F032594E'
  }
}

function Add-Failure([string]$message) {
  $script:failures.Add($message) | Out-Null
}

function Assert-Equal([string]$label, $actual, $want) {
  if ($actual -ne $want) {
    Add-Failure "$label expected [$want], got [$actual]"
  }
}

function Get-Sha256([string]$path) {
  (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash
}

function Get-NormalizedText([string]$path) {
  [System.IO.File]::ReadAllText((Resolve-Path $path)) -replace "`r`n", "`n" -replace "`r", "`n"
}

function Invoke-Git([string[]]$arguments) {
  $output = & git @arguments 2>&1
  if ($LASTEXITCODE -ne 0) {
    Add-Failure "git $($arguments -join ' ') failed: $output"
    return $null
  }
  ($output | Out-String).Trim()
}

Push-Location $root
try {
  $csvPath = Join-Path $root 'data/exports/frostbite-inventory-2026-06-18.csv'
  $capturePath = Join-Path $root 'app/inventory-test-live-capture.html'
  $legacyPath = Join-Path $root 'legacy/phone-app'
  $sourceCsvPath = 'C:\Users\Adam\Downloads\frostbite-inventory-2026-06-18.csv'
  $sourceLegacyPath = 'C:\Users\Adam\OneDrive\Desktop\FROSTBITE\Frostbite Master File\Frostbite Phone App'

  foreach ($path in @($csvPath, $capturePath, $legacyPath)) {
    if (-not (Test-Path -LiteralPath $path)) {
      Add-Failure "missing required path: $path"
    }
  }

  $rows = Import-Csv -LiteralPath $csvPath
  Assert-Equal 'CSV row count' $rows.Count 714

  $requiredColumns = @(
    'Bin', 'Room', 'Rack', 'Type', 'Status', 'SKU', 'QR Target',
    'SKU Freezer On Hand', 'Shopify Variant IDs', 'Updated At'
  )
  $columns = ($rows | Select-Object -First 1).PSObject.Properties.Name
  foreach ($column in $requiredColumns) {
    if ($columns -notcontains $column) {
      Add-Failure "CSV missing required column: $column"
    }
  }

  $roomCounts = @{}
  $rows | Group-Object Room | ForEach-Object { $roomCounts[$_.Name] = $_.Count }
  Assert-Equal 'room breeding count' $roomCounts['breeding'] 270
  Assert-Equal 'room growout count' $roomCounts['growout'] 168
  Assert-Equal 'room nursery count' $roomCounts['nursery'] 276

  $statusCounts = @{}
  $rows | Group-Object Status | ForEach-Object { $statusCounts[$_.Name] = $_.Count }
  Assert-Equal 'status breeding count' $statusCounts['breeding'] 270
  Assert-Equal 'status growout count' $statusCounts['growout'] 4
  Assert-Equal 'status nursery count' $statusCounts['nursery'] 6
  Assert-Equal 'status open count' $statusCounts['open'] 434

  Assert-Equal 'unique bin count' (@($rows | Group-Object Bin).Count) 714
  Assert-Equal 'duplicate bin groups' (@($rows | Group-Object Bin | Where-Object Count -gt 1).Count) 0
  Assert-Equal 'QR target count' (@($rows | Where-Object { $_.'QR Target' }).Count) 714
  Assert-Equal 'duplicate QR target groups' (@($rows | Group-Object 'QR Target' | Where-Object Count -gt 1).Count) 0
  Assert-Equal 'rows with SKU' (@($rows | Where-Object { $_.SKU }).Count) 714
  Assert-Equal 'rows with Shopify variant IDs' (@($rows | Where-Object { $_.'Shopify Variant IDs' }).Count) 10

  $badQr = $rows | Where-Object { $_.'QR Target' -notlike "$($expected.LiveUrl)#*" } | Select-Object -First 1
  if ($badQr) {
    Add-Failure "unexpected QR target format on bin $($badQr.Bin): $($badQr.'QR Target')"
  }

  if (Test-Path -LiteralPath $sourceCsvPath) {
    Assert-Equal 'source CSV SHA256' (Get-Sha256 $sourceCsvPath) $expected.CsvSourceSha256
    if ((Get-NormalizedText $sourceCsvPath) -ne (Get-NormalizedText $csvPath)) {
      Add-Failure 'repo CSV differs from Downloads source after line-ending normalization'
    }
  } else {
    Write-Warning "source CSV not found at $sourceCsvPath; repo CSV checks still ran"
  }

  foreach ($name in @('index.html', 'qr-labels.html', 'supabase-schema.sql', 'README.md')) {
    $repoFile = Join-Path $legacyPath $name
    if (-not (Test-Path -LiteralPath $repoFile)) {
      Add-Failure "missing legacy repo file: $repoFile"
      continue
    }
    $sourceFile = Join-Path $sourceLegacyPath $name
    if (Test-Path -LiteralPath $sourceFile) {
      if ($expected.LegacySourceHashes.ContainsKey($name)) {
        Assert-Equal "legacy source SHA256 $name" (Get-Sha256 $sourceFile) $expected.LegacySourceHashes[$name]
      }
      if ((Get-NormalizedText $sourceFile) -ne (Get-NormalizedText $repoFile)) {
        Add-Failure "legacy repo file differs from source after line-ending normalization: $name"
      }
    } else {
      Write-Warning "legacy source not found for $name at $sourceFile; repo file presence still checked"
    }
  }

  $capture = Get-NormalizedText $capturePath
  if ($capture -notmatch '<title>Frostbite Flow</title>') {
    Add-Failure 'repo live capture is missing the expected title'
  }
  if ($capture -notmatch "const FLOW_API_BASE = '/api/flow';") {
    Add-Failure 'repo live capture is missing expected Flow API base'
  }
  if ($capture -notmatch "mode: 'recon_only'") {
    Add-Failure 'repo live capture is missing Shopify recon_only guard'
  }
  if ($capture -notmatch 'location\.hash' -or $capture -notmatch 'openBin\(found\.id\)' -or $capture -notmatch 'qrTargetForBin') {
    Add-Failure 'repo live capture is missing the static QR fragment lookup path'
  }
  foreach ($blocked in @('inventoryAdjustQuantity', 'inventorySetQuantities', 'productUpdate', 'productVariantUpdate', 'inventoryActivate', 'inventoryBulkAdjustQuantityAtLocation')) {
    if ($capture -match $blocked) {
      Add-Failure "capture contains Shopify mutation marker: $blocked"
    }
  }

  if (-not $SkipLive) {
    $curl = Get-Command curl.exe -ErrorAction SilentlyContinue
    if (-not $curl) {
      Add-Failure 'curl.exe is required for byte-stable live capture verification'
    } else {
      $tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("frostbite-flow-live-current-{0}.html" -f ([guid]::NewGuid().ToString('N')))
      $statusCode = & curl.exe -L -sS -o $tmp -w '%{http_code}' $expected.LiveUrl
      if ($LASTEXITCODE -ne 0) {
        Add-Failure "live app curl failed with exit code $LASTEXITCODE"
      } else {
        Assert-Equal 'live app HTTP status' $statusCode '200'
        Assert-Equal 'live app SHA256' (Get-Sha256 $tmp) $expected.LiveSha256
        $liveCapture = Get-NormalizedText $tmp
        if ($liveCapture -notmatch "<title>$($expected.LiveTitle)</title>") {
          Add-Failure "live app title was not $($expected.LiveTitle)"
        }
        if ((Get-NormalizedText $tmp) -ne (Get-NormalizedText $capturePath)) {
          Add-Failure 'repo capture differs from current live app after line-ending normalization'
        }
        Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
      }
    }
  }

  if ($CheckReadOnlyApi) {
    foreach ($path in @('/api/flow/health', '/api/flow/state', '/api/flow/shopify/health', '/api/flow/shopify-variants', '/api/flow/shopify/demand')) {
      $url = "https://app.frostbitefeeders.com$path"
      $tmpApi = Join-Path ([System.IO.Path]::GetTempPath()) ("frostbite-flow-api-{0}.json" -f ([guid]::NewGuid().ToString('N')))
      $statusCode = & curl.exe -L -sS -H 'x-tenant-id: frostbite' -o $tmpApi -w '%{http_code}' $url
      if ($LASTEXITCODE -ne 0) {
        Add-Failure "read-only API probe failed for $url with exit code $LASTEXITCODE"
        continue
      }
      $apiText = if (Test-Path -LiteralPath $tmpApi) { Get-Content -LiteralPath $tmpApi -Raw } else { '' }
      $apiJson = $null
      if ($apiText) {
        try { $apiJson = $apiText | ConvertFrom-Json } catch { Add-Failure "read-only API probe for $url did not return JSON" }
      }
      Remove-Item -LiteralPath $tmpApi -Force -ErrorAction SilentlyContinue

      switch ($path) {
        '/api/flow/health' {
          Assert-Equal "$path status code" $statusCode '200'
          if ($apiJson) {
            Assert-Equal "$path response status" $apiJson.status 'ok'
            if (-not $apiJson.supabase_url) { Add-Failure "$path did not return supabase_url" }
          }
        }
        '/api/flow/state' {
          Assert-Equal "$path status code" $statusCode '200'
          if ($apiJson -and -not $apiJson.payload) { Add-Failure "$path did not return a payload" }
        }
        '/api/flow/shopify/health' {
          Assert-Equal "$path status code" $statusCode '200'
          if ($apiJson) {
            Assert-Equal "$path mode" $apiJson.mode 'read_only'
            if ($apiJson.status -notin @('configured', 'missing_config')) {
              Add-Failure "$path returned unexpected status $($apiJson.status)"
            }
          }
        }
        '/api/flow/shopify-variants' {
          Assert-Equal "$path status code" $statusCode '200'
          $variantCount = @($apiJson).Count
          Assert-Equal "$path variant count" $variantCount 26
        }
        '/api/flow/shopify/demand' {
          if ($statusCode -eq '503') {
            if ($apiText -notmatch 'read-only Shopify sync') {
              Add-Failure "$path returned 503 without the expected read-only setup message"
            }
          } elseif ($statusCode -eq '200') {
            if ($apiJson -and -not ($apiJson.PSObject.Properties.Name -contains 'orderCount')) {
              Add-Failure "$path returned 200 without orderCount"
            }
          } else {
            Add-Failure "$path returned unexpected HTTP $statusCode"
          }
        }
      }
    }
  }

  $head = Invoke-Git @('rev-parse', 'HEAD')
  if ($head -and $head -ne $expected.RecoveryCommit) {
    Write-Warning "HEAD is $head; recovery commit is $($expected.RecoveryCommit). This is OK after stabilization edits."
  }

  $originMain = Invoke-Git @('rev-parse', 'origin/main')
  if ($originMain -and $originMain -ne $expected.RecoveryCommit) {
    Write-Warning "origin/main is $originMain; recovery commit is anchored by $($expected.RecoveryTag)."
  }

  $tagCommit = Invoke-Git @('rev-parse', "$($expected.RecoveryTag)^{commit}")
  if ($tagCommit) {
    Assert-Equal "tag $($expected.RecoveryTag)" $tagCommit $expected.RecoveryCommit
  } else {
    Add-Failure "missing recovery tag: $($expected.RecoveryTag)"
  }

  if ($failures.Count) {
    Write-Host 'Frostbite Flow baseline verification FAILED' -ForegroundColor Red
    $failures | ForEach-Object { Write-Host " - $_" -ForegroundColor Red }
    exit 1
  }

  Write-Host 'Frostbite Flow baseline verification passed.' -ForegroundColor Green
  Write-Host "Rows: $($rows.Count); bins: $(@($rows | Group-Object Bin).Count); QR targets: $(@($rows | Where-Object { $_.'QR Target' }).Count)"
  Write-Host 'Shopify guard: read-only/recon-only markers present; no known Shopify mutation markers found in the captured app.'
}
finally {
  Pop-Location
}
