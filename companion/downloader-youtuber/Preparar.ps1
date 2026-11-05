$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
New-Item -ItemType Directory -Force tools | Out-Null
Invoke-WebRequest 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe' -OutFile 'tools/yt-dlp.exe'
if (!(Test-Path 'tools/ffmpeg.exe')) {
  Invoke-WebRequest 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip' -OutFile 'tools/ffmpeg.zip'
  Expand-Archive 'tools/ffmpeg.zip' 'tools' -Force
  Get-ChildItem tools -Filter ffmpeg.exe -Recurse | Where-Object { $_.DirectoryName -ne (Join-Path $PSScriptRoot 'tools') } | Select-Object -First 1 | Copy-Item -Destination 'tools/ffmpeg.exe'
  Get-ChildItem tools -Filter ffprobe.exe -Recurse | Where-Object { $_.DirectoryName -ne (Join-Path $PSScriptRoot 'tools') } | Select-Object -First 1 | Copy-Item -Destination 'tools/ffprobe.exe'
}
Write-Host 'Listo. Abrí Iniciar.cmd para comenzar.'
