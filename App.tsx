import React from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { ThemeProvider, useStatusBarStyle } from './src/contexts/ThemeContext';
import { PreferencesProvider } from './src/contexts/PreferencesContext';
import { LanguageProvider } from './src/contexts/LanguageContext';
import { AuthProvider } from './src/contexts/AuthContext';
import { RecognitionProvider } from './src/contexts/RecognitionContext';
import { CatchProvider } from './src/contexts/CatchContext';
import AppNavigator from './src/navigation/AppNavigator';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { AlertProvider } from './src/components/AlertProvider';

// StatusBar 跟随环境主题：夜晚浅色内容，其余深色内容
const ThemeStatusBar: React.FC = () => {
  const barStyle = useStatusBarStyle();
  return (
    <StatusBar
      barStyle={barStyle}
      backgroundColor="transparent"
      translucent
      animated
    />
  );
};

// Inner component to keep providers above NavigationContainer
const AppContent: React.FC = () => (
  <>
    <ThemeStatusBar />
    <NavigationContainer fallback={null}>
      <AppNavigator />
    </NavigationContainer>
  </>
);

function App(): React.JSX.Element {
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <ThemeProvider>
          <PreferencesProvider>
            <AlertProvider>
              <LanguageProvider>
                <AuthProvider>
                  <RecognitionProvider>
                    <CatchProvider>
                      <AppContent />
                    </CatchProvider>
                  </RecognitionProvider>
                </AuthProvider>
              </LanguageProvider>
            </AlertProvider>
          </PreferencesProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

export default App;
