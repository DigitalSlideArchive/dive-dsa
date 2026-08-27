<script lang="ts">
import {
  defineComponent, ref, watch, Ref,
} from 'vue';
import draggable from 'vuedraggable';
import { useAttributes, useConfiguration } from 'vue-media-annotator/provides';
import { shouldShowAttributeInCustomUI } from 'vue-media-annotator/use/attributeCustomUI';

interface AttributeButtonOrderItem {
  key: string;
  label: string;
}

export default defineComponent({
  name: 'UIContextBar',
  components: {
    draggable,
  },
  setup() {
    const configMan = useConfiguration();
    const attributes = useAttributes();
    const UIContextBarDefaultNotOpen = ref(configMan.getUISetting('UIContextBarDefaultNotOpen') as boolean);
    const UIContextBarNotStatic = ref(configMan.getUISetting('UIContextBarNotStatic') as boolean);
    const UIThresholdControls = ref(configMan.getUISetting('UIThresholdControls') as boolean);
    const UIImageEnhancements = ref(configMan.getUISetting('UIImageEnhancements') as boolean);
    const UIGroupManager = ref(configMan.getUISetting('UIGroupManager') as boolean);
    const UIAttributeDetails = ref(configMan.getUISetting('UIAttributeDetails') as boolean);
    const UIRevisionHistory = ref(configMan.getUISetting('UIRevisionHistory') as boolean);
    const UIDatasetInfo = ref(configMan.getUISetting('UIDatasetInfo') as boolean);
    const UIAttributeUserReview = ref(configMan.getUISetting('UIAttributeUserReview') as boolean);

    const CustomUIEnabled = ref(!!configMan.configuration.value?.customUI);
    const customUITitle = ref(configMan.configuration.value?.customUI?.title || 'Custom UI');
    const customUIInformation = ref(configMan.configuration.value?.customUI?.information || ['Custom UI Information']);
    const customUIWidth = ref(configMan.configuration.value?.customUI?.width || 300);
    const customUIAttributeButtonOrder = ref<string[]>(
      [...(configMan.configuration.value?.customUI?.attributeButtonOrder || [])],
    );
    const attributeButtonOrderList: Ref<AttributeButtonOrderItem[]> = ref([]);

    watch([UIThresholdControls, UIImageEnhancements,
      UIGroupManager, UIAttributeDetails, UIRevisionHistory, UIDatasetInfo, UIAttributeUserReview, UIContextBarDefaultNotOpen, UIContextBarNotStatic], () => {
      const data = {
        UIContextBarDefaultNotOpen: UIContextBarDefaultNotOpen.value ? undefined : false,
        UIContextBarNotStatic: UIContextBarNotStatic.value ? undefined : false,
        UIThresholdControls: UIThresholdControls.value ? undefined : false,
        UIImageEnhancements: UIImageEnhancements.value ? undefined : false,
        UIGroupManager: UIGroupManager.value ? undefined : false,
        UIAttributeDetails: UIAttributeDetails.value ? undefined : false,
        UIRevisionHistory: UIRevisionHistory.value ? undefined : false,
        UIDatasetInfo: UIDatasetInfo.value ? undefined : false,
        UIAttributeUserReview: UIAttributeUserReview.value ? undefined : false,
      };
      configMan.setUISettings('UIContextBar', data);
    });

    const addNewInformation = () => {
      customUIInformation.value.push('');
    };
    const removeInformation = (index: number) => {
      customUIInformation.value.splice(index, 1);
    };

    function syncAttributeButtonOrderList() {
      const withButtons = attributes.value
        .filter((attr) => {
          const buttonCount = attr.shortcuts?.filter((shortcut) => !!shortcut.button).length ?? 0;
          return shouldShowAttributeInCustomUI(attr, buttonCount);
        })
        .map((attr) => ({
          key: attr.key || `${attr.belongs}_${attr.name}`,
          label: attr.displayText || attr.name,
        }));
      const byKey = new Map(withButtons.map((item) => [item.key, item]));
      const ordered: AttributeButtonOrderItem[] = [];
      customUIAttributeButtonOrder.value.forEach((key) => {
        const item = byKey.get(key);
        if (item) {
          ordered.push(item);
          byKey.delete(key);
        }
      });
      byKey.forEach((item) => ordered.push(item));
      attributeButtonOrderList.value = ordered;
      const newOrder = ordered.map((item) => item.key);
      if (JSON.stringify(newOrder) !== JSON.stringify(customUIAttributeButtonOrder.value)) {
        customUIAttributeButtonOrder.value = newOrder;
      }
    }

    const onAttributeButtonOrderEnd = () => {
      customUIAttributeButtonOrder.value = attributeButtonOrderList.value.map((item) => item.key);
    };

    watch(attributes, () => {
      syncAttributeButtonOrderList();
    }, { deep: true, immediate: true });

    watch([CustomUIEnabled, customUITitle, customUIInformation, customUIWidth, customUIAttributeButtonOrder], () => {
      if (!CustomUIEnabled.value) {
        configMan.setCustomUI(undefined);
        return;
      }
      const data = {
        title: customUITitle.value,
        information: customUIInformation.value,
        width: customUIWidth.value,
        attributeButtonOrder: customUIAttributeButtonOrder.value.length
          ? customUIAttributeButtonOrder.value
          : undefined,
      };
      configMan.setCustomUI(data);
    }, { deep: true });

    return {
      UIContextBarDefaultNotOpen,
      UIContextBarNotStatic,
      UIThresholdControls,
      UIImageEnhancements,
      UIGroupManager,
      UIAttributeDetails,
      UIRevisionHistory,
      UIDatasetInfo,
      CustomUIEnabled,
      customUITitle,
      customUIInformation,
      customUIWidth,
      attributeButtonOrderList,
      onAttributeButtonOrderEnd,
      addNewInformation,
      removeInformation,
      UIAttributeUserReview,
    };
  },

});
</script>

