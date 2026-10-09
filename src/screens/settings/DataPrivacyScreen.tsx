import React, { useCallback, useEffect, useState } from 'react';
import {
  AppState,
  ScrollView,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { StackNavigationProp, RootStackParamList } from '../../navigation/types';
import {
  hasRequestedLocationPermission,
  locationService,
  LocationPermissionStatus,
} from '../../services/locationService';
import { accountService } from '../../services/accountService';
import { coreColors } from '../../constants/coreUi';
import { fs, spacing } from '../../constants/tokens';
import {
  LakeContentBackdrop,
  accountPageContentTop,
} from '../../components/coreui/LakeContentBackdrop';
import {
  SettingsCard,
  SettingsGroupLabel,
  SettingsRow,
} from '../../components/ui/SettingsList';
import { BottomSheet } from '../../components/ui/BottomSheet';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { PressableScale } from '../../components/ui/PressableScale';
import { ScreenHeader } from '../../components';

type DataPrivacyNavigationProp = StackNavigationProp<RootStackParamList, 'DataPrivacy'>;

/** AI 模型改进授权状态（服务端权威；加载中不猜测状态） */
type ConsentState =
  | { phase: 'loading' }
  | { phase: 'ready'; enabled: boolean }
  | { phase: 'error' };

/** 位置权限产品状态（Location_Privacy_Spec_V1：使用期间/已拒绝/未授权） */
type LocationProductStatus = '使用期间' | '已拒绝' | '未授权';

/**
 * 数据与隐私 · Home Spec V1（FROZEN）：
 * 数据使用（AI 模型改进 / 位置权限 / 导出我的数据·Deferred）→
 * 账号数据（注销账号·Deferred）→ 法律（查看《隐私政策》）。
 * AI 授权默认关闭、开关显示服务端持久状态、点击必须经显式确认 Sheet、
 * 无乐观翻转；位置行为仅信息展示，绝不直接拉系统权限弹窗。
 */
export const DataPrivacyScreen: React.FC = () => {
  const navigation = useNavigation<DataPrivacyNavigationProp>();
  const insets = useSafeAreaInsets();
  const { height: windowH } = useWindowDimensions();

  const [consent, setConsent] = useState<ConsentState>({ phase: 'loading' });
  const [consentSaving, setConsentSaving] = useState(false);
  const [consentSheet, setConsentSheet] = useState<'enable' | 'disable' | null>(null);
  const [consentError, setConsentError] = useState<string | null>(null);

  const [locationStatus, setLocationStatus] = useState<LocationProductStatus>('未授权');
  const [locationSheet, setLocationSheet] = useState(false);

  /* ── AI 模型改进授权状态加载（失败可重试，不猜状态） ─────────── */
  const loadConsent = useCallback(async () => {
    setConsent({ phase: 'loading' });
    setConsentError(null);
    try {
      const settings = await accountService.getAiModelImprovement();
      setConsent({ phase: 'ready', enabled: settings.enabled });
    } catch {
      setConsent({ phase: 'error' });
    }
  }, []);

  useEffect(() => {
    void loadConsent();
  }, [loadConsent]);

  /* ── 位置权限产品状态：静默检查 + 申请记录（绝不发系统弹窗） ── */
  const refreshLocationStatus = useCallback(async () => {
    const [status, asked] = await Promise.all([
      locationService.getPermissionStatus(),
      hasRequestedLocationPermission(),
    ]);
    setLocationStatus(
      status === 'granted' ? '使用期间' : status === 'unavailable' || !asked ? '未授权' : '已拒绝',
    );
  }, []);

  useEffect(() => {
    void refreshLocationStatus();
    // 从系统设置返回时刷新（页面可能未失焦）
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void refreshLocationStatus();
      }
    });
    return () => subscription.remove();
  }, [refreshLocationStatus]);

  useFocusEffect(
    useCallback(() => {
      void refreshLocationStatus();
    }, [refreshLocationStatus]),
  );

  /* ── AI 授权变更：必须显式确认；无乐观翻转；失败保留原状态 ── */
  const openConsentSheet = () => {
    if (consent.phase !== 'ready' || consentSaving) {
      return;
    }
    setConsentError(null);
    setConsentSheet(consent.enabled ? 'disable' : 'enable');
  };

  const confirmConsent = async (enable: boolean) => {
    if (consentSaving) {
      return;
    }
    setConsentSaving(true);
    try {
      const settings = await accountService.setAiModelImprovement(enable, 'settings');
      setConsent({ phase: 'ready', enabled: settings.enabled });
      setConsentSheet(null);
    } catch {
      /* 失败：保留此前已确认状态，仅提示 */
      setConsentError('隐私设置保存失败，请重试');
      setConsentSheet(null);
    } finally {
      setConsentSaving(false);
    }
  };

  const consentValue =
    consent.phase === 'ready' ? consent.enabled : undefined;
  /* 行内状态：读取中… / 已开启 / 已关闭（加载失败时状态行由下方提示取代） */
  const consentStatusLabel =
    consent.phase === 'loading'
      ? '读取中…'
      : consent.phase === 'ready' && consent.enabled
        ? '已开启'
        : '已关闭';

  return (
    <View style={styles.screen}>
      <LakeContentBackdrop />
      <ScreenHeader title="数据与隐私" onBack={() => navigation.goBack()} />

      <ScrollView
        style={styles.flex}
        contentContainerStyle={[
          styles.content,
          { paddingTop: accountPageContentTop(insets.top, windowH), paddingBottom: 48 + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <SettingsGroupLabel label="数据使用" />
        <SettingsCard>
          <SettingsRow
            icon="sparkles-outline"
            tint="blue"
            label="AI 模型改进"
            value={consent.phase === 'error' ? undefined : consentStatusLabel}
            switchValue={consentValue}
            switchDisabled={consent.phase !== 'ready' || consentSaving}
            onSwitchChange={openConsentSheet}
            onPress={openConsentSheet}
            accessibilityLabel={
              consent.phase === 'ready'
                ? `AI 模型改进，${consent.enabled ? '已开启' : '已关闭'}`
                : 'AI 模型改进'
            }
          />
          {consent.phase === 'ready' ? null : (
            <View style={styles.subLineWrap}>
              <Text style={styles.subLine}>
                {consent.phase === 'loading' ? '正在读取服务端授权状态' : '授权状态暂时不可用'}
              </Text>
              {consent.phase === 'error' ? (
                <PressableScale
                  onPress={() => void loadConsent()}
                  accessibilityRole="button"
                  accessibilityLabel="重试读取授权状态"
                  style={styles.retryHit}
                >
                  <Text style={styles.retryText}>重试</Text>
                </PressableScale>
              ) : null}
            </View>
          )}
          {consentError ? (
            <View style={styles.subLineWrap}>
              <Text style={styles.errorLine}>{consentError}</Text>
            </View>
          ) : null}

          <SettingsRow
            icon="location-outline"
            tint="green"
            label="位置权限"
            value={locationStatus}
            onPress={() => setLocationSheet(true)}
          />
          <SettingsRow
            icon="download-outline"
            tint="slate"
            label="导出我的数据"
            badge="即将推出"
            disabled
            hideChevron
          />
        </SettingsCard>

        <SettingsGroupLabel label="账号数据" />
        <SettingsCard>
          <SettingsRow
            icon="person-remove-outline"
            tint="slate"
            label="注销账号"
            badge="即将推出"
            disabled
            hideChevron
          />
        </SettingsCard>

        <SettingsGroupLabel label="法律" />
        <SettingsCard>
          <SettingsRow
            icon="document-text-outline"
            tint="amber"
            label="查看《隐私政策》"
            onPress={() => navigation.navigate('LegalDocument', { doc: 'privacy' })}
          />
        </SettingsCard>
      </ScrollView>

      {/* AI 模型改进 · 开启确认（默认关闭；无预勾选；无劝导文案） */}
      <BottomSheet
        visible={consentSheet === 'enable'}
        onClose={() => setConsentSheet(null)}
        title="帮助改善鱼种识别"
      >
        <Text style={styles.sheetBody}>
          仅会使用照片中框选出的鱼体部分和你确认的鱼种，用于训练和改进鱼种识别模型。
        </Text>
        <PrimaryButton
          label="允许用于模型改进"
          loading={consentSaving}
          onPress={() => void confirmConsent(true)}
        />
        <PrimaryButton
          label="暂不开启"
          variant="secondaryMuted"
          disabled={consentSaving}
          onPress={() => setConsentSheet(null)}
          style={styles.sheetSecondary}
        />
      </BottomSheet>

      {/* AI 模型改进 · 关闭确认（明示撤回影响与不受影响的功能） */}
      <BottomSheet
        visible={consentSheet === 'disable'}
        onClose={() => setConsentSheet(null)}
        title="关闭模型改进？"
      >
        <Text style={styles.sheetBody}>
          关闭后，新的合格纠正数据将不再用于模型改进。{'\n'}不影响：拍照识鱼、保存鱼获、修改识别结果。
        </Text>
        <PrimaryButton
          label="关闭"
          loading={consentSaving}
          onPress={() => void confirmConsent(false)}
        />
        <PrimaryButton
          label="保持开启"
          variant="secondaryMuted"
          disabled={consentSaving}
          onPress={() => setConsentSheet(null)}
          style={styles.sheetSecondary}
        />
      </BottomSheet>

      {/* 位置权限 · 信息说明（打开不触发系统权限弹窗） */}
      <BottomSheet
        visible={locationSheet}
        onClose={() => setLocationSheet(false)}
        title="位置权限"
      >
        <Text style={styles.sheetBody}>
          只有当你主动选择“使用当前位置”时，渔见才会获取你的位置，用于为当前鱼获添加地点。
        </Text>
        <Text style={styles.sheetNote}>拒绝不会影响拍照识鱼和保存鱼获。</Text>
        <Text style={styles.sheetStatus}>当前状态：{locationStatus}</Text>
        <PrimaryButton label="知道了" onPress={() => setLocationSheet(false)} />
      </BottomSheet>
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
  subLineWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: spacing.lg + 38 + spacing.md,
    paddingRight: spacing.lg,
    paddingBottom: spacing.sm + 2,
    marginTop: -4,
  } as ViewStyle,
  subLine: {
    fontSize: fs(11),
    color: coreColors.mistBlueGray,
  } as TextStyle,
  retryHit: {
    minHeight: 32,
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  } as ViewStyle,
  retryText: {
    fontSize: fs(12),
    fontWeight: '600',
    color: '#168B88',
  } as TextStyle,
  errorLine: {
    fontSize: fs(11),
    color: '#C25B4E',
  } as TextStyle,
  sheetBody: {
    fontSize: fs(14),
    lineHeight: 22,
    color: coreColors.lakeBlue,
    marginBottom: spacing.md,
  } as TextStyle,
  sheetNote: {
    fontSize: fs(13),
    lineHeight: 20,
    color: coreColors.mistBlueGray,
    marginBottom: spacing.sm,
  } as TextStyle,
  sheetStatus: {
    fontSize: fs(12),
    color: coreColors.mistBlueGray,
    marginBottom: spacing.lg,
  } as TextStyle,
  sheetSecondary: {
    marginTop: spacing.sm,
  } as ViewStyle,
});
