import React, { useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import Icon from 'react-native-vector-icons/Ionicons';
import { demoCatch, sharePeriods } from '../constants/demoData';
import { FishIllustration } from '../components/FishIllustration';
import { YujianTopBar } from '../components/Common';
import { palette } from '../constants/colors';
import { SharePeriodKey } from '../types/models';
import { RootStackParamList } from '../navigation/types';

type ShareCenterScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Share'>;

interface ShareStats {
  first: string;
  second: string;
  third: string;
}

const statsForPeriod = (period: SharePeriodKey): ShareStats => {
  switch (period) {
    case 'SINGLE':
      return {
        first: `${demoCatch.weightKg} kg`,
        second: `${demoCatch.lengthCm} cm`,
        third: demoCatch.speciesName,
      };
    case 'TODAY':
      return { first: '3 条', second: '2 种', third: '4.8 kg' };
    case 'WEEK':
      return { first: '8 条', second: '4 种', third: '11.6 kg' };
    case 'MONTH':
      return { first: '18 条', second: '7 种', third: '26.4 kg' };
    case 'YEAR':
      return { first: '36 条', second: '12 种', third: '52.7 kg' };
    case 'ALL':
    default:
      return { first: '36 条', second: '12 / 200', third: '52.7 kg' };
  }
};

const shareCopyFor = (period: SharePeriodKey): string => {
  switch (period) {
    case 'SINGLE':
      return `我用渔见记录了一条${demoCatch.speciesName}：${demoCatch.weightKg}kg / ${demoCatch.lengthCm}cm，${demoCatch.location}。\n\n渔见 AI · 收藏每一次渔获`;
    case 'TODAY':
      return '今天鱼获：3条 / 2种 / 4.8kg。\n\n渔见 AI · 收藏每一次渔获';
    case 'WEEK':
      return '本周鱼获：8条 / 4种 / 11.6kg。\n\n渔见 AI · 收藏每一次渔获';
    case 'MONTH':
      return '本月鱼获：18条 / 7种 / 26.4kg。\n\n渔见 AI · 收藏每一次渔获';
    case 'YEAR':
      return '本年鱼获：36条 / 12种 / 52.7kg。\n\n渔见 AI · 收藏每一次渔获';
    case 'ALL':
    default:
      return '累计鱼获36条，已经发现12种鱼。\n\n渔见 AI · 收藏每一次渔获';
  }
};

/** 分享中心（对应原 ShareCenterScreen.kt，预留功能：演示数据 + 系统分享）。 */
export const ShareCenterScreen: React.FC = () => {
  const navigation = useNavigation<ShareCenterScreenNavigationProp>();
  const [selected, setSelected] = useState<SharePeriodKey>('SINGLE');
  const stats = statsForPeriod(selected);
  const periodLabel = sharePeriods.find((item) => item.key === selected)?.label ?? '单条';
  const title =
    selected === 'SINGLE' ? `今天遇见一条 ${demoCatch.speciesName}` : `我的${periodLabel}鱼获`;

  return (
    <View style={styles.screen}>
      <YujianTopBar
        title="分享鱼获"
        subtitle="选一个固定模板，马上分享"
        onBack={() => navigation.goBack()}
      />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.periodRow}
      >
        {sharePeriods.map((period) => {
          const active = selected === period.key;
          return (
            <Pressable
              key={period.key}
              onPress={() => setSelected(period.key)}
              style={[styles.periodChip, active && styles.periodChipActive]}
              accessibilityRole="button"
              accessibilityLabel={period.label}
            >
              <Text style={[styles.periodChipText, active && styles.periodChipTextActive]}>
                {period.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.cardArea}>
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View>
              <Text style={styles.cardBrand}>渔见 AI</Text>
              <Text style={styles.cardBrandSub}>收藏每一次渔获</Text>
            </View>
            <View style={styles.cardPeriodPill}>
              <Text style={styles.cardPeriodText}>{periodLabel}</Text>
            </View>
          </View>

          <View style={styles.cardImageArea}>
            <FishIllustration size={170} bodyColor="rgba(46,139,131,0.72)" />
          </View>

          <Text style={styles.cardTitle}>{title}</Text>
          {selected === 'SINGLE' ? (
            <Text style={styles.cardMeta}>
              {`${demoCatch.location}  ·  ${demoCatch.timeLabel}`}
            </Text>
          ) : null}

          <View style={styles.metricRow}>
            <ShareMetric
              value={stats.first}
              label={selected === 'SINGLE' ? '重量' : '鱼获'}
            />
            <ShareMetric
              value={stats.second}
              label={selected === 'SINGLE' ? '长度' : '鱼种'}
            />
            <ShareMetric
              value={stats.third}
              label={selected === 'SINGLE' ? '鱼种' : '累计重量'}
            />
          </View>

          <View style={styles.cardFooter}>
            <Text style={styles.cardFooterText}>
              {selected === 'ALL'
                ? '已经解锁 12 种鱼，继续去遇见新的鱼。'
                : '每一次出钓，都值得被记住。'}
            </Text>
          </View>
        </View>
      </View>

      <Pressable
        onPress={() => {
          Share.share({ message: shareCopyFor(selected) }).catch(() => undefined);
        }}
        style={({ pressed }) => [styles.shareButton, pressed && { opacity: 0.85 }]}
        accessibilityRole="button"
        accessibilityLabel="分享这个模板"
      >
        <Icon name="share-social" size={20} color="#FFFFFF" />
        <Text style={styles.shareButtonText}>分享这个模板</Text>
      </Pressable>
    </View>
  );
};

const ShareMetric: React.FC<{ value: string; label: string }> = ({ value, label }) => (
  <View style={styles.metric}>
    <Text style={styles.metricValue}>{value}</Text>
    <Text style={styles.metricLabel}>{label}</Text>
  </View>
);

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: palette.warmBackground,
  },
  periodRow: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    gap: 8,
  },
  periodChip: {
    backgroundColor: palette.cardWhite,
    borderRadius: 50,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  periodChipActive: {
    backgroundColor: palette.waterTeal,
  },
  periodChipText: {
    color: palette.deepInk,
    fontSize: 12,
    fontWeight: '600',
  },
  periodChipTextActive: {
    color: '#FFFFFF',
  },
  cardArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    width: 330,
    backgroundColor: palette.cardWhite,
    borderRadius: 30,
    padding: 22,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  cardHeader: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardBrand: {
    color: palette.deepInk,
    fontSize: 18,
    fontWeight: '700',
  },
  cardBrandSub: {
    color: palette.mutedInk,
    fontSize: 10,
  },
  cardPeriodPill: {
    backgroundColor: palette.softWater,
    borderRadius: 50,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  cardPeriodText: {
    color: palette.waterTeal,
    fontSize: 11,
    fontWeight: '600',
  },
  cardImageArea: {
    alignSelf: 'stretch',
    height: 190,
    backgroundColor: palette.softWater,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  cardTitle: {
    color: palette.deepInk,
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 18,
  },
  cardMeta: {
    color: palette.mutedInk,
    fontSize: 11,
    marginTop: 5,
  },
  metricRow: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    marginTop: 18,
  },
  metric: {
    alignItems: 'center',
  },
  metricValue: {
    color: palette.deepInk,
    fontSize: 16,
    fontWeight: '700',
  },
  metricLabel: {
    color: palette.mutedInk,
    fontSize: 9,
    marginTop: 3,
  },
  cardFooter: {
    alignSelf: 'stretch',
    backgroundColor: palette.achievement,
    borderRadius: 18,
    padding: 12,
    alignItems: 'center',
    marginTop: 18,
  },
  cardFooterText: {
    color: palette.achievementInk,
    fontSize: 11,
    textAlign: 'center',
  },
  shareButton: {
    marginHorizontal: 20,
    marginVertical: 18,
    height: 56,
    borderRadius: 28,
    backgroundColor: palette.waterTeal,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  shareButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
