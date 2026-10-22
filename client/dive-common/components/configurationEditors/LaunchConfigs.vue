<script lang="ts">
import { defineComponent, ref } from 'vue';
import { cloneDeep } from 'lodash';
import { useConfiguration } from 'vue-media-annotator/provides';
import { LaunchConfig } from 'vue-media-annotator/ConfigurationManager';
import {
  DEFAULT_LAUNCH_COLOR,
  LaunchConfigRow,
  normalizeLaunchColor,
  normalizeLaunchConfigs,
} from 'vue-media-annotator/launchConfigs';
import { getFolder } from 'platform/web-girder/api/girder.service';
import { invalidateLaunchConfigs } from 'platform/web-girder/use/useLaunchConfigs';
import LaunchConfigsEditor from './LaunchConfigsEditor.vue';

export default defineComponent({
  name: 'LaunchConfigs',
  components: { LaunchConfigsEditor },
  props: {
    disabled: {
      type: Boolean,
      default: false,
    },
  },
  setup() {
    const { configuration, saveConfiguration, configurationId } = useConfiguration();
    const dialog = ref(false);
    const rows = ref<LaunchConfigRow[]>([]);
    const saving = ref(false);

    const launchEditor = () => {
      rows.value = cloneDeep(normalizeLaunchConfigs(configuration.value?.launchConfigs)).map(
        (r) => ({ ...r, color: normalizeLaunchColor(r.color) }),
      );
      dialog.value = true;
    };
    const addRow = () => {
      rows.value.push({
        id: `${Date.now()}${rows.value.length}`,
        label: '',
        configurationFolderId: '',
        color: DEFAULT_LAUNCH_COLOR,
        order: rows.value.length,
      });
    };
    const removeRow = (index: number) => rows.value.splice(index, 1);

    /** The target must be an accessible folder that has a stored configuration */
    const validateRow = async (row: LaunchConfigRow) => {
      let error = '';
      let folderName = '';
      if (!row.label.trim()) {
        error = 'Label is required';
      } else if (!row.configurationFolderId.trim()) {
        error = 'Folder id is required';
      } else {
        try {
          const folder = (await getFolder(row.configurationFolderId.trim())).data;
          if (!folder.meta?.configuration) {
            error = 'Folder has no configuration';
          }
          folderName = folder.name;
        } catch (err) {
          error = 'Folder not found or no access';
        }
      }
      const target = row;
      target.error = error;
      target.folderName = folderName;
      return !error;
    };

    const saveChanges = async () => {
      saving.value = true;
      const results = await Promise.all(rows.value.map(validateRow));
      if (results.every((r) => r)) {
        const launchConfigs: LaunchConfig[] = rows.value.map((r, order) => ({
          id: r.id,
          label: r.label.trim(),
          tooltip: r.tooltip || undefined,
          color: r.color || undefined,
          configurationFolderId: r.configurationFolderId.trim(),
          order,
        }));
        await saveConfiguration(configurationId.value, { launchConfigs });
        // Keep the in-memory configuration in sync so reopening the editor
        // (which reads from `configuration`) shows the saved values instead
        // of stale/deleted entries.
        configuration.value = { ...configuration.value, launchConfigs };
        invalidateLaunchConfigs();
        dialog.value = false;
      }
      saving.value = false;
    };

    return {
      dialog,
      rows,
      saving,
      launchEditor,
      addRow,
      removeRow,
      saveChanges,
      validateRow,
    };
  },
});
</script>

<template>
  <div class="ma-2">
    <v-btn
      :disabled="disabled"
      @click="launchEditor"
    >
      <span>Launch Configs<br></span>
      <v-icon class="ml-2">
        mdi-rocket-launch
      </v-icon>
    </v-btn>
    <v-dialog
      v-model="dialog"
      max-width="900"
    >
      <v-card>
        <v-card-title>
          Launch Configs
          <v-spacer />
          <v-btn
            icon
            small
            @click="dialog = false"
          >
            <v-icon small>
              mdi-close
            </v-icon>
          </v-btn>
        </v-card-title>
        <v-card-text>
          <LaunchConfigsEditor
            :rows="rows"
            description="Each entry adds a launch button that opens the viewer using the configuration of another folder (?configFolderId=). Empty list shows the default Launch Annotator button."
            @add="addRow"
            @remove="removeRow"
            @validate="validateRow"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn
            text
            depressed
            @click="dialog = false"
          >
            Cancel
          </v-btn>
          <v-btn
            color="primary"
            :loading="saving"
            @click="saveChanges"
          >
            Save
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>
