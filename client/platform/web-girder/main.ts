import Vue from 'vue';
import VueGtag from 'vue-gtag';

import registerNotifications from 'vue-media-annotator/notificatonBus';
import promptService from 'dive-common/vue-utilities/prompt-service';
import vMousetrap from 'dive-common/vue-utilities/v-mousetrap';

import GirderSlicerUI from 'vue-girder-slicer-cli-ui';
import getVuetify from './plugins/vuetify';
import girderRest from './plugins/girder';
import App from './App.vue';
import router from './router';
import store from './store';
import 'vue-girder-slicer-cli-ui/dist/vue-girder-slicer-cli-ui.css';

Vue.config.productionTip = false;
Vue.use(vMousetrap);

if (
  process.env.NODE_ENV === 'production'
  && window.location.hostname !== 'localhost'
) {
  Vue.use(VueGtag, {
    config: { id: process.env.VUE_APP_GTAG },
  }, router);
}

Promise.all([
  store.dispatch('Brand/loadBrand'),
  store.dispatch('GirderConfig/loadDIVEGirderConfig'),
  store.dispatch('User/loadUser'),
]).then(() => {
  const vuetify = getVuetify(store.state.Brand.brandData?.vuetify);
  Vue.use(promptService(vuetify));
  Vue.use(GirderSlicerUI);
  new Vue({
    router,
    store,
    vuetify,
    provide: {
      store,
      girderRest,
      notificationBus: girderRest, // gwc.JobList expects this
      vuetify,
    },
    render: (h) => h(App),
  })
    .$mount('#app')
    .$promptAttach();

  /** Start notification stream if everything else succeeds */
  registerNotifications(girderRest).connect();
});
