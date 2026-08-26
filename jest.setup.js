// react-native-screens membutuhkan native module; stub komponen passthrough
// supaya smoke test render navigator jalan di Jest.
jest.mock('react-native-screens', () => {
  const React = require('react');
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
