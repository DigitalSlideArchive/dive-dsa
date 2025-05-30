<script lang="ts">
import {
  defineComponent, computed, ref,
  Ref,
} from 'vue';

import StackedVirtualSidebarContainer from 'dive-common/components/StackedVirtualSidebarContainer.vue';
import {
  useAttributes, useCameraStore, useConfiguration, useSelectedTrackId, useTime,
  useHandler,
} from 'vue-media-annotator/provides';
import AttributeSubsection from 'dive-common/components/Attributes/AttributesSubsection.vue';
import { useStore } from 'platform/web-girder/store/types';
import { usePrompt } from 'dive-common/vue-utilities/prompt-service';
import { Attribute, AttributeShortcut } from 'vue-media-annotator/use/AttributeTypes';
import { DIVEAction } from 'dive-common/use/useActions';
import { StringKeyObject } from 'vue-media-annotator/BaseAnnotation';
import context from 'dive-common/store/context';

interface AttributeDisplayButton {
    name: string;
    color: string;
    prependIcon?: string;
    appendIcon?: string;
    buttonToolTip?: string;
    displayValue?: boolean;
    attrName: string;
    type: Attribute['belongs'];
    userAttribute: boolean;
    action: () => void;
}

interface ActionDisplayButton {
  name: string;
  color: string;
  prependIcon?: string;
  appendIcon?: string;
  buttonToolTip?: string;
  action: () => void;
}

interface AttributeButtons {
    name: string;
    type: 'track' | 'detection';
    description?: string;
    buttons: AttributeDisplayButton[];
}

type AttributeButtonList = AttributeButtons[];

