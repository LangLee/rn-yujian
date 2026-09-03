import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CompositeNavigationProp, useNavigation } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { StackNavigationProp } from '@react-navigation/stack';
import Icon from 'react-native-vector-icons/Ionicons';
import { useAuth } from '../contexts/AuthContext';
import { useCatchArchive } from '../contexts/CatchContext';
import { catchService } from '../services/catchService';
import { FishIllustration } from '../components/FishIllustration';
import { RemoteImage } from '../components/RemoteImage';
import { palette } from '../constants/colors';
import { RemoteCatch } from '../types/models';
import { MainTabParamList, RootStackParamList } from '../navigation/types';

type HomeScreenNavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'Home'>,
  StackNavigationProp<RootStackParamList>
>;

/** 首页（对应原 HomeScreen.kt：品牌区、拍照入口、统计卡、最近鱼获）。 */
export const HomeScreen: React.FC = () => {
  const navigation = useNavigation<HomeScreenNavigationProp>();
  const { session } = useAuth();
  const { statistics, catches } = useCatchArchive();

  const nickname = session?.nickname ?? '';
  const recentCatch: RemoteCatch | null = catches.length > 0 ? catches[0] : null;
  const accessToken = session?.accessToken ?? '';

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.brandRow}>
        <View style={styles.brandBadge}>
          <FishIllustration size={34} bodyColor={palette.waterTeal} />
        </View>
        <View style={styles.brandText}>
          <Text style={styles.brandTitle}>渔见 AI</Text>
          <Text style={styles.brandSubtitle}>收藏每一次渔获</Text>
        </View>
      </View>

      <View style={{ marginTop: 18 }}>
        <Text style={styles.greeting}>你好，{nickname.trim().length > 0 ? nickname : '钓友'}</Text>
        <Text style={styles.headline}>今天钓到什么？</Text>
      </View>

      <View style={styles.identifyCard}>
        <View style={styles.identifyBadge}>
          <FishIllustration size={70} bodyColor={palette.waterTeal} />
        </View>
        <View style={styles.identifyBody}>
          <Text style={styles.identifyTitle}>拍照识鱼</Text>
          <Text style={styles.identifyDesc}>拍下鱼获，让 AI 帮你认出来</Text>
          <Text style={styles.identifyHint}>鱼体完整 · 光线充足 · 少遮挡</Text>
          <Pressable
            onPress={() => navigation.getParent()?.navigate('Identify' as never)}
            style={({ pressed }) => [styles.identifyButton, pressed && { opacity: 0.85 }]}
            accessibilityRole="button"
            accessibilityLabel="拍照识鱼"
          >
            <Icon name="camera" size={20} color="#FFFFFF" />
            <Text style={styles.identifyButtonText}>拍照识鱼</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.sectionRow}>
        <Text style={styles.sectionTitle}>我的探索</Text>
        <Pressable
          onPress={() => navigation.navigate('Guide')}
          style={({ pressed }) => [styles.sectionLink, pressed && { opacity: 0.6 }]}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="查看图鉴"
        >
          <Text style={styles.sectionLinkText}>查看图鉴</Text>
        </Pressable>
      </View>

      <View style={styles.statRow}>
        <StatCard value={`${statistics.speciesCount} 种`} label="已识别鱼种" />
        <StatCard value={`${statistics.totalCatches}`} label="累计鱼获" />
      </View>

      <Text style={[styles.sectionTitle, styles.recentTitle]}>最近鱼获</Text>

      {recentCatch === null ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>还没有鱼获记录</Text>
          <Text style={styles.emptyText}>拍照识鱼后，第一条记录会出现在这里。</Text>
        </View>
      ) : (
        <Pressable
          onPress={() => navigation.navigate('My')}
          style={({ pressed }) => [styles.recentCard, pressed && { opacity: 0.85 }]}
          accessibilityRole="button"
          accessibilityLabel={`${recentCatch.speciesName} 鱼获记录`}
        >
          <View style={styles.recentImageWrap}>
            <RemoteImage
              url={catchService.resolveUrl(recentCatch.imageUrl)}
              authToken={accessToken}
              style={styles.recentImage}
              resizeMode="cover"
              placeholder={<FishIllustration size={70} bodyColor="#748F78" />}
            />
          </View>
          <View style={styles.recentBody}>
            <Text style={styles.recentSpecies}>{recentCatch.speciesName}</Text>
            <Text style={styles.recentConfidence}>
              {formatConfidencePercent(recentCatch.confidence)}% 把握
            </Text>
            <Text style={styles.recentDate}>{formatCatchDate(recentCatch.createdAt)}</Text>
          </View>
        </Pressable>
      )}
    </ScrollView>
  );
};

