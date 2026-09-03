import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Pressable } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import { palette } from '../constants/colors';
import { MainTabParamList } from '../navigation/types';

interface TabItem {
  key: keyof MainTabParamList;
  label: string;
  icon: string;
}

const TABS: TabItem[] = [
  { key: 'Home', label: '首页', icon: 'home' },
  { key: 'Identify', label: '识鱼', icon: 'camera' },
  { key: 'Guide', label: '图鉴', icon: 'albums' },
  { key: 'My', label: '我的', icon: 'person' },
];

/**
 * 渔见底部导航（对应原 YujianApp.kt NavigationBar：首页·识鱼·图鉴·我的）。
 * 识鱼点击跳转全屏拍照识鱼页（非 tab 切换），样式与其他 tab 一致。
 */
export const YujianBottomNav: React.FC<BottomTabBarProps> = ({ state, navigation }) => {
  const current = state.routes[state.index]?.name;

  const selectTab = (key: keyof MainTabParamList) => {
    if (key === 'Identify') {
      navigation.getParent()?.navigate('Identify' as never);
      return;
    }
    navigation.navigate(key);
  };

  return (
    <SafeAreaView edges={['bottom']} style={styles.safe} pointerEvents="box-none">
      <View style={styles.container}>
        {TABS.map((tab) => {
          const active = tab.key === 'Identify' ? false : current === tab.key;
          return (
            <Pressable
              key={tab.key}
              onPress={() => selectTab(tab.key)}
              style={styles.tab}
              accessibilityRole="button"
              accessibilityLabel={tab.label}
              accessibilityState={{ selected: active }}
            >
              <View style={[styles.tabIndicator, active && styles.tabIndicatorActive]}>
                <Icon
                  name={active ? tab.icon : `${tab.icon}-outline`}
                  size={22}
                  color={active ? palette.waterTeal : palette.mutedInk}
                />
              </View>
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: {
    backgroundColor: palette.cardWhite,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.cardWhite,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.hairline,
    paddingVertical: 6,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 4,
    gap: 2,
  },
  tabIndicator: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIndicatorActive: {
    // backgroundColor: 'rgba(46,139,131,0.14)',
  },
  tabLabel: {
    color: palette.mutedInk,
    fontSize: 11,
    fontWeight: '500',
  },
  tabLabelActive: {
    color: palette.waterTeal,
    fontWeight: '600',
  },
});
