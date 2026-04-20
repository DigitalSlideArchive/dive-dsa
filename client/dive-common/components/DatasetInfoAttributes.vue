<script lang="ts">
import {
  computed, defineComponent, ref, watch,
} from 'vue';
import { useStore } from 'platform/web-girder/store/types';
import {
  useAttributes, useCameraStore, useSelectedTrackId, useTime,
} from 'vue-media-annotator/provides';
import type { Attribute } from 'vue-media-annotator/use/AttributeTypes';
import { StringKeyObject } from 'vue-media-annotator/BaseAnnotation';

export default defineComponent({
  name: 'DatasetInfoAttributes',
  setup() {
    const store = useStore();
    const attributes = useAttributes();
    const cameraStore = useCameraStore();
    const selectedTrackId = useSelectedTrackId();
    const time = useTime();
    const stickyDetectionEnabled = ref(false);
    const hasInitializedStickyDetection = ref(false);
    const detectionAttributes = computed(() => attributes.value.filter((attribute) => attribute.belongs === 'detection'));
    const trackAttributes = computed(() => attributes.value.filter((attribute) => attribute.belongs === 'track'));
    const hasAttributeInfo = computed(() => detectionAttributes.value.length > 0 || trackAttributes.value.length > 0);
    const selectedTrack = computed(() => {
      if (selectedTrackId.value === null) {
        return undefined;
      }
      return cameraStore.getAnyPossibleTrack(selectedTrackId.value);
    });
    const shouldShowAttributes = computed(() => hasAttributeInfo.value && !!selectedTrack.value);
    const getAttributeUserMap = (
      source: StringKeyObject | undefined,
      attribute: Attribute,
    ) => {
      const user = store.state.User.user?.login;
      if (attribute.user && user && source?.userAttributes) {
        return (source.userAttributes as StringKeyObject)[user] as StringKeyObject | undefined;
      }
      return source;
    };
    const getDetectionValue = (attribute: Attribute, sticky = false) => {
      const track = selectedTrack.value;
      if (!track) {
        return undefined;
      }
      const [feature] = track.getFeature(time.frame.value);
      let value: unknown;
      if (feature?.attributes) {
        value = getAttributeUserMap(feature.attributes, attribute)?.[attribute.name];
      }
      if (!sticky || (value !== undefined && value !== '')) {
        return value;
      }
      let previousFrame = time.frame.value;
      while (previousFrame >= 0) {
        const previousKeyframe = track.getPreviousKeyframe(previousFrame);
        if (previousKeyframe === undefined) {
          break;
        }
        const [previousFeature] = track.getFeature(previousKeyframe);
        value = getAttributeUserMap(previousFeature?.attributes, attribute)?.[attribute.name];
        if (value !== undefined && value !== '') {
          return value;
        }
        previousFrame = previousKeyframe - 1;
      }
      return undefined;
    };
    const getTrackValue = (attribute: Attribute) => {
      const track = selectedTrack.value;
      if (!track) {
        return undefined;
      }
      return getAttributeUserMap(track.attributes, attribute)?.[attribute.name];
    };
    const getDisplayValue = (attribute: Attribute) => {
      if (attribute.belongs === 'detection') {
        return getDetectionValue(attribute, stickyDetectionEnabled.value);
      }
      return getTrackValue(attribute);
    };
    const getDisplayString = (attribute: Attribute) => {
      const value = getDisplayValue(attribute);
      return value === undefined ? 'N/A' : String(value);
    };
    watch(
      detectionAttributes,
      (newAttributes) => {
        if (!hasInitializedStickyDetection.value) {
          stickyDetectionEnabled.value = newAttributes.some((attribute) => !!attribute.render?.sticky);
          hasInitializedStickyDetection.value = true;
        }
      },
      { immediate: true },
    );

    return {
      hasAttributeInfo,
      shouldShowAttributes,
      detectionAttributes,
      trackAttributes,
      stickyDetectionEnabled,
      getDisplayValue,
      getDisplayString,
    };
  },
});
</script>

