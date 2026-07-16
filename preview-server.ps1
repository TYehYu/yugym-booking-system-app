$ErrorActionPreference = "SilentlyContinue"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Port = 8765
$Address = [System.Net.IPAddress]::Parse("127.0.0.1")
$Listener = [System.Net.Sockets.TcpListener]::new($Address, $Port)

$MimeTypes = @{
  ".html" = "text/html; charset=utf-8"
  ".css" = "text/css; charset=utf-8"
  ".js" = "text/javascript; charset=utf-8"
  ".png" = "image/png"
  ".jpg" = "image/jpeg"
  ".jpeg" = "image/jpeg"
  ".svg" = "image/svg+xml"
}

function Send-Response {
  param(
    [System.Net.Sockets.NetworkStream]$Stream,
    [int]$Status,
    [string]$ContentType,
    [byte[]]$Body
  )

  $reason = switch ($Status) {
    200 { "OK" }
    403 { "Forbidden" }
    404 { "Not Found" }
    default { "OK" }
  }
  $header = "HTTP/1.1 $Status $reason`r`nContent-Type: $ContentType`r`nContent-Length: $($Body.Length)`r`nCache-Control: no-store`r`nConnection: close`r`n`r`n"
  $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
  $Stream.Write($headerBytes, 0, $headerBytes.Length)
  $Stream.Write($Body, 0, $Body.Length)
}

$Listener.Start()
Write-Host "YUGYM booking system is running."
Write-Host "Open http://127.0.0.1:$Port/index.html"
Write-Host "Keep this window open while using the booking system."

while ($true) {
  $Client = $Listener.AcceptTcpClient()
  try {
    $Stream = $Client.GetStream()
    $Buffer = New-Object byte[] 8192
    $Read = $Stream.Read($Buffer, 0, $Buffer.Length)
    if ($Read -le 0) {
      $Client.Close()
      continue
    }

    $RequestText = [System.Text.Encoding]::ASCII.GetString($Buffer, 0, $Read)
    $RequestLine = ($RequestText -split "`r?`n")[0]
    $Parts = $RequestLine -split " "
    $UrlPath = if ($Parts.Length -ge 2) { $Parts[1].Split("?")[0] } else { "/" }
    $UrlPath = [System.Uri]::UnescapeDataString($UrlPath)

    if ($UrlPath -eq "/__version") {
      $VersionParts = @("index.html", "preview-server.ps1") |
        ForEach-Object {
          $Path = Join-Path $Root $_
          if (Test-Path $Path) { (Get-Item $Path).LastWriteTimeUtc.Ticks } else { 0 }
        }
      $VersionText = $VersionParts -join ":"
      $Body = [System.Text.Encoding]::UTF8.GetBytes($VersionText)
      Send-Response -Stream $Stream -Status 200 -ContentType "text/plain; charset=utf-8" -Body $Body
      $Client.Close()
      continue
    }

    if ($UrlPath -eq "/" -or $UrlPath -eq "") { $UrlPath = "/index.html" }
    $Relative = $UrlPath.TrimStart("/").Replace("/", [System.IO.Path]::DirectorySeparatorChar)
    $FilePath = [System.IO.Path]::GetFullPath((Join-Path $Root $Relative))
    $RootPath = [System.IO.Path]::GetFullPath($Root)

    if (!$FilePath.StartsWith($RootPath)) {
      $Body = [System.Text.Encoding]::UTF8.GetBytes("Forbidden")
      Send-Response -Stream $Stream -Status 403 -ContentType "text/plain; charset=utf-8" -Body $Body
      $Client.Close()
      continue
    }

    if (!(Test-Path $FilePath -PathType Leaf)) {
      $Body = [System.Text.Encoding]::UTF8.GetBytes("Not found")
      Send-Response -Stream $Stream -Status 404 -ContentType "text/plain; charset=utf-8" -Body $Body
      $Client.Close()
      continue
    }

    $Extension = [System.IO.Path]::GetExtension($FilePath).ToLowerInvariant()
    $ContentType = if ($MimeTypes.ContainsKey($Extension)) { $MimeTypes[$Extension] } else { "application/octet-stream" }
    $Body = [System.IO.File]::ReadAllBytes($FilePath)
    Send-Response -Stream $Stream -Status 200 -ContentType $ContentType -Body $Body
  } finally {
    $Client.Close()
  }
}
