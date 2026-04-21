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

const STICKY_DETECTION_STORAGE_KEY = 'dive.datasetInfoAttributes.stickyDetectionEnabled';

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
    const getStoredStickyPreference = () => {
      if (typeof window === 'undefined') {
        return undefined;
      }
      try {
        const storedValue = window.localStorage.getItem(STICKY_DETECTION_STORAGE_KEY);
        if (storedValue === null) {
          return undefined;
        }
        return storedValue === 'true';
      } catch (error) {
        return undefined;
      }
    };
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
    const getDetectionValueInfo = (attribute: Attribute, sticky = false) => {
      const track = selectedTrack.value;
      if (!track) {
        return { value: undefined, inherited: false };
      }
      const [feature] = track.getFeature(time.frame.value);
      let value: unknown;
      if (feature?.attributes) {
        value = getAttributeUserMap(feature.attributes, attribute)?.[attribute.name];
      }
      if (!sticky || (value !== undefined && value !== '')) {
        return { value, inherited: false };
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
          return { value, inherited: true };
        }
        previousFrame = previousKeyframe - 1;
      }
      return { value: undefined, inherited: false };
    };
    const getTrackValue = (attribute: Attribute) => {
      const track = selectedTrack.value;
      if (!track) {
        return undefined;
      }
      return getAttributeUserMap(track.attributes, attribute)?.[attribute.name];
    };
    const getDisplayInfo = (attribute: Attribute) => {
      if (attribute.belongs === 'detection') {
        return getDetectionValueInfo(attribute, stickyDetectionEnabled.value);
      }
      return { value: getTrackValue(attribute), inherited: false };
    };
    const getDisplayString = (attribute: Attribute) => {
      const { value } = getDisplayInfo(attribute);
      return value === undefined ? 'N/A' : String(value);
    };
    const isDisplayValueInherited = (attribute: Attribute) => getDisplayInfo(attribute).inherited;
    const getDisplayValueTooltip = (attribute: Attribute) => {
      const value = getDisplayString(attribute);
      return isDisplayValueInherited(attribute)
        ? `${value} (inherited from previous keyframe)`
        : value;
    };
    const shouldShowPredefinedValues = (attribute: Attribute) => (
      attribute.datatype === 'text'
      && !!attribute.values
      && attribute.values.length > 0
    );
    watch(
      detectionAttributes,
      (newAttributes) => {
        if (!hasInitializedStickyDetection.value) {
          const storedStickyPreference = getStoredStickyPreference();
          if (storedStickyPreference !== undefined) {
            stickyDetectionEnabled.value = storedStickyPreference;
          } else {
            stickyDetectionEnabled.value = newAttributes.some((attribute) => !!attribute.render?.sticky);
          }
          hasInitializedStickyDetection.value = true;
        }
      },
      { immediate: true },
    );
    watch(
      stickyDetectionEnabled,
      (enabled) => {
        if (!hasInitializedStickyDetection.value || typeof window === 'undefined') {
          return;
        }
        try {
          window.localStorage.setItem(STICKY_DETECTION_STORAGE_KEY, String(enabled));
        } catch (error) {
          // Ignore storage failures so UI behavior remains usable.
        }
      },
    );

    return {
      hasAttributeInfo,
      shouldShowAttributes,
      detectionAttributes,
      trackAttributes,
      stickyDetectionEnabled,
      getDisplayString,
      getDisplayValueTooltip,
      isDisplayValueInherited,
      shouldShowPredefinedValues,
    };
  },
});
</script>

<template>
  <v-expansion-panel v-if="shouldShowAttributes" class="border">
    <v-expansion-panel-header>Attributes</v-expansion-panel-header>
    <v-expansion-panel-content class="pa-0">
      <v-expansion-panels multiple flat class="attribute-sections pa-0">
        <v-expansion-panel
          v-if="trackAttributes.length"
          class="attribute-section-panel border"
        >
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
                        <template v-if="shouldShowPredefinedValues(attribute)">
                          <div class="mt-1">
                            <strong>Predefined values:</strong>
                          </div>
                          <ul class="ma-0 pl-4">
                            <li v-for="value in attribute.values" :key="`${attribute.key}_${value}`">
                              {{ value }}
                            </li>
                          </ul>
                        </template>
                      </div>
                    </v-tooltip>
                  </div>
                  <v-tooltip bottom max-width="420" open-delay="200">
                    <template #activator="{ on }">
                      <div class="attribute-value d-inline-flex align-center" v-on="on">
                        <span class="attribute-value-text">
                          {{ getDisplayString(attribute) }}
                        </span>
                      </div>
                    </template>
                    <span>{{ getDisplayValueTooltip(attribute) }}</span>
                  </v-tooltip>
                </div>
              </v-list-item-content>
            </v-list-item>
          </v-expansion-panel-content>
        </v-expansion-panel>

        <v-expansion-panel
          v-if="detectionAttributes.length"
          class="attribute-section-panel border"
        >
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
                  aria-label="Detection attribute settings"
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
                            aria-label="Stickiness information"
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
                        <template v-if="shouldShowPredefinedValues(attribute)">
                          <div class="mt-1">
                            <strong>Predefined values:</strong>
                          </div>
                          <ul class="ma-0 pl-4">
                            <li v-for="value in attribute.values" :key="`${attribute.key}_${value}`">
                              {{ value }}
                            </li>
                          </ul>
                        </template>
                      </div>
                    </v-tooltip>
                  </div>
                  <v-tooltip bottom max-width="420" open-delay="200">
                    <template #activator="{ on }">
                      <div class="attribute-value d-inline-flex align-center" v-on="on">
                        <span class="attribute-value-text">
                          {{ getDisplayString(attribute) }}
                        </span>
                      </div>
                    </template>
                    <span>{{ getDisplayValueTooltip(attribute) }}</span>
                  </v-tooltip>
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
  flex: 0 1 46%;
  text-align: right;
  justify-content: flex-end;
  min-width: 0;
}

.attribute-value-text {
  display: inline-block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
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
