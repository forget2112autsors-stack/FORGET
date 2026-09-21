# FORGET desktop (.exe) qayta build qilish
# Ishlatish: shu faylni PowerShell'da ishga tushiring, yoki o'ng tugma -> "Run with PowerShell"

$ErrorActionPreference = "Stop"

$src = $PSScriptRoot
$build = "C:\Users\user\forget-desktop-build"

Write-Host "1) Fayllarni yangilanmoqda: $src -> $build"
Copy-Item "$src\index.html" "$build\index.html" -Force
Copy-Item "$src\app.js" "$build\app.js" -Force
Copy-Item "$src\styles.css" "$build\styles.css" -Force
Copy-Item "$src\electron-main.js" "$build\electron-main.js" -Force
Copy-Item "$src\package.json" "$build\package.json" -Force
Copy-Item "$src\icon.ico" "$build\icon.ico" -Force
Copy-Item "$src\icon.png" "$build\icon.png" -Force
Copy-Item "$src\vendor\*" "$build\vendor\" -Recurse -Force

Write-Host "2) .exe build qilinmoqda..."
Push-Location $build
$env:ELECTRON_RUN_AS_NODE = $null
Remove-Item Env:\ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
npm run dist
Pop-Location

Write-Host ""
Write-Host "Tayyor. O'rnatuvchi fayl:"
Write-Host "$build\dist\FORGET Setup 1.0.0.exe"
