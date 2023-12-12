import Vue from 'vue';
import Girder, { RestClient } from '@girder/components/src';

Vue.use(Girder);
const girderRest = new RestClient({ apiRoot: 'api/v1', token: window.localStorage.getItem('girderToken') || undefined });

export function useGirderRest() {
  return girderRest;
}

export default girderRest;
