import Vue from 'vue';
import Girder, { RestClient } from '@girder/components/src';
import cookies from 'js-cookie';

Vue.use(Girder);
const girderRest = new RestClient({ apiRoot: 'api/v1', token: window.localStorage.getItem('girderToken') || cookies.get('girderToken') });

export function useGirderRest() {
  return girderRest;
}

export default girderRest;
