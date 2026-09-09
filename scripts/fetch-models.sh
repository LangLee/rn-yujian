#!/usr/bin/env bash
# 拉取拍照识鱼所需的端侧模型资产（对齐原工程 CI 的 download-and-gate 流程）：
#   1. classifier：GitHub Release pan277942135/Yujian → mobile-model-v0.2
#      → fish_classifier_v0_2.tflite（固定 SHA256/大小，与 FishRecognitionEngine 常量一致）
#   2. detector：同仓库 → detector-model-v0.1 → det_fish_v0_1_android_bundle.zip
#      （metadata 与 onnx 二进制自校验：SHA256 + 字节数）
# 校验通过后安装到 android/app/src/main/assets/。assets 变更需重新构建，不会热更新。
set -euo pipefail

REPO="pan277942135/Yujian"
ASSETS_DIR="$(cd "$(dirname "$0")/.." && pwd)/android/app/src/main/assets"
WORK_DIR="$(mktemp -d /tmp/yujian-models.XXXXXX)"

CLASSIFIER_URL="https://github.com/${REPO}/releases/download/mobile-model-v0.2/fish_classifier_v0_2.tflite"
DETECTOR_URL="https://github.com/${REPO}/releases/download/detector-model-v0.1/det_fish_v0_1_android_bundle.zip"

CLASSIFIER_SHA256="9575ede5c6c85b850647016d76e8e5175fa9ea6b609c47c83f54b4062e47d14e"
CLASSIFIER_BYTES="6220308"

sha256() { shasum -a 256 "$1" | awk '{print $1}'; }

echo "==> 下载 classifier (mobile-model-v0.2)"
curl -fSL -o "$WORK_DIR/fish_classifier_v0_2.tflite" "$CLASSIFIER_URL"

echo "==> 校验 classifier 固定哈希/大小"
[ "$(stat -f%z "$WORK_DIR/fish_classifier_v0_2.tflite")" = "$CLASSIFIER_BYTES" ] \
  || { echo "✗ classifier 大小不匹配"; exit 1; }
[ "$(sha256 "$WORK_DIR/fish_classifier_v0_2.tflite")" = "$CLASSIFIER_SHA256" ] \
  || { echo "✗ classifier SHA256 不匹配"; exit 1; }

echo "==> 下载 detector bundle (detector-model-v0.1)"
curl -fSL -o "$WORK_DIR/det_fish_v0_1_android_bundle.zip" "$DETECTOR_URL"
unzip -oq "$WORK_DIR/det_fish_v0_1_android_bundle.zip" -d "$WORK_DIR/det_bundle"

ONNX="$WORK_DIR/det_bundle/fish_detector_yolox_nano_v0_1.onnx"
META="$WORK_DIR/det_bundle/detector_metadata.json"
[ -f "$ONNX" ] && [ -f "$META" ] || { echo "✗ bundle 缺少 onnx 或 detector_metadata.json"; exit 1; }

echo "==> 校验 detector metadata 与 onnx 二进制配套"
ACTUAL_SHA="$(sha256 "$ONNX")"
EXPECTED_SHA="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["onnx_sha256"])' "$META")"
EXPECTED_BYTES="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["onnx_bytes"])' "$META")"
[ "$ACTUAL_SHA" = "$EXPECTED_SHA" ] || { echo "✗ onnx SHA256 与 metadata 不一致"; exit 1; }
[ "$(stat -f%z "$ONNX")" = "$EXPECTED_BYTES" ] || { echo "✗ onnx 大小与 metadata 不一致"; exit 1; }

echo "==> 安装到 $ASSETS_DIR"
mkdir -p "$ASSETS_DIR"
cp "$ONNX" "$ASSETS_DIR/"
cp "$META" "$ASSETS_DIR/"
cp "$WORK_DIR/det_bundle/recognition_pipeline_v1.json" "$ASSETS_DIR/"
cp "$WORK_DIR/fish_classifier_v0_2.tflite" "$ASSETS_DIR/fish_classifier.tflite"
chmod 644 "$ASSETS_DIR"/*

rm -rf "$WORK_DIR"
echo "✓ 完成。请重新构建 App（npm run android），assets 变更不会热更新。"
