import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Image,
  PermissionsAndroid,
  Platform,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import Icon from 'react-native-vector-icons/Ionicons';
import { StackNavigationProp, RootStackParamList } from '../navigation/types';
import { useRecognition } from '../contexts/RecognitionContext';
import { recognitionService } from '../services/recognitionService';
import { WaterBackdrop } from '../components/WaterBackdrop';
import { CaptureButton } from '../components/CaptureButton';
import { IconButton } from '../components/ui/IconButton';
import { BottomSheet } from '../components/ui/BottomSheet';
import { PrimaryButton } from '../components/ui/PrimaryButton';
import { palette } from '../constants/colors';
import { radius, spacing, typeScale } from '../constants/tokens';
import { toFileUri } from '../utils/fileUri';
import { haptics } from '../utils/haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';

type IdentifyScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Identify'>;

const CAMERA_PERM_SEEN_KEY = '@yujian/perm_camera_seen';

/** Quality Gate 文案：只说用户可行动的信息（7.1）。 */
const QUALITY_COPY: Record<string, string> = {
  ready: '鱼体完整，可以拍摄',
  no_fish: '没有看到完整的鱼，调整一下角度再试试',
  uncertain: '鱼看得不太清楚，靠近一点、拍亮一点',
  multiple_fish: '一次拍一条鱼会认得更准',
  incomplete_fish: '保持鱼头鱼尾完整',
  fish_too_small: '让鱼占满取景框会更好认',
};

/**
 * P02 拍照识鱼（设计文档 7.1）：
 * 全屏取景；底部中央相机按钮；相册缩略入口位于右下角。
 * 辅助框只用于提示完整鱼身，不做人脸框 / HUD。
 * 拍照后立即进入 P03，不假装已经完成识别。
 */
