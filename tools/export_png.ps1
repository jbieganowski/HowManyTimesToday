# Renders every docs/images/diagram-*.svg to docs/images/png/*.png with headless Edge
# (2x scale). PNGs are for Confluence/Word, which do not render SVG attachments well.
#   pwsh tools/export_png.ps1
#
# Headless Edge does not reliably exit after --screenshot (it can hang forever, and
# Start-Process -Wait then waits for the whole process tree), so the script waits for
# the PNG to appear and stops only the Edge tree it started itself.
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$edge = @('C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
          'C:\Program Files\Microsoft\Edge\Application\msedge.exe') | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $edge) { throw 'Microsoft Edge not found' }
$out = Join-Path $root 'docs\images\png'
New-Item -ItemType Directory -Force $out | Out-Null
foreach ($svg in Get-ChildItem (Join-Path $root 'docs\images') -Filter 'diagram-*.svg') {
    $head = (Get-Content $svg.FullName -TotalCount 1)
    if ($head -notmatch 'width="(\d+)" height="(\d+)"') { throw "no size in $($svg.Name)" }
    $w = [int]$Matches[1]; $h = [int]$Matches[2]
    $png = Join-Path $out ($svg.BaseName + '.png')
    Remove-Item $png -ErrorAction SilentlyContinue
    $edgeProfile = Join-Path ([IO.Path]::GetTempPath()) ('hmtt-edge-' + [guid]::NewGuid().ToString('N'))
    $proc = Start-Process -FilePath $edge -PassThru -ArgumentList @(
        '--headless=new', '--disable-gpu', '--hide-scrollbars', "--user-data-dir=$edgeProfile",
        '--force-device-scale-factor=2', "--window-size=$w,$h", "--screenshot=$png",
        ([Uri]$svg.FullName).AbsoluteUri)
    $deadline = (Get-Date).AddSeconds(30)
    while (-not (Test-Path $png) -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 300 }
    Start-Sleep -Milliseconds 500   # let the file be fully written
    & taskkill /T /F /PID $proc.Id 2>&1 | Out-Null
    Remove-Item $edgeProfile -Recurse -Force -ErrorAction SilentlyContinue
    if (-not (Test-Path $png)) { throw "failed: $($svg.Name)" }
}
Write-Host "PNG export done: $out"
