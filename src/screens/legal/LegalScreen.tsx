import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp, RootStackParamList } from '../../navigation/types';
import { coreColors } from '../../constants/coreUi';
import { font, fs, spacing } from '../../constants/tokens';
import {
  LakeContentBackdrop,
  accountPageContentTop,
} from '../../components/coreui/LakeContentBackdrop';
import { LEGAL_DOCUMENTS, LegalDocId } from './legalContent';
import { ScreenHeader } from '../../components';

type LegalRouteProp = RouteProp<RootStackParamList, 'LegalDocument'>;
type LegalNavigationProp = StackNavigationProp<RootStackParamList, 'LegalDocument'>;

/**
 * 法律文档壳 · Shared Legal Document Shell V1（FROZEN）：
 * 隐私政策与用户协议共用一个可读长文档壳 —— BACK_TITLE 动态标题 +
 * 单一外层纵向滚动 + 克制的白/雾阅读面；无装饰 Hero、无与正文竞争的 CTA；
 * 查看文档本身不构成任何同意。标题层级语义化、正文可随系统字号缩放。
 */
export const LegalScreen: React.FC = () => {
  const route = useRoute<LegalRouteProp>();
  const navigation = useNavigation<LegalNavigationProp>();
  const insets = useSafeAreaInsets();
  const { height: windowH } = useWindowDimensions();

  const doc: LegalDocId = route.params?.doc === 'agreement' ? 'agreement' : 'privacy';
  const content = LEGAL_DOCUMENTS[doc];

  return (
    <View style={styles.screen}>
      <LakeContentBackdrop />
      <ScreenHeader title={content.title} onBack={() => navigation.goBack()} />

      <ScrollView
        style={styles.flex}
        contentContainerStyle={[
          styles.content,
          { paddingTop: accountPageContentTop(insets.top, windowH), paddingBottom: 48 + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.readingCard}>
          {/* 文档标题上下文 + 版本/更新时间元数据 */}
          <Text style={styles.docTitle}>{content.title}</Text>
          <Text style={styles.docMeta}>
            版本 {content.version} · 更新于 {content.updatedAt}
          </Text>

          {content.sections.map((section) => (
            <View key={section.heading} style={styles.sectionBlock}>
              <Text style={styles.sectionHeading} accessibilityRole="header">
                {section.heading}
              </Text>
              {section.paragraphs.map((paragraph, index) => (
                <Text key={index} style={styles.paragraph}>
                  {paragraph}
                </Text>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  } as ViewStyle,
  flex: {
    flex: 1,
  } as ViewStyle,
  content: {
    paddingHorizontal: spacing.page,
  } as ViewStyle,
  readingCard: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.9)',
    shadowColor: 'rgba(11,45,75,0.08)',
    shadowOpacity: 1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xl,
    marginTop: spacing.sm,
  } as ViewStyle,
  docTitle: {
    fontFamily: font.serif,
    fontSize: fs(22),
    fontWeight: '700',
    color: coreColors.deepLakeBlue,
    letterSpacing: 1,
  } as TextStyle,
  docMeta: {
    fontSize: fs(12),
    color: coreColors.mistBlueGray,
    marginTop: 6,
    marginBottom: spacing.lg,
  } as TextStyle,
  sectionBlock: {
    marginTop: spacing.lg,
  } as ViewStyle,
  sectionHeading: {
    fontSize: fs(16),
    fontWeight: '600',
    color: coreColors.deepLakeBlue,
    marginBottom: spacing.sm,
  } as TextStyle,
  paragraph: {
    fontSize: fs(14),
    lineHeight: 24,
    color: coreColors.lakeBlue,
    marginBottom: spacing.sm,
  } as TextStyle,
});
