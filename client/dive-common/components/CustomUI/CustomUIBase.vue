<script lang="ts">
import {
  defineComponent, computed, ref,
  Ref,
  watch,
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
  segment?: boolean;
  actionType: 'set' | 'remove' | 'dialog';
  disabled: boolean;
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
  attrName: string;
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
    const { frame: frameRef, frameRate } = useTime();
    const store = useStore();
    const cameraStore = useCameraStore();
    const selectedTrackIdRef = useSelectedTrackId();
    const systemHandler = useHandler();
    const panelExpanded: Ref<Record<string, number | undefined>> = ref({});
    const trackPercentSize = 0.01; // 5% of the track length is used for segment creation

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

    function getButtonDisabled(attribute: Attribute, shortcut: AttributeShortcut) {
      if (selectedTrackIdRef.value === null) {
        return { disabled: true, tooltip: 'No track selected' };
      }

      if (shortcut.segment && selectedTrackIdRef.value !== null && frameRef.value !== undefined) {
        const track = cameraStore.getAnyTrack(selectedTrackIdRef.value);
        const rangeVals = track.getFrameAttributeRanges([attribute.name], store.state.User.user?.login || null);
        const ranges = rangeVals[attribute.name];
        if (ranges && ranges.length > 0) {
          if (ranges.length % 2 !== 0) {
            return { disabled: true, tooltip: 'Segments are uneven' };
          }
          if (frameRef.value !== undefined) {
            let inRange = false;
            let varianceRange = false;
            let segmentCreationFrames = (track.end - track.begin) * trackPercentSize;
            const { segmentSize, segmentSizeType } = shortcut;
            if (segmentSize && segmentSizeType) {
              if (segmentSizeType === 'frames' && segmentSize > 0) {
                // segment size is in frames
                segmentCreationFrames = segmentSize;
              }
              if (segmentSizeType === 'seconds' && segmentSize > 0 && frameRate.value) {
                // segment size is in seconds
                segmentCreationFrames = segmentSize * frameRate.value;
              }
              if (segmentSizeType === 'percent' && segmentSize > 0) {
                // segment size is in percent of track
                segmentCreationFrames = (track.end - track.begin) * segmentSize;
              }
            }
            for (let i = 0; i < ranges.length; i += 2) {
              const start = ranges[i];
              const end = ranges[i + 1];
              if (frameRef.value >= start && frameRef.value <= end) {
                inRange = true;
                varianceRange = true;
                break;
              }
              if (frameRef.value < start && frameRef.value > start - segmentCreationFrames) {
                varianceRange = true;
              }
              if (frameRef.value > end && frameRef.value < end + segmentCreationFrames) {
                varianceRange = true;
              }
            }
            if (shortcut.type === 'remove' && !inRange) {
              return { disabled: true, tooltip: 'Frame not in segment range' };
            }
            if ((shortcut.type === 'set' || shortcut.type === 'dialog') && varianceRange && !shortcut.segmentEditable) {
              return { disabled: true, tooltip: 'Cannot Create Segment, too close to other segments' };
            }
          }
        }
      }

      return { disabled: false, tooltip: shortcut.button?.buttonToolTip || '' };
    }

    function updateAttribute({
      name, value, belongs, frame,
    }: { name: string; value: unknown; belongs: 'track' | 'detection', frame?: number }) {
      const frameVal = frame || frameRef.value;
      if (selectedTrackIdRef.value !== null) {
        // Tracks across all cameras get the same attributes set if they are linked
        const tracks = cameraStore.getTrackAll(selectedTrackIdRef.value);
        const user = getAttributeUser({ name, belongs });
        if (tracks.length) {
          if (belongs === 'track') {
            tracks.forEach((track) => track.setAttribute(name, value, user));
          } else if (belongs === 'detection' && frameRef.value !== undefined) {
            tracks.forEach((track) => track.setFeatureAttribute(frameVal, name, value, user));
          }
        }
      }
    }

    const createSegmentHandler = (shortcut: AttributeShortcut, attribute: Attribute, val: number | string | boolean) => {
      if (selectedTrackIdRef.value === null || frameRef.value === undefined) {
        return;
      }
      const track = cameraStore.getAnyTrack(selectedTrackIdRef.value);
      // Check if inside segment
      if (shortcut.segmentEditable) {
        const rangeVals = track.getFrameAttributeRanges([attribute.name], store.state.User.user?.login || null);
        const ranges = rangeVals[attribute.name];
        let insideSegmentBounds: { start: number, end: number } | null = null;
        if (ranges && ranges.length > 0) {
          for (let i = 0; i < ranges.length; i += 2) {
            const startseg = ranges[i];
            const endseg = ranges[i + 1];
            if (frameRef.value >= startseg && frameRef.value <= endseg) {
              insideSegmentBounds = { start: startseg, end: endseg };
              break;
            }
          }
        }
        if (insideSegmentBounds) {
          updateAttribute({
            name: attribute.name,
            value: val,
            belongs: attribute.belongs,
            frame: insideSegmentBounds.start,
          });
          updateAttribute({
            name: attribute.name,
            value: val,
            belongs: attribute.belongs,
            frame: insideSegmentBounds.end,
          });
          return;
        }
      }
      // Create attribute segment if not inside segment and it is editable
      const frame = frameRef.value;
      let segmentCreationFrames = (track.end - track.begin) * trackPercentSize;
      const { segmentSize, segmentSizeType } = shortcut;
      if (segmentSize && segmentSizeType) {
        if (segmentSizeType === 'frames' && segmentSize > 0) {
          // segment size is in frames
          segmentCreationFrames = segmentSize;
        }
        if (segmentSizeType === 'seconds' && segmentSize > 0 && frameRate.value) {
          // segment size is in seconds
          segmentCreationFrames = segmentSize * frameRate.value;
        }
        if (segmentSizeType === 'percent' && segmentSize > 0) {
          // segment size is in percent of track
          segmentCreationFrames = (track.end - track.begin) * segmentSize;
        }
      }
      // Check the ranges so we don't clobber another Segment with our new size:
      const rangeChecks = track.getFrameAttributeRanges([attribute.name], store.state.User.user?.login || null);
      const rangesCheck = rangeChecks[attribute.name];
      let start = Math.max(0, Math.round(frame - (segmentCreationFrames / 2.0)));
      let end = Math.min(track.end, Math.round(frame + (segmentCreationFrames / 2.0)));

      // We have this new start/End point need to check and see if they intersect any ranges or are larger than a range

      if (rangesCheck && rangesCheck.length > 0) {
        for (let i = 0; i < rangesCheck.length; i += 2) {
          const starts = rangesCheck[i];
          const ends = rangesCheck[i + 1];
          if ((start >= starts && start <= ends) || (end >= starts && end <= ends)
            || (start <= starts && end >= ends)) {
            // intersects se we shrink the segment to 1 frame smaller than the new segments
            if (start >= starts && start <= ends) {
              // our start is inside a segment so move it to the end of that segment
              // but make sure we don't go past the end point
              const newStart = Math.min(end - 1, ends + 1);
              if (newStart >= end) {
                return; // can't make a segment here
              }
              start = newStart;
            } else if (end >= starts && end <= ends) {
              // our end is inside a segment so move it to the start of that segment
              // but make sure we don't go before the start point
              const newEnd = Math.max(start + 1, starts - 1);
              if (newEnd <= start) {
                return; // can't make a segment here
              }
              end = newEnd;
            } else if (start <= starts && end >= ends) {
              // we are larger than an existing segment so just shrink to either side of it
              if (starts - 1 <= start && ends + 1 >= end) {
                return; // can't make a segment here
              }
              // If the midpoint is to the left of the segment, move the end, else move the start
              const midPoint = (start + end) / 2.0;
              if (midPoint < starts) {
                end = starts - 1;
              } else {
                start = starts - 1;
              }
            }
          }
        }
      }
      updateAttribute({
        name: attribute.name,
        value: val,
        belongs: attribute.belongs,
        frame: start,
      });
      updateAttribute({
        name: attribute.name,
        value: val,
        belongs: attribute.belongs,
        frame: end,
      });
    };

    const createShortcutHandler = (shortcut: AttributeShortcut, attribute: Attribute) => {
      // eslint-disable-next-line @typescript-eslint/ban-types
      let handler: () => void = () => undefined;
      if (shortcut.type === 'set') {
        handler = () => {
          let val: number | string | boolean = shortcut.value;
          if (attribute.datatype === 'number' && typeof (shortcut.value) === 'string') {
            val = parseFloat(shortcut.value);
          }
          if (shortcut.segment && selectedTrackIdRef.value !== null && frameRef.value !== undefined) {
            createSegmentHandler(shortcut, attribute, val);
            updateButtonMap();
            return;
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
          if (shortcut.segment && selectedTrackIdRef.value !== null && frameRef.value !== undefined) {
            const track = cameraStore.getAnyTrack(selectedTrackIdRef.value);
            const rangeVals = track.getFrameAttributeRanges([attribute.name], store.state.User.user?.login || null);
            const ranges = rangeVals[attribute.name];
            // find the range that contains the current frame
            if (ranges && ranges.length > 0) {
              for (let i = 0; i < ranges.length; i += 2) {
                const start = ranges[i];
                const end = ranges[i + 1];
                if (frameRef.value >= start && frameRef.value <= end) {
                  // remove the range
                  updateAttribute({
                    name: attribute.name,
                    value: undefined,
                    belongs: attribute.belongs,
                    frame: start,
                  });
                  updateAttribute({
                    name: attribute.name,
                    value: undefined,
                    belongs: attribute.belongs,
                    frame: end,
                  });
                }
              }
            }
          } else {
            updateAttribute({
              name: attribute.name,
              value: undefined,
              belongs: attribute.belongs,
            });
          }
          updateButtonMap();
        };
      }
      if (shortcut.type === 'dialog') {
        handler = async () => {
          let value = getAttributeValue(attribute.name, attribute.belongs, !!attribute.user) as string | number | boolean | undefined;
          if (!value && buttonValueMap.value[attribute.name]?.value) {
            value = buttonValueMap.value[attribute.name].value as string | number | boolean | undefined;
          }
          const val = await inputValue({
            title: `Set ${attribute.displayText || attribute.name} Value`,
            text: attribute.values?.length ? 'Press Spacebar to choose a selection, then Enter to select' : `Set the ${attribute.displayText || attribute.name}  Value below`,
            positiveButton: 'Save',
            negativeButton: 'Cancel',
            confirm: true,
            valueType: attribute.datatype,
            valueList: attribute.values,
            lockedValueList: !!attribute.lockedValues,
            value,
            maxWidth: '45vw',
          });
          if (val !== null) {
            if (shortcut.segment && selectedTrackIdRef.value !== null && frameRef.value !== undefined) {
              createSegmentHandler(shortcut, attribute, val);
              updateButtonMap();
              return;
            }
            updateAttribute({
              name: attribute.name,
              value: val,
              belongs: attribute.belongs,
            });
            updateButtonMap();
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
              const { disabled, tooltip } = getButtonDisabled(attribute, shortcut);
              buttons.push({
                name: shortcut.button.buttonText,
                color: shortcut.button.buttonColor || attribute.color || 'primary',
                prependIcon: shortcut.button.iconPrepend,
                appendIcon: shortcut.button.iconAppend,
                buttonToolTip: tooltip,
                displayValue: shortcut.button.displayValue,
                attrName: attribute.name,
                type: attribute.belongs,
                userAttribute: !!attribute.user,
                segment: shortcut.segment,
                actionType: shortcut.type,
                disabled,
                action: createShortcutHandler(shortcut, attribute),
              });
            }
          });
          if (buttons.length > 0) {
            attributeButtonList.push({
              name: attribute.displayText || attribute.name,
              attrName: attribute.name,
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

    const getAttributeValue = (key: string, type: Attribute['belongs'], userAttr: boolean): string | number | boolean | unknown => {
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

    // const buttonValueMap = computed(() => {
    //   const buttonMapping: Record<string, {attribute: string, button: string; value: string | boolean | number | unknown; length: number }> = {};
    //   attributeButtons.value.forEach((attribute) => attribute.buttons.forEach((button) => {
    //     if (button.displayValue) {
    //       if (button.segment && selectedTrackIdRef.value !== null) {
    //         const track = cameraStore.getAnyTrack(selectedTrackIdRef.value);
    //         const rangeVals = track.getFrameAttributeRanges([attribute.attrName], store.state.User.user?.login || null);
    //         const ranges = rangeVals[attribute.attrName];
    //         if (ranges && ranges.length > 0) {
    //           for (let i = 0; i < ranges.length; i += 2) {
    //             const start = ranges[i];
    //             const end = ranges[i + 1];
    //             if (frameRef.value >= start && frameRef.value <= end) {
    //               const [real] = track.getFeature(start);
    //               if (real && real.attributes) {
    //                 if (button.userAttribute && real.attributes.userAttributes) {
    //                   const user = store.state.User.user?.login;
    //                   if (user && real.attributes.userAttributes[user]) {
    //                     const val = ((real.attributes.userAttributes[user] as StringKeyObject)[button.attrName] as string | boolean | number);
    //                     buttonMapping[button.attrName] = {
    //                       attribute: attribute.name, button: button.attrName, value: val, length: val ? (val as string | boolean | number).toString()?.length : 0,
    //                     };
    //                   }
    //                 } else if (real.attributes) {
    //                   const val = (real.attributes[button.attrName] as string | boolean | number);
    //                   buttonMapping[button.attrName] = {
    //                     attribute: attribute.name, button: button.attrName, value: val, length: val ? (val as string | boolean | number).toString()?.length : 0,
    //                   };
    //                 }
    //               }
    //             }
    //           }
    //         }
    //       } else {
    //         const val = getAttributeValue(button.attrName, button.type, button.userAttribute);
    //         buttonMapping[button.attrName] = {
    //           attribute: attribute.name, button: button.attrName, value: val, length: val ? (val as string | boolean | number).toString()?.length : 0,
    //         };
    //       }
    //     }
    //   }));
    //   return buttonMapping;
    // });

    const buttonValueMap: Ref<Record<string, { attribute: string, button: string; value: string | boolean | number | unknown; length: number }>> = ref({});

    const updateButtonMap = () => {
      const buttonMapping: Record<string, { attribute: string, button: string; value: string | boolean | number | unknown; length: number }> = {};
      attributeButtons.value.forEach((attribute) => attribute.buttons.forEach((button) => {
        if (button.displayValue) {
          if (button.segment && selectedTrackIdRef.value !== null) {
            const track = cameraStore.getAnyTrack(selectedTrackIdRef.value);
            const rangeVals = track.getFrameAttributeRanges([attribute.attrName], store.state.User.user?.login || null);
            const ranges = rangeVals[attribute.attrName];
            if (ranges && ranges.length > 0) {
              for (let i = 0; i < ranges.length; i += 2) {
                const start = ranges[i];
                const end = ranges[i + 1];
                if (frameRef.value >= start && frameRef.value <= end) {
                  const [real] = track.getFeature(start);
                  if (real && real.attributes) {
                    if (button.userAttribute && real.attributes.userAttributes) {
                      const user = store.state.User.user?.login;
                      if (user && real.attributes.userAttributes[user]) {
                        const val = ((real.attributes.userAttributes[user] as StringKeyObject)[button.attrName] as string | boolean | number);
                        buttonMapping[button.attrName] = {
                          attribute: attribute.name, button: button.attrName, value: val, length: val ? (val as string | boolean | number).toString()?.length : 0,
                        };
                      }
                    } else if (real.attributes) {
                      const val = (real.attributes[button.attrName] as string | boolean | number);
                      buttonMapping[button.attrName] = {
                        attribute: attribute.name, button: button.attrName, value: val, length: val ? (val as string | boolean | number).toString()?.length : 0,
                      };
                    }
                  }
                }
              }
            }
          } else {
            const val = getAttributeValue(button.attrName, button.type, button.userAttribute);
            buttonMapping[button.attrName] = {
              attribute: attribute.name, button: button.attrName, value: val, length: val ? (val as string | boolean | number).toString()?.length : 0,
            };
          }
        }
      }));
      buttonValueMap.value = buttonMapping;
    };

    watch([attributeButtons, frameRef, selectedTrackIdRef], () => {
      updateButtonMap();
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
      getButtonDisabled,
    };
  },
});
</script>

<template>
  <StackedVirtualSidebarContainer :width="updatedWidth" :enable-slot="false">
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
                    :color="button.disabled ? 'rgba(255, 255, 255, 0.3)' : button.color"
                    outlined
                    class="mx-2"
                    v-on="button.buttonToolTip && on"
                    @click="!button.disabled ? button.action() : () => undefined"
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
          <v-row v-if="buttonValueMap[attribute.attrName]">
            <v-col cols="12">
              <span v-if="buttonValueMap[attribute.attrName].length < 50">
                {{ buttonValueMap[attribute.attrName].value }}
              </span>
              <v-expansion-panels v-else :value="panelExpanded[attribute.attrName]">
                <v-expansion-panel class="border" @change="expandPanel(attribute.attrName)">
                  <v-expansion-panel-header>{{ attribute.name }} Value</v-expansion-panel-header>
                  <v-expansion-panel-content>
                    {{ buttonValueMap[attribute.attrName].value }}
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
