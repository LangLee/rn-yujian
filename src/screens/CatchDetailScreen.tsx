import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import Icon from 'react-native-vector-icons/Ionicons';
import { demoCatch } from '../constants/demoData';
import { FishIllustration } from '../components/FishIllustration';
import { YujianTopBar } from '../components/Common';
import { palette } from '../constants/colors';
import { RootStackParamList } from '../navigation/types';

type CatchDetailScreenNavigationProp = StackNavigationProp<RootStackParamList, 'CatchDetail'>;

/** 鱼获详情（对应原 CatchDetailScreen.kt，预留功能：演示数据）。 */
export const CatchDetailScreen: React.FC = () => {
  const navigation = useNavigation<CatchDetailScreenNavigationProp>();

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <YujianTopBar
        title="我的鱼获"
        subtitle={demoCatch.timeLabel}
        onBack={() => navigation.goBack()}
      />

      <View style={styles.heroCard}>
        <FishIllustration size={220} bodyColor="rgba(46,139,131,0.72)" />
        {demoCatch.isNewRecord ? (
          <View style={styles.newRecordBadge}>
            <Text style={styles.newRecordText}>新记录</Text>
          </View>
        ) : null}
        <View style={styles.aiBadge}>
          <Text style={styles.aiBadgeText}>AI 识别 · {demoCatch.confidence}% 把握</Text>
        </View>
      </View>

      <View style={styles.titleBlock}>
        <Text style={styles.title}>{demoCatch.speciesName}</Text>
        <Text style={styles.titleMeta}>
          {`${demoCatch.location}  ·  ${demoCatch.timeLabel}`}
        </Text>
      </View>

      <View style={styles.metricCard}>
        <Metric label="重量" value={`${demoCatch.weightKg} kg`} />
        <Metric label="长度" value={`${demoCatch.lengthCm} cm`} />
        <Metric label="识别" value={`${demoCatch.confidence}%`} />
      </View>

      <View style={styles.noteCard}>
        <Text style={styles.noteTitle}>这次鱼获</Text>
        <Text style={styles.noteText}>{demoCatch.note}</Text>
      </View>

      <Pressable
        onPress={() => navigation.navigate('Share')}
        style={({ pressed }) => [styles.shareButton, pressed && { opacity: 0.85 }]}
        accessibilityRole="button"
        accessibilityLabel="分享这次鱼获"
      >
        <Icon name="share-social" size={20} color="#FFFFFF" />
        <Text style={styles.shareButtonText}>分享这次鱼获</Text>
      </Pressable>
    </ScrollView>
  );
};

const Metric: React.FC<{ label: string; value: string }> = ({ label, value }) => (
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
  content: {
    paddingBottom: 38,
  },
  heroCard: {
    marginHorizontal: 20,
    height: 300,
    borderRadius: 28,
    backgroundColor: palette.softWater,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  newRecordBadge: {
    position: 'absolute',
    top: 16,
    right: 16,
    backgroundColor: palette.achievement,
    borderRadius: 50,
    paddingHorizontal: 13,
    paddingVertical: 7,
  },
  newRecordText: {
    color: palette.achievementInk,
    fontSize: 11,
    fontWeight: '600',
  },
  aiBadge: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    backgroundColor: 'rgba(255,255,255,0.80)',
    borderRadius: 50,
    paddingHorizontal: 13,
    paddingVertical: 7,
  },
  aiBadgeText: {
    color: palette.waterTeal,
    fontSize: 11,
    fontWeight: '600',
  },
  titleBlock: {
    marginHorizontal: 20,
    marginVertical: 22,
  },
  title: {
    color: palette.deepInk,
    fontSize: 32,
    fontWeight: '700',
  },
  titleMeta: {
    color: palette.mutedInk,
    fontSize: 12,
    marginTop: 6,
  },
  metricCard: {
    flexDirection: 'row',
    marginHorizontal: 20,
    backgroundColor: palette.cardWhite,
    borderRadius: 24,
    padding: 18,
    justifyContent: 'space-around',
  },
  metric: {
    alignItems: 'center',
  },
  metricValue: {
    color: palette.deepInk,
    fontSize: 20,
    fontWeight: '700',
  },
  metricLabel: {
    color: palette.mutedInk,
    fontSize: 11,
    marginTop: 4,
  },
  noteCard: {
    margin: 20,
    backgroundColor: palette.cardWhite,
    borderRadius: 24,
    padding: 18,
  },
  noteTitle: {
    color: palette.deepInk,
    fontSize: 18,
    fontWeight: '700',
  },
  noteText: {
    color: palette.deepInk,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 10,
  },
  shareButton: {
    marginHorizontal: 20,
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
