import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CompositeNavigationProp, useNavigation } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { StackNavigationProp } from '@react-navigation/stack';
import { useAuth } from '../contexts/AuthContext';
import { useCatchArchive } from '../contexts/CatchContext';
import { catchService } from '../services/catchService';
import { FishIllustration } from '../components/FishIllustration';
import { RemoteImage } from '../components/RemoteImage';
import { palette } from '../constants/colors';
import { RemoteCatch } from '../types/models';
import { MainTabParamList, RootStackParamList } from '../navigation/types';
import { formatCatchDate, formatConfidencePercent } from './HomeScreen';

type MyScreenNavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'My'>,
  StackNavigationProp<RootStackParamList>
>;

/** 我的页（对应原 MyScreen.kt：统计、鱼获列表、登出）。 */
export const MyScreen: React.FC = () => {
  const navigation = useNavigation<MyScreenNavigationProp>();
  const { session, logout } = useAuth();
  const { statistics, catches, loading, error, reload } = useCatchArchive();

  if (!session) {
    return <View style={styles.screen} />;
  }

  const displayName = session.nickname.trim().length > 0 ? session.nickname : session.username;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View>
        <Text style={styles.title}>我的</Text>
        <Text style={styles.subtitle}>收藏每一次渔获，也收藏自己的钓鱼轨迹</Text>
      </View>

      <View style={styles.profileCard}>
        <View style={styles.profileAvatar}>
          <FishIllustration size={56} bodyColor={palette.waterTeal} />
        </View>
        <View style={styles.profileBody}>
          <Text style={styles.profileName}>{displayName}</Text>
          <Text style={styles.profileMeta}>已保存 {statistics.totalCatches} 次鱼获</Text>
        </View>
        <Pressable
          onPress={() => {
            logout().catch(() => undefined);
          }}
          style={({ pressed }) => [styles.logoutWrap, pressed && { opacity: 0.6 }]}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="退出登录"
        >
          <Text style={styles.logoutText}>退出</Text>
        </Pressable>
      </View>

      <View style={styles.profileStatRow}>
        <ProfileStat value={`${statistics.speciesCount}`} label="已识别鱼种" />
        <ProfileStat value={`${statistics.totalCatches}`} label="累计鱼获" />
        <ProfileStat
          value={statistics.topSpecies.length > 0 ? statistics.topSpecies[0].speciesName : '—'}
          label="最常钓"
        />
      </View>

      <Text style={styles.sectionTitle}>最近鱼获</Text>

      {loading ? (
        <Text style={styles.loadingText}>正在同步你的鱼获…</Text>
      ) : error !== null && error.length > 0 ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable
            onPress={reload}
            style={({ pressed }) => [styles.retryButton, pressed && { opacity: 0.85 }]}
            accessibilityRole="button"
            accessibilityLabel="重新加载"
          >
            <Text style={styles.retryText}>重新加载</Text>
          </Pressable>
        </View>
      ) : catches.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>还没有鱼获记录</Text>
          <Text style={styles.emptyText}>拍一张鱼获照片，AI 识别后保存到这里。</Text>
        </View>
      ) : (
        catches.map((catchItem) => (
          <CatchRow
            key={catchItem.id}
            catchItem={catchItem}
            accessToken={session.accessToken}
            onPress={() => navigation.navigate('Species', { key: catchItem.speciesId })}
          />
        ))
      )}

      <Pressable
        onPress={() => navigation.navigate('Guide')}
        style={({ pressed }) => [styles.menuCard, pressed && { opacity: 0.85 }]}
        accessibilityRole="button"
        accessibilityLabel="我的图鉴"
      >
        <View style={styles.menuBody}>
          <Text style={styles.menuTitle}>我的图鉴</Text>
          <Text style={styles.menuSubtitle}>看看已认识的鱼种</Text>
        </View>
        <Text style={styles.chevron}>›</Text>
      </Pressable>
    </ScrollView>
  );
};

