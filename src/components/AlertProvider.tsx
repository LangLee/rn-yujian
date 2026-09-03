import React, { useState, useEffect, ReactNode } from 'react';
import { CustomAlert } from './CustomAlert';
import {
  registerAlertComponent,
  AlertButton,
  AlertOptions,
} from '../utils/alert';

interface AlertState {
  visible: boolean;
  title?: string;
  message?: string;
  buttons?: AlertButton[];
  options?: AlertOptions;
}

export function AlertProvider({ children }: { children: ReactNode }) {
  const [alertState, setAlertState] = useState<AlertState>({
    visible: false,
  });

  useEffect(() => {
    // 注册全局 Alert 组件
    registerAlertComponent({
      show: (
        title: string,
        message?: string,
        buttons?: AlertButton[],
        options?: AlertOptions,
      ) => {
        setAlertState({
          visible: true,
          title,
          message,
          buttons,
          options,
        });
      },
    });
  }, []);

  const handleDismiss = () => {
    setAlertState({ visible: false });
  };

  return (
    <>
      {children}
      <CustomAlert
        visible={alertState.visible}
        title={alertState.title}
        message={alertState.message}
        buttons={alertState.buttons}
        onDismiss={handleDismiss}
        buttonLayout={alertState.options?.buttonLayout}
      />
    </>
  );
}
