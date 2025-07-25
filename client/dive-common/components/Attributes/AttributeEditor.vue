<script lang="ts">
import {
  computed, defineComponent, PropType, Ref, ref, watch,
} from 'vue';
import {
  Attribute, AttributeShortcut, NumericAttributeEditorOptions, StringAttributeEditorOptions,
} from 'vue-media-annotator/use/AttributeTypes';
import { usePrompt } from 'dive-common/vue-utilities/prompt-service';
import { useTrackStyleManager } from 'vue-media-annotator/provides';
import AttributeShortcuts from './AttributeShortcuts.vue';
import AttributeRendering from './AttributeRendering.vue';
import AttributeValueColors from './AttributeValueColors.vue';
import AttributeNumberValueColors from './AttributeNumberColors.vue';

export default defineComponent({
  name: 'AttributeSettings',
  components: {
    AttributeShortcuts,
    AttributeRendering,
    AttributeValueColors,
    AttributeNumberValueColors,
  },
  props: {
    selectedAttribute: {
      type: Object as PropType<Attribute>,
      required: true,
    },
    error: {
      type: String,
      default: '',
    },
  },
  setup(props, { emit }) {
    const { prompt } = usePrompt();
    const trackStyleManager = useTrackStyleManager();
    const name: Ref<string> = ref(props.selectedAttribute.name);
    const displayText: Ref<string> = ref(props.selectedAttribute.displayText || '');
    const description: Ref<string> = ref(props.selectedAttribute.description || '');
    const belongs: Ref<Attribute['belongs']> = ref(props.selectedAttribute.belongs);
    const datatype: Ref<Attribute['datatype']> = ref(props.selectedAttribute.datatype);
    const attributeColors:
      Ref<Record<string, string> | undefined> = ref(props.selectedAttribute.valueColors);
    let valueOrder: Record<string, number> | undefined;
    const colorKey = ref(props.selectedAttribute.colorKey || false);
    const staticColor = ref(props.selectedAttribute.staticColor || false);
    const noneColor = ref(props.selectedAttribute.noneColor ?? false);
    const colorKeySettings = ref(props.selectedAttribute.colorKeySettings || undefined);
    const user: Ref<boolean | undefined> = ref(props.selectedAttribute.user);
    const color: Ref<string | undefined> = ref(props.selectedAttribute.color);
    const tempColor = ref(trackStyleManager.typeStyling.value.color(name.value));
    const areSettingsValid = ref(false);
    const currentTab = ref('Main');
    const editor: Ref<
      undefined | StringAttributeEditorOptions | NumericAttributeEditorOptions
    > = ref(props.selectedAttribute.editor);
    let values: string[] = props.selectedAttribute.values ? props.selectedAttribute.values : [];
    let addNew = !props.selectedAttribute.key.length;
    const shortcuts: Ref<AttributeShortcut[]> = ref(props.selectedAttribute.shortcuts || []);
    const form: Ref<HTMLFormElement | null> = ref(null);
    const colorEditor = ref(false);
    const textValues = computed({
      get: () => {
        if (values) {
          return values.join('\n');
        }
        return '';
      },
      set: (newval) => {
        values = newval.split('\n');
      },

    });
    const lockedValues = ref(!!props.selectedAttribute.lockedValues);
    const attributeRendering = ref(!!props.selectedAttribute.render);
    const renderingVals = ref(props.selectedAttribute.render);

    function setDefaultValue() {
      name.value = '';
      description.value = '';
      displayText.value = '';
      belongs.value = 'track';
      datatype.value = 'number';
      values = [];
    }
    function add() {
      setDefaultValue();
      addNew = true;
      if (form.value) {
        form.value.resetValidation();
      }
    }

    async function submit(close = true) {
      if (form.value && !form.value.validate()) {
        return;
      }

      const data: Attribute = {
        name: name.value,
        description: description.value || undefined,
        displayText: displayText.value || undefined,
        belongs: belongs.value,
        datatype: datatype.value,
        values: datatype.value === 'text' && values ? values : [],
        valueColors: attributeColors.value,
        key: `${belongs.value}_${name.value}`,
        editor: editor.value,
        color: color.value ? color.value : tempColor.value,
        shortcuts: shortcuts.value,
        user: user.value ? true : undefined,
        render: renderingVals.value,
        lockedValues: lockedValues.value,
      };
      if (valueOrder) {
        data.valueOrder = valueOrder;
      }
      if (colorKey.value) {
        data.colorKey = true;
      }
      if (staticColor.value) {
        data.staticColor = true;
      }
      data.noneColor = noneColor.value;
      if (colorKeySettings.value) {
        data.colorKeySettings = colorKeySettings.value;
      }
      if (addNew) {
        emit('save', { data, close });
        addNew = false;
      } else {
        emit('save', { data, oldAttribute: props.selectedAttribute, close });
      }
      valueOrder = undefined;
    }

    async function deleteAttribute() {
      const result = await prompt({
        title: 'Confirm',
        text: 'Do you want to delete this attribute?',
        confirm: true,
      });
      if (!result) {
        return;
      }
      emit('delete', props.selectedAttribute);
    }
    const typeChange = (type: 'number' | 'text' | 'boolean') => {
      if (type === 'number') {
        editor.value = {
          type: 'combo',
        };
      } else if (type === 'text') {
        editor.value = {
          type: 'freeform',
        };
      }
      datatype.value = type;
    };
    const numericChange = (type: 'combo' | 'slider') => {
      if (type === 'combo') {
        editor.value = {
          type: 'combo',
        };
      } else if (type === 'slider') {
        editor.value = {
          type: 'slider',
          range: [0, 1],
          steps: 0.1,
        };
      }
    };

    watch(name, () => {
      if (!color.value) {
        tempColor.value = trackStyleManager.typeStyling.value.color(name.value);
      }
    });

    const launchColorEditor = () => {
      if (!color.value) {
        color.value = tempColor.value;
      }
      colorEditor.value = true;
    };

    watch(renderingVals, () => {
      submit(false);
    });

    watch(attributeRendering, () => {
      if (renderingVals.value === undefined) {
        renderingVals.value = {
          typeFilter: ['all'],
          displayName: props.selectedAttribute.name,
          displayColor: 'auto',
          displayTextSize: 32,
          valueColor: 'auto',
          valueTextSize: 32,
          order: 0,
          location: 'outside',
          layout: 'vertical',
          box: false,
          boxColor: 'auto',
          boxThickness: 1,
          displayWidth: {
            type: '%',
            val: 10,
          },
          displayHeight: {
            type: 'auto',
            val: 10,
          },
        };
      }
      if (!attributeRendering.value) {
        renderingVals.value = undefined;
      }
    });

    const saveAttributeValueColors = (data:
       {
        colorValues: Record<string, string>;
        colorKey?: boolean;
        staticColor?: boolean;
        noneColor?: false | string;
        valueOrder?: Record<string, number>;
        colorKeySettings?: Attribute['colorKeySettings'];
      }) => {
      attributeColors.value = data.colorValues;
      colorKey.value = !!data.colorKey;
      staticColor.value = !!data.staticColor;
      noneColor.value = data.noneColor ?? false;
      colorKeySettings.value = data.colorKeySettings;
      if (data.valueOrder) {
        valueOrder = data.valueOrder;
      }
      if (valueOrder && Object.entries(valueOrder).length === 0) {
        valueOrder = undefined;
      }
    };
    return {
      name,
      description,
      displayText,
      belongs,
      color,
      colorEditor,
      datatype,
      values,
      addNew,
      editor,
      areSettingsValid,
      tempColor,
      attributeRendering,
      renderingVals,
      currentTab,
      attributeColors,
      lockedValues,
      //computed
      textValues,
      shortcuts,
      user,
      //functions
      add,
      submit,
      deleteAttribute,
      typeChange,
      numericChange,
      launchColorEditor,
      saveAttributeValueColors,
    };
  },
});
</script>

