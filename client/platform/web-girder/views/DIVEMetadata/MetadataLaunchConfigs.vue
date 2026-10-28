<script lang="ts">
import { defineComponent, ref } from 'vue';
import { cloneDeep } from 'lodash';
import { LaunchConfig } from 'vue-media-annotator/ConfigurationManager';
import {
  DEFAULT_LAUNCH_COLOR,
  LaunchConfigRow,
  normalizeLaunchColor,
  normalizeLaunchConfigs,
} from 'vue-media-annotator/launchConfigs';
import { getFolder } from 'platform/web-girder/api/girder.service';
import { saveConfiguration } from 'platform/web-girder/api/dataset.service';
import { invalidateLaunchConfigs } from 'platform/web-girder/use/useLaunchConfigs';
import LaunchConfigsEditor from 'dive-common/components/configurationEditors/LaunchConfigsEditor.vue';

export default defineComponent({
  name: 'MetadataLaunchConfigs',
  components: { LaunchConfigsEditor },
  props: {
    folderId: {
      type: String,
      required: true,
    },
  },
  setup(props, { emit }) {
    const dialog = ref(false);
    const rows = ref<LaunchConfigRow[]>([]);
    const saving = ref(false);
    const loading = ref(false);

    const launchEditor = async () => {
      loading.value = true;
      dialog.value = true;
      try {
        const folder = (await getFolder(props.folderId)).data;
        rows.value = cloneDeep(
          normalizeLaunchConfigs(folder.meta?.configuration?.launchConfigs),
        ).map((r) => ({ ...r, color: normalizeLaunchColor(r.color) }));
      } catch (err) {
        rows.value = [];
      }
      loading.value = false;
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
        // Merge into this folder's own configuration so other fields are preserved
        const folder = (await getFolder(props.folderId)).data;
        const existing = { ...(folder.meta?.configuration || {}) };
        await saveConfiguration(props.folderId, { ...existing, launchConfigs });
        invalidateLaunchConfigs(props.folderId);
        dialog.value = false;
        emit('updated');
      }
      saving.value = false;
    };

    return {
      dialog,
      rows,
      saving,
      loading,
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
  <span>
    <v-tooltip bottom open-delay="400">
      <template #activator="{ on }">
        <v-btn
          class="ma-1 pa-0"
          outlined
          color="primary"
          text
          x-small
          v-on="on"
          @click="launchEditor"
        >
          <v-icon
            left
            class="mx-1"
          >
            mdi-cog
          </v-icon>
          Launch Configs
        </v-btn>
      </template>
      <span>Configure launch buttons for all datasets in this metadata view</span>
    </v-tooltip>
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
          <div
            v-if="loading"
            class="mb-2"
          >
            Loading…
          </div>
          <LaunchConfigsEditor
            v-else
            :rows="rows"
            description="Each entry adds a launch button on every row that opens the viewer using the configuration of another folder (?configFolderId=). These settings are stored on this metadata folder only. Empty list shows the default Launch Annotator button."
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
            :disabled="loading"
            @click="saveChanges"
          >
            Save
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </span>
</template>
