<script lang="ts">
import {
  defineComponent, Ref, ref,
} from '@vue/composition-api';

import StackedVirtualSidebarContainer from 'dive-common/components/StackedVirtualSidebarContainer.vue';
import { getFolder } from 'platform/web-girder/api';
import { useStore } from 'platform/web-girder/store/types';

export default defineComponent({
  name: 'DatasetInfo',

  components: {
    StackedVirtualSidebarContainer,
  },

  props: {
    width: {
      type: Number,
      default: 300,
    },
  },

  setup() {
    const store = useStore();
    const datasetInfo: Ref<Record<string, any>> = ref({});
    const getMetadata = async () => {
      if (store.state.Dataset.meta) {
        const resp = await getFolder(store.state.Dataset.meta?.id);
        console.log(resp);
        if (resp.data) {
          datasetInfo.value = resp.data.meta.datasetInfo as Record<string, any>;
        }
      }
    };
    getMetadata();
    return {
      datasetInfo,
    };
  },
});
</script>


<template>
  <StackedVirtualSidebarContainer
    :width="width"
    :enable-slot="false"
  >
    <template #default>
      <v-container>
        <v-simple-table dark>
          <template v-slot:default>
            <thead>
              <tr>
                <th class="text-left">
                  Name
                </th>
                <th class="text-left">
                  Value
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(value, name) in datasetInfo"
                :key="`datasetInfo_${name}`"
              >
                <td>{{ name }}</td>
                <td>{{ value }}</td>
              </tr>
            </tbody>
          </template>
        </v-simple-table>
      </v-container>
    </template>
  </StackedVirtualSidebarContainer>
</template>