export const IdentifyScreen: React.FC = () => {
  const navigation = useNavigation<IdentifyScreenNavigationProp>();
  const { image, selectImage, reset } = useRecognition();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(false);
  const [gateStatus, setGateStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [permSheet, setPermSheet] = useState(false);
  const pendingCameraRef = useRef(false);

  // 进入 P02 时清理上一条流程的残留状态
  useEffect(() => {
    reset();
    return () => undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePicked = useCallback(
    async (uri: string, source: 'camera' | 'gallery') => {
      setLoading(true);
      setError(null);
      setGateStatus(null);
      try {
        const meta = await recognitionService.normalizeImage(uri, source);
        selectImage(meta);
        // 拍照后立即进入 P03；照片尚未识别，不假装已完成
        navigation.navigate('Recognizing');
      } catch (e) {
        setError(e instanceof Error ? e.message : '照片读取失败，请再试一次');
      } finally {
        setLoading(false);
      }
    },
    [selectImage, navigation],
  );

  const requestCameraAndShoot = useCallback(async () => {
    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA, {
        title: '相机权限',
        message: '只有在你主动拍摄时，渔见才会使用相机',
        buttonPositive: '允许',
        buttonNegative: '拒绝',
      });
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        setError('需要相机权限才能拍照，也可以从右下角选择相册照片');
        return;
      }
    }
    launchCamera({ mediaType: 'photo', quality: 1 }, (response) => {
      if (response.didCancel) {
        return;
      }
      if (response.errorCode) {
        setError(
          response.errorCode === 'permission'
            ? '需要相机权限才能拍照，也可以从右下角选择相册照片'
            : response.errorMessage ?? '相机启动失败，请再试一次',
        );
        return;
      }
      const uri = response.assets?.[0]?.uri;
      if (!uri) {
        setError('没有拍到照片，请重新拍摄');
        return;
      }
      void handlePicked(uri, 'camera');
    });
  }, [handlePicked]);

  const openCamera = useCallback(async () => {
    setError(null);
    haptics.confirm(); // S2：拍照核心确认（17.6）
    const seen = await AsyncStorage.getItem(CAMERA_PERM_SEEN_KEY);
    if (!seen) {
      pendingCameraRef.current = true;
      setPermSheet(true);
      return;
    }
    await requestCameraAndShoot();
  }, [requestCameraAndShoot]);

  const openGallery = useCallback(() => {
    setError(null);
    haptics.selection();
    launchImageLibrary({ mediaType: 'photo', quality: 1, selectionLimit: 1 }, (response) => {
      if (response.didCancel) {
        return;
      }
      if (response.errorCode) {
        setError(response.errorMessage ?? '相册读取失败，请再试一次');
        return;
      }
      const uri = response.assets?.[0]?.uri;
      if (!uri) {
        return;
      }
      void handlePicked(uri, 'gallery');
    });
  }, [handlePicked]);

  const imageUri = toFileUri(image?.filePath);
  const gateCopy = error ?? (loading ? '正在准备照片…' : imageUri ? '正在认识这条鱼…' : gateStatus ? QUALITY_COPY[gateStatus] ?? null : '把鱼放进框里，保持鱼头鱼尾完整');

  return (
    <View style={styles.screen}>
      {/* 环境照片背景 + 深色遮罩（相机氛围，透明取景） */}
      <WaterBackdrop />
      <View style={[StyleSheet.absoluteFill, styles.bgScrim]} pointerEvents="none" />
      {/* 顶部：关闭 + 标题 */}
      <View style={[styles.topBar, { paddingTop: insets.top + spacing.sm }]}>
        <IconButton
          icon="close"
          iconSize={20}
          iconColor="#EAF4F2"
          backgroundColor="rgba(255,255,255,0.12)"
          onPress={() => navigation.goBack()}
        />
        <Text style={styles.topTitle}>拍照识鱼</Text>
        <View style={styles.topSpacer} />
      </View>

      {/* 取景区（半透明；鱼体标记位后续由图片资产实现） */}
      <View style={styles.viewfinder}>
        {imageUri ? (
          <>
            <Image source={{ uri: imageUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            <View style={[StyleSheet.absoluteFill, styles.viewfinderDim]} />
          </>
        ) : null}
        {/* 辅助框：提示完整鱼身 */}
        <View style={styles.frame} pointerEvents="none" />
        <View style={styles.viewfinderHint} pointerEvents="none">
          <Text style={styles.viewfinderHintText}>鱼体完整 · 光线充足 · 少遮挡</Text>
        </View>
      </View>

      {/* Quality Gate 反馈 */}
      <View style={styles.copyWrap}>
        <Text style={[styles.copy, Boolean(error) && styles.copyError]} numberOfLines={2}>
          {gateCopy ?? ''}
        </Text>
      </View>

      {/* 底部：中央快门 + 右下角相册入口 */}
      <View style={[styles.dock, { paddingBottom: insets.bottom + spacing.lg }]}>
        <View style={styles.dockRow}>
          <View style={styles.dockSide} />
          <CaptureButton onPress={openCamera} disabled={loading} size={84} icon="camera" />
          <View style={styles.dockSide}>
            <IconButton
              icon="images-outline"
              size={52}
              iconSize={22}
              iconColor="#EAF4F2"
              backgroundColor="rgba(255,255,255,0.12)"
              onPress={openGallery}
              disabled={loading}
            />
          </View>
        </View>
      </View>

      {/* 首次相机权限引导（16：自有说明 Sheet → 继续 → 系统权限弹窗） */}
      <BottomSheet
        visible={permSheet}
        onClose={() => {
          setPermSheet(false);
          pendingCameraRef.current = false;
        }}
        title="使用相机"
      >
        <Text style={styles.permText}>
          只有在你主动拍摄时，渔见才会使用相机。拍下的鱼获照片保存在你自己的收藏里。
        </Text>
        <PrimaryButton
          label="继续"
          onPress={async () => {
            setPermSheet(false);
            AsyncStorage.setItem(CAMERA_PERM_SEEN_KEY, '1').catch(() => undefined);
            if (pendingCameraRef.current) {
              pendingCameraRef.current = false;
              await requestCameraAndShoot();
            }
          }}
        />
        <PrimaryButton
          label="先不用"
          variant="ghost"
          onPress={() => {
            setPermSheet(false);
            pendingCameraRef.current = false;
          }}
          style={styles.permSecondary}
        />
      </BottomSheet>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: palette.viewfinderDark,
  } as ViewStyle,
  bgScrim: {
    backgroundColor: 'rgba(5,18,24,0.62)',
  } as ViewStyle,
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.page,
    paddingBottom: spacing.sm,
  } as ViewStyle,
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  } as ViewStyle,
  topTitle: {
    flex: 1,
    textAlign: 'center',
    color: '#EAF4F2',
    fontSize: typeScale.h2,
    fontWeight: '700',
  } as TextStyle,
  topSpacer: {
    width: 40,
  } as ViewStyle,
  viewfinder: {
    flex: 1,
    marginHorizontal: spacing.page,
    borderRadius: radius.l,
    backgroundColor: 'rgba(4,16,20,0.35)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  viewfinderDim: {
    backgroundColor: 'rgba(0,0,0,0.16)',
  } as ViewStyle,
  frame: {
    position: 'absolute',
    width: '78%',
    height: 260,
    borderWidth: 1.5,
    borderColor: 'rgba(188,217,213,0.55)',
    borderRadius: radius.l,
  } as ViewStyle,
  viewfinderHint: {
    position: 'absolute',
    bottom: spacing.lg,
    alignItems: 'center',
  } as ViewStyle,
  viewfinderHintText: {
    color: 'rgba(234,244,242,0.72)',
    fontSize: typeScale.caption,
  } as TextStyle,
  copyWrap: {
    paddingHorizontal: spacing.page,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  copy: {
    color: 'rgba(234,244,242,0.85)',
    fontSize: typeScale.body,
    textAlign: 'center',
  } as TextStyle,
  copyError: {
    color: '#E8A79D',
  } as TextStyle,
  dock: {
    paddingHorizontal: spacing.page,
  } as ViewStyle,
  dockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  } as ViewStyle,
  dockSide: {
    width: 84,
    alignItems: 'center',
  } as ViewStyle,
  albumButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
  } as ViewStyle,
  permText: {
    color: palette.mutedInk,
    fontSize: typeScale.body,
    lineHeight: 24,
    marginBottom: spacing.lg,
  } as TextStyle,
  permSecondary: {
    marginTop: spacing.sm,
  } as ViewStyle,
});
