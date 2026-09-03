import {
  DefaultTheme,
  NavigationContainer,
  type Theme,
} from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import * as React from 'react';

import { colors, typography } from '../theme';
import { LoginScreen } from '../features/auth/screens/LoginScreen';
import { TransactionDetailScreen } from '../features/history/screens/TransactionDetailScreen';
import { TransactionHistoryScreen } from '../features/history/screens/TransactionHistoryScreen';
import { PaymentSuccessScreen } from '../features/pos/screens/PaymentSuccessScreen';
import { PosScreen } from '../features/pos/screens/PosScreen';
import { ProductFormScreen } from '../features/products/screens/ProductFormScreen';
import { ProductListScreen } from '../features/products/screens/ProductListScreen';
import { InventoryScreen } from '../features/inventory/screens/InventoryScreen';
import { StockAdjustmentScreen } from '../features/inventory/screens/StockAdjustmentScreen';
import { StockMovementLogScreen } from '../features/inventory/screens/StockMovementLogScreen';
import { CustomerDebtDetailScreen } from '../features/customers/screens/CustomerDebtDetailScreen';
import { DebtDashboardScreen } from '../features/customers/screens/DebtDashboardScreen';
import { PrinterSettingsScreen } from '../features/settings/screens/PrinterSettingsScreen';
import { SettingsScreen } from '../features/settings/screens/SettingsScreen';
import { OpenShiftScreen } from '../features/shifts/screens/OpenShiftScreen';
import { CloseShiftScreen } from '../features/shifts/screens/CloseShiftScreen';
import { ShiftRecapScreen } from '../features/shifts/screens/ShiftRecapScreen';
import { ShiftHistoryScreen } from '../features/shifts/screens/ShiftHistoryScreen';
import { ReportsDashboardScreen } from '../features/reports/screens/ReportsDashboardScreen';

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

export type ProductsStackParamList = {
  ProductList: undefined;
  // productId kosong/undefined = mode tambah produk baru.
  ProductForm: { productId: string } | undefined;
  InventoryList: undefined;
  StockAdjustment: { productId: string };
  StockLog: { productId?: string };
};

export type PosStackParamList = {
  PosMain: undefined;
  PaymentSuccess: { transactionId: string; invoiceNo: string; change: number; total: number };
};

export type HistoryStackParamList = {
  HistoryList: undefined;
  HistoryDetail: { transactionId: string };
};

export type SettingsStackParamList = {
  SettingsMain: undefined;
  PrinterSettings: undefined;
  ShiftHistory: undefined;
  ShiftRecap: { shiftId: string };
  OpenShift: undefined;
  CloseShift: { shiftId: string };
  ReportsDashboard: undefined;
};

export type CustomersStackParamList = {
  DebtDashboard: undefined;
  CustomerDebtDetail: { customerId: string };
};

const RootStack = createNativeStackNavigator<RootStackParamList>();
const MainTabs = createBottomTabNavigator<MainTabParamList>();
const ProductsStack = createNativeStackNavigator<ProductsStackParamList>();
const PosStack = createNativeStackNavigator<PosStackParamList>();
const HistoryStack = createNativeStackNavigator<HistoryStackParamList>();
const SettingsStack = createNativeStackNavigator<SettingsStackParamList>();
const CustomersStack = createNativeStackNavigator<CustomersStackParamList>();

