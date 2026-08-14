# Reprojects source rasters (custom Mollweide) to EPSG:4326 Cloud-Optimized GeoTIFFs
# for the interactive web map. Continuous rasters use bilinear resampling;
# categorical rasters use nearest-neighbor to avoid inventing class values.

$ErrorActionPreference = "Stop"
$env:GDAL_DATA = "C:\Program Files\QGIS 3.20.0\share\gdal"
$gdalwarp = "C:\Program Files\QGIS 3.20.0\bin\gdalwarp.exe"
$gdaladdo = "C:\Program Files\QGIS 3.20.0\bin\gdaladdo.exe"

$srcDir = "C:\Users\uqjli47\Dropbox\Juli PhD UQ projects\Juli claude code trial"
$outDir = "C:\Users\uqjli47\Dropbox\Juli PhD UQ projects\Juli claude code trial\webmap\data"

# name, srcNoData, dstNoData, resampling
$continuous = @(
  @{ src = "current_forest_FFI.tif";                     out = "current_forest_ffi.tif" },
  @{ src = "all_pnr_ap_b_FFI_raster.tif";                 out = "regen_all_pnr_ffi.tif" },
  @{ src = "holistic_hotspot_hh_b_FFI_raster.tif";        out = "regen_holistic_hotspot_ffi.tif" },
  @{ src = "delta_FFI_all_pnr_ap_b_continuous.tif";       out = "delta_ffi_all_pnr.tif" },
  @{ src = "delta_FFI_holistic_hotspot_hh_b_continuous.tif"; out = "delta_ffi_holistic_hotspot.tif" }
)

foreach ($f in $continuous) {
  $srcPath = Join-Path $srcDir $f.src
  $outPath = Join-Path $outDir $f.out
  Write-Output "Reprojecting $($f.src) -> $($f.out) (bilinear) ..."
  & $gdalwarp -t_srs EPSG:4326 -r bilinear -srcnodata "nan" -dstnodata "nan" `
    -of COG -co COMPRESS=DEFLATE -co PREDICTOR=3 -co OVERVIEWS=IGNORE_EXISTING -co RESAMPLING=BILINEAR `
    -overwrite $srcPath $outPath
  if ($LASTEXITCODE -ne 0) { throw "gdalwarp failed for $($f.src)" }
}

# Categorical raster: extinction-risk classes (1-12, nodata=255) -> nearest neighbor
$catSrc = Join-Path $srcDir "R2_median_forest_depen_extinc_fig2.tif"
$catOut = Join-Path $outDir "extinction_risk_classes.tif"
Write-Output "Reprojecting R2_median_forest_depen_extinc_fig2.tif -> extinction_risk_classes.tif (nearest) ..."
& $gdalwarp -t_srs EPSG:4326 -r near -srcnodata 255 -dstnodata 255 `
  -of COG -co COMPRESS=DEFLATE -co OVERVIEWS=IGNORE_EXISTING -co RESAMPLING=NEAREST `
  -overwrite $catSrc $catOut
if ($LASTEXITCODE -ne 0) { throw "gdalwarp failed for extinction risk raster" }

Write-Output "Done. Output files:"
Get-ChildItem $outDir -Filter "*.tif" | Select-Object Name, @{N="MB";E={[math]::Round($_.Length/1MB,2)}}
