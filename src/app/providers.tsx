import * as React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { database } from '../database';
import { SettingsService } from '../services/SettingsService';

type Props = {
  children: React.ReactNode;
};

export const Providers = ({ children }: Props) => {
  React.useEffect(() => {
    const service = new SettingsService(database);
    service.restoreLanguageFromSettings().catch(() => undefined);
  }, []);

  return <SafeAreaProvider>{children}</SafeAreaProvider>;
};
