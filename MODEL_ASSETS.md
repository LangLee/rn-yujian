# 拍照识鱼所需的 AI 模型资产

拍照识鱼的端侧推理（Detector → QualityGate → Crop → Classifier）在首次识别时需要从
`android/app/src/main/assets/` 读取以下 5 个文件。模型二进制不进 git，
**每次 Android 构建前由 Gradle 任务 `fetchModelAssets` 自动确保就位**：
已存在且哈希匹配时直接跳过（约 1 秒），缺失或不匹配才重新下载。

## 资产清单

| 文件 | 来源 | 校验 |
| --- | --- | --- |
| `fish_classifier.tflite` | Release `mobile-model-v0.2` 的 `fish_classifier_v0_2.tflite`（重命名） | 固定 SHA256 `29c2f2fd…cce18`、6244908 字节（与 `FishRecognitionEngine` 常量一致；2026-09-29 重新发布的 15 类版本） |
| `fish_detector_yolox_nano_v0_1.onnx` | Release `detector-model-v0.3` 的 bundle | SHA256/字节数须与 `detector_metadata.json` 配套 |
| `detector_metadata.json` | 同上 bundle | `DET_FISH_v0.3`/`DET_DS_v0.3`，含 onnx 哈希 `98257b95…c9a1`、输入名 `images`、shape `[1,3,416,416]` |
| `recognition_pipeline_v1.json` | 同上 bundle | 契约 `RECOGNITION_PIPELINE_v1`，阈值须与 `FishDetectionQualityGate` 常量一致 |
| `preprocess_contract_v1.json` | 已在仓库 | classifier 预处理契约（224 letterbox / ImageNet 归一化） |

Release 仓库：`pan277942135/Yujian`（模型工厂；detector 的权威产物在
`gs://yujian-model-factory-571785698442/models/DET_FISH_v0.3/`，Release 为 Android 镜像）。
bundle 中的 `golden_cases.json` 与 `golden/*.jpg` 是 CI 五例黄金回归用的，不会打进 App。

## 构建时自动下载

`android/app/build.gradle` 中的 `fetchModelAssets` 任务挂在 `preBuild` 上：

```bash
npm run android          # 构建前自动校验/下载模型资产
./gradlew fetchModelAssets   # 也可单独执行（android/ 目录下）
```

与原工程 CI 同一套门禁：classifier 用固定哈希，detector 用 metadata 与二进制自洽校验；
任何一步校验失败都会让构建失败，不会把坏模型打进 APK。

## 手动兜底

```bash
./scripts/fetch-models.sh   # 与 Gradle 任务等价的独立脚本（curl + unzip）
```

## 升级模型版本时

1. 改 `android/app/build.gradle` 顶部的 `classifierReleaseUrl` / `detectorBundleUrl`
   （以及 classifier 的 `classifierSha256` / `classifierBytes`，需与
   `FishRecognitionEngine` 常量同步）；
2. 删除 `android/app/src/main/assets/` 下对应旧文件（或直接重新构建，哈希不符会自动重下）；
3. assets 变更不会热更新，需完整重新构建。

## SAM 轮廓分割资产（识别过程动效）

识别处理页的鱼体轮廓光（demo AI--main samService 同款实现）使用
`Xenova/slimsam-77-uniform` 的 q8 量化 ONNX 导出（transformers.js 用的那两个文件）
在端上做分割，由 `SamContourEngine.kt` 通过 ONNX Runtime 运行：

| 文件 | 大小 | SHA256 |
| --- | --- | --- |
| `sam_vision_encoder_quantized.onnx` | 8,882,165 | `cce23c7b…f2971` |
| `sam_prompt_encoder_mask_decoder_quantized.onnx` | 4,903,810 | `cb90b279…fdce2` |

- 接口（已从 ONNX 图解析确认）：encoder `pixel_values[1,3,1024,1024]` →
  `image_embeddings[1,256,64,64]` + `image_positional_embeddings[1,256,64,64]`；
  decoder `input_points[1,1,N,2]` float32 + `input_labels[1,1,N]` int64 +
  两个嵌入 → `iou_scores[1,1,3]` + `pred_masks[1,1,3,256,256]`（logits > 0 为前景）。
- 来源是 Hugging Face 而非本仓库的模型工厂 Release，`fetchModelAssets` 只做
  在位校验（SHA256 + 字节数，与 `SamContourEngine` 常量一致），缺失时构建报错
  并提示执行 `./scripts/fetch-sam.sh`（优先 hf-mirror 镜像，回退 Hugging Face）。
- SAM 为辅助视觉：模型缺失/失败只影响轮廓精度（退回检测 bbox 合成鱼形），
  不阻塞识别流程。
