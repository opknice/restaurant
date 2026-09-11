param(
  [Parameter(Mandatory = $true)][string]$PrinterName,
  [Parameter(Mandatory = $true)][string]$FontName,
  [Parameter(Mandatory = $true)][string]$PayloadBase64
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

if (-not (Get-Printer -Name $PrinterName -ErrorAction SilentlyContinue)) {
  throw "Configured printer was not found: $PrinterName"
}

$json = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($PayloadBase64))
$data = $json | ConvertFrom-Json
$document = New-Object System.Drawing.Printing.PrintDocument
$document.PrinterSettings.PrinterName = $PrinterName
$document.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(8, 8, 5, 5)

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

  $graphics.DrawLine([System.Drawing.Pens]::Black, $left, $y, $right, $y)
  $y += 4
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
  }
  $event.HasMorePages = $false
})

$document.Print()
