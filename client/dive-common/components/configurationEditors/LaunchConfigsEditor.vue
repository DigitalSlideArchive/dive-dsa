<script lang="ts">
import { defineComponent, PropType } from 'vue';
import { LaunchConfigRow } from 'vue-media-annotator/launchConfigs';

export default defineComponent({
  name: 'LaunchConfigsEditor',
  props: {
    rows: {
      type: Array as PropType<LaunchConfigRow[]>,
      required: true,
    },
    description: {
      type: String,
      default: '',
    },
  },
  setup(_props, { emit }) {
    const addRow = () => emit('add');
    const removeRow = (index: number) => emit('remove', index);
    const validateRow = (row: LaunchConfigRow) => emit('validate', row);
    return { addRow, removeRow, validateRow };
  },
});
</script>

<template>
  <div>
    <div
      v-if="description"
      class="mb-3"
    >
      {{ description }}
    </div>
    <v-simple-table dense class="launch-configs-table">
      <thead>
        <tr>
          <th class="text-left">
            Label
          </th>
          <th class="text-left">
            Config folder id
          </th>
          <th class="text-left">
            Color
          </th>
          <th class="text-left">
            Tooltip
          </th>
          <th style="width: 48px" />
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="(row, index) in rows"
          :key="row.id"
        >
          <td class="align-top py-2">
            <v-text-field
              v-model="row.label"
              dense
              hide-details
              placeholder="Label"
              class="mt-0 pt-0"
            />
          </td>
          <td class="align-top py-2 folder-id-cell">
            <v-text-field
              v-model="row.configurationFolderId"
              dense
              hide-details
              placeholder="Folder id"
              :error="!!row.error"
              class="mt-0 pt-0"
              @blur="validateRow(row)"
            />
            <div
              v-if="row.error || row.folderName"
              class="caption mt-1"
              :class="row.error ? 'error--text' : 'text--secondary'"
            >
              {{ row.error || row.folderName }}
            </div>
          </td>
          <td class="align-top py-2">
            <div class="d-flex align-center">
              <v-menu
                :close-on-content-click="false"
                offset-y
                left
              >
                <template #activator="{ on, attrs }">
                  <v-btn
                    v-bind="attrs"
                    icon
                    small
                    class="mr-1"
                    v-on="on"
                  >
                    <span
                      class="color-swatch"
                      :style="{ backgroundColor: row.color || '#1976D2' }"
                    />
                  </v-btn>
                </template>
                <v-card>
                  <v-color-picker
                    v-model="row.color"
                    mode="hexa"
                    hide-mode-switch
                  />
                </v-card>
              </v-menu>
              <v-text-field
                v-model="row.color"
                dense
                hide-details
                placeholder="#1976D2"
                class="mt-0 pt-0 hex-field"
              />
            </div>
          </td>
          <td class="align-top py-2">
            <v-text-field
              v-model="row.tooltip"
              dense
              hide-details
              placeholder="Optional"
              class="mt-0 pt-0"
            />
          </td>
          <td class="align-top py-2 text-center">
            <v-btn
              icon
              small
              @click="removeRow(index)"
            >
              <v-icon small>
                mdi-delete
              </v-icon>
            </v-btn>
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td
            colspan="5"
            class="text--secondary text-center py-4"
          >
            No launch configs — default Launch Annotator button will be shown.
          </td>
        </tr>
      </tbody>
    </v-simple-table>
    <v-btn
      small
      class="mt-3"
      @click="addRow"
    >
      <v-icon
        small
        left
      >
        mdi-plus
      </v-icon>
      Add
    </v-btn>
  </div>
</template>

<style scoped>
.launch-configs-table td.align-top {
  vertical-align: top;
}
.folder-id-cell {
  min-width: 180px;
}
.color-swatch {
  display: inline-block;
  width: 22px;
  height: 22px;
  border-radius: 4px;
  border: 1px solid rgba(0, 0, 0, 0.25);
}
.hex-field {
  max-width: 110px;
}
</style>
