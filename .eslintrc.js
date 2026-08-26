module.exports = {
  root: true,
  extends: '@react-native',
  overrides: [
    {
      files: ['jest.setup.js'],
      globals: {
        jest: 'readonly',
      },
    },
  ],
};
