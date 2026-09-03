# Download YuJian production model assets into android/app/src/main/assets.
# Mirrors the original Android CI flow:
#   - MODEL_M1_v0.2 classifier (fish_classifier.tflite)
#   - DET_FISH_v0.1 detector bundle (ONNX + metadata + contract)
# Note: ASCII-only on purpose - Windows PowerShell 5.1 misparses BOM-less UTF-8.
param(
    [switch]$Force
)

$ErrorActionPreference = 'Stop'

# Windows PowerShell 5.1 defaults to TLS 1.0/1.1; GitHub requires TLS 1.2+.
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Root = Split-Path -Parent $PSScriptRoot
$AssetsDir = Join-Path $Root 'android/app/src/main/assets'
New-Item -ItemType Directory -Force -Path $AssetsDir | Out-Null

$ClassifierUrl = 'https://github.com/pan277942135/Yujian/releases/download/mobile-model-v0.2/fish_classifier_v0_2.tflite'
$ClassifierPath = Join-Path $AssetsDir 'fish_classifier.tflite'
$ClassifierSha256 = '9575ede5c6c85b850647016d76e8e5175fa9ea6b609c47c83f54b4062e47d14e'
$ClassifierBytes = 6220308

$DetectorBundleUrl = 'https://github.com/pan277942135/Yujian/releases/download/detector-model-v0.1/det_fish_v0_1_android_bundle.zip'
$DetectorBundleSha256 = '246ddacaf89ca7ecc9c64a47d3e12c5ee9088d92c763a38626778505ae8c15ee'

function Get-FileSha256([string]$Path) {
    $stream = [System.IO.File]::OpenRead($Path)
    try {
        $sha = [System.Security.Cryptography.SHA256]::Create()
        ($sha.ComputeHash($stream) | ForEach-Object { $_.ToString('x2') }) -join ''
    } finally {
        $stream.Dispose()
    }
}

function Test-Asset([string]$Path, [string]$ExpectedSha, [long]$ExpectedSize) {
    if (-not (Test-Path $Path)) { return $false }
    if ($ExpectedSize -gt 0 -and (Get-Item $Path).Length -ne $ExpectedSize) { return $false }
    return (Get-FileSha256 $Path) -eq $ExpectedSha
}

$needsClassifier = $Force -or -not (Test-Asset $ClassifierPath $ClassifierSha256 $ClassifierBytes)
$needsDetector = $Force

foreach ($name in @('fish_detector_yolox_nano_v0_1.onnx', 'detector_metadata.json', 'recognition_pipeline_v1.json')) {
    if (-not (Test-Path (Join-Path $AssetsDir $name))) { $needsDetector = $true }
}

if (-not ($needsClassifier -or $needsDetector)) {
    Write-Host 'Model assets already present and verified. Nothing to do.' -ForegroundColor Green
    exit 0
}

$TempDir = Join-Path $Root '.model-download'
New-Item -ItemType Directory -Force -Path $TempDir | Out-Null

try {
    if ($needsClassifier) {
        Write-Host '==> Downloading MODEL_M1_v0.2 classifier (fish_classifier_v0_2.tflite)...' -ForegroundColor Cyan
        Invoke-WebRequest -Uri $ClassifierUrl -OutFile $ClassifierPath
        if (-not (Test-Asset $ClassifierPath $ClassifierSha256 $ClassifierBytes)) {
            throw "Classifier SHA256/size mismatch: $ClassifierPath"
        }
        Write-Host '    Classifier verified.' -ForegroundColor Green
    }

    if ($needsDetector) {
        $bundlePath = Join-Path $TempDir 'det_fish_v0_1_android_bundle.zip'
        Write-Host '==> Downloading DET_FISH_v0.1 detector bundle...' -ForegroundColor Cyan
        Invoke-WebRequest -Uri $DetectorBundleUrl -OutFile $bundlePath
        $actualSha = Get-FileSha256 $bundlePath
        if ($actualSha -ne $DetectorBundleSha256) {
            throw "Detector bundle SHA256 mismatch: $actualSha"
        }
        Write-Host '    Bundle SHA256 verified, extracting...' -ForegroundColor Green
        $extractDir = Join-Path $TempDir 'bundle'
        if (Test-Path $extractDir) { Remove-Item -Recurse -Force $extractDir }
        Expand-Archive -Path $bundlePath -DestinationPath $extractDir -Force
        foreach ($name in @('fish_detector_yolox_nano_v0_1.onnx', 'detector_metadata.json', 'recognition_pipeline_v1.json')) {
            Copy-Item (Join-Path $extractDir $name) (Join-Path $AssetsDir $name) -Force
        }
        Write-Host '    Detector assets installed.' -ForegroundColor Green
    }
} finally {
    if (Test-Path $TempDir) { Remove-Item -Recurse -Force $TempDir }
}

Write-Host ''
Write-Host 'All model assets ready:' -ForegroundColor Green
Get-ChildItem $AssetsDir | ForEach-Object { Write-Host ('  {0}  {1:N0} bytes' -f $_.Name, $_.Length) }
