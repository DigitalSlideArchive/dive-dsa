import Vue from 'vue';
import getVuetify from './plugins/vuetify';

import registerNotifications from 'vue-media-annotator/notificatonBus';
import promptService from 'dive-common/vue-utilities/prompt-service';
import vMousetrap from 'dive-common/vue-utilities/v-mousetrap';

import girderRest from './plugins/girder';
import App from './App.vue';
import router from './router';
import store from './store';
import GirderSlicerUI  from '@bryonlewis/vue-girder-slicer-cli-ui';

Vue.config.productionTip = false;
Vue.use(vMousetrap);
Vue.use(GirderSlicerUI);

Promise.all([
  store.dispatch('Brand/loadBrand'),
  store.dispatch('User/loadUser'),
]).then(() => {
  const vuetify = getVuetify(store.state.Brand.brandData?.vuetify);
  Vue.use(promptService(vuetify));
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
