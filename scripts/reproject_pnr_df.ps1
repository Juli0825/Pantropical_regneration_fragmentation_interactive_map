$ErrorActionPreference = "Stop"
$env:GDAL_DATA = "C:\Program Files\QGIS 3.20.0\share\gdal"
$gdalwarp = "C:\Program Files\QGIS 3.20.0\bin\gdalwarp.exe"
$srcDir = "C:\Users\uqjli47\Dropbox\Juli PhD UQ projects\Juli claude code trial\webmap\data_raw_mollweide"
$outDir = "C:\Users\uqjli47\Dropbox\Juli PhD UQ projects\Juli claude code trial\webmap\data"
$te = @("-te", "-111.5", "-25.5", "165.5", "25.5")
$tr = @("-tr", "0.0524", "0.0524")

$files = @("pnr_carbon.tif","pnr_bio.tif","pnr_oppcosts.tif","pnr_implecosts.tif","pnr_nrcosts_total.tif","pnr_score.tif")
foreach ($f in $files) {
  $out = $f
  Write-Output "Reprojecting $f ..."
  & $gdalwarp -t_srs EPSG:4326 -r bilinear -srcnodata "nan" -dstnodata "nan" `
    @te @tr -tap `
    -of COG -co COMPRESS=DEFLATE -co OVERVIEWS=IGNORE_EXISTING `
    -overwrite "$srcDir\$f" "$outDir\$out"
  if ($LASTEXITCODE -ne 0) { throw "failed: $f" }
}
Write-Output "ALL DONE"
Get-ChildItem $outDir -Filter "pnr_*" | Select-Object Name, @{N="MB";E={[math]::Round($_.Length/1MB,2)}}
