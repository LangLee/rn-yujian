package com.yujian.ai.model

import android.graphics.Bitmap
import java.util.UUID

data class FishSpecies(
    val key: String,
    val name: String,
    val aliases: String,
    val category: String,
    val habitat: String,
    val diet: String,
    val season: String,
    val description: String,
    val tip: String,
    val discovered: Boolean,
    val catches: Int = 0,
)

data class SelectedImage(
    val filePath: String,
    val bitmap: Bitmap,
    val source: String,
    /** Stable identity shared by original image, crop, feedback and backend assets. */
    val imageId: String = "yj_img_${UUID.randomUUID()}",
)

data class RecognitionCandidate(
    val classIndex: Int,
    val speciesKey: String,
    val speciesName: String,
    val confidence: Float,
)

data class RecognitionPrediction(
    val modelVersion: String,
    val modelSha256: String,
    val top1: RecognitionCandidate,
    val candidates: List<RecognitionCandidate>,
    val latencyMs: Long,
    /** The rendered 224x224 bitmap whose pixels are normalized into MODEL_M1_v0.2. */
    val modelInputBitmap: Bitmap? = null,
) {
    val lowConfidence: Boolean
        get() {
            val second = candidates.getOrNull(1)?.confidence ?: 0f
            return top1.confidence < 0.55f || (top1.confidence - second) < 0.12f
        }
}

data class CatchRecord(
    val id: String,
    val speciesKey: String,
    val speciesName: String,
    val weightKg: Double,
    val lengthCm: Int,
    val location: String,
    val timeLabel: String,
    val note: String,
    val confidence: Int,
    val isNewRecord: Boolean,
    val modelVersion: String? = null,
    val aiSpeciesKey: String? = null,
    val aiSpeciesName: String? = null,
    val aiConfidence: Int? = null,
    val userCorrected: Boolean = false,
)

enum class SharePeriod(val label: String) {
    SINGLE("单条"), TODAY("今日"), WEEK("本周"), MONTH("本月"), YEAR("本年"), ALL("累计")
}

object DemoData {
    val species = listOf(
        FishSpecies("grass_carp", "草鱼", "鲩鱼、草鲩", "淡水鱼 · 鲤科", "江河 · 湖泊 · 水库", "草食为主", "春末至秋季", "体形修长、鳞片较大，是中国常见的淡水鱼之一。喜欢水草丰富、较开阔的江河湖库。", "找有水草的缓流区或近岸深浅交界。天气稳定、溶氧较高时更容易开口。", true, 6),
        FishSpecies("crucian_carp", "鲫鱼", "鲫瓜子", "淡水鱼 · 鲤科", "池塘 · 河沟 · 湖湾", "杂食", "全年", "适应能力强，分布广，是钓友最常遇见的鱼种之一。", "小钩细线、轻口漂相更容易抓住真实吃口。", true, 10),
        FishSpecies("common_carp", "鲤鱼", "鲤拐子", "淡水鱼 · 鲤科", "江河 · 湖库", "杂食偏底栖", "春秋", "底栖性明显，警惕性高，常在缓流、坎位和障碍附近活动。", "保持安静，窝料不宜一次过量。", true, 4),
        FishSpecies("bighead_carp", "鳙鱼", "胖头鱼、花鲢", "淡水鱼 · 鲤科", "湖库中上层", "滤食", "夏秋", "头部较大，体侧常有不规则暗斑。", "关注水温和风向带来的浮游生物聚集带。", true, 2),
        FishSpecies("silver_carp", "白鲢", "鲢子", "淡水鱼 · 鲤科", "湖库中上层", "滤食", "夏秋", "体色偏银白，游泳速度快，常成群活动。", "大水面优先判断鱼层，再决定钓棚。", false),
        FishSpecies("largemouth_bass", "加州鲈", "大口黑鲈", "淡水鱼 · 太阳鱼科", "结构区 · 岸边障碍", "肉食", "春秋", "典型掠食鱼，嘴大，偏好结构和遮蔽物。", "优先搜索倒树、石堆、草边等结构。", true, 5),
        FishSpecies("snakehead", "黑鱼", "乌鳢、财鱼", "淡水鱼 · 鳢科", "草区 · 浅滩", "肉食", "夏秋", "伏击型掠食鱼，常贴近水草或障碍。", "观察草洞、蛙声与小鱼受惊迹象。", true, 3),
        FishSpecies("yellow_catfish", "黄骨鱼", "黄颡鱼、昂刺", "淡水鱼 · 鲿科", "底层 · 石缝", "肉食偏杂食", "夏秋夜间", "背鳍与胸鳍有硬刺，夜间活跃。", "摘钩时注意硬刺，夜钓常比白天更活跃。", false),
        FishSpecies("black_carp", "青鱼", "螺蛳青", "淡水鱼 · 鲤科", "湖库深水", "软体动物为主", "夏秋", "体型可长得很大，力量强，偏底层活动。", "大水面守钓时重点考虑安全的线组余量。", false),
    )

    val catch = CatchRecord(
        id = "catch_20260830_001", speciesKey = "grass_carp", speciesName = "草鱼",
        weightKg = 2.1, lengthCm = 53, location = "江苏太湖", timeLabel = "今天 15:26",
        note = "风不大，草边出的口。第一次把这条鱼完整记录下来。", confidence = 92, isNewRecord = true,
    )
}
