import { Alert as RNAlert, Platform } from 'react-native';

export interface AlertButton {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
}

export interface AlertOptions {
  buttonLayout?: 'horizontal' | 'vertical';
}

// 全局状态管理
let alertComponent: {
  show: (
    title: string,
    message?: string,
    buttons?: AlertButton[],
    options?: AlertOptions,
  ) => void;
} | null = null;

export const registerAlertComponent = (component: {
  show: (
    title: string,
    message?: string,
    buttons?: AlertButton[],
    options?: AlertOptions,
  ) => void;
}) => {
  alertComponent = component;
};

/**
 * 显示 Alert 对话框
 * 在 iOS 上使用原生 Alert（支持系统主题）
 * 在 Android 上使用自定义 Alert（支持应用主题）
 */
const showAlert = (
  title: string,
  message?: string,
  buttons?: AlertButton[],
  options?: AlertOptions,
) => {
  // iOS 使用原生 Alert，会自动跟随系统主题
  if (Platform.OS === 'ios') {
    RNAlert.alert(
      title,
      message,
      buttons?.map(btn => ({
        text: btn.text,
        onPress: btn.onPress,
        style: btn.style,
      })),
    );
    return;
  }

  // Android 使用自定义 Alert，支持应用主题
  if (alertComponent) {
    alertComponent.show(title, message, buttons, options);
  } else {
    // 降级到原生 Alert
    RNAlert.alert(
      title,
      message,
      buttons?.map(btn => ({
        text: btn.text,
        onPress: btn.onPress,
        style: btn.style,
      })),
    );
  }
};

// 导出 Alert 对象
export const Alert = {
  alert: showAlert,
};
