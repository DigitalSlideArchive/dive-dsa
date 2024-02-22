import Vue from 'vue';
import Girder, { RestClient } from '@girder/components/src';
//import cookies from 'js-cookie';

Vue.use(Girder);
//const token = cookies.get('girderToken');
const girderRest = new RestClient({ apiRoot: 'api/v1' });
export function useGirderRest() {
  return girderRest;
}

export default girderRest;