const CatchRow: React.FC<{
  catchItem: RemoteCatch;
  accessToken: string;
  onPress: () => void;
}> = ({ catchItem, accessToken, onPress }) => (
  <Pressable
    onPress={onPress}
    style={({ pressed }) => [styles.catchRow, pressed && { opacity: 0.85 }]}
    accessibilityRole="button"
    accessibilityLabel={`${catchItem.speciesName} 鱼获记录`}
  >
    <View style={styles.catchImageWrap}>
      <RemoteImage
        url={catchService.resolveUrl(catchItem.imageUrl)}
        authToken={accessToken}
        style={styles.catchImage}
        resizeMode="cover"
        placeholder={<FishIllustration size={52} bodyColor="#5E9E95" />}
      />
    </View>
    <View style={styles.catchBody}>
      <Text style={styles.catchSpecies}>{catchItem.speciesName}</Text>
      <Text style={styles.catchConfidence}>
        {formatConfidencePercent(catchItem.confidence)}% 把握
      </Text>
      <Text style={styles.catchDate}>{formatCatchDate(catchItem.createdAt)}</Text>
    </View>
    <Text style={styles.chevron}>›</Text>
  </Pressable>
);

const ProfileStat: React.FC<{ value: string; label: string }> = ({ value, label }) => (
  <View style={styles.profileStat}>
    <Text style={styles.profileStatValue} numberOfLines={1}>
      {value}
    </Text>
    <Text style={styles.profileStatLabel}>{label}</Text>
  </View>
);

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: palette.warmBackground,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 110,
    gap: 16,
  },
  title: {
    color: palette.deepInk,
    fontSize: 29,
    fontWeight: '700',
  },
  subtitle: {
    color: palette.mutedInk,
    fontSize: 13,
    marginTop: 4,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.softWater,
    borderRadius: 28,
    padding: 20,
  },
  profileAvatar: {
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: palette.cardWhite,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileBody: {
    flex: 1,
    marginLeft: 16,
  },
  profileName: {
    color: palette.deepInk,
    fontSize: 20,
    fontWeight: '700',
  },
  profileMeta: {
    color: palette.mutedInk,
    fontSize: 12,
    marginTop: 5,
  },
  logoutWrap: {
    paddingVertical: 8,
    paddingHorizontal: 6,
  },
  logoutText: {
    color: palette.mutedInk,
    fontSize: 12,
  },
  profileStatRow: {
    flexDirection: 'row',
    gap: 12,
  },
  profileStat: {
    flex: 1,
    backgroundColor: palette.cardWhite,
    borderRadius: 20,
    padding: 14,
  },
  profileStatValue: {
    color: palette.deepInk,
    fontSize: 18,
    fontWeight: '700',
  },
  profileStatLabel: {
    color: palette.mutedInk,
    fontSize: 10,
    marginTop: 3,
  },
  sectionTitle: {
    color: palette.deepInk,
    fontSize: 20,
    fontWeight: '700',
  },
  loadingText: {
    color: palette.mutedInk,
    fontSize: 13,
  },
  errorCard: {
    backgroundColor: palette.cardWhite,
    borderRadius: 20,
    padding: 16,
  },
  errorText: {
    color: palette.mutedInk,
    fontSize: 12,
  },
  retryButton: {
    alignSelf: 'flex-start',
    backgroundColor: palette.waterTeal,
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginTop: 10,
  },
  retryText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  emptyCard: {
    backgroundColor: palette.cardWhite,
    borderRadius: 22,
    padding: 20,
  },
  emptyTitle: {
    color: palette.deepInk,
    fontSize: 16,
    fontWeight: '700',
  },
  emptyText: {
    color: palette.mutedInk,
    fontSize: 12,
    marginTop: 6,
  },
  catchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.cardWhite,
    borderRadius: 20,
    padding: 12,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  catchImageWrap: {
    width: 76,
    height: 76,
    borderRadius: 16,
    backgroundColor: palette.softWater,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  catchImage: {
    width: '100%',
    height: '100%',
  },
  catchBody: {
    flex: 1,
    marginLeft: 14,
  },
  catchSpecies: {
    color: palette.deepInk,
    fontSize: 17,
    fontWeight: '700',
  },
  catchConfidence: {
    color: palette.waterTeal,
    fontSize: 12,
    marginTop: 4,
  },
  catchDate: {
    color: palette.mutedInk,
    fontSize: 11,
    marginTop: 5,
  },
  chevron: {
    color: palette.waterTeal,
    fontSize: 28,
    fontWeight: '300',
  },
  menuCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.cardWhite,
    borderRadius: 22,
    padding: 18,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  menuBody: {
    flex: 1,
  },
  menuTitle: {
    color: palette.deepInk,
    fontSize: 16,
    fontWeight: '700',
  },
  menuSubtitle: {
    color: palette.mutedInk,
    fontSize: 11,
    marginTop: 4,
  },
});
