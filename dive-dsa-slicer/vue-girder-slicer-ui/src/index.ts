
import GirderSlicerTaskButton from "./components/GirderSlicerTaskButton.tw.vue";
import GirderSlicerTaskCard from "./components/GirderSlicerTaskCard.tw.vue";
import GirderDataBrowser from "./components/FileBrowser/DataBrowser.tw.vue";
import GirderRootSelection from "./components/FileBrowser/RootSelection.tw.vue";
import GirderSlicerTasksIntegrated from "./components/GirderSlicerTasksIntegrated.tw.vue";
// Consumers import styles separately:
//   import 'vue-girder-slicer-cli-ui/dist/vue-girder-slicer-cli-ui.css'
// Standalone demo loads ./tailwind.css from main.js. Keeping CSS out of the
// JS entry avoids shipping uncompiled Tailwind v4 into host apps' PostCSS.
export default{
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    install(app: any) {
        app.component('GirderSlicerTaskButton', GirderSlicerTaskButton);
        app.component('GirderSlicerTaskCard', GirderSlicerTaskCard);
        app.component('GirderSlicerDataBrowser', GirderDataBrowser);
        app.component('GirderSlicerRootSelection', GirderRootSelection);
        app.component('GirderSlicerTasksIntegrated', GirderSlicerTasksIntegrated);
    }
}
export  {
    GirderSlicerTaskButton,
    GirderSlicerTaskCard,
    GirderDataBrowser,
    GirderRootSelection,
    GirderSlicerTasksIntegrated,
};