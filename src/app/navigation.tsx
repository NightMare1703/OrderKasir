import {
  DefaultTheme,
  NavigationContainer,
  type Theme,
} from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import * as React from 'react';

import { colors } from '../theme';
import { LoginScreen } from '../features/auth/screens/LoginScreen';
import { PlaceholderScreen } from './PlaceholderScreen';

export type RootStackParamList = {
  Login: undefined;
  MainTabs: undefined;
};

export type MainTabParamList = {
  PosTab: undefined;
  HistoryTab: undefined;
  ProductsTab: undefined;
  DebtsTab: undefined;
  MoreTab: undefined;
};

const RootStack = createNativeStackNavigator<RootStackParamList>();
const MainTabs = createBottomTabNavigator<MainTabParamList>();

// Stub layar kosong sesuai SCREENS.md peta navigasi: LoginPin → MainTabs.
// Diganti layar sungguhan pada task masing-masing.
const PosTabStub = () => <PlaceholderScreen titleKey="pos.title" />;
const HistoryTabStub = () => <PlaceholderScreen titleKey="history.title" />;
const ProductsTabStub = () => <PlaceholderScreen titleKey="products.title" />;
const DebtsTabStub = () => <PlaceholderScreen titleKey="customers.title" />;
const MoreTabStub = () => <PlaceholderScreen titleKey="common.more" />;

const navigationTheme: Theme = {
  ...DefaultTheme,
  dark: true,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.orange[500],
    background: colors.black[900],
    card: colors.black[800],
    text: colors.white[50],
    border: colors.black[600],
    notification: colors.orange[500],
  },
};

const MainTabsNavigator = () => {
  const { t } = useTranslation();

  return (
    <MainTabs.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.orange[500],
        tabBarInactiveTintColor: colors.white[150],
        tabBarStyle: {
          backgroundColor: colors.black[800],
          borderTopColor: colors.black[600],
        },
      }}>
      <MainTabs.Screen
        name="PosTab"
        component={PosTabStub}
        options={{ tabBarLabel: t('pos.title') }}
      />
      <MainTabs.Screen
        name="HistoryTab"
        component={HistoryTabStub}
        options={{ tabBarLabel: t('history.title') }}
      />
      <MainTabs.Screen
        name="ProductsTab"
        component={ProductsTabStub}
        options={{ tabBarLabel: t('products.title') }}
      />
      <MainTabs.Screen
        name="DebtsTab"
        component={DebtsTabStub}
        options={{ tabBarLabel: t('customers.title') }}
      />
      <MainTabs.Screen
        name="MoreTab"
        component={MoreTabStub}
        options={{ tabBarLabel: t('common.more') }}
      />
    </MainTabs.Navigator>
  );
};

export const RootNavigator = () => (
  <NavigationContainer theme={navigationTheme}>
    <RootStack.Navigator
      initialRouteName="Login"
      screenOptions={{
        contentStyle: { backgroundColor: colors.black[900] },
        headerShown: false,
      }}>
      <RootStack.Screen name="Login" component={LoginScreen} />
      <RootStack.Screen name="MainTabs" component={MainTabsNavigator} />
    </RootStack.Navigator>
  </NavigationContainer>
);
