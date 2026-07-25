$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$projectRoot = Split-Path -Parent $PSScriptRoot
$sourcePath = Join-Path $projectRoot 'public\android-chrome-512x512.png'
$outDir = Join-Path $projectRoot 'public\app_icon.iconset'

if (-not (Test-Path $sourcePath)) {
  throw "Missing source icon: $sourcePath"
}

New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$source = [System.Drawing.Image]::FromFile($sourcePath)
try {
  $sizes = @(16, 32, 64, 128, 256, 512, 1024)
  foreach ($size in $sizes) {
    $bitmap = New-Object System.Drawing.Bitmap $size, $size
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
      $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $graphics.DrawImage($source, 0, 0, $size, $size)
      $path = Join-Path $outDir ("icon_{0}x{0}.png" -f $size)
      $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
      Write-Host "Wrote $path"
    }
    finally {
      $graphics.Dispose()
      $bitmap.Dispose()
    }
  }
}
finally {
  $source.Dispose()
}

function Copy-IconMapping {
  param(
    [string]$SourceName,
    [string]$DestinationName
  )
  $from = Join-Path $outDir $SourceName
  $to = Join-Path $outDir $DestinationName
  Copy-Item -Force $from $to
  Write-Host "Mapped $DestinationName"
}

Copy-IconMapping 'icon_32x32.png' ('icon_16x16@' + '2x.png')
Copy-IconMapping 'icon_64x64.png' ('icon_32x32@' + '2x.png')
Copy-IconMapping 'icon_256x256.png' ('icon_128x128@' + '2x.png')
Copy-IconMapping 'icon_512x512.png' ('icon_256x256@' + '2x.png')
Copy-IconMapping 'icon_1024x1024.png' ('icon_512x512@' + '2x.png')

Get-ChildItem $outDir | ForEach-Object { Write-Host "$($_.Name) $($_.Length)" }
