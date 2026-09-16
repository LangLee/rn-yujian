// @testing-library/react-native v13+ 自动注册 matchers，无需手动 extend-expect

// Gesture Handler 原生模块 mock（@react-navigation/stack 依赖）
require('react-native-gesture-handler/jestSetup');

// SafeAreaContext 在 jest 下无原生测量回调，使用官方 mock 提供默认 insets
jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default,
);

// Mock react-native-config（ESM 原生导出，jest 不转译 node_modules）
jest.mock('react-native-config', () => ({
  __esModule: true,
  default: {},
  Config: {},
}));

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// Mock react-native-vector-icons
jest.mock('react-native-vector-icons/Ionicons', () => 'Icon');

// Mock react-native-vision-camera（v5 依赖 NitroModules 原生模块，jest 下不可用）
jest.mock('react-native-vision-camera', () => ({
  Camera: () => null,
  useCameraDevice: () => undefined,
  useCameraDevices: () => [],
  useCameraFormat: () => undefined,
  useCameraPermission: () => ({
    hasPermission: false,
    requestPermission: async () => false,
  }),
  usePhotoOutput: () => ({
    capturePhotoToFile: async () => ({ filePath: '/tmp/photo.jpg' }),
  }),
}));

// requireNativeComponent 兜底：未注册的原生组件（如 YujianARMeasureView）退化为普通 View
jest.mock('react-native/Libraries/ReactNative/requireNativeComponent', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: (name) => {
      const NativeStub = (props) => <View {...props} />;
      NativeStub.displayName = name;
      return NativeStub;
    },
  };
});

// Mock Reanimated（仅在安装了 reanimated 时生效）
try {
  require.resolve('react-native-reanimated');
  jest.mock('react-native-reanimated', () => {
    const Reanimated = require('react-native-reanimated/mock');
    Reanimated.default.call = () => {};
    return Reanimated;
  });
} catch {
  // 未安装 reanimated，跳过
}
