# Package the original brand artwork; do not redraw or change the logo.
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing
$projectDir = Split-Path $PSScriptRoot -Parent
$publicDir = Join-Path $projectDir "public"
$source = [System.Drawing.Bitmap]::new((Join-Path $publicDir "itkan-logo.png"))
try {
  $background = $source.GetPixel(0, 0)
  foreach ($size in @(192, 512)) {
    foreach ($maskable in @($false, $true)) {
      $canvas = [System.Drawing.Bitmap]::new($size, $size)
      $graphics = [System.Drawing.Graphics]::FromImage($canvas)
      try {
        $graphics.Clear($background)
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        # Android guarantees a centered circular safe zone with radius 40%.
        # The original mark fits inside that circle at 90% image scale.
        $artSize = if ($maskable) { [int][Math]::Round($size * 0.90) } else { $size }
        $offset = [int][Math]::Floor(($size - $artSize) / 2)
        $graphics.DrawImage($source, $offset, $offset, $artSize, $artSize)
        $suffix = if ($maskable) { "-maskable" } else { "" }
        $canvas.Save((Join-Path $publicDir "app-icon-$size$suffix.png"), [System.Drawing.Imaging.ImageFormat]::Png)
      } finally {
        $graphics.Dispose()
        $canvas.Dispose()
      }
    }
  }
} finally {
  $source.Dispose()
}
