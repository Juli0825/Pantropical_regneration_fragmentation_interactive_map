$ErrorActionPreference = "Stop"
$env:GDAL_DATA = "C:\Program Files\QGIS 3.20.0\share\gdal"
$gdalwarp = "C:\Program Files\QGIS 3.20.0\bin\gdalwarp.exe"
$srcDir = "C:\Users\uqjli47\Dropbox\Juli PhD UQ projects\Juli claude code trial"
$outDir = "C:\Users\uqjli47\Dropbox\Juli PhD UQ projects\Juli claude code trial\webmap\data"
$te = @("-te", "-111.5", "-25.5", "165.5", "25.5")
$tr = @("-tr", "0.0524", "0.0524")

Write-Output "[1/2] for_ext_risk_reduction_ras_07042026_v2.tif -> ext_risk_reduction.tif"
& $gdalwarp -t_srs EPSG:4326 -r bilinear -srcnodata -3.4e+38 -dstnodata "nan" `
  @te @tr -tap `
  -of COG -co COMPRESS=DEFLATE -co OVERVIEWS=IGNORE_EXISTING `
  -overwrite "$srcDir\for_ext_risk_reduction_ras_07042026_v2.tif" "$outDir\ext_risk_reduction.tif"
if ($LASTEXITCODE -ne 0) { throw "failed: ext_risk_reduction" }

Write-Output "[2/2] moll_PNR.tif -> pnr_score_williams.tif"
& $gdalwarp -t_srs EPSG:4326 -r bilinear -srcnodata -3.4028234663852886e+38 -dstnodata "nan" `
  @te @tr -tap `
  -of COG -co COMPRESS=DEFLATE -co OVERVIEWS=IGNORE_EXISTING `
  -overwrite "$srcDir\moll_PNR.tif" "$outDir\pnr_score_williams.tif"
if ($LASTEXITCODE -ne 0) { throw "failed: moll_PNR" }

Write-Output "ALL DONE"
& "C:\Program Files\QGIS 3.20.0\bin\gdalinfo.exe" -stats "$outDir\ext_risk_reduction.tif" 2>&1 | Select-String -Pattern "Minimum|Maximum|VALID_PERCENT"
& "C:\Program Files\QGIS 3.20.0\bin\gdalinfo.exe" -stats "$outDir\pnr_score_williams.tif" 2>&1 | Select-String -Pattern "Minimum|Maximum|VALID_PERCENT"
Get-ChildItem $outDir -Filter "ext_risk_reduction.tif" | Select-Object Name, @{N="MB";E={[math]::Round($_.Length/1MB,2)}}
Get-ChildItem $outDir -Filter "pnr_score_williams.tif" | Select-Object Name, @{N="MB";E={[math]::Round($_.Length/1MB,2)}}
