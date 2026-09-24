# FORGET mobil (Android .apk) qayta build qilish
# Ishlatish: shu faylni PowerShell'da ishga tushiring, yoki o'ng tugma -> "Run with PowerShell"

$ErrorActionPreference = "Stop"

$src = $PSScriptRoot
$build = "C:\Users\user\forget-mobile-build"

Write-Host "1) Fayllarni yangilanmoqda: $src -> $build\www"
Copy-Item "$src\index.html" "$build\www\index.html" -Force
Copy-Item "$src\app.js" "$build\www\app.js" -Force
Copy-Item "$src\styles.css" "$build\www\styles.css" -Force
Copy-Item "$src\vendor\*" "$build\www\vendor\" -Recurse -Force

Write-Host "2) Capacitor android loyihasiga sinxronlanmoqda..."
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-21.0.12.101-hotspot"
$env:ANDROID_HOME = "C:\Android\sdk"
Push-Location $build
npx cap sync android

Write-Host "3) .apk build qilinmoqda..."
Push-Location "$build\android"
.\gradlew.bat assembleDebug
Pop-Location
Pop-Location

$apk = "$build\android\app\build\outputs\apk\debug\app-debug.apk"
Copy-Item $apk "$src\FORGET-mobile.apk" -Force

Write-Host ""
Write-Host "Tayyor. APK fayl:"
Write-Host "$apk"
Write-Host "(Google Drive'ga ham nusxalandi: $src\FORGET-mobile.apk)"
