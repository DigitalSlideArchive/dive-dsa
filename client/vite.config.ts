/* eslint-disable import/no-extraneous-dependencies */
import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue2';
import { gitDescribeSync } from 'git-describe';
import path from 'path';
import packagejson from './package.json';

const rootDir = __dirname;

function getBase(mode: string, env: Record<string, string>) {
  if (mode !== 'production') {
    return './';
  }
  const configuredBase = env.VUE_APP_STATIC_PATH || '/static/dive/';
  if (configuredBase === './' || configuredBase === '') {
    return configuredBase;
  }
  if (/^https?:\/\//.test(configuredBase)) {
    return configuredBase.endsWith('/') ? configuredBase : `${configuredBase}/`;
  }
  const normalized = configuredBase.replace(/^\.\//, '/');
  const withLeadingSlash = normalized.startsWith('/') ? normalized : `/${normalized}`;
  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, rootDir, '');
  const appEnv = Object.fromEntries(
    Object.entries(env).filter(([key]) => key.startsWith('VUE_APP_')),
  );

  const processEnv = {
    NODE_ENV: mode === 'production' ? 'production' : 'development',
    VUE_APP_GIT_HASH: gitDescribeSync().hash,
    VUE_APP_VERSION: packagejson.version,
    ...appEnv,
  };

  return {
    plugins: [vue()],
    base: getBase(mode, env),
    resolve: {
      dedupe: ['axios', 'vue', 'vuetify'],
      alias: [
        { find: 'dive-common', replacement: path.resolve(rootDir, 'dive-common') },
        { find: 'vue-media-annotator', replacement: path.resolve(rootDir, 'src') },
        { find: 'src', replacement: path.resolve(rootDir, 'src') },
        { find: 'platform', replacement: path.resolve(rootDir, 'platform') },
        { find: /^vue$/, replacement: path.resolve(rootDir, 'node_modules/vue/dist/vue.runtime.esm.js') },
      ],
      preserveSymlinks: false,
    },
    define: {
      'process.env': JSON.stringify(processEnv),
    },
    css: {
      preprocessorOptions: {
        sass: {
          includePaths: [rootDir],
          quietDeps: true,
          silenceDeprecations: ['legacy-js-api', 'import', 'global-builtin', 'slash-div', 'if-function'],
        },
        scss: {
          includePaths: [rootDir],
          quietDeps: true,
          silenceDeprecations: ['legacy-js-api', 'import', 'global-builtin', 'slash-div', 'if-function'],
        },
      },
    },
    server: {
      host: '0.0.0.0',
      port: 8080,
      strictPort: true,
      proxy: {
        '/api': {
          target: 'http://localhost:8010',
          secure: false,
          ws: true,
        },
      },
    },
    build: {
      sourcemap: true,
    },
    optimizeDeps: {
      include: ['axios', 'qs', 'markdown-it', 'js-cookie'],
    },
  };
});
