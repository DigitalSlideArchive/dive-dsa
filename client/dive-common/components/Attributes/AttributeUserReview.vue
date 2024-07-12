<script lang="ts">
import {
  defineComponent, ref, Ref, computed,
} from 'vue';

import StackedVirtualSidebarContainer from 'dive-common/components/StackedVirtualSidebarContainer.vue';
import { useAttributes, useCameraStore } from 'vue-media-annotator/provides';
import AttributeSubsection from 'dive-common/components/Attributes/AttributesSubsection.vue';

export default defineComponent({
  name: 'AttributeUserReview',

  components: {
    StackedVirtualSidebarContainer,
    AttributeSubsection,
  },

  props: {
    width: {
      type: Number,
      default: 300,
    },
  },

  setup() {
    const attributes = useAttributes();
    const attributesList = computed(() => attributes.value.filter((item) => item.user === true));
    const cameraStore = useCameraStore();
    const userListData = cameraStore.getUserAttributeList();
    const userList: Ref<string[]> = ref(Array.from(userListData));
    return {
      userList,
      attributesList,
      attributes,
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
        <v-row><h3> User Attribute Review</h3></v-row>
        <div
          v-for="user in userList"
          :key="`userAttributes_${user}`"
          class="mt-5"
        >
          <v-row class="mb-2">
            <h4>{{ user }}:</h4>
          </v-row>
          <attribute-subsection
            mode="Track"
            :user="user"
            :attributes="attributesList"
          />
          <attribute-subsection
            mode="Detection"
            :user="user"
            :attributes="attributesList"
          />
          <v-divider />
        </div>
      </v-container>
    </template>
  </StackedVirtualSidebarContainer>
</template>
