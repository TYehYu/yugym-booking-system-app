$ErrorActionPreference = "SilentlyContinue"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Port = 8765
$Url = "http://127.0.0.1:$Port/index.html"
$Server = Join-Path $Root "preview-server.ps1"

function Test-BookingServer {
  try {
    $client = New-Object Net.Sockets.TcpClient
    $async = $client.BeginConnect("127.0.0.1", $Port, $null, $null)
    $connected = $async.AsyncWaitHandle.WaitOne(300)
    if ($connected) {
      $client.EndConnect($async)
      $client.Close()
      return $true
    }
    $client.Close()
    return $false
  } catch {
    return $false
  }
}

if (!(Test-Path $Server)) {
  Start-Process (Join-Path $Root "index.html")
  exit
}

if (!(Test-BookingServer)) {
  Start-Process `
    -FilePath "powershell.exe" `
    -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$Server`"" `
    -WorkingDirectory $Root

  for ($i = 0; $i -lt 30; $i++) {
    if (Test-BookingServer) { break }
    Start-Sleep -Milliseconds 200
  }
}

Start-Process $Url