<template>
  <v-card>
    <v-card-title>Context Bar (Right side) Settings</v-card-title>
    <v-card-text>
      <div>
        <p>Context Bar Generic Settings</p>
        <v-row dense>
          <v-switch
            v-model="UIContextBarDefaultNotOpen"
            label="Closed by Default"
            class="mx-2"
          />
          <v-switch
            v-model="UIContextBarNotStatic"
            label="Dismissable"
            class="mx-2"
          />
        </v-row>
        <v-divider />
      </div>
      <div>
        <v-row dense>
          <v-switch
            v-model="UIThresholdControls"
            label="Confidence Detailed Controls"
          />
        </v-row>
        <v-row dense>
          <v-switch
            v-model="UIImageEnhancements"
            label="Image Enhancements"
          />
        </v-row>
        <v-row dense>
          <v-switch
            v-model="UIGroupManager"
            label="Group Manager"
          />
        </v-row>
        <v-row dense>
          <v-switch
            v-model="UIAttributeDetails"
            label="Attribute Filtering/Graphing"
          />
        </v-row>
        <v-row dense>
          <v-switch
            v-model="UIRevisionHistory"
            label="Revision History"
          />
        </v-row>
        <v-row dense>
          <v-switch
            v-model="UIDatasetInfo"
            label="Dataset Info"
          />
        </v-row>
        <v-row dense>
          <v-switch
            v-model="UIAttributeUserReview"
            label="Attribute User Review"
          />
        </v-row>
        <v-row dense>
          <v-switch
            v-model="CustomUIEnabled"
            label="Custom UI Enabled"
          />
        </v-row>
        <v-row v-if="CustomUIEnabled" dense>
          <v-text-field v-model="customUITitle" label="Title" />
          <v-text-field v-model.number="customUIWidth" label="Width" />
        </v-row>
        <div
          v-if="CustomUIEnabled"
        >
          <v-row>
            <v-btn @click="addNewInformation()">
              Add New
            </v-btn>
          </v-row>
          <v-row v-for="(info, index) in customUIInformation" :key="index" class="my-2">
            <v-col>
              <v-text-field v-model="customUIInformation[index]" label="Information" />
            </v-col>
            <v-col cols="auto">
              <v-btn icon @click="removeInformation(index)">
                <v-icon color="error">
                  mdi-delete
                </v-icon>
              </v-btn>
            </v-col>
          </v-row>
          <v-expansion-panels class="mt-3" flat>
            <v-expansion-panel>
              <v-expansion-panel-header>
                Attribute button order
              </v-expansion-panel-header>
              <v-expansion-panel-content>
                <p
                  v-if="!attributeButtonOrderList.length"
                  class="text-caption grey--text"
                >
                  No attribute buttons configured. Enable a button on an attribute shortcut to order it here.
                </p>
                <draggable
                  v-else
                  :list="attributeButtonOrderList"
                  handle=".drag-handle"
                  @end="onAttributeButtonOrderEnd"
                >
                  <v-row
                    v-for="item in attributeButtonOrderList"
                    :key="item.key"
                    align="center"
                    dense
                    class="mb-1"
                  >
                    <v-col cols="auto">
                      <v-icon class="drag-handle">
                        mdi-drag
                      </v-icon>
                    </v-col>
                    <v-col>
                      {{ item.label }}
                      <span class="text-caption grey--text ml-1">({{ item.key }})</span>
                    </v-col>
                  </v-row>
                </draggable>
              </v-expansion-panel-content>
            </v-expansion-panel>
          </v-expansion-panels>
        </div>
      </div>
    </v-card-text>
  </v-card>
</template>

<style lang="scss">
.drag-handle {
  cursor: grab;
}
</style>
