$ErrorActionPreference = "Stop"
$env:GDAL_DATA = "C:\Program Files\QGIS 3.20.0\share\gdal"
$gdal_translate = "C:\Program Files\QGIS 3.20.0\bin\gdal_translate.exe"
$gdalwarp = "C:\Program Files\QGIS 3.20.0\bin\gdalwarp.exe"
$srcDir = "C:\Users\uqjli47\Dropbox\Juli PhD UQ projects\Juli claude code trial"
$outDir = "C:\Users\uqjli47\Dropbox\Juli PhD UQ projects\Juli claude code trial\webmap\data"
$tmpDir = "C:\Users\uqjli47\AppData\Local\Temp\claude\C--Users-uqjli47-Dropbox-Juli-PhD-UQ-projects-Juli-claude-code-trial\8b17818d-b722-46b6-995d-5d389d091b43\scratchpad"
$te = @("-te", "91.5", "-14", "160.5", "7")
$tr = @("-tr", "0.0524", "0.0524")

$jobs = @(
  @{ src = "FFI_pre_masked_gr.tif";  tmp = "tmp_ffi_pre.tif";  out = "ffi_pre_ghost_road.tif" },
  @{ src = "FFI_post_masked_gr.tif"; tmp = "tmp_ffi_post.tif"; out = "ffi_post_ghost_road.tif" }
)

foreach ($j in $jobs) {
  $srcPath = Join-Path $srcDir $j.src
  $tmpPath = Join-Path $tmpDir $j.tmp
  $outPath = Join-Path $outDir $j.out

  Write-Output "Step A: decimated read (native CRS) of $($j.src)"
  & $gdal_translate -r average -outsize 1400 0 -of GTiff -co COMPRESS=DEFLATE `
    -a_nodata -3.4028234663852886e+38 `
    $srcPath $tmpPath
  if ($LASTEXITCODE -ne 0) { throw "gdal_translate failed for $($j.src)" }

  Write-Output "Step B: reproject small file to EPSG:4326 -> $($j.out)"
  & $gdalwarp -t_srs EPSG:4326 -r average -srcnodata -3.4028234663852886e+38 -dstnodata "nan" `
    @te @tr -tap `
    -of COG -co COMPRESS=DEFLATE -co OVERVIEWS=IGNORE_EXISTING `
    -overwrite $tmpPath $outPath
  if ($LASTEXITCODE -ne 0) { throw "gdalwarp failed for $($j.tmp)" }

  Remove-Item $tmpPath -ErrorAction SilentlyContinue
}

Write-Output "ALL DONE"
& "C:\Program Files\QGIS 3.20.0\bin\gdalinfo.exe" -stats "$outDir\ffi_pre_ghost_road.tif" 2>&1 | Select-String -Pattern "Minimum|Maximum|VALID_PERCENT"
& "C:\Program Files\QGIS 3.20.0\bin\gdalinfo.exe" -stats "$outDir\ffi_post_ghost_road.tif" 2>&1 | Select-String -Pattern "Minimum|Maximum|VALID_PERCENT"
