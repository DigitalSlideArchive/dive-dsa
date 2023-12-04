import { defineConfig } from 'vite';
import { createVuePlugin as vue } from 'vite-plugin-vue2';
import path from 'path';
import { VuetifyResolver } from 'unplugin-vue-components/resolvers';
import Components from 'unplugin-vue-components/vite';
import { gitDescribeSync } from 'git-describe';
import packagejson from './package.json';

process.env.VUE_APP_GIT_HASH = gitDescribeSync().hash;
process.env.VUE_APP_VERSION = packagejson.version;
const staticPath = process.env.NODE_ENV === 'production' ? process.env.VUE_APP_STATIC_PATH || './static/dive' : './';

export default defineConfig({
  base: './',
  optimizeDeps: { include: ['axios', 'qs', 'markdown-it', 'js-cookie'] },
  plugins: [
    vue(),
    Components({
      resolvers: [
        // Vuetify
        VuetifyResolver(),
      ],
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './platform'),
      'vue-media-annotator': path.resolve(__dirname, './src'),
      'dive-common': path.resolve(__dirname, './dive-common'),
      platform: path.resolve(__dirname, './platform'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 8080,
    proxy: {
      '/api': {
        target: 'http://localhost:8010',
        xfwd: true,
      },
    },
    publicPath: staticPath,
    strictPort: true,
  },
});
