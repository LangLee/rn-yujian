import React from 'react';
import { StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';
import { RemoteImage } from '../../../components/RemoteImage';
import { FishIllustration } from '../../../components/FishIllustration';
import { PressableScale } from '../../../components/ui/PressableScale';
import { coreColors } from '../../../constants/coreUi';
import { fs } from '../../../constants/tokens';
import {
  CatchEntry,
  growthMarkBadgeKind,
  primaryGrowthMarkLabel,
  GrowthMarkInfo,
  locationOf,
} from '../../../utils/myCatchesTimeline';

/**
 * FishRecordRowCard V2（My Catches 冻结稿 / List Image Spec V1）：
 * 82×82 1:1 真实现场照片缩略图（radius 14）+ 鱼种 / 长度重量 / 地点日期 +
 * 右上 Growth Mark 徽章（Chevron 左侧，不压照片、不改卡高）。
 */

const THUMB = 82;

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
    /* 卡片右上信息区、Chevron 左侧（Growth Mark Spec §5），不压照片不改卡高 */
    alignSelf: 'flex-start',
    marginTop: 3,
    marginLeft: 4,
  } as ViewStyle,
  text: {
    fontSize: fs(11),
    fontWeight: '500',
    letterSpacing: 0.5,
  } as TextStyle,
});

function measurementLabel(entry: CatchEntry): string | null {
  const parts: string[] = [];
  const length = entry.memory?.lengthCm;
  const weight = entry.memory?.weightKg;
  if (typeof length === 'number' && length > 0) parts.push(`长 ${length} cm`);
  if (typeof weight === 'number' && weight > 0) parts.push(`重 ${weight} kg`);
  return parts.length > 0 ? parts.join(' · ') : null;
}

function cardDateLabel(entry: CatchEntry): string {
  if (!entry.date) return '';
  const now = new Date();
  const sameYear = entry.year === now.getFullYear();
  return sameYear
    ? `${entry.month}.${entry.day}`
    : `${entry.year}.${entry.month}.${entry.day}`;
}

export const FishRecordRowCard: React.FC<{
  entry: CatchEntry;
  mark?: GrowthMarkInfo;
  onPress: () => void;
}> = ({ entry, mark, onPress }) => {
  const badgeKind = growthMarkBadgeKind(mark);
  const badgeLabel = primaryGrowthMarkLabel(mark, entry.catch.speciesName);
  const measurement = measurementLabel(entry);
  const location = locationOf(entry);
  const dateLabel = cardDateLabel(entry);

  return (
    <PressableScale onPress={onPress} scaleTo={0.985} style={styles.hit}>
      <View style={styles.card}>
        {/* 真实现场照片：唯一主来源（List Image Spec V1） */}
        <View style={styles.thumbWrap}>
          <RemoteImage
            url={entry.catch.imageUrl}
            style={styles.thumb}
            resizeMode="cover"
            placeholder={<FishIllustration size={50} bodyColor="rgba(116,151,133,0.62)" />}
          />
        </View>

        <View style={styles.info}>
          <Text style={styles.species} numberOfLines={1}>
            {entry.catch.speciesName || '确认中的鱼'}
          </Text>
          {measurement ? (
            <Text style={styles.measurement} numberOfLines={1}>
              {measurement}
            </Text>
          ) : null}
          <View style={styles.metaRow}>
            {location ? (
              <Text style={styles.meta} numberOfLines={1}>
                {location}
              </Text>
            ) : null}
            {location && dateLabel ? <Text style={styles.metaDot}>·</Text> : null}
            {dateLabel ? (
              <Text style={styles.meta} numberOfLines={1}>
                {dateLabel}
              </Text>
            ) : null}
          </View>
        </View>

        {/* Growth Mark：右上信息区、Chevron 左侧、最多 1 个（Spec §4/§5） */}
        {badgeKind && badgeLabel ? (
          <GrowthMarkBadge kind={badgeKind} label={badgeLabel} />
        ) : null}

        <Text style={styles.chevron}>›</Text>
      </View>
    </PressableScale>
  );
};

const styles = StyleSheet.create({
  hit: {
    borderRadius: 18,
  } as ViewStyle,
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.90)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.65)',
    padding: 10,
  } as ViewStyle,
  thumbWrap: {
    width: THUMB,
    height: THUMB,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: coreColors.lakeWhite,
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  thumb: {
    width: THUMB,
    height: THUMB,
  } as ViewStyle,
  info: {
    flex: 1,
    marginLeft: 14,
    marginRight: 8,
    gap: 4,
  } as ViewStyle,
  species: {
    color: coreColors.deepLakeBlue,
    fontSize: fs(17),
    fontWeight: '600',
  } as TextStyle,
  measurement: {
    color: 'rgba(11,45,75,0.82)',
    fontSize: fs(12),
  } as TextStyle,
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  } as ViewStyle,
  meta: {
    color: coreColors.mistBlueGray,
    fontSize: fs(11),
    flexShrink: 1,
  } as TextStyle,
  metaDot: {
    color: coreColors.mistBlueGray,
    fontSize: fs(11),
  } as TextStyle,
  chevron: {
    color: coreColors.mistBlueGray,
    fontSize: fs(26),
    fontWeight: '300',
    marginLeft: 2,
    minWidth: 18,
    textAlign: 'center',
  } as TextStyle,
});