export default defineComponent({
  name: 'CustomUIBase',

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

  setup(props) {
    const configMan = useConfiguration();
    const attributes = useAttributes();
    const { inputValue } = usePrompt();
    const { frame: frameRef } = useTime();
    const store = useStore();
    const cameraStore = useCameraStore();
    const selectedTrackIdRef = useSelectedTrackId();
    const systemHandler = useHandler();
    const panelExpanded: Ref<Record<string, number | undefined>> = ref({});

    const title = computed(() => configMan.configuration.value?.customUI?.title || 'Custom Actions');
    const information = computed(() => configMan.configuration.value?.customUI?.information || []);
    const updatedWidth = computed(() => configMan.configuration.value?.customUI?.width || props.width);
    context.nudgeWidth(updatedWidth.value);
    function getAttributeUser({ name, belongs }: { name: string; belongs: 'track' | 'detection' }) {
      const attribute = attributes.value.find((attr) => attr.name === name && attr.belongs === belongs);
      if (attribute?.user) {
        return store.state.User.user?.login || null;
      }
      return null;
    }

    function updateAttribute({ name, value, belongs }: { name: string; value: unknown; belongs: 'track' | 'detection' }) {
      if (selectedTrackIdRef.value !== null) {
        // Tracks across all cameras get the same attributes set if they are linked
        const tracks = cameraStore.getTrackAll(selectedTrackIdRef.value);
        const user = getAttributeUser({ name, belongs });
        if (tracks.length) {
          if (belongs === 'track') {
            tracks.forEach((track) => track.setAttribute(name, value, user));
          } else if (belongs === 'detection' && frameRef.value !== undefined) {
            tracks.forEach((track) => track.setFeatureAttribute(frameRef.value, name, value, user));
          }
        }
      }
    }

    const createShortcutHandler = (shortcut: AttributeShortcut, attribute: Attribute) => {
      // eslint-disable-next-line @typescript-eslint/ban-types
      let handler: () => void = () => undefined;
      if (shortcut.type === 'set') {
        handler = () => {
          let val: number | string | boolean = shortcut.value;
          if (attribute.datatype === 'number' && typeof (shortcut.value) === 'string') {
            val = parseFloat(shortcut.value);
          }
          updateAttribute({
            name: attribute.name,
            value: val,
            belongs: attribute.belongs,
          });
        };
      }
      if (shortcut.type === 'remove') {
        handler = () => {
          updateAttribute({
            name: attribute.name,
            value: undefined,
            belongs: attribute.belongs,
          });
        };
      }
      if (shortcut.type === 'dialog') {
        handler = async () => {
          const value = getAttributeValue(attribute.name, attribute.belongs, !!attribute.user) as string | number | boolean | undefined;
          const val = await inputValue({
            title: `Set ${attribute.name} Value`,
            text: attribute.values ? 'Press Spacebar to choose a selection, then Enter to select' : 'Set the Attribute Value below',
            positiveButton: 'Save',
            negativeButton: 'Cancel',
            confirm: true,
            valueType: attribute.datatype,
            valueList: attribute.values,
            lockedValueList: !!attribute.lockedValues,
            value,
          });
          if (val !== null) {
            updateAttribute({
              name: attribute.name,
              value: val,
              belongs: attribute.belongs,
            });
          }
        };
      }
      return handler;
    };

    const attributeButtons = computed(() => {
      const attributeButtonList: AttributeButtonList = [];
      attributes.value.forEach((attribute) => {
        if (attribute.shortcuts && attribute.shortcuts.length > 0) {
          const buttons: AttributeDisplayButton[] = [];
          attribute.shortcuts.forEach((shortcut) => {
            if (shortcut.button) {
              buttons.push({
                name: shortcut.button.buttonText,
                color: shortcut.button.buttonColor || attribute.color || 'primary',
                prependIcon: shortcut.button.iconPrepend,
                appendIcon: shortcut.button.iconAppend,
                buttonToolTip: shortcut.button.buttonToolTip,
                displayValue: shortcut.button.displayValue,
                attrName: attribute.name,
                type: attribute.belongs,
                userAttribute: !!attribute.user,
                action: createShortcutHandler(shortcut, attribute),
              });
            }
          });
          if (buttons.length > 0) {
            attributeButtonList.push({
              name: attribute.name,
              description: attribute.description,
              type: attribute.belongs,
              buttons,
            });
          }
        }
      });
      return attributeButtonList;
    });

    // Dive Action Shortcuts

    const actionButtons = computed(() => {
      const dataList: ActionDisplayButton[] = [];
      const user = store.state.User.user?.login;
      if (configMan.configuration.value?.shortcuts) {
        configMan.configuration.value.shortcuts.forEach((item) => {
          if (item.button) {
            dataList.push({
              name: item.button.buttonText,
              buttonToolTip: item.button.buttonToolTip,
              color: item.button.buttonColor || 'primary',
              prependIcon: item.button.iconPrepend,
              appendIcon: item.button.iconAppend,
              action: () => {
                item.actions.forEach((action: DIVEAction) => {
                  systemHandler.processAction(action, true, { frame: frameRef.value }, user);
                });
              },
            });
          }
        });
      }
      return dataList;
    });

    const selectedTrack = computed(() => {
      if (selectedTrackIdRef.value !== null) {
        return cameraStore.getAnyTrack(selectedTrackIdRef.value);
      }
      return null;
    });

    const selectedAttributes = computed(() => {
      if (selectedTrack.value && selectedTrack.value.revision.value) {
        const t = selectedTrack.value;
        if (t !== undefined && t !== null) {
          const [real] = t.getFeature(frameRef.value);
          return { trackAttributes: t.attributes, detectionAttributes: real?.attributes };
        }
      }
      return { trackAttributes: {}, detectionAttributes: {} };
    });

    const getAttributeValue = (key: string, type: Attribute['belongs'], userAttr: boolean) : string | number | boolean | unknown => {
      const attributes = type === 'detection' ? selectedAttributes.value.detectionAttributes : selectedAttributes.value.trackAttributes;
      if (userAttr && attributes?.userAttributes) {
        const user = store.state.User.user?.login;
        if (user && attributes.userAttributes[user]) {
          return (attributes.userAttributes[user] as StringKeyObject)[key];
        }
      } else if (attributes) {
        return attributes[key];
      }
      return '';
    };

    const buttonValueMap = computed(() => {
      const buttonMapping: Record<string, {attribute: string, button: string; value: string | boolean | number | unknown; length: number }> = {};
      attributeButtons.value.forEach((attribute) => attribute.buttons.forEach((button) => {
        if (button.displayValue) {
          const val = getAttributeValue(button.attrName, button.type, button.userAttribute);
          buttonMapping[button.attrName] = {
            attribute: attribute.name, button: button.attrName, value: val, length: val ? (val as string | boolean | number).toString()?.length : 0,
          };
        }
      }));
      return buttonMapping;
    });

    const expandPanel = (buttonName: string) => {
      if (panelExpanded.value[buttonName] !== undefined) {
        panelExpanded.value[buttonName] = undefined;
      } else {
        panelExpanded.value[buttonName] = 0;
      }
      panelExpanded.value = { ...panelExpanded.value };
    };

    return {
      attributes,
      title,
      information,
      updatedWidth,
      attributeButtons,
      actionButtons,
      selectedTrackIdRef,
      getAttributeValue,
      buttonValueMap,
      panelExpanded,
      expandPanel,

    };
  },
});
</script>

