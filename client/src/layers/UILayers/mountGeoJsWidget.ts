import Vue from 'vue';
import type { Vuetify } from 'vuetify';

export default function mountGeoJsWidget(
  element: HTMLElement,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  component: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  props: Record<string, any>,
  vuetify?: Vuetify,
) {
  return new Vue({
    vuetify,
    render: (h) => h(component, { props }),
  }).$mount(element);
}