<template>
  <v-expansion-panel v-if="shouldShowAttributes">
    <v-expansion-panel-header>Attributes</v-expansion-panel-header>
    <v-expansion-panel-content class="pa-0">
      <v-expansion-panels multiple flat class="attribute-sections pa-0">
        <v-expansion-panel class="attribute-section-panel">
          <v-expansion-panel-header class="subtitle-2 py-2 attribute-section-header">
            Track Attributes
          </v-expansion-panel-header>
          <v-expansion-panel-content class="pa-0 track-attributes-content">
            <v-list-item
              v-for="attribute in trackAttributes"
              :key="`datasetInfo_track_attribute_${attribute.key}`"
              dense
            >
              <v-list-item-content>
                <div class="attribute-row">
                  <div class="attribute-name d-flex align-center">
                    <span>{{ attribute.name }}</span>
                    <v-tooltip bottom max-width="320" open-delay="200">
                      <template #activator="{ on }">
                        <v-icon small class="ml-1" color="grey lighten-1" v-on="on">
                          mdi-information
                        </v-icon>
                      </template>
                      <div class="attribute-info-tooltip">
                        <div>
                          <strong>Type:</strong> {{ attribute.datatype }}
                        </div>
                        <template v-if="attribute.values && attribute.values.length">
                          <div class="mt-1">
                            <strong>Predefined values:</strong>
                          </div>
                          <ul class="ma-0 pl-4">
                            <li v-for="value in attribute.values" :key="`${attribute.key}_${value}`">
                              {{ value }}
                            </li>
                          </ul>
                        </template>
                        <div v-else class="mt-1">
                          <strong>Predefined values:</strong> None
                        </div>
                      </div>
                    </v-tooltip>
                  </div>
                  <div class="attribute-value">
                    {{ getDisplayString(attribute) }}
                  </div>
                </div>
              </v-list-item-content>
            </v-list-item>
          </v-expansion-panel-content>
        </v-expansion-panel>

        <v-expansion-panel class="attribute-section-panel">
          <v-expansion-panel-header class="subtitle-2 py-2 attribute-section-header">
            <span>Detection Attributes</span>
            <v-menu left offset-y @click.stop>
              <template #activator="{ on, attrs }">
                <v-btn
                  icon
                  small
                  class="ml-2"
                  v-bind="attrs"
                  v-on="on"
                  @click.stop
                >
                  <v-icon small>
                    mdi-cog
                  </v-icon>
                </v-btn>
              </template>
              <v-list dense>
                <v-list-item>
                  <v-list-item-content>
                    <v-list-item-title class="d-flex align-center">
                      <span>Stickiness</span>
                      <v-tooltip bottom max-width="320" open-delay="200">
                        <template #activator="{ on: infoOn }">
                          <v-icon
                            small
                            class="ml-1"
                            color="grey lighten-1"
                            v-on="infoOn"
                          >
                            mdi-information
                          </v-icon>
                        </template>
                        <span>
                          When enabled, empty detection attribute values reuse the most recent non-empty value from earlier keyframes.
                        </span>
                      </v-tooltip>
                    </v-list-item-title>
                  </v-list-item-content>
                  <v-list-item-action>
                    <v-switch
                      v-model="stickyDetectionEnabled"
                      hide-details
                      dense
                      inset
                    />
                  </v-list-item-action>
                </v-list-item>
              </v-list>
            </v-menu>
          </v-expansion-panel-header>
          <v-expansion-panel-content class="pa-0">
            <v-list-item
              v-for="attribute in detectionAttributes"
              :key="`datasetInfo_detection_attribute_${attribute.key}`"
              dense
            >
              <v-list-item-content>
                <div class="attribute-row">
                  <div class="attribute-name d-flex align-center">
                    <span>{{ attribute.name }}</span>
                    <v-tooltip bottom max-width="320" open-delay="200">
                      <template #activator="{ on }">
                        <v-icon small class="ml-1" color="grey lighten-1" v-on="on">
                          mdi-information
                        </v-icon>
                      </template>
                      <div class="attribute-info-tooltip">
                        <div>
                          <strong>Type:</strong> {{ attribute.datatype }}
                        </div>
                        <template v-if="attribute.values && attribute.values.length">
                          <div class="mt-1">
                            <strong>Predefined values:</strong>
                          </div>
                          <ul class="ma-0 pl-4">
                            <li v-for="value in attribute.values" :key="`${attribute.key}_${value}`">
                              {{ value }}
                            </li>
                          </ul>
                        </template>
                        <div v-else class="mt-1">
                          <strong>Predefined values:</strong> None
                        </div>
                      </div>
                    </v-tooltip>
                  </div>
                  <div class="attribute-value">
                    {{ getDisplayString(attribute) }}
                  </div>
                </div>
              </v-list-item-content>
            </v-list-item>
          </v-expansion-panel-content>
        </v-expansion-panel>
      </v-expansion-panels>
    </v-expansion-panel-content>
  </v-expansion-panel>
</template>

<style scoped>
.wrap-text {
  white-space: normal !important;
  word-break: break-word;
}

.attribute-info-tooltip {
  white-space: normal;
}

.attribute-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  column-gap: 12px;
}

.attribute-name {
  flex: 1 1 auto;
  min-width: 0;
}

.attribute-value {
  flex: 0 0 auto;
  text-align: right;
  white-space: normal;
  word-break: break-word;
}

.attribute-sections {
  padding: 0;
  margin: 0;
}

.attribute-section-panel {
  margin: 0;
  padding: 0;
}

.attribute-section-header {
  min-height: 36px;
  padding: 0 8px;
}
:deep(.v-expansion-panel-content__wrap) {
  margin: 0 !important;
  padding: 0 !important;
}
</style>
