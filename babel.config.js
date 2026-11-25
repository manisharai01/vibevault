module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      [
        'babel-preset-expo',
        {
          // zustand's ESM build (resolved for web) references `import.meta.env`.
          // Web bundles are loaded as classic scripts, where `import.meta` is a
          // syntax error, so polyfill it on every platform.
          unstable_transformImportMeta: true,
        },
      ],
    ],
  };
};
