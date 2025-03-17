// vite.config.js
import { defineConfig } from "file:///home/local/KHQ/bryon.lewis/dev/dive-dsa-slicer/vue-girder-slicer-ui/node_modules/vite/dist/node/index.js";
import { resolve } from "path";
import dts from "file:///home/local/KHQ/bryon.lewis/dev/dive-dsa-slicer/vue-girder-slicer-ui/node_modules/vite-plugin-dts/dist/index.mjs";
import * as path from "path";
import createVuePlugin from "file:///home/local/KHQ/bryon.lewis/dev/dive-dsa-slicer/vue-girder-slicer-ui/node_modules/@vitejs/plugin-vue2/dist/index.mjs";
var __vite_injected_original_dirname = "/home/local/KHQ/bryon.lewis/dev/dive-dsa-slicer/vue-girder-slicer-ui";
var vite_config_default = defineConfig(() => {
  return {
    build: {
      lib: {
        // Could also be a dictionary or array of multiple entry points
        entry: resolve(__vite_injected_original_dirname, "src/index.ts"),
        name: "VueGirderSlicerCLIUI",
        // the proper extensions will be added
        fileName: "vue-girder-slicer-cli-ui"
      },
      rollupOptions: {
        // make sure to externalize deps that shouldn't be bundled
        // into your library
        external: ["vue"],
        output: {}
      }
    },
    plugins: [dts(), createVuePlugin()],
    resolve: {
      alias: {
        "@": path.resolve(__vite_injected_original_dirname, "src")
      }
    },
    server: {
      host: "0.0.0.0",
      port: 8080,
      proxy: {
        "/api": {
          target: "http://localhost:8010",
          xfwd: true
        }
      },
      strictPort: true
    }
  };
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvaG9tZS9sb2NhbC9LSFEvYnJ5b24ubGV3aXMvZGV2L2RpdmUtZHNhLXNsaWNlci92dWUtZ2lyZGVyLXNsaWNlci11aVwiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiL2hvbWUvbG9jYWwvS0hRL2JyeW9uLmxld2lzL2Rldi9kaXZlLWRzYS1zbGljZXIvdnVlLWdpcmRlci1zbGljZXItdWkvdml0ZS5jb25maWcuanNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL2hvbWUvbG9jYWwvS0hRL2JyeW9uLmxld2lzL2Rldi9kaXZlLWRzYS1zbGljZXIvdnVlLWdpcmRlci1zbGljZXItdWkvdml0ZS5jb25maWcuanNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tICd2aXRlJ1xuaW1wb3J0IHsgcmVzb2x2ZSB9IGZyb20gJ3BhdGgnXG5pbXBvcnQgZHRzIGZyb20gJ3ZpdGUtcGx1Z2luLWR0cydcbmltcG9ydCAqIGFzIHBhdGggZnJvbSBcInBhdGhcIjtcbmltcG9ydCBjcmVhdGVWdWVQbHVnaW4gZnJvbSAnQHZpdGVqcy9wbHVnaW4tdnVlMidcblxuLy8gaHR0cHM6Ly92aXRlanMuZGV2L2NvbmZpZy9cbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbmZpZygoKSA9PntcbiAgcmV0dXJuIHtcbiAgICBidWlsZDoge1xuICAgICAgbGliOiB7XG4gICAgICAgIC8vIENvdWxkIGFsc28gYmUgYSBkaWN0aW9uYXJ5IG9yIGFycmF5IG9mIG11bHRpcGxlIGVudHJ5IHBvaW50c1xuICAgICAgICBlbnRyeTogcmVzb2x2ZShfX2Rpcm5hbWUsICdzcmMvaW5kZXgudHMnKSxcbiAgICAgICAgbmFtZTogJ1Z1ZUdpcmRlclNsaWNlckNMSVVJJyxcbiAgICAgICAgLy8gdGhlIHByb3BlciBleHRlbnNpb25zIHdpbGwgYmUgYWRkZWRcbiAgICAgICAgZmlsZU5hbWU6ICd2dWUtZ2lyZGVyLXNsaWNlci1jbGktdWknLFxuICAgICAgfSxcbiAgICAgIHJvbGx1cE9wdGlvbnM6IHtcbiAgICAgICAgLy8gbWFrZSBzdXJlIHRvIGV4dGVybmFsaXplIGRlcHMgdGhhdCBzaG91bGRuJ3QgYmUgYnVuZGxlZFxuICAgICAgICAvLyBpbnRvIHlvdXIgbGlicmFyeVxuICAgICAgICBleHRlcm5hbDogWyd2dWUnXSxcbiAgICAgICAgb3V0cHV0OiB7XG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgIH0sXG4gICAgcGx1Z2luczogW2R0cygpLCBjcmVhdGVWdWVQbHVnaW4oKV0sXG4gICAgcmVzb2x2ZToge1xuICAgICAgYWxpYXM6IHtcbiAgICAgICAgXCJAXCI6IHBhdGgucmVzb2x2ZShfX2Rpcm5hbWUsIFwic3JjXCIpXG4gICAgICB9XG4gICAgfSxcbiAgICBzZXJ2ZXI6IHtcbiAgICAgIGhvc3Q6IFwiMC4wLjAuMFwiLFxuICAgICAgcG9ydDogODA4MCxcbiAgICAgIHByb3h5OiB7XG4gICAgICAgIFwiL2FwaVwiOiB7XG4gICAgICAgICAgdGFyZ2V0OiBcImh0dHA6Ly9sb2NhbGhvc3Q6ODAxMFwiLFxuICAgICAgICAgIHhmd2Q6IHRydWUsXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICAgc3RyaWN0UG9ydDogdHJ1ZSxcbiAgICB9LFxuICB9O1xufSlcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBOFgsU0FBUyxvQkFBb0I7QUFDM1osU0FBUyxlQUFlO0FBQ3hCLE9BQU8sU0FBUztBQUNoQixZQUFZLFVBQVU7QUFDdEIsT0FBTyxxQkFBcUI7QUFKNUIsSUFBTSxtQ0FBbUM7QUFPekMsSUFBTyxzQkFBUSxhQUFhLE1BQUs7QUFDL0IsU0FBTztBQUFBLElBQ0wsT0FBTztBQUFBLE1BQ0wsS0FBSztBQUFBO0FBQUEsUUFFSCxPQUFPLFFBQVEsa0NBQVcsY0FBYztBQUFBLFFBQ3hDLE1BQU07QUFBQTtBQUFBLFFBRU4sVUFBVTtBQUFBLE1BQ1o7QUFBQSxNQUNBLGVBQWU7QUFBQTtBQUFBO0FBQUEsUUFHYixVQUFVLENBQUMsS0FBSztBQUFBLFFBQ2hCLFFBQVEsQ0FDUjtBQUFBLE1BQ0Y7QUFBQSxJQUNGO0FBQUEsSUFDQSxTQUFTLENBQUMsSUFBSSxHQUFHLGdCQUFnQixDQUFDO0FBQUEsSUFDbEMsU0FBUztBQUFBLE1BQ1AsT0FBTztBQUFBLFFBQ0wsS0FBVSxhQUFRLGtDQUFXLEtBQUs7QUFBQSxNQUNwQztBQUFBLElBQ0Y7QUFBQSxJQUNBLFFBQVE7QUFBQSxNQUNOLE1BQU07QUFBQSxNQUNOLE1BQU07QUFBQSxNQUNOLE9BQU87QUFBQSxRQUNMLFFBQVE7QUFBQSxVQUNOLFFBQVE7QUFBQSxVQUNSLE1BQU07QUFBQSxRQUNSO0FBQUEsTUFDRjtBQUFBLE1BQ0EsWUFBWTtBQUFBLElBQ2Q7QUFBQSxFQUNGO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
