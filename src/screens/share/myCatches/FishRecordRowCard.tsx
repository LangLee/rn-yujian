import React from 'react';
import { StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';
import { RemoteImage } from '../../../components/RemoteImage';
import { FishIllustration } from '../../../components/FishIllustration';
import { PressableScale } from '../../../components/ui/PressableScale';
import { coreColors } from '../../../constants/coreUi';
import { font, fs } from '../../../constants/tokens';
import {
  CatchEntry,
  growthMarkBadgeKind,
  primaryGrowthMarkLabel,
  GrowthMarkInfo,
} from '../../../utils/myCatchesTimeline';

/**
 * FishRecordRowCard（my_catches_v2 / List Image Spec V1 / Growth Mark V1）：
 * 紧凑行卡 —— 白玻璃蒙版只落在卡片上；左侧真实现场照片带纯白衬边（贴册照片），
 * 信息栈仅保留 鱼种（衬线）+ 长度·重量（地点与日期已在时间线日期节点/当日摘要呈现）；
 * Growth Mark 徽章收在鱼种行右端（Chevron 左侧，不压照片、不改卡高）。
 */

/** 缩略图（List Image Spec V1 1:1 · 14dp 圆角；按压缩节奏取 76dp） */
const THUMB = 76;
const THUMB_RADIUS = 14;
/** 照片纯白衬边（设计稿照片外 ~2dp 白 mat，像贴在卡上的冲印照） */
const MAT = 2;

/** Growth Mark 徽章三档语义色（Growth Mark Spec V1 §6）：里程碑金 / 首条灰绿 / 尺寸蓝灰 */
const BADGE_STYLE: Record<
  'milestone' | 'firstSpecies' | 'size',
  { bg: string; border: string; text: string }
> = {
  milestone: { bg: '#FBF7EE', border: 'rgba(184,147,74,0.45)', text: '#B8934A' },
  firstSpecies: { bg: '#F2F5F2', border: 'rgba(116,136,151,0.35)', text: '#5F7A6B' },
  size: { bg: '#F0F4F7', border: 'rgba(116,136,151,0.35)', text: '#5B7288' },
};

export const GrowthMarkBadge: React.FC<{ kind: string; label: string }> = ({ kind, label }) => {
  const style = BADGE_STYLE[(kind as keyof typeof BADGE_STYLE) ?? 'size'] ?? BADGE_STYLE.size;
  return (
    <View style={[badgeStyles.wrap, { backgroundColor: style.bg, borderColor: style.border }]}>
      <Text style={[badgeStyles.text, { color: style.text }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
};

const badgeStyles = StyleSheet.create({
  wrap: {
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    /* 鱼种行右端、Chevron 左侧（Growth Mark Spec §5），完整展示绝不收缩，空间不足由鱼种名让位 */
    flexShrink: 0,
  } as ViewStyle,
  text: {
    fontSize: fs(11),
    fontWeight: '500',
    letterSpacing: 0.5,
  } as TextStyle,
});

/** 长度 · 重量（设计稿格式：`42.6 cm · 1.28 kg`，地点与日期由时间线呈现，不在卡内重复） */
function measurementLabel(entry: CatchEntry): string | null {
  const parts: string[] = [];
  const length = entry.memory?.lengthCm;
  const weight = entry.memory?.weightKg;
  if (typeof length === 'number' && length > 0) parts.push(`${length} cm`);
  if (typeof weight === 'number' && weight > 0) parts.push(`${weight} kg`);
  return parts.length > 0 ? parts.join(' · ') : null;
}

export const FishRecordRowCard: React.FC<{
  entry: CatchEntry;
  mark?: GrowthMarkInfo;
  onPress: () => void;
}> = ({ entry, mark, onPress }) => {
  const badgeKind = growthMarkBadgeKind(mark);
  const badgeLabel = primaryGrowthMarkLabel(mark, entry.catch.speciesName);
  const measurement = measurementLabel(entry);

  return (
    <PressableScale onPress={onPress} scaleTo={0.985} style={styles.hit}>
      <View style={styles.card}>
        {/* 真实现场照片：唯一主来源（List Image Spec V1），白衬边贴册式呈现 */}
        <View style={styles.thumbMat}>
          <RemoteImage
            url={entry.catch.imageUrl}
            style={styles.thumb}
            resizeMode="cover"
            placeholder={<FishIllustration size={46} bodyColor="rgba(116,151,133,0.62)" />}
          />
        </View>

        <View style={styles.info}>
          {/* 鱼种行 = 信息区首行；徽章收在行右端（Growth Mark Spec §5），
              由鱼种名（numberOfLines=1）让位，不影响下方测量行 */}
          <View style={styles.speciesRow}>
            <Text style={styles.species} numberOfLines={1}>
              {entry.catch.speciesName || '确认中的鱼'}
            </Text>
            {badgeKind && badgeLabel ? (
              <GrowthMarkBadge kind={badgeKind} label={badgeLabel} />
            ) : null}
          </View>
          {measurement ? (
            <Text style={styles.measurement} numberOfLines={1}>
              {measurement}
            </Text>
          ) : null}
        </View>

        <Text style={styles.chevron}>›</Text>
      </View>
    </PressableScale>
  );
};

const styles = StyleSheet.create({
  hit: {
    borderRadius: THUMB_RADIUS,
  } as ViewStyle,
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: THUMB_RADIUS,
    backgroundColor: 'rgba(255,255,255,0.90)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.65)',
    padding: 4,
  } as ViewStyle,
  /** 纯白衬边 + 照片 = 贴册冲印照（外 16dp 圆角包 14dp 照片圆角） */
  thumbMat: {
    width: THUMB + MAT * 2,
    height: THUMB + MAT * 2,
    borderRadius: THUMB_RADIUS + MAT,
    backgroundColor: '#FFFFFF',
    padding: MAT,
    overflow: 'hidden',
  } as ViewStyle,
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB_RADIUS,
    overflow: 'hidden',
  } as ViewStyle,
  info: {
    flex: 1,
    marginLeft: 11,
    marginRight: 6,
    justifyContent: 'center',
    gap: 4,
  } as ViewStyle,
  speciesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  } as ViewStyle,
  species: {
    /* 鱼名用衬线（tokens：鱼名/数字使用衬线；设计稿同） */
    fontFamily: font.serif,
    color: coreColors.deepLakeBlue,
    fontSize: fs(16),
    fontWeight: '700',
    flexShrink: 1,
  } as TextStyle,
  measurement: {
    color: coreColors.lakeBlue,
    fontSize: fs(12),
  } as TextStyle,
  chevron: {
    color: coreColors.mistBlueGray,
    fontSize: fs(24),
    fontWeight: '300',
    marginLeft: 2,
    minWidth: 16,
    textAlign: 'center',
  } as TextStyle,
});
