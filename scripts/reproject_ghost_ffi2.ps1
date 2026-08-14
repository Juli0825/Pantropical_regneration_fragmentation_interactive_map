$ErrorActionPreference = "Stop"
$env:GDAL_DATA = "C:\Program Files\QGIS 3.20.0\share\gdal"
$gdal_translate = "C:\Program Files\QGIS 3.20.0\bin\gdal_translate.exe"
$gdalwarp = "C:\Program Files\QGIS 3.20.0\bin\gdalwarp.exe"
$srcDir = "C:\Users\uqjli47\Dropbox\Juli PhD UQ projects\Juli claude code trial"
$outDir = "C:\Users\uqjli47\Dropbox\Juli PhD UQ projects\Juli claude code trial\webmap\data"
$tmpDir = "C:\Users\uqjli47\AppData\Local\Temp\claude\C--Users-uqjli47-Dropbox-Juli-PhD-UQ-projects-Juli-claude-code-trial\8b17818d-b722-46b6-995d-5d389d091b43\scratchpad"
$te = @("-te", "91.5", "-14", "160.5", "7")

$jobs = @(
  @{ src = "FFI_ghost road_boundaries_current_forest_5km.tif"; tmp = "tmp_ffi_ghost1.tif"; out = "ffi_with_ghost_roads.tif" },
  @{ src = "FFI_ghost_forest_10m.tif";                           tmp = "tmp_ffi_ghost2.tif"; out = "ffi_ghost_forest_variant.tif" }
)

foreach ($j in $jobs) {
  $srcPath = Join-Path $srcDir $j.src
  $tmpPath = Join-Path $tmpDir $j.tmp
  $outPath = Join-Path $outDir $j.out

  Write-Output "Step A: decimated read (native CRS) of $($j.src) -> $($j.tmp)"
  & $gdal_translate -r average -outsize 1200 0 -of GTiff -co COMPRESS=DEFLATE `
    -a_nodata nan `
    $srcPath $tmpPath
  if ($LASTEXITCODE -ne 0) { throw "gdal_translate failed for $($j.src)" }

  Write-Output "Step B: reproject small file to EPSG:4326 -> $($j.out)"
  & $gdalwarp -t_srs EPSG:4326 -r average -srcnodata "nan" -dstnodata "nan" `
    @te -tr 0.0524 0.0524 `
    -of COG -co COMPRESS=DEFLATE -co OVERVIEWS=IGNORE_EXISTING `
    -overwrite $tmpPath $outPath
  if ($LASTEXITCODE -ne 0) { throw "gdalwarp failed for $($j.tmp)" }

  Remove-Item $tmpPath -ErrorAction SilentlyContinue
}

Write-Output "ALL DONE"
Get-ChildItem $outDir -Filter "ffi_ghost*" | Select-Object Name, @{N="MB";E={[math]::Round($_.Length/1MB,2)}}
Get-ChildItem $outDir -Filter "ffi_with*" | Select-Object Name, @{N="MB";E={[math]::Round($_.Length/1MB,2)}}