const SettingsNavigator = () => (
  <SettingsStack.Navigator
    screenOptions={{
      contentStyle: { backgroundColor: colors.black[900] },
      headerStyle: { backgroundColor: colors.black[900] },
      headerTintColor: colors.white[50],
      headerTitleStyle: typography.heading,
    }}>
    <SettingsStack.Screen
      component={SettingsScreen}
      name="SettingsMain"
      options={{ headerBackVisible: false, title: 'Pengaturan' }}
    />
    <SettingsStack.Screen component={PrinterSettingsScreen} name="PrinterSettings" />
    <SettingsStack.Screen
      component={ShiftHistoryScreen}
      name="ShiftHistory"
      options={{ title: 'Riwayat Shift' }}
    />
    <SettingsStack.Screen
      component={ShiftRecapScreen}
      name="ShiftRecap"
      options={{ title: 'Rekap Shift' }}
    />
    <SettingsStack.Screen
      component={OpenShiftScreen}
      name="OpenShift"
      options={{ title: 'Buka Shift' }}
    />
    <SettingsStack.Screen
      component={CloseShiftScreen}
      name="CloseShift"
      options={{ title: 'Tutup Shift' }}
    />
    <SettingsStack.Screen
      component={ReportsDashboardScreen}
      name="ReportsDashboard"
      options={{ title: 'Laporan' }}
    />
  </SettingsStack.Navigator>
);

const PosNavigator = () => (
  <PosStack.Navigator
    screenOptions={{
      contentStyle: { backgroundColor: colors.black[900] },
      headerShown: false,
    }}>
    <PosStack.Screen component={PosScreen} name="PosMain" />
    <PosStack.Screen component={PaymentSuccessScreen} name="PaymentSuccess" />
  </PosStack.Navigator>
);

const ProductsNavigator = () => (
  <ProductsStack.Navigator
    screenOptions={{
      contentStyle: { backgroundColor: colors.black[900] },
      headerStyle: { backgroundColor: colors.black[900] },
      headerTintColor: colors.white[50],
      headerTitleStyle: typography.heading,
    }}>
    <ProductsStack.Screen
      component={ProductListScreen}
      name="ProductList"
      options={{ headerBackVisible: false }}
    />
    <ProductsStack.Screen component={ProductFormScreen} name="ProductForm" />
    <ProductsStack.Screen component={InventoryScreen} name="InventoryList" />
    <ProductsStack.Screen component={StockAdjustmentScreen} name="StockAdjustment" />
    <ProductsStack.Screen component={StockMovementLogScreen} name="StockLog" />
  </ProductsStack.Navigator>
);

const HistoryNavigator = () => (
  <HistoryStack.Navigator
    screenOptions={{
      contentStyle: { backgroundColor: colors.black[900] },
      headerStyle: { backgroundColor: colors.black[900] },
      headerTintColor: colors.white[50],
      headerTitleStyle: typography.heading,
    }}>
    <HistoryStack.Screen
      component={TransactionHistoryScreen}
      name="HistoryList"
      options={{ headerBackVisible: false, title: 'Riwayat' }}
    />
    <HistoryStack.Screen component={TransactionDetailScreen} name="HistoryDetail" />
  </HistoryStack.Navigator>
);

const CustomersNavigator = () => (
  <CustomersStack.Navigator
    screenOptions={{
      contentStyle: { backgroundColor: colors.black[900] },
      headerStyle: { backgroundColor: colors.black[900] },
      headerTintColor: colors.white[50],
      headerTitleStyle: typography.heading,
    }}>
    <CustomersStack.Screen
      component={DebtDashboardScreen}
      name="DebtDashboard"
      options={{ headerBackVisible: false, title: 'Piutang' }}
    />
    <CustomersStack.Screen component={CustomerDebtDetailScreen} name="CustomerDebtDetail" />
  </CustomersStack.Navigator>
);

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
        component={PosNavigator}
        options={{ tabBarLabel: t('pos.title') }}
      />
      <MainTabs.Screen
        name="HistoryTab"
        component={HistoryNavigator}
        options={{ tabBarLabel: t('history.title') }}
      />
      <MainTabs.Screen
        name="ProductsTab"
        component={ProductsNavigator}
        options={{ tabBarLabel: t('products.title') }}
      />
      <MainTabs.Screen
        name="DebtsTab"
        component={CustomersNavigator}
        options={{ tabBarLabel: t('customers.title') }}
      />
      <MainTabs.Screen
        name="MoreTab"
        component={SettingsNavigator}
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
