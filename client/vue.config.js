const { gitDescribeSync } = require('git-describe');
const path = require('path');
const http = require('http');
const packagejson = require('./package.json');
const SentryPlugin = require('@sentry/webpack-plugin');

const keepAliveAgent = new http.Agent({ keepAlive: true });

process.env.VUE_APP_GIT_HASH = gitDescribeSync().hash;
process.env.VUE_APP_VERSION = packagejson.version;

function chainWebpack(config) {
  config.output.strictModuleExceptionHandling(true);
  config.resolve.symlinks(false);
  config.resolve.alias.set('dive-common', path.resolve(__dirname, 'dive-common'));
  config.resolve.alias.set('vue-media-annotator', path.resolve(__dirname, 'src'));
  config.resolve.alias.set('platform', path.resolve(__dirname, 'platform'));
  config.externals({
    /**
     * Specify vtkjs as external dependency on global context to
     * prevent it from being included in bundle (2MB savings)
     */
    'vtk.js': 'vtkjs',
  });
  if (process.env.SENTRY_AUTH_TOKEN) {
    config
      .plugin('SentryPlugin')
      .use(SentryPlugin, [{
        authToken: process.env.SENTRY_AUTH_TOKEN,
        include: './dist',
        org: 'kitware-data',
        project: 'viame-web-client',
        release: process.env.VUE_APP_GIT_HASH
      }]);
  }
}

module.exports = {
  devServer: {
    proxy: {
      '/api': {
        target: 'http://localhost:8010',
        secure: false,
        ws: true,
        agent: keepAliveAgent,
      },
    },
  },
  productionSourceMap: true,
  publicPath: process.env.VUE_APP_STATIC_PATH,
  chainWebpack,
  pluginOptions: {
  },
};
