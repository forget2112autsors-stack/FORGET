# FORGET mobil (Android .apk) qayta build qilish
# Ishlatish: shu faylni PowerShell'da ishga tushiring, yoki o'ng tugma -> "Run with PowerShell"
#
# RELEASE yoki DEBUG?
#   Debug APK imzolanmagan va "debuggable" — unga ulanib, ilova ma'lumotlarini
#   o'qib olish mumkin. Xaridorga tarqatiladigan nusxa RELEASE bo'lishi shart.
#   Shu sabab standart holat endi "release". Sinov uchun tezda debug yig'ish
#   kerak bo'lsa:  .\build-mobile.ps1 -Variant debug
#
# RELEASE uchun bir martalik tayyorgarlik (keystore):
#   1) Kalit yarating (parolni ishonchli joyda saqlang — YO'QOTSANGIZ ilovani
#      boshqa yangilay olmaysiz):
#        keytool -genkey -v -keystore C:\Users\user\forget-release.jks `
#          -keyalg RSA -keysize 2048 -validity 10000 -alias forget
#   2) <build>\android\keystore.properties faylini yarating:
#        storeFile=C:\\Users\\user\\forget-release.jks
#        storePassword=...
#        keyAlias=forget
#        keyPassword=...
#   3) <build>\android\app\build.gradle ichiga signingConfigs qo'shing:
#        def kp = new Properties()
#        def kpFile = rootProject.file("keystore.properties")
#        if (kpFile.exists()) kp.load(new FileInputStream(kpFile))
#        android {
#          signingConfigs { release {
#            storeFile file(kp['storeFile']); storePassword kp['storePassword']
#            keyAlias kp['keyAlias'];        keyPassword kp['keyPassword']
#          } }
#          buildTypes { release { signingConfig signingConfigs.release } }
#        }

param(
  [ValidateSet("release", "debug")]
  [string]$Variant = "release"
)

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

Write-Host "3) .apk build qilinmoqda ($Variant)..."
Push-Location "$build\android"
if ($Variant -eq "release") {
  .\gradlew.bat assembleRelease
} else {
  .\gradlew.bat assembleDebug
}
Pop-Location
Pop-Location

if ($Variant -eq "release") {
  $apk = "$build\android\app\build\outputs\apk\release\app-release.apk"
} else {
  $apk = "$build\android\app\build\outputs\apk\debug\app-debug.apk"
}
if (-not (Test-Path $apk)) {
  # Imzolash sozlanmagan bo'lsa Gradle "app-release-unsigned.apk" chiqaradi —
  # bunday faylni telefonga o'rnatib bo'lmaydi, shu sabab aniq aytamiz.
  throw "APK topilmadi: $apk`nRelease uchun keystore sozlanganini tekshiring (fayl boshidagi izohga qarang)."
}
Copy-Item $apk "$src\FORGET-mobile.apk" -Force

Write-Host ""
Write-Host "Tayyor. APK fayl ($Variant):"
Write-Host "$apk"
Write-Host "(Google Drive'ga ham nusxalandi: $src\FORGET-mobile.apk)"
