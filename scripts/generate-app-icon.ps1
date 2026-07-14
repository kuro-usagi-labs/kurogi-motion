Add-Type -AssemblyName System.Drawing

$size = 512
$outputDirectory = Join-Path (Split-Path $PSScriptRoot -Parent) "build"
$outputPath = Join-Path $outputDirectory "icon.png"
[System.IO.Directory]::CreateDirectory($outputDirectory) | Out-Null

$bitmap = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$graphics.Clear([System.Drawing.Color]::Transparent)

$rect = New-Object System.Drawing.RectangleF(28, 28, 456, 456)
$radius = 116
$path = New-Object System.Drawing.Drawing2D.GraphicsPath
$path.AddArc($rect.Left, $rect.Top, $radius, $radius, 180, 90)
$path.AddArc($rect.Right - $radius, $rect.Top, $radius, $radius, 270, 90)
$path.AddArc($rect.Right - $radius, $rect.Bottom - $radius, $radius, $radius, 0, 90)
$path.AddArc($rect.Left, $rect.Bottom - $radius, $radius, $radius, 90, 90)
$path.CloseFigure()

$gradient = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, [System.Drawing.Color]::FromArgb(255, 174, 139, 255), [System.Drawing.Color]::FromArgb(255, 91, 64, 211), 135)
$graphics.FillPath($gradient, $path)

$innerRect = New-Object System.Drawing.RectangleF(39, 39, 434, 434)
$innerPath = New-Object System.Drawing.Drawing2D.GraphicsPath
$innerRadius = 104
$innerPath.AddArc($innerRect.Left, $innerRect.Top, $innerRadius, $innerRadius, 180, 90)
$innerPath.AddArc($innerRect.Right - $innerRadius, $innerRect.Top, $innerRadius, $innerRadius, 270, 90)
$innerPath.AddArc($innerRect.Right - $innerRadius, $innerRect.Bottom - $innerRadius, $innerRadius, $innerRadius, 0, 90)
$innerPath.AddArc($innerRect.Left, $innerRect.Bottom - $innerRadius, $innerRadius, $innerRadius, 90, 90)
$innerPath.CloseFigure()
$highlight = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(62, 255, 255, 255), 3)
$graphics.DrawPath($highlight, $innerPath)

$font = New-Object System.Drawing.Font("Segoe UI", 245, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
$format = New-Object System.Drawing.StringFormat
$format.Alignment = [System.Drawing.StringAlignment]::Center
$format.LineAlignment = [System.Drawing.StringAlignment]::Center
$textRect = New-Object System.Drawing.RectangleF(18, 2, 476, 472)
$graphics.DrawString("K", $font, $brush, $textRect, $format)

$bitmap.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)

$format.Dispose()
$brush.Dispose()
$font.Dispose()
$highlight.Dispose()
$innerPath.Dispose()
$gradient.Dispose()
$path.Dispose()
$graphics.Dispose()
$bitmap.Dispose()

Write-Output $outputPath
