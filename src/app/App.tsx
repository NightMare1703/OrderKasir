import * as React from 'react';

import '../i18n';
import { Providers } from './providers';
import { RootNavigator } from './navigation';

const App = () => {
  return (
    <Providers>
      <RootNavigator />
    </Providers>
  );
};

export default App;
