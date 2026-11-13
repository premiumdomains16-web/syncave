<#
  Builds the Syncave Android app.

  Usage (from the project folder, in PowerShell):
    .\scripts\android.ps1                                   # app loads http://10.0.2.2:3000 (Android emulator → this PC)
    .\scripts\android.ps1 -ServerUrl http://172.20.10.5:3000 # app on a real phone, same Wi-Fi as this PC
    .\scripts\android.ps1 -ServerUrl https://app.syncave.com # production (must be https)
    .\scripts\android.ps1 -Open                             # also open the project in Android Studio

  Output: android\app\build\outputs\apk\debug\app-debug.apk

  Requirements: Node 22+ and Java 21+ (Capacitor 8). If the installed versions are
  older, portable copies in %USERPROFILE%\.syncave-tools\node22 and \jdk21 are used
  for this script only (override the folder with $env:SYNCAVE_TOOLS).
#>
param(
  [string]$ServerUrl = $(if ($env:CAP_SERVER_URL) { $env:CAP_SERVER_URL } else { 'http://10.0.2.2:3000' }),
  [switch]$Open
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$tools = if ($env:SYNCAVE_TOOLS) { $env:SYNCAVE_TOOLS } else { Join-Path $HOME '.syncave-tools' }

function Major([string]$v) { if ($v -match '(\d+)') { [int]$Matches[1] } else { 0 } }

# --- Node 22+ ---
$nodeMajor = 0
try { $nodeMajor = Major (node -v) } catch {}
if ($nodeMajor -lt 22) {
  if (-not (Test-Path "$tools\node22\node.exe")) { throw "Node 22+ is required. Install it, or put a portable copy in $tools\node22." }
  $env:Path = "$tools\node22;$env:Path"
  Write-Host "Using portable Node $(node -v) from $tools\node22"
}

# --- Java 21+ ---
$javaOk = $false
if ($env:JAVA_HOME -and (Test-Path "$env:JAVA_HOME\bin\java.exe")) {
  $ver = & "$env:JAVA_HOME\bin\java.exe" -version 2>&1 | Select-Object -First 1
  $javaOk = (Major (($ver -split '"')[1])) -ge 21
}
if (-not $javaOk) {
  if (-not (Test-Path "$tools\jdk21\bin\java.exe")) { throw "Java 21+ is required. Install it, or put a portable JDK in $tools\jdk21." }
  $env:JAVA_HOME = "$tools\jdk21"
  Write-Host "Using portable Java from $env:JAVA_HOME"
}

# --- Android SDK ---
if (-not $env:ANDROID_HOME) { $env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
if (-not (Test-Path $env:ANDROID_HOME)) { throw "Android SDK not found at $env:ANDROID_HOME. Install Android Studio or set ANDROID_HOME." }

Write-Host "`n==> Building web assets"
npm run build
if ($LASTEXITCODE) { throw 'Web build failed' }

if (-not (Test-Path 'android')) {
  Write-Host "`n==> Adding Android platform"
  npx cap add android
  if ($LASTEXITCODE) { throw 'cap add android failed' }
}

Write-Host "`n==> Syncing (app will load $ServerUrl/app)"
$env:CAP_SERVER_URL = $ServerUrl
npx cap sync android
if ($LASTEXITCODE) { throw 'cap sync failed' }

if (Test-Path 'assets\icon-only.png') {
  Write-Host "`n==> Generating app icons and splash screens"
  npx --yes @capacitor/assets@4 generate --android --iconBackgroundColor '#ffffff' --splashBackgroundColor '#ffffff'
  if ($LASTEXITCODE) { throw 'Icon generation failed' }
}

Write-Host "`n==> Building debug APK"
Push-Location android
try {
  .\gradlew.bat assembleDebug --no-daemon
  if ($LASTEXITCODE) { throw 'Gradle build failed' }
} finally { Pop-Location }

$apk = Join-Path $root 'android\app\build\outputs\apk\debug\app-debug.apk'
Write-Host "`nDone: $apk" -ForegroundColor Green
if ($Open) { npx cap open android }
