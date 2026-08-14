# Re-reprojects the 5 fragmentation-family rasters onto ONE shared,
# pixel-aligned EPSG:4326 grid (same -te/-tr/-tap for all), so that
# current / regen-scenario / delta values are directly comparable
# cell-for-cell in the web map's click-query and comparison chart.

$ErrorActionPreference = "Stop"
$env:GDAL_DATA = "C:\Program Files\QGIS 3.20.0\share\gdal"
$gdalwarp = "C:\Program Files\QGIS 3.20.0\bin\gdalwarp.exe"

$srcDir = "C:\Users\uqjli47\Dropbox\Juli PhD UQ projects\Juli claude code trial"
$outDir = "C:\Users\uqjli47\Dropbox\Juli PhD UQ projects\Juli claude code trial\webmap\data"

# Shared grid covering the union of all source extents, aligned via -tap
$te = @("-te", "-111.5", "-25.5", "165.5", "25.5")
$tr = @("-tr", "0.0524", "0.0524")

$continuous = @(
  @{ src = "current_forest_FFI.tif";                        out = "current_forest_ffi.tif" },
  @{ src = "all_pnr_ap_b_FFI_raster.tif";                    out = "regen_all_pnr_ffi.tif" },
  @{ src = "holistic_hotspot_hh_b_FFI_raster.tif";           out = "regen_holistic_hotspot_ffi.tif" },
  @{ src = "delta_FFI_all_pnr_ap_b_continuous.tif";          out = "delta_ffi_all_pnr.tif" },
  @{ src = "delta_FFI_holistic_hotspot_hh_b_continuous.tif"; out = "delta_ffi_holistic_hotspot.tif" }
)

foreach ($f in $continuous) {
  $srcPath = Join-Path $srcDir $f.src
  $outPath = Join-Path $outDir $f.out
  Write-Output "Reprojecting $($f.src) -> $($f.out) onto shared grid ..."
  & $gdalwarp -t_srs EPSG:4326 -r bilinear -srcnodata "nan" -dstnodata "nan" `
    @te @tr -tap `
    -of COG -co COMPRESS=DEFLATE -co PREDICTOR=3 -co OVERVIEWS=IGNORE_EXISTING -co RESAMPLING=BILINEAR `
    -overwrite $srcPath $outPath
  if ($LASTEXITCODE -ne 0) { throw "gdalwarp failed for $($f.src)" }
}

Write-Output "Done. Verifying shared grid dimensions:"
foreach ($f in $continuous) {
  $outPath = Join-Path $outDir $f.out
  & "C:\Program Files\QGIS 3.20.0\bin\gdalinfo.exe" $outPath 2>&1 | Select-String -Pattern "Size is|Upper Left|Pixel Size"
}
