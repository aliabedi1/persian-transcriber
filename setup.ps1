$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
function Download-Checked($Url, $Destination, $ExpectedHash) {
    if ((Test-Path -LiteralPath $Destination) -and ((Get-FileHash -LiteralPath $Destination -Algorithm SHA256).Hash -eq $ExpectedHash)) { return }
    $taskPartial = "$Destination.partial"
    & curl.exe -L --fail --retry 3 $Url -o $taskPartial
    if ($LASTEXITCODE -ne 0) { throw "Download failed: $Url" }
    if ((Get-FileHash -LiteralPath $taskPartial -Algorithm SHA256).Hash -ne $ExpectedHash) { throw "Checksum mismatch: $Destination" }
    Move-Item -LiteralPath $taskPartial -Destination $Destination -Force
}
New-Item -ItemType Directory -Force runtime, models, runtime/ffmpeg | Out-Null
$taskEngine = 'runtime/engine.zip'
# Engine hash is checked against GitHub's release asset digest.
$taskRelease = Invoke-RestMethod 'https://api.github.com/repos/ggml-org/whisper.cpp/releases/tags/b5454'
$taskAsset = $taskRelease.assets | Where-Object name -eq 'whisper-bin-x64.zip'
if (!$taskAsset.digest.StartsWith('sha256:')) { throw 'GitHub did not provide a release checksum.' }
Download-Checked $taskAsset.browser_download_url $taskEngine $taskAsset.digest.Substring(7)
Expand-Archive -LiteralPath $taskEngine -DestinationPath runtime/whisper -Force
Download-Checked 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin' 'models/ggml-large-v3-turbo-q5_0.bin' '394221709CD5AD1F40C46E6031CA61BCE88931E6E088C188294C6D5A55FFA7E2'
$taskFfmpeg = Get-Command ffmpeg.exe -ErrorAction SilentlyContinue
if (!$taskFfmpeg) { throw 'Install FFmpeg with: winget install --id Gyan.FFmpeg.Shared -e. Reopen PowerShell, then run setup.ps1 again.' }
$taskFfmpegDir = Split-Path $taskFfmpeg.Source
Copy-Item -LiteralPath $taskFfmpeg.Source -Destination runtime/ffmpeg/ffmpeg.exe -Force
Get-ChildItem -LiteralPath $taskFfmpegDir -Filter '*.dll' | Copy-Item -Destination runtime/ffmpeg -Force
npm.cmd ci
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
# Fetch Electron during setup, never on the first offline launch.
if (!(Test-Path -LiteralPath 'node_modules/electron/dist/electron.exe')) {
    $taskElectronVersion = (Get-Content 'node_modules/electron/package.json' | ConvertFrom-Json).version
    $taskElectronName = "electron-v$taskElectronVersion-win32-x64.zip"
    $taskElectronBase = "https://github.com/electron/electron/releases/download/v$taskElectronVersion"
    & curl.exe -sL --fail "$taskElectronBase/SHASUMS256.txt" -o runtime/electron-shasums.txt
    if ($LASTEXITCODE -ne 0) { throw 'Could not download Electron checksums.' }
    $taskChecksumLine = Get-Content runtime/electron-shasums.txt | Where-Object { ($_ -split '\s+')[1].TrimStart('*') -eq $taskElectronName }
    if (!$taskChecksumLine) { throw 'Electron checksum is missing.' }
    Download-Checked "$taskElectronBase/$taskElectronName" 'runtime/electron.zip' $taskChecksumLine.Split(' ')[0]
    Expand-Archive -LiteralPath runtime/electron.zip -DestinationPath node_modules/electron/dist -Force
    Set-Content node_modules/electron/path.txt 'electron.exe' -NoNewline
}
npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw 'Build failed.' }
Write-Host 'Ready. Run npm start. You can now disconnect the internet.'
