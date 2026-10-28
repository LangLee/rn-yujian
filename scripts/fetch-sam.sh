#!/usr/bin/env bash
# 下载 SAM 鱼体轮廓分割模型（demo AI--main 同款 Xenova/slimsam-77-uniform q8 量化导出）
# 到 android/app/src/main/assets/。Gradle fetchModelAssets 任务只做在位校验，
# 缺失时提示执行本脚本（国内网络优先 hf-mirror 镜像，失败回退 Hugging Face 官方）。
set -euo pipefail

ASSETS_DIR="$(cd "$(dirname "$0")/.." && pwd)/android/app/src/main/assets"
mkdir -p "$ASSETS_DIR"

# name|sha256|bytes|hf_path
SPECS=(
  "sam_vision_encoder_quantized.onnx|cce23c7b2e5d4f330932738fb67ba518e04b0d99ccdd1cccd22a7da4e01f2971|8882165|onnx/vision_encoder_quantized.onnx"
  "sam_prompt_encoder_mask_decoder_quantized.onnx|cb90b279f549d2cab7fd6e20c38522438c65d84bdcca3d2a764cff7d857fdce2|4903810|onnx/prompt_encoder_mask_decoder_quantized.onnx"
)

REPO="Xenova/slimsam-77-uniform"
MIRRORS=("https://hf-mirror.com" "https://huggingface.co")

sha256_of() {
  if command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1" | cut -d' ' -f1
  else sha256sum "$1" | cut -d' ' -f1; fi
}

for spec in "${SPECS[@]}"; do
  IFS='|' read -r name sha bytes hf_path <<< "$spec"
  dest="$ASSETS_DIR/$name"
  if [[ -f "$dest" ]] && [[ "$(sha256_of "$dest")" == "$sha" ]] && [[ "$(stat -f%z "$dest" 2>/dev/null || stat -c%s "$dest")" == "$bytes" ]]; then
    echo "已就位: $name"
    continue
  fi
  ok=0
  for mirror in "${MIRRORS[@]}"; do
    url="$mirror/$REPO/resolve/main/$hf_path"
    echo "下载: $url"
    if curl -fL --connect-timeout 30 --retry 2 -o "$dest" "$url"; then
      if [[ "$(sha256_of "$dest")" == "$sha" ]]; then ok=1; break; fi
      echo "校验失败（$mirror），尝试下一个源…"
    fi
  done
  if [[ "$ok" != "1" ]]; then
    echo "错误: $name 下载/校验失败。也可从本地 demo（AI--main/model/）直接拷贝同名文件。" >&2
    exit 1
  fi
  echo "完成: $name"
done

echo "SAM 轮廓分割模型全部就位。"
