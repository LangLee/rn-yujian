import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { AlertButton } from '../utils/alert';

interface CustomAlertProps {
  visible: boolean;
  title?: string;
  message?: string;
  buttons?: AlertButton[];
  onDismiss?: () => void;
  buttonLayout?: 'horizontal' | 'vertical';
}

export function CustomAlert({
  visible,
  title,
  message,
  buttons = [{ text: 'OK', style: 'default' }],
  onDismiss,
  buttonLayout = 'horizontal',
}: CustomAlertProps) {
  const { colors } = useTheme();

  const handleButtonPress = (button: AlertButton) => {
    if (button.onPress) {
      button.onPress();
    }
    if (onDismiss) {
      onDismiss();
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <View style={styles.overlay}>
        <View style={[styles.alertContainer, { backgroundColor: colors.card }]}>
          {title && (
            <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
          )}

          {message && (
            <Text style={[styles.message, { color: colors.textSecondary }]}>
              {message}
            </Text>
          )}

          <View
            style={[
              styles.buttonContainer,
              { borderTopColor: colors.border },
              buttonLayout === 'vertical' && styles.buttonContainerVertical,
            ]}
          >
            {buttons.map((button, index) => {
              let buttonColor = colors.primary;
              if (button.style === 'destructive') {
                buttonColor = colors.error;
              } else if (button.style === 'cancel') {
                buttonColor = colors.textSecondary;
              }

              const isNotLastButton = index < buttons.length - 1;
              const borderStyle =
                buttonLayout === 'vertical'
                  ? {
                      borderBottomWidth: StyleSheet.hairlineWidth,
                      borderBottomColor: colors.border,
                    }
                  : {
                      borderRightWidth: StyleSheet.hairlineWidth,
                      borderRightColor: colors.border,
                    };

              return (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.button,
                    buttonLayout === 'vertical' && styles.buttonVertical,
                    isNotLastButton && borderStyle,
                  ]}
                  onPress={() => handleButtonPress(button)}
                >
                  <Text style={[styles.buttonText, { color: buttonColor }]}>
                    {button.text}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  alertContainer: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 16,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    lineHeight: 32,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
    textAlign: 'center',
  },
  message: {
    fontSize: 16,
    fontWeight: '400',
    lineHeight: 24,
    letterSpacing: 0.15,
    paddingHorizontal: 20,
    paddingBottom: 20,
    textAlign: 'center',
  },
  buttonContainer: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  buttonContainerVertical: {
    flexDirection: 'column',
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonVertical: {
    flex: 0,
    width: '100%',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 24,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
});
