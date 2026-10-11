# Package without electron-builder.
#
# electron-builder essentially stitches three things together, and that is all this
# script does by hand: the Electron runtime, the app files, and the native module.
# The upside is that it needs no extra tooling installed.
#
# Output: <repo root>\dist\<productName>-<version>-portable.zip
#
# Normally invoked by 打包.bat in the repo root.
#
# IMPORTANT: this file deliberately contains NO non-ASCII literals.
# Windows PowerShell 5.1 reads .ps1 files using the system ANSI codepage unless the
# file has a UTF-8 BOM, which silently mangles Chinese string literals and can even
# break parsing. The product name (which is Chinese) is therefore read from
# package.json, which is decoded as UTF-8 explicitly.

$ErrorActionPreference = 'Stop'

function Read-JsonUtf8($path) {
  $text = [System.IO.File]::ReadAllText($path, [System.Text.UTF8Encoding]::new($false))
  return $text | ConvertFrom-Json
}

$app    = Split-Path -Parent $PSScriptRoot        # overlay\
$root   = Split-Path -Parent $app                 # repo root
$dist   = Join-Path $root 'dist'

$pkg = Read-JsonUtf8 (Join-Path $app 'package.json')
$ver = $pkg.version
$name = 'FadeLine'
if ($pkg.build -and $pkg.build.productName) { $name = $pkg.build.productName }

$out    = Join-Path $dist $name
$appDst = Join-Path $out 'resources\app'
$exeSrc = Join-Path $app 'node_modules\electron\dist\electron.exe'

# The zip filename must be ASCII. GitHub strips non-ASCII characters from release
# asset names, so "灵光一挂-0.1.0-portable.zip" would show up as "-0.1.0-portable.zip".
# The folder and the exe inside the zip keep the Chinese product name - only the
# outer filename has to be ASCII.
$zip = Join-Path $dist ("FadeLine-$ver-portable.zip")

Write-Host ("  product : " + $name)
Write-Host ("  version : " + $ver)
Write-Host ""

# A running instance holds the exe open, so shut it down first.
# Only our own product, plus an electron.exe that actually lives inside this project's
# node_modules - a blanket -Name 'electron' would also kill whatever other Electron app
# the developer happens to be running.
$self = $app
Get-Process -ErrorAction SilentlyContinue | Where-Object {
  if ($_.ProcessName -eq $name) { return $true }
  if ($_.ProcessName -ne 'electron') { return $false }
  try { return ($_.Path -and $_.Path.StartsWith($self, [StringComparison]::OrdinalIgnoreCase)) } catch { return $false }
} | Stop-Process -Force
Start-Sleep -Seconds 2

if (Test-Path $out) { Remove-Item $out -Recurse -Force }
New-Item -ItemType Directory -Force -Path $appDst | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $appDst 'node_modules') | Out-Null

# 1. Electron runtime
$ed = Split-Path -Parent $exeSrc
if (-not (Test-Path $exeSrc)) {
  throw "Electron runtime not found at $ed - run 'npm install' in overlay first"
}
Write-Host "  [1/6] copying Electron runtime..."
Copy-Item (Join-Path $ed '*') $out -Recurse -Force

# 1b. Electron ships ~50 locale .pak files (tens of MB). The app's own UI is Chinese and
#     Electron's fallback is en-US, so keep those two and drop the rest.
$locales = Join-Path $out 'locales'
if (Test-Path $locales) {
  $keep = @('zh-CN.pak', 'en-US.pak')
  Get-ChildItem $locales -Filter '*.pak' | Where-Object { $keep -notcontains $_.Name } | Remove-Item -Force
  Write-Host ("  [2/6] locales trimmed to " + (@(Get-ChildItem $locales).Count) + " file(s)")
}

# 2. App files (mirrors the electron-builder "files" whitelist: no dev/, no logs,
#    no local config.json - otherwise this machine's settings get baked in)
Write-Host "  [3/6] copying app files..."
$skip = @('dev', 'node_modules', 'overlay.log', 'config.json', 'config.json.bak')
Get-ChildItem $app |
  Where-Object { $skip -notcontains $_.Name -and $_.Name -notlike '_*' } |
  ForEach-Object { Copy-Item $_.FullName $appDst -Recurse -Force }

# 3. Native modules (koffi calls the Windows APIs, it must ship as-is)
Write-Host "  [4/6] copying native modules..."
foreach ($m in @('koffi', '@koromix')) {
  $src = Join-Path $app "node_modules\$m"
  if (Test-Path $src) { Copy-Item $src (Join-Path $appDst "node_modules\$m") -Recurse -Force }
}

# 4. Rename the executable
Write-Host "  [5/6] renaming executable..."
Move-Item (Join-Path $out 'electron.exe') (Join-Path $out "$name.exe") -Force

# 5. Zip
Write-Host "  [6/6] compressing (roughly 270 MB, this takes a while)..."
if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path $out -DestinationPath $zip -CompressionLevel Optimal -Force

Write-Host ""
Write-Host ("  done : " + $zip)
Write-Host ("  size : " + [Math]::Round((Get-Item $zip).Length / 1MB, 1) + " MB")
