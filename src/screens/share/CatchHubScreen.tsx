import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { StackNavigationProp } from '../../navigation/types';
import { useTheme } from '../../contexts/ThemeContext';
import { font, spacing } from '../../constants/tokens';
import { WaterBackdrop } from '../../components/WaterBackdrop';
import { PressableScale } from '../../components/ui/PressableScale';
import { MyCatchesTab } from './MyCatchesTab';
import { ShareHomeTab } from './ShareHomeTab';
import { GrowthTab } from './GrowthTab';

export type CatchHubTab = 'catches' | 'share' | 'growth';

type CatchHubNavigationProp = StackNavigationProp;
type CatchHubRoute = RouteProp<{ MyCatches: { tab?: CatchHubTab } | undefined }, 'MyCatches'>;

const TABS: { key: CatchHubTab; label: string }[] = [
  { key: 'catches', label: '我的鱼获' },
  { key: 'share', label: '鱼获分享' },
  { key: 'growth', label: '成长历程' },
];

/**
 * 我的鱼获 Hub（P20 / 入口高保真稿）：
 * 页面标题 + 三段式切换（我的鱼获 / 鱼获分享 / 成长历程），
 * 三个 Tab 常驻挂载保留各自浏览状态，切换只做显隐。
 */
export const CatchHubScreen: React.FC = () => {
  const navigation = useNavigation<CatchHubNavigationProp>();
  const route = useRoute<CatchHubRoute>();
  const { profile } = useTheme();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<CatchHubTab>(route.params?.tab ?? 'catches');

  useEffect(() => {
    if (route.params?.tab) {
      setTab(route.params.tab);
    }
  }, [route.params]);

  const textPrimary = profile.surface.textPrimary;
  const textSecondary = profile.surface.textSecondary;

  return (
    <View style={styles.screen}>
      <WaterBackdrop />
      {/* 顶栏：返回 + 居中衬线标题 */}
      <View style={[styles.topBar, { paddingTop: insets.top + spacing.sm }]}>
        <PressableScale onPress={() => navigation.goBack()} scaleTo={0.92} style={styles.edgeHit}>
          <Icon name="chevron-back" size={24} color={textPrimary} />
        </PressableScale>
        <Text style={[styles.title, { color: textPrimary }]}>我的鱼获</Text>
        <View style={styles.edgeHit} />
      </View>

      {/* 三段式切换 */}
      <View
        style={[
          styles.segmentBar,
          {
            marginTop: spacing.md,
            backgroundColor: profile.surface.glass,
            borderColor: profile.surface.glassBorder,
          },
        ]}
      >
        {TABS.map((item) => {
          const active = tab === item.key;
          return (
            <PressableScale
              key={item.key}
              onPress={() => setTab(item.key)}
              scaleTo={0.96}
              style={styles.segmentHit}
            >
              <View
                style={[
                  styles.segment,
                  {
                    // Android：背景在 null ↔ 色值间切换会重建背景 drawable 丢圆角，
                    // 固定给背景色并在切换时重设 borderRadius
                    backgroundColor: active
                      ? profile.isDark
                        ? 'rgba(255,255,255,0.16)'
                        : '#FFFFFF'
                      : 'transparent',
                    borderRadius: 22,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.segmentText,
                    { color: active ? textPrimary : textSecondary },
                    active && styles.segmentTextActive,
                  ]}
                >
                  {item.label}
                </Text>
                {active ? <View style={styles.segmentUnderline} /> : null}
              </View>
            </PressableScale>
          );
        })}
      </View>

      {/* Tab 内容（常驻挂载，保留各自滚动与筛选状态） */}
      <View style={styles.body}>
        <View style={[styles.tabPane, tab !== 'catches' && styles.tabPaneHidden]}>
          <MyCatchesTab />
        </View>
        <View style={[styles.tabPane, tab !== 'share' && styles.tabPaneHidden]}>
          <ShareHomeTab />
        </View>
        <View style={[styles.tabPane, tab !== 'growth' && styles.tabPaneHidden]}>
          <GrowthTab />
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  } as ViewStyle,
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
  } as ViewStyle,
  edgeHit: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  } as ViewStyle,
  title: {
    flex: 1,
    textAlign: 'center',
    fontFamily: font.serif,
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: 6,
  } as TextStyle,
  segmentBar: {
    flexDirection: 'row',
    marginHorizontal: spacing.page,
    borderRadius: 26,
    borderWidth: 1,
    padding: 4,
  } as ViewStyle,
  segmentHit: {
    flex: 1,
  } as ViewStyle,
  segment: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 22,
  } as ViewStyle,
  segmentText: {
    fontSize: 15,
    fontWeight: '500',
  } as TextStyle,
  segmentTextActive: {
    fontWeight: '700',
  } as TextStyle,
  segmentUnderline: {
    width: 18,
    height: 2.5,
    borderRadius: 1.5,
    backgroundColor: '#C9A96A',
    marginTop: 3,
  } as ViewStyle,
  body: {
    flex: 1,
    marginTop: spacing.lg,
  } as ViewStyle,
  tabPane: {
    flex: 1,
  } as ViewStyle,
  tabPaneHidden: {
    display: 'none',
  } as ViewStyle,
});
