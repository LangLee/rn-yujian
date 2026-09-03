package com.yujian.ai.contracts

import com.yujian.ai.model.RecognitionPrediction
import org.json.JSONObject

data class ClassifierContract(
    val modelVersion: String,
    val predictionSpecies: String,
    val confidence: Float,
    val latencyMs: Long,
) {
    init {
        require(modelVersion.isNotBlank()) { "model_version is required" }
        require(predictionSpecies.isNotBlank()) { "prediction_species is required" }
        require(confidence.isFinite() && confidence in 0f..1f) { "confidence must be normalized" }
        require(latencyMs >= 0L) { "latency_ms cannot be negative" }
    }

    fun toJson(): JSONObject = JSONObject().apply {
        put("model_version", modelVersion)
        put("prediction_species", predictionSpecies)
        put("confidence", confidence.toDouble())
        put("latency_ms", latencyMs)
    }

    companion object {
        fun fromPrediction(prediction: RecognitionPrediction): ClassifierContract = ClassifierContract(
            modelVersion = prediction.modelVersion,
            predictionSpecies = prediction.top1.speciesKey,
            confidence = prediction.top1.confidence,
            latencyMs = prediction.latencyMs,
        )
    }
}
