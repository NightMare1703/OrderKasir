import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import './src/i18n/index';
import { colors, typography } from './src/theme';

const App = () => {
  const { t } = useTranslation();

  return (
    <View style={styles.container}>
      <Text style={styles.i18nCheck}>{t('common.ok')}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: colors.black[900],
    flex: 1,
    justifyContent: 'center',
  },
  i18nCheck: {
    ...typography.body,
    color: colors.white[50],
  },
});

export default App;