<template>
  <v-card class="attribute-settings">
    <v-card-title class="pb-0">
      Attributes
      <v-card-text>
        <v-card-title class="text-h6">
          <v-tabs v-model="currentTab">
            <v-tab> Main </v-tab>
            <v-tab> Shortcuts </v-tab>
            <v-tab> Rendering </v-tab>
            <v-tab v-if="datatype === 'text' || datatype === 'number'">
              Value Colors
            </v-tab>
          </v-tabs>
        </v-card-title>

        <v-tabs-items v-model="currentTab">
          <v-tab-item>
            <v-alert
              v-if="error || !addNew"
              :type="error ? 'error' : 'info'"
            >
              <div style="word-break: break-word;">
                {{
                  error ? error
                  : 'Changes to Attribute Datatypes or Names do not effect \
               currently set attributes on tracks.'
                }}
              </div>
            </v-alert>
            <v-form
              ref="form"
              v-model="areSettingsValid"
            >
              <v-text-field
                v-model="name"
                label="Name"
                :rules="[v => !!v || 'Name is required', v => !v.includes(' ')
                  || 'No spaces', v => v !== 'userAttributes' || 'Reserved Name']"
                required
              />
              <v-text-field
                v-model="displayText"
                label="Display Text"
              />
              <v-text-field
                v-model="description"
                label="Description"
              />
              <v-select
                :value="datatype"
                :items="[
                  { text: 'Boolean', value: 'boolean' },
                  { text: 'Number', value: 'number' },
                  { text: 'Text', value: 'text' },
                ]"
                label="Datatype"
                @change="typeChange"
              />
              <div v-if="datatype === 'number'">
                <v-radio-group
                  :value="(editor && editor.type) || 'combo'"
                  row
                  label="Display Type:"
                  @change="numericChange"
                >
                  <v-radio
                    label="Input Box"
                    value="combo"
                  />
                  <v-radio
                    label="Slider"
                    value="slider"
                  />
                </v-radio-group>
              </div>
              <v-row dense>
                <v-checkbox
                  v-model="user"
                  label="User Attribute"
                  hint="Attribute data is saved per user instead of globally."
                  persistent-hint
                  class="py-2 mx-2"
                />
                <v-spacer />
                <v-checkbox
                  v-if="textValues.length && datatype === 'text'"
                  v-model="lockedValues"
                  label="Lock Values"
                  hint="Lock Values to only predefined Values"
                  persistent-hint
                  class="py-2 mx-2"
                />
              </v-row>
              <div v-if="datatype === 'number' && editor && editor.type === 'slider'">
                <v-row class="pt-2">
                  <v-text-field
                    v-model.number="editor.range[0]"
                    dense
                    outlined
                    :step="editor.range[0] > 1 ? 1 : 0.01"
                    type="number"
                    label="Min"
                    :rules="[
                      v => !isNaN(parseFloat(v)) || 'Number is required',
                      v => v < editor.range[1] || 'Min needs to be smaller than the Max']"
                    :max="editor.range[1]"
                    hint="Min limit for slider"
                    persistent-hint
                  />
                  <v-text-field
                    v-model.number="editor.range[1]"
                    dense
                    outlined
                    :step="editor.range[1] > 1 ? 1 : 0.01"
                    type="number"
                    label="Max"
                    :rules="[
                      v => !isNaN(parseFloat(v)) || 'Number is required',
                      v => v > editor.range[0] || 'Max needs to be larger than the Min']"
                    :min="editor.range[0]"
                    hint="Max limit for slider"
                    persistent-hint
                  />
                </v-row>
                <v-row class="pt-2">
                  <v-text-field
                    v-model.number="editor.steps"
                    dense
                    outlined
                    :step="editor.steps > 1 ? 1 : 0.01"
                    type="number"
                    :rules="[
                      v => !isNaN(parseFloat(v)) || 'Number is required',
                      v => v < (editor.range[1] - editor.range[0])
                        || 'Steps should be smaller than the range']"
                    label="Slider Step Interval"
                    min="0"
                    hint="Each movement will move X amount"
                    persistent-hint
                  />
                </v-row>
              </div>
              <v-textarea
                v-if="datatype === 'text'"
                v-model="textValues"
                label="Predefined values"
                hint="Line separated values"
                outlined
                auto-grow
                row-height="30"
              />
            </v-form>
            <v-row
              v-if="!colorEditor"
              align="center"
              justify="start"
            >
              <v-col
                align-self="center"
                cols="2"
              >
                <h2>
                  Color:
                </h2>
              </v-col>
              <v-col align-self="center">
                <div
                  v-if="!color"
                  class="edit-color-box"
                  :style="{
                    backgroundColor: tempColor,
                  }"
                  @click="launchColorEditor"
                /><div
                  v-else
                  class="edit-color-box"
                  :style="{
                    backgroundColor: color,
                  }"
                  @click="launchColorEditor"
                />
              </v-col>
              <v-spacer />
            </v-row>
            <v-row v-if="colorEditor">
              <v-spacer />
              <v-col>
                <v-color-picker
                  v-model="color"
                  hide-inputs
                />
              </v-col>
              <v-spacer />
            </v-row>
          </v-tab-item>
          <v-tab-item>
            <attribute-shortcuts
              v-model="shortcuts"
              :value-type="datatype"
            />
          </v-tab-item>
          <v-tab-item>
            <v-switch
              v-model="attributeRendering"
              label="Rendering"
            />
            <attribute-rendering
              v-if="attributeRendering && renderingVals !== undefined"
              v-model="renderingVals"
              :attribute="selectedAttribute"
            />
          </v-tab-item>
          <v-tab-item v-if="datatype === 'text'">
            <attribute-value-colors
              :attribute="selectedAttribute"
              @save="saveAttributeValueColors($event)"
            />
          </v-tab-item>
          <v-tab-item v-else-if="datatype === 'number'">
            <attribute-number-value-colors
              :attribute="selectedAttribute"
              @save="saveAttributeValueColors($event)"
            />
          </v-tab-item>
        </v-tabs-items>

        <v-card-actions>
          <v-row>
            <v-tooltip
              open-delay="100"
              bottom
            >
              <template #activator="{ on }">
                <div v-on="on">
                  <v-btn
                    class="hover-show-child"
                    color="error"
                    :disabled="!selectedAttribute.key.length"
                    @click.prevent="deleteAttribute"
                  >
                    Delete
                  </v-btn>
                </div>
              </template>
              <span
                class="ma-0 pa-1"
              >
                Deletion of Attribute
              </span>
            </v-tooltip>
            <v-spacer />
            <v-btn
              text
              class="mr-2"
              @click="$emit('close')"
            >
              Cancel
            </v-btn>
            <v-btn
              color="primary"
              :disabled="!areSettingsValid || (!name || name.includes(' '))"
              @click.prevent="submit"
            >
              Save
            </v-btn>
          </v-row>
        </v-card-actions>
      </v-card-text>
    </v-card-title>
  </v-card>
</template>

<style lang="scss">
.attribute-settings {
  .v-textarea textarea {
    line-height: 24px;
  }
}
.edit-color-box {
  display: inline-block;
  margin-left: 20px;
  min-width: 50px;
  max-width: 50px;
  min-height: 50px;
  max-height: 50px;
  &:hover {
    cursor: pointer;
    border: 2px solid white
  }
}

</style>
