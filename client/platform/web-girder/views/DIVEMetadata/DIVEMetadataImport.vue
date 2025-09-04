<script lang="ts">
import { defineComponent, ref } from 'vue';
import { useApi } from 'dive-common/apispec';
import { usePrompt } from 'dive-common/vue-utilities/prompt-service';
import { getResponseError } from 'vue-media-annotator/utils';
import { importMetadataFile } from 'platform/web-girder/api/divemetadata.service';

export default defineComponent({
  name: 'DIVEMetadataImport',
  props: {
    metadataRoot: {
      type: String,
      default: null,
    },
    blockOnUnsaved: {
      type: Boolean,
      default: false,
    },
    buttonOptions: {
      type: Object,
      default: () => ({}),
    },
    menuOptions: {
      type: Object,
      default: () => ({}),
    },
    readOnlyMode: {
      type: Boolean,
      default: false,
    },
  },
  emits: ['updated'],
  setup(props, { emit }) {
    const { openFromDisk } = useApi();
    const { prompt } = usePrompt();
    const processing = ref(false);
    const menuOpen = ref(false);
    const additive = ref(false);
    const additivePrepend = ref('');
    const openUpload = async () => {
      try {
        const ret = await openFromDisk('annotation');
        if (!ret.canceled) {
          menuOpen.value = false;
          const path = ret.filePaths[0];
          let importFile = false;
          processing.value = true;
          if (ret.fileList?.length) {
            importFile = await importMetadataFile(
              props.metadataRoot,
              path,
              ret.fileList[0],
            );
          } else {
            importFile = await importMetadataFile(
              props.metadataRoot,
              path,
              undefined,
            );
          }
          if (importFile) {
            processing.value = false;
            emit('updated');
          }
        }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (error: any) {
        const text = [getResponseError(error)];
        prompt({
          title: 'Import Failed',
          text,
          positiveButton: 'OK',
        });
        processing.value = false;
      }
    };
    return {
      openUpload,
      processing,
      menuOpen,
      additive,
      additivePrepend,

    };
  },
});
</script>

<template>
  <v-menu
    v-model="menuOpen"
    :close-on-content-click="false"
    :nudge-width="120"
    v-bind="menuOptions"
    max-width="280"
  >
    <template #activator="{ on: menuOn }">
      <v-tooltip bottom>
        <template #activator="{ on: tooltipOn }">
          <v-btn
            class="ma-0 mx-2"
            v-bind="buttonOptions"
            :disabled="processing"
            v-on="{ ...tooltipOn, ...menuOn }"
          >
            <div>
              <v-icon>
                {{ processing ? 'mdi-spin mdi-sync' : 'mdi-application-import' }}
              </v-icon>
              <span
                v-show=" buttonOptions.block"
                class="pl-1"
              >
                Import
              </span>
            </div>
          </v-btn>
        </template>
        <span>Import Metadata</span>
      </v-tooltip>
    </template>
    <template>
      <v-card
        outlined
      >
        <v-card-title>
          Import Formats
        </v-card-title>
        <v-card-text>
          Multiple Data types can be imported:
          <ul>
            <li> Metadata JSON </li>
            <li> Metadata NDJSON </li>
            <li> Metadata CSV </li>
          </ul>
          <p>The Import matching requires that either the key/column 'DIVEDataset' or 'Filename' is present.  If there are multiple 'Filename' matches in the DIVEMetadata it will then rely on the field 'DIVE_Path' to match the path.</p>
        </v-card-text>
        <v-container>
          <v-col>
            <v-row>
              <v-btn
                depressed
                block
                :disabled="processing"
                @click="openUpload"
              >
                Import
              </v-btn>
            </v-row>
          </v-col>
        </v-container>
      </v-card>
    </template>
  </v-menu>
</template>
