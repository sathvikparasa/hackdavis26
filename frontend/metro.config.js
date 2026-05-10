const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

const { transformer, resolver } = config;

config.transformer = {
  ...transformer,
  babelTransformerPath: require.resolve('react-native-svg-transformer/expo'),
};
config.resolver = {
  ...resolver,
  assetExts: resolver.assetExts.filter((ext) => ext !== 'svg'),
  sourceExts: [...resolver.sourceExts, 'svg'],
  resolveRequest: (context, moduleName, platform) => {
    // Metro can't resolve relative requires inside reanimated's nested semver.
    // Re-route them to the correct absolute path manually.
    if (
      context.originModulePath.includes('react-native-reanimated/node_modules/semver') &&
      moduleName.startsWith('./')
    ) {
      const path = require('path')
      const absolutePath = path.resolve(path.dirname(context.originModulePath), moduleName)
      return { type: 'sourceFile', filePath: absolutePath + '.js' }
    }
    return context.resolveRequest(context, moduleName, platform)
  },
};

module.exports = config;
