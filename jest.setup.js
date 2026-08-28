// react-native-screens membutuhkan native module; stub komponen passthrough
// supaya smoke test render navigator jalan di Jest.
jest.mock('react-native-screens', () => {  const React = require('react');
  const { View } = require('react-native');

  const passthrough = ({ children }) =>
    React.createElement(View, { collapsable: false }, children);

  const componentExports = [
    'Screen',
    'ScreenStack',
    'ScreenStackItem',
    'ScreenContainer',
    'ScreenFooter',
    'ScreenStackHeaderConfig',
    'ScreenStackHeaderSubview',
    'ScreenStackHeaderCenterView',
    'ScreenStackHeaderLeftView',
    'ScreenStackHeaderRightView',
    'ScreenStackHeaderBackButtonImage',
    'ScreenStackHeaderSearchBarView',
    'SearchBar',
  ];

  const valueExports = {
    enableScreens: () => {},
    enableFreeze: () => {},
    screensEnabled: () => false,
    freezeEnabled: () => false,
    isSearchBarAvailableForCurrentPlatform: false,
    compatibilityFlags: {
      enabled: false,
      isNativeStackSupported: false,
      isSearchBarSupported: false,
      useAnimatedDescriptors: false,
    },
  };

  const mocked = {};
  for (const name of componentExports) {
    mocked[name] = passthrough;
  }
  Object.assign(mocked, valueExports);

  return {
    __esModule: true,
    ...mocked,
  };
});

jest.mock('@shopify/flash-list', () => {
  const React = require('react');
  const { FlatList } = require('react-native');
  const FlashList = React.forwardRef((props, ref) => React.createElement(FlatList, { ...props, ref }));
  return { FlashList };
});

// SQLite adapter butuh JSI native; di Jest diganti LokiJS in-memory supaya
// singleton src/database bisa dipakai smoke test render tanpa device.
jest.mock('@nozbe/watermelondb/adapters/sqlite', () => {
  const { default: LokiJSAdapter } = require('@nozbe/watermelondb/adapters/lokijs');

  // LokiJSAdapter logging mengotori output Jest dan menjaga event loop hidup.
  require('@nozbe/watermelondb/utils/common/logger').default.silence();

  class TestSQLiteAdapter extends LokiJSAdapter {
    constructor(options) {
      super({
        ...options,
        useWebWorker: false,
        useIncrementalIndexedDB: false,
        extraLokiOptions: { autosave: false },
      });
    }
  }

  return {
    __esModule: true,
    default: TestSQLiteAdapter,
  };
});
