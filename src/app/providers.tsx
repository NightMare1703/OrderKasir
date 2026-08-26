import * as React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

type Props = {
  children: React.ReactNode;
};

export const Providers = ({ children }: Props) => {
  return <SafeAreaProvider>{children}</SafeAreaProvider>;
};
