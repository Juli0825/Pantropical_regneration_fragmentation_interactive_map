$ErrorActionPreference = "Stop"
$env:GDAL_DATA = "C:\Program Files\QGIS 3.20.0\share\gdal"
$gdalwarp = "C:\Program Files\QGIS 3.20.0\bin\gdalwarp.exe"
$ogr2ogr = "C:\Program Files\QGIS 3.20.0\bin\ogr2ogr.exe"
$srcDir = "C:\Users\uqjli47\Dropbox\Juli PhD UQ projects\Juli claude code trial"
$outDir = "C:\Users\uqjli47\Dropbox\Juli PhD UQ projects\Juli claude code trial\webmap\data"
$te = @("-te", "91.5", "-14", "160.5", "7")
$tr = @("-tr", "0.0524", "0.0524")

Write-Output "[1/4] FFI_pre_masked_gr.tif -> ffi_pre_ghost_road.tif"
& $gdalwarp -t_srs EPSG:4326 -r average -srcnodata -3.4028234663852886e+38 -dstnodata "nan" `
  @te @tr -tap -wm 300 --config GDAL_CACHEMAX 300 `
  -of COG -co COMPRESS=DEFLATE -co OVERVIEWS=IGNORE_EXISTING `
  -overwrite "$srcDir\FFI_pre_masked_gr.tif" "$outDir\ffi_pre_ghost_road.tif"
if ($LASTEXITCODE -ne 0) { throw "failed: FFI_pre_masked_gr" }

Write-Output "[2/4] FFI_post_masked_gr.tif -> ffi_post_ghost_road.tif"
& $gdalwarp -t_srs EPSG:4326 -r average -srcnodata -3.4028234663852886e+38 -dstnodata "nan" `
  @te @tr -tap -wm 300 --config GDAL_CACHEMAX 300 `
  -of COG -co COMPRESS=DEFLATE -co OVERVIEWS=IGNORE_EXISTING `
  -overwrite "$srcDir\FFI_post_masked_gr.tif" "$outDir\ffi_post_ghost_road.tif"
if ($LASTEXITCODE -ne 0) { throw "failed: FFI_post_masked_gr" }

Write-Output "[3/4] natural_forest_binary.tif -> natural_forest_binary.tif"
& $gdalwarp -t_srs EPSG:4326 -r near -srcnodata 255 -dstnodata 255 `
  @te @tr -tap `
  -of COG -co COMPRESS=DEFLATE -co OVERVIEWS=IGNORE_EXISTING `
  -overwrite "$srcDir\natural_forest_binary.tif" "$outDir\natural_forest_binary.tif"
if ($LASTEXITCODE -ne 0) { throw "failed: natural_forest_binary" }

Write-Output "[4/4] WDPA_IUCN_II_studyarea.shp -> protected_areas.geojson"
& $ogr2ogr -f GeoJSON -t_srs EPSG:4326 -lco COORDINATE_PRECISION=5 "$outDir\protected_areas.geojson" "$srcDir\WDPA_IUCN_II_studyarea.shp"
if ($LASTEXITCODE -ne 0) { throw "failed: WDPA shapefile" }

Write-Output "ALL DONE"
Get-ChildItem $outDir -Filter "ffi_*ghost_road*" | Select-Object Name, @{N="MB";E={[math]::Round($_.Length/1MB,2)}}
Get-ChildItem $outDir -Filter "natural_forest_binary.tif" | Select-Object Name, @{N="MB";E={[math]::Round($_.Length/1MB,2)}}
Get-ChildItem $outDir -Filter "protected_areas.geojson" | Select-Object Name, @{N="MB";E={[math]::Round($_.Length/1MB,2)}}
