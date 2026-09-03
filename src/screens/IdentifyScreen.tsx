import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Image, PermissionsAndroid, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import Icon from 'react-native-vector-icons/Ionicons';
import { useRecognition } from '../contexts/RecognitionContext';
import { recognitionService } from '../services/recognitionService';
import { YujianTopBar } from '../components/Common';
import { FishIllustration } from '../components/FishIllustration';
import { palette } from '../constants/colors';
import { RootStackParamList } from '../navigation/types';
import { toFileUri } from '../utils/fileUri';

type IdentifyScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Identify'>;

/**
 * 拍照识鱼页（对应原 IdentifyScreen.kt）：image-picker 拍照/相册 →
 * 原生 normalizeImage（EXIF 校正 + 2048 归一化落盘）。
 */
export const IdentifyScreen: React.FC = () => {
  const navigation = useNavigation<IdentifyScreenNavigationProp>();
  const { image, selectImage } = useRecognition();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePicked = useCallback(
    async (uri: string, source: 'camera' | 'gallery') => {
      setLoading(true);
      setError(null);
      try {
        const meta = await recognitionService.normalizeImage(uri, source);
        selectImage(meta);
      } catch (e) {
        setError(e instanceof Error ? e.message : '照片读取失败');
      } finally {
        setLoading(false);
      }
    },
    [selectImage],
  );

  const openCamera = useCallback(async () => {
    setError(null);
    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA, {
        title: '相机权限',
        message: '需要使用相机拍照识鱼',
        buttonPositive: '允许',
        buttonNegative: '拒绝',
      });
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        setError('需要相机权限才能拍照识鱼，也可以直接从相册选择照片');
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
            ? '需要相机权限才能拍照识鱼，也可以直接从相册选择照片'
            : response.errorMessage ?? '相机启动失败',
        );
        return;
      }
      const uri = response.assets?.[0]?.uri;
      if (!uri) {
        setError('未完成拍照，请重新拍摄');
        return;
      }
      void handlePicked(uri, 'camera');
    });
  }, [handlePicked]);

  const openGallery = useCallback(() => {
    setError(null);
    launchImageLibrary({ mediaType: 'photo', quality: 1, selectionLimit: 1 }, (response) => {
      if (response.didCancel) {
        return;
      }
      if (response.errorCode) {
        setError(response.errorMessage ?? '相册读取失败');
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

  return (
    <View style={styles.screen}>
      <YujianTopBar
        title="拍照识鱼"
        subtitle="让鱼体尽量完整地进入框内"
        onBack={() => navigation.goBack()}
      />

      <View style={styles.viewfinder}>
        {imageUri ? (
          <>
            <Image source={{ uri: imageUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            <View style={[StyleSheet.absoluteFill, styles.viewfinderDim]} />
          </>
        ) : (
          <View style={styles.viewfinderPlaceholder}>
            <FishIllustration size={190} bodyColor="rgba(220,239,235,0.86)" />
          </View>
        )}
        <View style={styles.frame} pointerEvents="none" />
        <View style={styles.statusBadge} pointerEvents="none">
          <Text style={styles.statusText}>
            {loading ? '正在准备照片' : imageUri ? '照片已选好' : '准备取景'}
          </Text>
        </View>
        <View style={styles.viewfinderHint} pointerEvents="none">
          <Text style={styles.viewfinderHintTitle}>把鱼放在框内</Text>
          <Text style={styles.viewfinderHintText}>鱼体完整 · 光线充足 · 少遮挡</Text>
        </View>
        {loading ? <ActivityIndicator style={styles.loading} color="#FFFFFF" /> : null}
      </View>

      <Text style={[styles.statusLine, error !== null && styles.statusLineError]}>
        {error ?? (imageUri ? '照片准备好了，可以开始认识这条鱼' : '拍清楚一点，我会认得更准')}
      </Text>

      <View style={styles.actions}>
        <Pressable
          onPress={openGallery}
          disabled={loading}
          style={({ pressed }) => [styles.galleryButton, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
          accessibilityLabel="从相册选择照片"
        >
          <Icon name="images" size={20} color={palette.waterTeal} />
          <Text style={styles.galleryButtonText}>相册</Text>
        </Pressable>
        <Pressable
          onPress={openCamera}
          disabled={loading}
          style={({ pressed }) => [styles.cameraButton, pressed && { opacity: 0.8 }]}
          accessibilityRole="button"
          accessibilityLabel="拍照"
        >
          <Icon name="camera" size={20} color={palette.waterTeal} />
          <Text style={styles.cameraButtonText}>拍照</Text>
        </Pressable>
      </View>

      <Pressable
        onPress={() => navigation.navigate('Recognizing')}
        disabled={image === null || loading}
        style={({ pressed }) => [
          styles.startButton,
          (image === null || loading) && styles.startButtonDisabled,
          pressed && image !== null && !loading && { opacity: 0.88 },
        ]}
        accessibilityRole="button"
        accessibilityLabel="开始识别"
      >
        <View style={styles.sparkBadge}>
          <Text style={styles.sparkText}>✦</Text>
        </View>
        <Text style={styles.startButtonText}>开始识别</Text>
      </Pressable>

      <View style={{ height: 20 }} />
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: palette.warmBackground,
  },
  viewfinder: {
    flex: 1,
    marginHorizontal: 20,
    marginVertical: 8,
    borderRadius: 28,
    backgroundColor: palette.viewfinderDark,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewfinderDim: {
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  viewfinderPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  frame: {
    position: 'absolute',
    width: '78%',
    height: 270,
    borderWidth: 2,
    borderColor: palette.fishMint,
    borderRadius: 24,
  },
  statusBadge: {
    position: 'absolute',
    top: 18,
    left: 18,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: 50,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  statusText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  viewfinderHint: {
    position: 'absolute',
    bottom: 20,
    alignItems: 'center',
  },
  viewfinderHintTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  viewfinderHintText: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 11,
    marginTop: 5,
  },
  loading: {
    position: 'absolute',
    top: 18,
    right: 18,
  },
  statusLine: {
    color: palette.mutedInk,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 10,
  },
  statusLineError: {
    color: palette.qualityInvalid,
  },
  actions: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 18,
    gap: 12,
  },
  galleryButton: {
    flex: 1,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: palette.waterTeal,
    backgroundColor: palette.cardWhite,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  galleryButtonText: {
    color: palette.deepInk,
  },
  cameraButton: {
    flex: 1,
    height: 52,
    borderRadius: 26,
    backgroundColor: palette.softWater,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  cameraButtonText: {
    color: palette.waterTeal,
    fontWeight: '600',
  },
  startButton: {
    marginHorizontal: 20,
    height: 54,
    borderRadius: 27,
    backgroundColor: palette.waterTeal,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  startButtonDisabled: {
    opacity: 0.28,
  },
  sparkBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sparkText: {
    color: '#FFFFFF',
    fontSize: 12,
  },
  startButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
