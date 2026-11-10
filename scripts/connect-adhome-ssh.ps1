param(
    [switch]$Bitvise
)

$ErrorActionPreference = 'Stop'
$cloudflared = 'C:\Program Files (x86)\cloudflared\cloudflared.exe'
$port = 2222

if (-not (Test-Path -LiteralPath $cloudflared)) {
    throw "Khong tim thay cloudflared: $cloudflared"
}

if ($Bitvise) {
    $profile = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'AdHome VPS 101 Cloudflare.bscp'
    $bitvise = 'C:\Program Files (x86)\Bitvise SSH Client\BvSsh.exe'
    if (-not (Test-Path -LiteralPath $bitvise)) { throw "Khong tim thay Bitvise: $bitvise" }
    if (-not (Test-Path -LiteralPath $profile)) { throw "Khong tim thay profile: $profile" }
}

$listener = Get-NetTCPConnection -LocalAddress '127.0.0.1' -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($listener) {
    $owner = Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue
    if ($owner.ProcessName -ne 'cloudflared') {
        throw "Cong $port dang duoc dung boi tien trinh khac."
    }
} else {
    Start-Process -FilePath $cloudflared -ArgumentList @('access', 'tcp', '--hostname', 'server.adhome.vn', '--url', "127.0.0.1:$port") -WindowStyle Hidden | Out-Null
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        Start-Sleep -Milliseconds 500
        $listener = Get-NetTCPConnection -LocalAddress '127.0.0.1' -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($listener) { break }
    }
    if (-not $listener) { throw 'Cloudflare TCP proxy khong khoi dong duoc.' }
}

if ($Bitvise) {
    Start-Process -FilePath $bitvise -ArgumentList @("-profile=`"$profile`"", '-loginOnStartup') | Out-Null
    Write-Output "Bitvise dang ket noi VPS qua 127.0.0.1:$port"
} else {
    Write-Output "Proxy san sang tai 127.0.0.1:$port. Terminal: ssh server.adhome.vn"
}