/** (confidence * 100) 四舍五入并收敛到 0..100（对应原 confidencePercent）。 */
export const formatConfidencePercent = (confidence: number): number =>
  Math.min(100, Math.max(0, Math.round(confidence * 100)));

/** "2025-01-31T..." -> "2025.01.31"（对应原 formatCatchDate）。 */
export const formatCatchDate = (value: string): string =>
  value.slice(0, 10).replace(/-/g, '.');

const StatCard: React.FC<{ value: string; label: string }> = ({ value, label }) => (
  <View style={styles.statCard}>
    <View style={styles.statBadge}>
      <Text style={styles.statBadgeIcon}>◒</Text>
    </View>
    <Text style={styles.statValue}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: palette.warmBackground,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 110,
    gap: 18,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  brandBadge: {
    width: 42,
    height: 42,
    borderRadius: 16,
    backgroundColor: palette.softWater,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandText: {
    flex: 1,
  },
  brandTitle: {
    color: palette.deepInk,
    fontSize: 20,
    fontWeight: '700',
  },
  brandSubtitle: {
    color: palette.mutedInk,
    fontSize: 12,
    marginTop: 2,
  },
  greeting: {
    color: palette.mutedInk,
    fontSize: 14,
  },
  headline: {
    color: palette.deepInk,
    fontSize: 29,
    fontWeight: '700',
    marginTop: 4,
  },
  identifyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.softWater,
    borderRadius: 28,
    padding: 20,
  },
  identifyBadge: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: palette.cardWhite,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identifyBody: {
    flex: 1,
    marginLeft: 18,
  },
  identifyTitle: {
    color: palette.deepInk,
    fontSize: 23,
    fontWeight: '700',
  },
  identifyDesc: {
    color: palette.deepInk,
    fontSize: 13,
    marginTop: 5,
  },
  identifyHint: {
    color: palette.mutedInk,
    fontSize: 11,
    marginTop: 8,
  },
  identifyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    borderRadius: 24,
    backgroundColor: palette.waterTeal,
    marginTop: 16,
    paddingHorizontal: 18,
    alignSelf: 'flex-start',
    gap: 8,
  },
  identifyButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: palette.deepInk,
    fontSize: 20,
    fontWeight: '700',
  },
  sectionLink: {
    padding: 8,
  },
  sectionLinkText: {
    color: palette.waterTeal,
    fontSize: 12,
  },
  statRow: {
    flexDirection: 'row',
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: palette.cardWhite,
    borderRadius: 22,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  statBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: palette.softWater,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  statBadgeIcon: {
    color: palette.waterTeal,
    fontSize: 18,
    fontWeight: '700',
  },
  statValue: {
    color: palette.deepInk,
    fontSize: 23,
    fontWeight: '700',
  },
  statLabel: {
    color: palette.mutedInk,
    fontSize: 11,
    marginTop: 2,
  },
  recentTitle: {
    marginBottom: -4,
  },
  emptyCard: {
    backgroundColor: palette.cardWhite,
    borderRadius: 24,
    padding: 18,
  },
  emptyTitle: {
    color: palette.deepInk,
    fontSize: 16,
    fontWeight: '700',
  },
  emptyText: {
    color: palette.mutedInk,
    fontSize: 11,
    marginTop: 5,
  },
  recentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.cardWhite,
    borderRadius: 24,
    padding: 12,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  recentImageWrap: {
    width: 88,
    height: 88,
    borderRadius: 18,
    backgroundColor: palette.softWater,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recentImage: {
    width: '100%',
    height: '100%',
  },
  recentBody: {
    flex: 1,
    marginLeft: 16,
  },
  recentSpecies: {
    color: palette.deepInk,
    fontSize: 18,
    fontWeight: '700',
  },
  recentConfidence: {
    color: palette.waterTeal,
    fontSize: 15,
    fontWeight: '600',
    marginTop: 4,
  },
  recentDate: {
    color: palette.mutedInk,
    fontSize: 11,
    marginTop: 7,
  },
});
