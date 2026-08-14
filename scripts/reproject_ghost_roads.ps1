$ErrorActionPreference = "Stop"
$env:GDAL_DATA = "C:\Program Files\QGIS 3.20.0\share\gdal"
$gdalwarp = "C:\Program Files\QGIS 3.20.0\bin\gdalwarp.exe"
$srcDir = "C:\Users\uqjli47\Dropbox\Juli PhD UQ projects\Juli claude code trial"
$outDir = "C:\Users\uqjli47\Dropbox\Juli PhD UQ projects\Juli claude code trial\webmap\data"

# Regional extent covering the SE Asia / New Guinea ghost-road study area (with margin)
$te = @("-te", "91.5", "-14", "160.5", "7")

Write-Output "[1/4] road_presabs_clipped_sumborpap_1ha.tif -> ghost_roads_presence.tif (max resample, ~1km)"
& $gdalwarp -t_srs EPSG:4326 -r max -srcnodata 3 -dstnodata 255 `
  @te -tr 0.01 0.01 `
  -of COG -co COMPRESS=DEFLATE -co OVERVIEWS=IGNORE_EXISTING `
  -overwrite "$srcDir\road_presabs_clipped_sumborpap_1ha.tif" "$outDir\ghost_roads_presence.tif"
if ($LASTEXITCODE -ne 0) { throw "failed: road_presabs" }

Write-Output "[2/4] ghost_forest_aligned.tif -> ghost_forest_mask.tif (max resample, ~1km)"
& $gdalwarp -t_srs EPSG:4326 -r max -srcnodata 255 -dstnodata 255 `
  @te -tr 0.01 0.01 `
  -of COG -co COMPRESS=DEFLATE -co OVERVIEWS=IGNORE_EXISTING `
  -overwrite "$srcDir\ghost_forest_aligned.tif" "$outDir\ghost_forest_mask.tif"
if ($LASTEXITCODE -ne 0) { throw "failed: ghost_forest_aligned" }

Write-Output "[3/4] FFI_ghost road_boundaries_current_forest_5km.tif -> ffi_with_ghost_roads.tif (average resample, matches main FFI grid res)"
& $gdalwarp -t_srs EPSG:4326 -r average -srcnodata "nan" -dstnodata "nan" `
  @te -tr 0.0524 0.0524 `
  -of COG -co COMPRESS=DEFLATE -co OVERVIEWS=IGNORE_EXISTING `
  -overwrite "$srcDir\FFI_ghost road_boundaries_current_forest_5km.tif" "$outDir\ffi_with_ghost_roads.tif"
if ($LASTEXITCODE -ne 0) { throw "failed: FFI_ghost road_boundaries" }

Write-Output "[4/4] FFI_ghost_forest_10m.tif -> ffi_ghost_forest_variant.tif (average resample)"
& $gdalwarp -t_srs EPSG:4326 -r average -srcnodata "nan" -dstnodata "nan" `
  @te -tr 0.0524 0.0524 `
  -of COG -co COMPRESS=DEFLATE -co OVERVIEWS=IGNORE_EXISTING `
  -overwrite "$srcDir\FFI_ghost_forest_10m.tif" "$outDir\ffi_ghost_forest_variant.tif"
if ($LASTEXITCODE -ne 0) { throw "failed: FFI_ghost_forest_10m" }

Write-Output "ALL DONE"
Get-ChildItem $outDir -Filter "*ghost*" | Select-Object Name, @{N="MB";E={[math]::Round($_.Length/1MB,2)}}