<template>
  <StackedVirtualSidebarContainer
    :width="updatedWidth"
    :enable-slot="false"
  >
    <template #default>
      <v-container>
        <p v-for="(item, index) in information" :key="`information_${index}`">
          {{ item }}
        </p>
        <v-divider />
        <v-row v-if="actionButtons.length" dense>
          Action Buttons
        </v-row>
        <v-row v-if="actionButtons.length" class="my-1">
          <v-col v-for="(button, index) in actionButtons" :key="`action_${index}`">
            <v-tooltip bottom>
              <template #activator="{ on }">
                <v-btn
                  :color="button.color"
                  outlined
                  class="mx-2"
                  v-on="button.buttonToolTip && on"
                  @click="button.action"
                >
                  <template v-if="button.prependIcon !== undefined">
                    <v-icon>{{ button.prependIcon }}</v-icon>
                  </template>
                  {{ button.name }}
                  <template v-if="button.appendIcon !== undefined">
                    <v-icon>{{ button.appendIcon }}</v-icon>
                  </template>
                </v-btn>
              </template>
              <span>{{ button.buttonToolTip }}</span>
            </v-tooltip>
          </v-col>
        </v-row>
        <v-divider />
        <p v-if="attributeButtons.length && selectedTrackIdRef === null">
          Attribute Action Buttons are disabled because no track is selected
        </p>
        <p v-else>
          Attribute Buttons
        </p>
        <v-row v-for="(attribute, index) in attributeButtons" :key="`attribute_${index}`">
          <v-col cols="12">
            <v-row>
              <v-col cols="12">
                <h4>{{ attribute.name }}</h4>
              </v-col>
            </v-row>
            <v-row v-if="attribute.description" class="mx-1">
              <p>{{ attribute.description }}</p>
            </v-row>
          </v-col>
          <v-row>
            <v-col v-for="(button, subIndex) in attribute.buttons" :key="`button_${subIndex}`">
              <v-tooltip bottom>
                <template #activator="{ on }">
                  <v-btn
                    :color="button.color"
                    outlined
                    :disabled="selectedTrackIdRef === null"
                    class="mx-2"
                    v-on="button.buttonToolTip && on"
                    @click="button.action"
                  >
                    <template v-if="button.prependIcon !== undefined">
                      <v-icon>{{ button.prependIcon }}</v-icon>
                    </template>
                    {{ button.name }}
                    <template v-if="button.appendIcon !== undefined">
                      <v-icon>{{ button.appendIcon }}</v-icon>
                    </template>
                  </v-btn>
                </template>
                <span>{{ button.buttonToolTip }}</span>
              </v-tooltip>
            </v-col>
          </v-row>
          <v-row v-if="buttonValueMap[attribute.name]">
            <v-col cols="12">
              <span v-if="buttonValueMap[attribute.name].length < 50">
                {{ buttonValueMap[attribute.name].value }}
              </span>
              <v-expansion-panels v-else :value="panelExpanded[attribute.name]">
                <v-expansion-panel class="border" @change="expandPanel(attribute.name)">
                  <v-expansion-panel-header>{{ attribute.name }} Value</v-expansion-panel-header>
                  <v-expansion-panel-content>
                    {{ buttonValueMap[attribute.name].value }}
                  </v-expansion-panel-content>
                </v-expansion-panel>
              </v-expansion-panels>
            </v-col>
          </v-row>
        </v-row>
      </v-container>
    </template>
  </StackedVirtualSidebarContainer>
</template>
