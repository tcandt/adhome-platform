param([string]$InputDocx, [string]$OutputPdf)
$ErrorActionPreference = 'Stop'
$word = $null
$document = $null
try {
  $word = New-Object -ComObject Word.Application
  $word.Visible = $false
  $word.DisplayAlerts = 0
  $document = $word.Documents.Open($InputDocx, $false, $true)
  $document.ExportAsFixedFormat($OutputPdf, 17)
} finally {
  if ($document) { $document.Close($false); [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($document) }
  if ($word) { $word.Quit(); [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) }
}
