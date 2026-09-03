import React from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { ThemeProvider } from './src/contexts/ThemeContext';
import { LanguageProvider } from './src/contexts/LanguageContext';
import { AuthProvider } from './src/contexts/AuthContext';
import { RecognitionProvider } from './src/contexts/RecognitionContext';
import { CatchProvider } from './src/contexts/CatchContext';
import AppNavigator from './src/navigation/AppNavigator';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { AlertProvider } from './src/components/AlertProvider';

// Inner component to keep providers above NavigationContainer
const AppContent: React.FC = () => (
  <>
    {/* 主题固定浅色（与原 app 一致） */}
    <StatusBar
      barStyle="dark-content"
      backgroundColor="transparent"
      translucent
      animated
    />
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
        </ThemeProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

export default App;
