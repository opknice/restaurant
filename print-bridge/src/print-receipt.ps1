param(
  [Parameter(Mandatory = $true)][string]$PrinterName,
  [Parameter(Mandatory = $true)][string]$FontName,
  [Parameter(Mandatory = $true)][string]$PayloadBase64
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Net.Http

if (-not (Get-Printer -Name $PrinterName -ErrorAction SilentlyContinue)) {
  throw "Configured printer was not found: $PrinterName"
}

$json = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($PayloadBase64))
$data = $json | ConvertFrom-Json
$script:qrLoadFailed = $false
$document = New-Object System.Drawing.Printing.PrintDocument
$document.PrinterSettings.PrinterName = $PrinterName
$document.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(8, 8, 5, 5)

# Thermal printers use one continuous page. Size it from the actual content so
# long orders are not clipped by the driver's default paper height.
$headerCount = @($data.HeaderLines).Count
$itemCount = @($data.Items).Count
$footerCount = @($data.FooterLines).Count + @($data.QrCaptionLines).Count
$qrHeight = if ([string]::IsNullOrWhiteSpace([string]$data.QrPath)) { 0 } else { 165 }
$estimatedHeight = 35 + ($headerCount * 16) + ($itemCount * 30) + ($footerCount * 14) + $qrHeight
$paperWidth = $document.DefaultPageSettings.PaperSize.Width
$paperHeight = [Math]::Min(32760, [Math]::Max(200, $estimatedHeight))
$document.DefaultPageSettings.PaperSize = New-Object System.Drawing.Printing.PaperSize('Receipt', $paperWidth, $paperHeight)

$document.add_PrintPage({
  param($sender, $event)
  $graphics = $event.Graphics
  $left = $event.MarginBounds.Left
  $right = $event.MarginBounds.Right
  $width = $event.MarginBounds.Width
  $y = $event.MarginBounds.Top
  $normal = New-Object System.Drawing.Font($FontName, 8.5)
  $small = New-Object System.Drawing.Font($FontName, 7.5)
  $bold = New-Object System.Drawing.Font($FontName, 10, [System.Drawing.FontStyle]::Bold)
  $center = New-Object System.Drawing.StringFormat
  $center.Alignment = [System.Drawing.StringAlignment]::Center
  $rightAlign = New-Object System.Drawing.StringFormat
  $rightAlign.Alignment = [System.Drawing.StringAlignment]::Far

  foreach ($line in $data.HeaderLines) {
    if ([string]::IsNullOrWhiteSpace($line)) { continue }
    $font = if ($line -eq $data.HeaderLines[0] -and -not $data.IsField) { $bold } else { $normal }
    $graphics.DrawString([string]$line, $font, [System.Drawing.Brushes]::Black, ($left + ($width / 2)), $y, $center)
    $y += $font.GetHeight($graphics) + 2
  }

  if (-not $data.IsField) {
    $graphics.DrawLine([System.Drawing.Pens]::Black, $left, $y, $right, $y)
    $y += 4
  }
  foreach ($item in $data.Items) {
    $graphics.DrawString([string]$item.Name, $normal, [System.Drawing.Brushes]::Black, $left, $y)
    $y += $normal.GetHeight($graphics)
    $graphics.DrawString("$($item.Quantity) x $($item.UnitPrice)", $small, [System.Drawing.Brushes]::Black, $left, $y)
    $graphics.DrawString([string]$item.LineTotal, $small, [System.Drawing.Brushes]::Black, $right, $y, $rightAlign)
    $y += $small.GetHeight($graphics) + 3
  }

  if (-not $data.IsField) {
    $graphics.DrawLine([System.Drawing.Pens]::Black, $left, $y, $right, $y)
    $y += 4
    foreach ($line in $data.FooterLines) {
      $graphics.DrawString([string]$line, $small, [System.Drawing.Brushes]::Black, $left, $y)
      $y += $small.GetHeight($graphics) + 2
    }
    if (-not [string]::IsNullOrWhiteSpace([string]$data.QrPath)) {
      $client = $null
      $handler = $null
      $response = $null
      $stream = $null
      $qr = $null
      try {
        $uri = $null
        if (-not [System.Uri]::TryCreate([string]$data.QrPath, [System.UriKind]::Absolute, [ref]$uri) -or $uri.Scheme -ne 'https') {
          throw 'QR URL must use HTTPS'
        }
        $handler = New-Object System.Net.Http.HttpClientHandler
        $handler.AllowAutoRedirect = $false
        $client = New-Object System.Net.Http.HttpClient($handler)
        $client.Timeout = [TimeSpan]::FromSeconds(10)
        $response = $client.GetAsync($uri).GetAwaiter().GetResult()
        $response.EnsureSuccessStatusCode()
        if ($response.Content.Headers.ContentLength -gt 5242880) { throw 'QR image is larger than 5 MB' }
        $bytes = $response.Content.ReadAsByteArrayAsync().GetAwaiter().GetResult()
        if ($bytes.Length -gt 5242880) { throw 'QR image is larger than 5 MB' }
        $stream = New-Object System.IO.MemoryStream(,$bytes)
        $qr = [System.Drawing.Image]::FromStream($stream)
        if ($qr.Width -gt 2000 -or $qr.Height -gt 2000) { throw 'QR image dimensions are too large' }
        $size = [Math]::Min(150, $width)
        $graphics.DrawImage($qr, $left + (($width - $size) / 2), $y, $size, $size)
        $y += $size + 5
        foreach ($line in $data.QrCaptionLines) {
          $graphics.DrawString([string]$line, $small, [System.Drawing.Brushes]::Black, ($left + ($width / 2)), $y, $center)
          $y += $small.GetHeight($graphics) + 2
        }
      } catch {
        $script:qrLoadFailed = $true
        $graphics.DrawString('ไม่สามารถโหลด QR ได้', $small, [System.Drawing.Brushes]::Black, $left, $y)
        $y += $small.GetHeight($graphics) + 2
      } finally {
        if ($null -ne $qr) { $qr.Dispose() }
        if ($null -ne $stream) { $stream.Dispose() }
        if ($null -ne $response) { $response.Dispose() }
        if ($null -ne $client) { $client.Dispose() }
        if ($null -ne $handler) { $handler.Dispose() }
      }
    }
  }
  $event.HasMorePages = $false
})

$document.Print()
if ($script:qrLoadFailed) {
  throw 'QR_LOAD_FAILED: ไม่สามารถโหลด QR สำหรับใบพิมพ์แบบร้านอาหาร'
}
