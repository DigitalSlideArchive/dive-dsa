import { defineConfig } from 'vite'
import { resolve } from 'path'
import dts from 'vite-plugin-dts'
import * as path from "path";
import createVuePlugin from '@vitejs/plugin-vue2'

// https://vitejs.dev/config/
export default defineConfig(() =>{
  return {
    build: {
      lib: {
        // Could also be a dictionary or array of multiple entry points
        entry: resolve(__dirname, 'src/index.ts'),
        name: 'VueGirderSlicerCLIUI',
        // the proper extensions will be added
        fileName: 'vue-girder-slicer-cli-ui',
      },
      rollupOptions: {
        // make sure to externalize deps that shouldn't be bundled
        // into your library
        external: ['vue'],
        output: {
        },
      },
    },
    plugins: [dts(), createVuePlugin()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src")
      }
    },
    server: {
      host: "0.0.0.0",
      port: 3000,
      proxy: {
        "/api": {
          target: "http://localhost:8010",
          xfwd: true,
        },
      },
      strictPort: true,
    },
  };
})
