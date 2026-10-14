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

// 图标组件 AppIcon 与湖景/直尺等 SVG 视觉层共用 react-native-svg，
// jest 下走真实 JS 实现（原生视图经下方 requireNativeComponent 兜底桩化），
// 因此这里不 mock react-native-svg。

// Mock @shopify/react-native-skia（依赖 CanvasKit/RNSkiaModule 原生，jest 下不可用；
// 仅 ScanEffect 视觉动效使用，桩化为不渲染的空组件即可）
jest.mock('@shopify/react-native-skia', () => {
  const React = require('react');
  const Noop = () => null;
  const make = (name) => {
    const Comp = (props) => <>{props?.children ?? null}</>;
    Comp.displayName = name;
    return Comp;
  };
  return {
    Canvas: make('Canvas'),
    Circle: Noop,
    Group: make('Group'),
    Line: Noop,
    LinearGradient: Noop,
    Path: Noop,
    Rect: Noop,
    RoundedRect: Noop,
    Blur: Noop,
    Paint: Noop,
    vec: (x, y) => ({ x, y }),
    Skia: new Proxy(
      {},
      {
        get: (_t, prop) => {
          if (prop === 'MakeLinearGradientShader') {
            return () => null;
          }
          return () => null;
        },
      },
    ),
  };
});

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

// Mock Reanimated（v4 官方 mock 依赖 worklets 原生，jest 下不可用；
// 仅 ScanEffect 动效使用，桩化核心 API）
jest.mock('react-native-reanimated', () => {
  const identity = (v) => v;
  const chainable = () => chainable;
  return {
    __esModule: true,
    default: {
      createAnimatedComponent: (Comp) => Comp,
      View: require('react-native').View,
    },
    useSharedValue: (initial) => ({ value: initial }),
    useFrameCallback: () => {},
    useDerivedValue: (fn) => ({ value: fn?.() ?? null }),
    useAnimatedProps: () => ({}),
    useAnimatedStyle: () => ({}),
    useAnimatedReaction: () => {},
    withTiming: identity,
    withRepeat: identity,
    withSequence: identity,
    withDelay: (_d, v) => v,
    withSpring: identity,
    cancelAnimation: () => {},
    runOnJS: (fn) => fn,
    runOnUI: (fn) => fn,
    Easing: {
      linear: identity,
      ease: identity,
      quad: identity,
      bezier: () => identity,
      in: identity,
      out: identity,
      inOut: identity,
    },
  };
});
