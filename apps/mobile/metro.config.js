const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// markdown-it (via react-native-markdown-display) requires the Node core
// module "punycode", which Metro can't resolve on native. Map it to the
// userland "punycode" package (declared in package.json dependencies).
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules ?? {}),
  punycode: require.resolve("punycode/"),
};

module.exports = config;
