const { getDefaultConfig } = require('expo/metro-config')
const { withNativeWind } = require('nativewind/metro')

const config = getDefaultConfig(__dirname)

// Route .svg through react-native-svg-transformer so category icons import as components
// (see lib/categories/icons.ts) instead of as image assets. The default resolver treats .svg
// as an asset, so it has to move from assetExts to sourceExts for the transformer to see it.
config.transformer.babelTransformerPath = require.resolve('react-native-svg-transformer/expo')
config.resolver.assetExts = config.resolver.assetExts.filter((ext) => ext !== 'svg')
config.resolver.sourceExts = [...config.resolver.sourceExts, 'svg']

module.exports = withNativeWind(config, { input: './global.css' })
