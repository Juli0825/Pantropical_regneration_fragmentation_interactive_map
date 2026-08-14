$ErrorActionPreference = "Stop"
$env:GDAL_DATA = "C:\Program Files\QGIS 3.20.0\share\gdal"
$gdalwarp = "C:\Program Files\QGIS 3.20.0\bin\gdalwarp.exe"
$srcDir = "C:\Users\uqjli47\Dropbox\Juli PhD UQ projects\Juli claude code trial"
$outDir = "C:\Users\uqjli47\Dropbox\Juli PhD UQ projects\Juli claude code trial\webmap\data"
$te = @("-te", "-111.5", "-25.5", "165.5", "25.5")
$tr = @("-tr", "0.0524", "0.0524")

Write-Output "[1/3] bio_iucn_sup.tif -> bio_iucn_sup.tif (coarse, bilinear)"
& $gdalwarp -t_srs EPSG:4326 -r bilinear -srcnodata -128 -dstnodata "nan" `
  @te @tr -tap `
  -of COG -co COMPRESS=DEFLATE -co OVERVIEWS=IGNORE_EXISTING `
  -overwrite "$srcDir\bio_iucn_sup.tif" "$outDir\bio_iucn_sup.tif"
if ($LASTEXITCODE -ne 0) { throw "failed: bio_iucn_sup" }

Write-Output "[2/3] wider_species_extinction_risk_sup.tif -> extinction_risk_sup.tif"
& $gdalwarp -t_srs EPSG:4326 -r bilinear -srcnodata -128 -dstnodata "nan" `
  @te @tr -tap `
  -of COG -co COMPRESS=DEFLATE -co OVERVIEWS=IGNORE_EXISTING `
  -overwrite "$srcDir\wider_species_extinction_risk_sup.tif" "$outDir\extinction_risk_sup.tif"
if ($LASTEXITCODE -ne 0) { throw "failed: wider_species_extinction_risk_sup" }

Write-Output "[3/3] carbon_30yrs_main.tif -> carbon_30yrs_main.tif (1.1GB source)"
& $gdalwarp -t_srs EPSG:4326 -r average -srcnodata -3.4028234663852886e+38 -dstnodata "nan" `
  @te @tr -tap -wm 300 --config GDAL_CACHEMAX 300 `
  -of COG -co COMPRESS=DEFLATE -co OVERVIEWS=IGNORE_EXISTING `
  -overwrite "$srcDir\carbon_30yrs_main.tif" "$outDir\carbon_30yrs_main.tif"
if ($LASTEXITCODE -ne 0) { throw "failed: carbon_30yrs_main" }

Write-Output "ALL DONE"
Get-ChildItem $outDir -Filter "*carbon_30yrs*" | Select-Object Name, @{N="MB";E={[math]::Round($_.Length/1MB,2)}}
Get-ChildItem $outDir -Filter "*bio_iucn*" | Select-Object Name, @{N="MB";E={[math]::Round($_.Length/1MB,2)}}
Get-ChildItem $outDir -Filter "*extinction_risk_sup*" | Select-Object Name, @{N="MB";E={[math]::Round($_.Length/1MB,2)}}
