// Navigation type definitions for the entire app
import { NavigatorScreenParams } from '@react-navigation/native';

export type MainTabParamList = {
  Home: undefined;
  Identify: undefined;
  Guide: undefined;
  My: undefined;
};

export type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  Main: NavigatorScreenParams<MainTabParamList>;
  Identify: undefined;
  Recognizing: undefined;
  Result: undefined;
  RecognitionIssue: undefined;
  Species: { key: string };
  Share: { catchId?: string } | undefined;
  CatchDetail: { catchId?: string } | undefined;
};

// Navigation prop types for screens
import { StackNavigationProp as NativeStackNavigationProp } from '@react-navigation/stack';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { CompositeNavigationProp, RouteProp } from '@react-navigation/native';

// Type for navigation prop in tab screens
export type TabNavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList>,
  NativeStackNavigationProp<RootStackParamList>
>;

// Type for navigation prop in stack screens
export type StackNavigationProp = NativeStackNavigationProp<RootStackParamList>;

export type SpeciesScreenRouteProp = RouteProp<RootStackParamList, 'Species'>;
