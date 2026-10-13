$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Printing;
public static class DistriHubPrinter {
 public static string[] Printers() {
  var names = new List<string>();
  foreach(string name in PrinterSettings.InstalledPrinters) names.Add(name);
  return names.ToArray();
 }
 public static void Print(string name, int width, string text) {
  using(var document = new PrintDocument()) {
   document.PrinterSettings.PrinterName = name;
   if(!document.PrinterSettings.IsValid) throw new Exception("Impressora nao encontrada no Windows.");
   document.DocumentName = "Cupom DistriHub";
   document.PrintController = new StandardPrintController();
   document.DefaultPageSettings.Margins = new Margins(8,8,8,8);
   document.DefaultPageSettings.PaperSize = new PaperSize("Cupom", (int)Math.Round(width / 25.4 * 100), 1100);
   var lines = text.Replace("\r", "").Split('\n');
   int cursor = 0;
   using(var font = new Font("Arial", 9)) {
    using(var measurement = document.PrinterSettings.CreateMeasurementGraphics()) {
     float measuredHeight = 24;
     foreach(var line in lines) measuredHeight += Math.Max(font.GetHeight(measurement), measurement.MeasureString(line, font, document.DefaultPageSettings.PaperSize.Width - 16).Height);
     document.DefaultPageSettings.PaperSize = new PaperSize("Cupom", document.DefaultPageSettings.PaperSize.Width, (int)Math.Min(1100, Math.Max(100, Math.Ceiling(measuredHeight))));
    }
    document.PrintPage += (sender, page) => {
     float top = page.MarginBounds.Top;
     float availableWidth = Math.Min(page.MarginBounds.Width, page.PageSettings.PrintableArea.Width);
     while(cursor < lines.Length) {
      var line = lines[cursor];
      var height = Math.Max(font.GetHeight(page.Graphics), page.Graphics.MeasureString(line, font, (int)availableWidth).Height);
      if(top + height > page.MarginBounds.Bottom && top > page.MarginBounds.Top) break;
      page.Graphics.DrawString(line, font, Brushes.Black, new RectangleF(page.MarginBounds.Left, top, availableWidth, height));
      top += height; cursor++;
     }
     page.HasMorePages = cursor < lines.Length;
    };
    document.Print();
   }
  }
 }
}
'@
# Single listener per computer. It accepts browser requests only from DistriHub.
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add('http://localhost:17891/')
try { $listener.Start() } catch { exit 1 }
$jobs = @{}
while ($listener.IsListening) {
 $context = $listener.GetContext()
 $response = $context.Response
 try {
  if (-not [System.Net.IPAddress]::IsLoopback($context.Request.RemoteEndPoint.Address)) { $response.StatusCode = 403; throw 'Apenas conexoes locais.' }
  $origin = $context.Request.Headers['Origin']
  if ($origin -notin @('https://distrihub.com.br', 'https://www.distrihub.com.br')) { $response.StatusCode = 403; throw 'Origem nao autorizada.' }
  $response.Headers.Add('Access-Control-Allow-Origin', $origin)
  $response.Headers.Add('Vary', 'Origin')
  $response.Headers.Add('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  $response.Headers.Add('Access-Control-Allow-Headers', 'Content-Type')
  $response.Headers.Add('Access-Control-Allow-Private-Network', 'true')
  $response.Headers.Add('Cache-Control', 'no-store')
  if ($context.Request.HttpMethod -eq 'OPTIONS') { $response.StatusCode = 204; continue }
  $path = $context.Request.Url.AbsolutePath
  if ($path -eq '/printers' -and $context.Request.HttpMethod -eq 'GET') {
   $result = @{ printers = @([DistriHubPrinter]::Printers()); version = 1 }
  } elseif ($path -eq '/print' -and $context.Request.HttpMethod -eq 'POST') {
   if ($context.Request.ContentType -notmatch '^application/json' -or $context.Request.ContentLength64 -lt 1 -or $context.Request.ContentLength64 -gt 131072) { $response.StatusCode = 400; throw 'Pedido de impressao invalido.' }
   $reader = New-Object System.IO.StreamReader($context.Request.InputStream, [System.Text.Encoding]::UTF8)
   try { $payload = $reader.ReadToEnd() | ConvertFrom-Json } finally { $reader.Dispose() }
   $jobId = [guid]::Empty
   if (-not [guid]::TryParse([string]$payload.id, [ref]$jobId) -or $payload.width -notin @(58,80) -or $payload.text -isnot [string] -or $payload.text.Length -gt 50000 -or $payload.printer -notin @([DistriHubPrinter]::Printers())) { $response.StatusCode = 400; throw 'Confira a impressora e o tamanho do cupom.' }
   if ($jobs.ContainsKey($payload.id)) {
    if ($jobs[$payload.id].status -ne 'queued') { $response.StatusCode = 409; throw 'Impressao anterior sem confirmacao. Confira o cupom antes de reenviar.' }
   } else {
    if ($jobs.Count -ge 10000) { $response.StatusCode = 503; throw 'Reinicie o conector antes de imprimir novos cupons.' }
    $jobs[$payload.id] = @{ status = 'uncertain' }
    [DistriHubPrinter]::Print($payload.printer, [int]$payload.width, $payload.text)
    $jobs[$payload.id] = @{ status = 'queued' }
   }
   $result = @{ status = 'queued' }
  } else { $response.StatusCode = 404; throw 'Endereco nao encontrado.' }
  $json = $result | ConvertTo-Json -Compress
 } catch {
  if ($response.StatusCode -eq 200) { $response.StatusCode = 500 }
  $json = @{ error = $_.Exception.Message } | ConvertTo-Json -Compress
 } finally {
  if ($response.StatusCode -ne 204) {
   $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
   $response.ContentType = 'application/json; charset=utf-8'
   $response.ContentLength64 = $bytes.Length
   try { $response.OutputStream.Write($bytes,0,$bytes.Length) } catch {}
  }
  $response.Close()
 }
}
