<script lang="ts">
import { DIVEMetadataFilter, exportDiveMetadata } from 'platform/web-girder/api/divemetadata.service';
import {
  defineComponent,
  PropType,
  ref,
  Ref,
} from 'vue';

export default defineComponent({
  name: 'DIVEMetadataExport',
  components: {
  },
  props: {
    metadataRoot: {
      type: String,
      required: true,
    },
    filters: {
      type: Object as PropType<DIVEMetadataFilter>,
      default: {},
    },
  },
  setup(props) {
    const processing = ref(false);
    const format: Ref<'json' | 'csv'> = ref('json');
    const exportMetadata = async () => {
      processing.value = true;
      await exportDiveMetadata(props.metadataRoot, props.filters, format.value);
      processing.value = false;
    };
    return {
      processing,
      format,
      exportMetadata,
    };
  },
});
</script>

<template>
  <div>
    <v-menu
      offset-y
      offset-x
      nudge-left="90"
      open-on-hover
      open-delay="250"
      close-delay="500"
    >
      <template #activator="{ on, attrs }">
        <v-btn
          v-bind="attrs"
          v-on="on"

          @click="exportMetadata"
        >
          <v-icon>mdi-export</v-icon>
          <span style="font-size: 0.75em">
            {{ format }}
          </span>
        </v-btn>
      </template>
      <v-card outlined>
        <v-card-title>Export Format</v-card-title>
        <v-list dense>
          <v-list-item
            @click="format = 'json'"
          >
            <v-list-item-content>
              <v-list-item-title>JSON</v-list-item-title>
            </v-list-item-content>
          </v-list-item>
          <v-list-item
            @click="format = 'csv'"
          >
            <v-list-item-content>
              <v-list-item-title>CSV</v-list-item-title>
            </v-list-item-content>
          </v-list-item>
        </v-list>
      </v-card>
    </v-menu>
  </div>
</template>

<style scoped>
</style>
