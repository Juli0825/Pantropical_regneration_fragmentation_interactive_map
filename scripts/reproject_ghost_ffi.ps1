$ErrorActionPreference = "Stop"
$env:GDAL_DATA = "C:\Program Files\QGIS 3.20.0\share\gdal"
$gdalwarp = "C:\Program Files\QGIS 3.20.0\bin\gdalwarp.exe"
$srcDir = "C:\Users\uqjli47\Dropbox\Juli PhD UQ projects\Juli claude code trial"
$outDir = "C:\Users\uqjli47\Dropbox\Juli PhD UQ projects\Juli claude code trial\webmap\data"
$te = @("-te", "91.5", "-14", "160.5", "7")

Write-Output "[3/4] FFI_ghost road_boundaries_current_forest_5km.tif -> ffi_with_ghost_roads.tif"
& $gdalwarp -t_srs EPSG:4326 -r average -srcnodata "nan" -dstnodata "nan" `
  @te -tr 0.0524 0.0524 -wm 300 --config GDAL_CACHEMAX 300 -multi `
  -of COG -co COMPRESS=DEFLATE -co OVERVIEWS=IGNORE_EXISTING -co BLOCKSIZE=256 `
  -overwrite "$srcDir\FFI_ghost road_boundaries_current_forest_5km.tif" "$outDir\ffi_with_ghost_roads.tif"
if ($LASTEXITCODE -ne 0) { throw "failed: FFI_ghost road_boundaries" }

Write-Output "[4/4] FFI_ghost_forest_10m.tif -> ffi_ghost_forest_variant.tif"
& $gdalwarp -t_srs EPSG:4326 -r average -srcnodata "nan" -dstnodata "nan" `
  @te -tr 0.0524 0.0524 -wm 300 --config GDAL_CACHEMAX 300 -multi `
  -of COG -co COMPRESS=DEFLATE -co OVERVIEWS=IGNORE_EXISTING -co BLOCKSIZE=256 `
  -overwrite "$srcDir\FFI_ghost_forest_10m.tif" "$outDir\ffi_ghost_forest_variant.tif"
if ($LASTEXITCODE -ne 0) { throw "failed: FFI_ghost_forest_10m" }

Write-Output "ALL DONE"
