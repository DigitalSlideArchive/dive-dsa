<script lang="ts">
import {
  defineComponent, watch, PropType, Ref, ref, computed, toRef,
} from 'vue';

import { UISettingsKey } from 'vue-media-annotator/ConfigurationManager';
import { useStore } from 'platform/web-girder/store/types';
import geo, { GeoEvent } from 'geojs';
import { TrackWithContext } from '../BaseFilterControls';
import { injectAggregateController } from './annotators/useMediaController';
import RectangleLayer from '../layers/AnnotationLayers/RectangleLayer';
import PolygonLayer from '../layers/AnnotationLayers/PolygonLayer';
import PointLayer from '../layers/AnnotationLayers/PointLayer';
import LineLayer from '../layers/AnnotationLayers/LineLayer';
import TailLayer from '../layers/AnnotationLayers/TailLayer';

import EditAnnotationLayer, { EditAnnotationTypes } from '../layers/EditAnnotationLayer';
import { FrameDataTrack } from '../layers/LayerTypes';
import VideoLayer from '../layers/MediaLayers/videoLayer';
import TextLayer, { FormatTextRow } from '../layers/AnnotationLayers/TextLayer';
import AttributeLayer from '../layers/AnnotationLayers/AttributeLayer';
import AttributeBoxLayer from '../layers/AnnotationLayers/AttributeBoxLayer';
import type { AnnotationId } from '../BaseAnnotation';
import { geojsonToBound, hexToRgb } from '../utils';
import { VisibleAnnotationTypes } from '../layers';
import ToolTipLayer from '../layers/UILayers/ToolTipLayer';
import ToolTipWidget from '../layers/UILayers/ToolTipWidget.vue';
import { ToolTipWidgetData } from '../layers/UILayers/UILayerTypes';
import AttributeColorKey from '../layers/UILayers/AttributeColorKey.vue';
import {
  useHandler,
  useSelectedTrackId,
  useTrackFilters,
  useTrackStyleManager,
  useEditingMode,
  useVisibleModes,
  useSelectedKey,
  useMultiSelectList,
  useAnnotatorPreferences,
  useGroupStyleManager,
  useCameraStore,
  useSelectedCamera,
  useConfiguration,
  useAttributes,
} from '../provides';

/** LayerManager is a component intended to be used as a child of an Annotator.
 *  It provides logic for switching which layers are visible, but more importantly
 *  it maps Track objects into their respective layer representations.
 *  LayerManager emits high-level events when track features get selected or updated.
 */
export default defineComponent({
  components: {
    AttributeColorKey,
  },
  props: {
    formatTextRow: {
      type: Function as PropType<FormatTextRow | undefined>,
      default: undefined,
    },
    colorBy: {
      type: String as PropType<'group' | 'track'>,
      default: 'track',
    },
    camera: {
      type: String,
      default: 'singleCam',
    },
    overlays: {
      type: Array as PropType<
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {filename: string; id: string; url: string; metadata?: Record<string, any>}[]>,
      default: () => [],
    },
  },
  setup(props) {
    const store = useStore();
    const handler = useHandler();
    const cameraStore = useCameraStore();
    const selectedCamera = useSelectedCamera();
    const configMan = useConfiguration();
    const attributes = useAttributes();
    const getUISetting = (key: UISettingsKey) => (configMan.getUISetting(key));

    const trackStore = cameraStore.camMap.value.get(props.camera)?.trackStore;
    const groupStore = cameraStore.camMap.value.get(props.camera)?.groupStore;
    if (!trackStore || !groupStore) {
      throw Error(`TrackStore: ${trackStore} or GroupStore: ${groupStore} are undefined for camera ${props.camera}`);
    }
    const enabledTracksRef = useTrackFilters().enabledAnnotations;
    const selectedTrackIdRef = useSelectedTrackId();
    const multiSeletListRef = useMultiSelectList();
    const editingModeRef = useEditingMode();
    const visibleModesRef = useVisibleModes();
    const selectedKeyRef = useSelectedKey();
    const trackStyleManager = useTrackStyleManager();
    const groupStyleManager = useGroupStyleManager();
    const annotatorPrefs = useAnnotatorPreferences();
    const typeStylingRef = computed(() => {
      if (props.colorBy === 'group') {
        return groupStyleManager.typeStyling.value;
      }
      return trackStyleManager.typeStyling.value;
    });

    const annotator = injectAggregateController().value.getController(props.camera);
    const frameNumberRef = annotator.frame;
    const flickNumberRef = annotator.flick;

    const videoLayer = new VideoLayer({ annotator, typeStyling: typeStylingRef });

    if (props.overlays && props.overlays.length) {
      videoLayer.initialize({
        url: props.overlays[0].url,
        opacity: props.overlays[0].metadata?.opacity || 1.0,
        metadata: props.overlays[0].metadata,
      });
    }

    const rectAnnotationLayer = new RectangleLayer({
      annotator,
      stateStyling: trackStyleManager.stateStyles,
      typeStyling: typeStylingRef,
    });
    const polyAnnotationLayer = new PolygonLayer({
      annotator,
      stateStyling: trackStyleManager.stateStyles,
      typeStyling: typeStylingRef,
    });

    const lineLayer = new LineLayer({
      annotator,
      stateStyling: trackStyleManager.stateStyles,
      typeStyling: typeStylingRef,
    });
    const pointLayer = new PointLayer({
      annotator,
      stateStyling: trackStyleManager.stateStyles,
      typeStyling: typeStylingRef,
    });
    const tailLayer = new TailLayer({
      annotator,
      stateStyling: trackStyleManager.stateStyles,
      typeStyling: typeStylingRef,
    }, trackStore);

    const textLayer = new TextLayer({
      annotator,
      stateStyling: trackStyleManager.stateStyles,
      typeStyling: typeStylingRef,
      formatter: props.formatTextRow,
    });

    const attributeBoxLayer = new AttributeBoxLayer({
      annotator,
      stateStyling: trackStyleManager.stateStyles,
      typeStyling: typeStylingRef,
    });

    const attributeLayer = new AttributeLayer({
      annotator,
      stateStyling: trackStyleManager.stateStyles,
      typeStyling: typeStylingRef,
    });

    const editAnnotationLayer = new EditAnnotationLayer({
      annotator,
      stateStyling: trackStyleManager.stateStyles,
      typeStyling: typeStylingRef,
      type: 'rectangle',
    });

    const updateAttributes = () => {
      const newList = attributes.value.filter((item) => item.render).sort((a, b) => {
        if (a.render && b.render) {
          return (a.render.order - b.render.order);
        }
        return 0;
      });
      const user = store.state.User.user?.login as string || '';
      attributeLayer.updateRenderAttributes(newList, user);
      attributeBoxLayer.updateRenderAttributes(newList);
    };
    updateAttributes();

    const toolTipLayer = new ToolTipLayer(annotator);
    const hoverOvered: Ref<ToolTipWidgetData[]> = ref([]);
    const toolTipWidgetProps = {
      color: typeStylingRef.value.color,
      dataList: hoverOvered,
      selected: selectedTrackIdRef,
      stateStyling: trackStyleManager.stateStyles,
    };
    toolTipLayer.addDOMWidget('customToolTip', ToolTipWidget, toolTipWidgetProps, { x: 10, y: 10 });

    const includesAttributeKey = computed(() => visibleModesRef.value.includes('attributeKey'));
    function updateLayers(
      frame: number,
      editingTrack: false | EditAnnotationTypes,
      selectedTrackId: AnnotationId | null,
      multiSelectList: readonly AnnotationId[],
      enabledTracks: readonly TrackWithContext[],
      visibleModes: readonly VisibleAnnotationTypes[],
      selectedKey: string,
      colorBy: string,
    ) {
      const currentFrameIds: AnnotationId[] | undefined = trackStore?.intervalTree
        .search([frame, frame])
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((str: any) => parseInt(str, 10));
      const inlcudesTooltip = visibleModes.includes('tooltip');
      rectAnnotationLayer.setHoverAnnotations(inlcudesTooltip);
      polyAnnotationLayer.setHoverAnnotations(inlcudesTooltip);
      if (!inlcudesTooltip) {
        hoverOvered.value = [];
      }

      const frameData = [] as FrameDataTrack[];
      const editingTracks = [] as FrameDataTrack[];
      if (currentFrameIds === undefined) {
        return;
      }
      currentFrameIds.forEach(
        (trackId: AnnotationId) => {
          const track = trackStore?.get(trackId);
          if (track === undefined) {
            // Track may be located in another Camera
            // TODO: Find a better way to represent tracks outside of cameras
            return;
          }

          const enabledIndex = enabledTracks.findIndex(
            (trackWithContext) => trackWithContext.annotation.id === trackId,
          );
          if (enabledIndex !== -1) {
            const [features] = track.getFeature(frame);
            const groups = cameraStore.lookupGroups(track.id);
            const trackStyleType = track.getType(
              enabledTracks[enabledIndex].context.confidencePairIndex,
            );
            const groupStyleType = groups?.[0]?.getType() ?? cameraStore.defaultGroup;
            const trackFrame = {
              selected: ((selectedTrackId === track.trackId)
                || (multiSelectList.includes(track.trackId))),
              editing: editingTrack,
              track,
              groups,
              features,
              styleType: colorBy === 'group' ? groupStyleType : trackStyleType,
            };
            frameData.push(trackFrame);
            if (trackFrame.selected) {
              if (editingTrack && props.camera === selectedCamera.value) {
                editingTracks.push(trackFrame);
              }
              if (annotator.lockedCamera.value) {
                if (trackFrame.features?.bounds) {
                  const coords = {
                    x: (trackFrame.features.bounds[0] + trackFrame.features.bounds[2]) / 2.0,
                    y: (trackFrame.features.bounds[1] + trackFrame.features.bounds[3]) / 2.0,
                    z: 0,
                  };
                  annotator.centerOn(coords);
                }
              }
            }
          }
        },
      );

      if (visibleModes.includes('rectangle')) {
        //We modify rects opacity/thickness if polygons are visible or not
        rectAnnotationLayer.setDrawingOther(visibleModes.includes('Polygon'));
        rectAnnotationLayer.changeData(frameData);
      } else {
        rectAnnotationLayer.disable();
      }
      if (visibleModes.includes('Polygon')) {
        polyAnnotationLayer.setDrawingOther(visibleModes.includes('rectangle'));
        polyAnnotationLayer.changeData(frameData);
      } else {
        polyAnnotationLayer.disable();
      }
      if (visibleModes.includes('LineString')) {
        lineLayer.changeData(frameData);
      } else {
        lineLayer.disable();
      }
      if (visibleModes.includes('TrackTail')) {
        tailLayer.updateSettings(
          frame,
          annotatorPrefs.value.trackTails.before,
          annotatorPrefs.value.trackTails.after,
        );
        tailLayer.changeData(frameData);
      } else {
        tailLayer.disable();
      }
      if (visibleModes.includes('overlays')) {
        videoLayer.updateSettings(
          frame,
          annotatorPrefs.value.overlays.opacity,
          annotatorPrefs.value.overlays.colorTransparency,
          annotatorPrefs.value.overlays.colorScale,
        );
      } else {
        videoLayer.disable();
      }

      pointLayer.changeData(frameData);
      if (visibleModes.includes('text')) {
        textLayer.changeData(frameData);
        attributeBoxLayer.changeData(frameData);
        attributeLayer.changeData(frameData);
      } else {
        textLayer.disable();
        attributeLayer.disable();
        attributeBoxLayer.disable();
      }

      if (selectedTrackId !== null) {
        if ((editingTrack) && !currentFrameIds.includes(selectedTrackId)
        && props.camera === selectedCamera.value) {
          const editTrack = trackStore?.getPossible(selectedTrackId);
          if (editTrack === undefined) {
            throw new Error(`trackMap missing trackid ${selectedTrackId}`);
          }
          const [real, lower, upper] = editTrack.getFeature(frame);
          const features = real || lower || upper;
          const trackFrame = {
            selected: true,
            editing: true,
            track: editTrack,
            groups: cameraStore.lookupGroups(editTrack.id),
            features: (features && features.interpolate) ? features : null,
            styleType: cameraStore.defaultGroup, // Won't be used
          };
          editingTracks.push(trackFrame);
        }
        if (editingTracks.length) {
          if (editingTrack) {
            editAnnotationLayer.setType(editingTrack);
            editAnnotationLayer.setKey(selectedKey);
            editAnnotationLayer.changeData(editingTracks);
          }
        } else {
          editAnnotationLayer.disable();
        }
      } else {
        editAnnotationLayer.disable();
      }
    }

    /**
     * TODO: for some reason, GeoJS requires us to initialize
     * by calling the render function twice.  This is a bug.
     * https://github.com/Kitware/dive/issues/365
     */
    [1, 2].forEach(() => {
      updateLayers(
        frameNumberRef.value,
        editingModeRef.value,
        selectedTrackIdRef.value,
        multiSeletListRef.value,
        enabledTracksRef.value,
        visibleModesRef.value,
        selectedKeyRef.value,
        props.colorBy,
      );
    });

    /** Shallow watch */
    watch(
      [
        frameNumberRef,
        editingModeRef,
        enabledTracksRef,
        selectedTrackIdRef,
        multiSeletListRef,
        visibleModesRef,
        typeStylingRef,
        toRef(props, 'colorBy'),
        selectedCamera,
      ],
      () => {
        updateLayers(
          frameNumberRef.value,
          editingModeRef.value,
          selectedTrackIdRef.value,
          multiSeletListRef.value,
          enabledTracksRef.value,
          visibleModesRef.value,
          selectedKeyRef.value,
          props.colorBy,
        );
      },
    );

    /** Deep watch */
    watch(
      annotatorPrefs,
      () => {
        updateLayers(
          frameNumberRef.value,
          editingModeRef.value,
          selectedTrackIdRef.value,
          multiSeletListRef.value,
          enabledTracksRef.value,
          visibleModesRef.value,
          selectedKeyRef.value,
          props.colorBy,
        );
      },
      { deep: true },
    );

    watch(attributes, () => {
      updateAttributes();
      updateLayers(
        frameNumberRef.value,
        editingModeRef.value,
        selectedTrackIdRef.value,
        multiSeletListRef.value,
        enabledTracksRef.value,
        visibleModesRef.value,
        selectedKeyRef.value,
        props.colorBy,
      );
    });

    const Clicked = (trackId: number, editing: boolean) => {
      // If the camera isn't selected yet we ignore the click
      if (selectedCamera.value !== props.camera) {
        return;
      }
      //So we only want to pass the click whjen not in creation mode or editing mode for features
      if (editAnnotationLayer.getMode() !== 'creation' && getUISetting('UISelection')) {
        editAnnotationLayer.disable();
        const editTrack = editing && getUISetting('UIEditing') as boolean;
        handler.trackSelect(trackId, editTrack);
      }
    };

    //Sync of internal geoJS state with the application
    editAnnotationLayer.bus.$on('editing-annotation-sync', (editing: boolean) => {
      handler.trackSelect(selectedTrackIdRef.value, editing);
    });
    rectAnnotationLayer.bus.$on('annotation-clicked', Clicked);
    rectAnnotationLayer.bus.$on('annotation-right-clicked', Clicked);
    polyAnnotationLayer.bus.$on('annotation-clicked', Clicked);
    polyAnnotationLayer.bus.$on('annotation-right-clicked', Clicked);
    editAnnotationLayer.bus.$on('update:geojson', (
      mode: 'in-progress' | 'editing',
      geometryCompleteEvent: boolean,
      data: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.LineString | GeoJSON.Point>,
      type: string,
      key = '',
      cb: () => void,
    ) => {
      if (type === 'rectangle') {
        const bounds = geojsonToBound(data as GeoJSON.Feature<GeoJSON.Polygon>);
        cb();
        handler.updateRectBounds(frameNumberRef.value, flickNumberRef.value, bounds);
      } else {
        handler.updateGeoJSON(mode, frameNumberRef.value, flickNumberRef.value, data, key, cb);
      }
      // Jump into edit mode if we completed a new shape
      if (geometryCompleteEvent) {
        updateLayers(
          frameNumberRef.value,
          editingModeRef.value,
          selectedTrackIdRef.value,
          multiSeletListRef.value,
          enabledTracksRef.value,
          visibleModesRef.value,
          selectedKeyRef.value,
          props.colorBy,
        );
      }
    });
    editAnnotationLayer.bus.$on(
      'update:selectedIndex',
      (index: number, _type: EditAnnotationTypes, key = '') => handler.selectFeatureHandle(index, key),
    );
    const annotationHoverTooltip = (
      found: {
          styleType: [string, number];
          trackId: number;
          polygon: { coordinates: Array<Array<[number, number]>>};
        }[],
    ) => {
      const hoveredVals: (ToolTipWidgetData & { maxX: number})[] = [];
      found.forEach((item) => {
        // get Max of X and Min of y for ordering
        if (item.polygon.coordinates.length) {
          let maxX = -Infinity;
          let minY = Infinity;
          item.polygon.coordinates[0].forEach((coord) => {
            if (coord.length === 2) {
              maxX = Math.max(coord[0], maxX);
              minY = Math.min(coord[1], minY);
            }
          });
          hoveredVals.push({
            type: item.styleType[0],
            confidence: item.styleType[1],
            trackId: item.trackId,
            maxX,
          });
        }
      });
      hoverOvered.value = hoveredVals.sort((a, b) => a.maxX - b.maxX);
      toolTipLayer.setToolTipWidget('customToolTip', (hoverOvered.value.length > 0));
    };
    rectAnnotationLayer.bus.$on('annotation-hover', annotationHoverTooltip);
    polyAnnotationLayer.bus.$on('annotation-hover', annotationHoverTooltip);

    const generateSVGArray = (rgb: number[], variance: number) => {
      const colorVals: number[][] = [];
      for (let i = 0; i < rgb.length; i += 1) {
        const colorArray: number[] = new Array(255).fill(0);
        colorArray[rgb[i]] = 1;
        for (let j = 1; j <= variance; j += 1) {
          if (rgb[i] - j >= 0) {
            colorArray[rgb[i] - j] = 1;
          }
          if (rgb[i] + j < 255) {
            colorArray[rgb[i] + j] = 1;
          }
        }
        colorVals.push(colorArray);
      }
      return colorVals;
    };
    // Data for the video Opacity Filter:
    // Templating is there for multiple colors but only support a single coor for now
    const videoLayerTransparencyVals = computed(() => {
      const transparencyArray: number[][][] = [];
      if (annotatorPrefs.value.overlays.overrideValue) {
        const rgb = annotatorPrefs.value.overlays.overrideColor
          ? hexToRgb(annotatorPrefs.value.overlays.overrideColor) : [0, 0, 0];
        const variance = annotatorPrefs.value.overlays.overrideVariance || 0;
        const colorVals = generateSVGArray(rgb, variance);
        transparencyArray.push(colorVals);
      } else if (videoLayer.overlayMetadata.transparency) {
        videoLayer.overlayMetadata.transparency.forEach((transparencyColor) => {
          const { rgb } = transparencyColor;
          const variance = transparencyColor.variance || 0;
          const colorVals = generateSVGArray(rgb, variance);
          transparencyArray.push(colorVals);
        });
      }
      return transparencyArray;
    });
    const videoLayerColorTransparencyOn = computed(
      () => annotatorPrefs.value.overlays.colorTransparency
      || videoLayer.overlayMetadata.transparency,
    );
    const colorScaleOn = computed(
      () => !!(annotatorPrefs.value.overlays.colorScale
        || (videoLayer.overlayMetadata.colorScale)),
    );

    const colorScaleMatrix = computed(() => {
      if (annotatorPrefs.value.overlays.colorScale
        || (videoLayer.overlayMetadata.colorScale)) {
        let color2 = '#000000';
        let color1 = '#FFFFFF';
        if (annotatorPrefs.value.overlays.colorScale
          && annotatorPrefs.value.overlays.blackColorScale
          && annotatorPrefs.value.overlays.whiteColorScale) {
          color2 = annotatorPrefs.value.overlays.blackColorScale;
          color1 = annotatorPrefs.value.overlays.whiteColorScale;
        } else if (videoLayer.overlayMetadata.colorScale) {
          color2 = videoLayer.overlayMetadata.colorScale.black;
          color1 = videoLayer.overlayMetadata.colorScale.white;
        }
        if (color1 !== undefined && color2 !== undefined) {
          const rgb1 = [
            parseInt(color1.slice(1, 3), 16) / 255.0,
            parseInt(color1.slice(3, 5), 16) / 255.0,
            parseInt(color1.slice(5, 7), 16) / 255.0,
          ];
          const rgb2 = [
            parseInt(color2.slice(1, 3), 16) / 255.0,
            parseInt(color2.slice(3, 5), 16) / 255.0,
            parseInt(color2.slice(5, 7), 16) / 255.0,
          ];
          const scale = 1;
          const shift = 0;
          const matrix = [
            (rgb1[0] - rgb2[0]) * scale, 0, 0, 0, rgb2[0] * scale + shift,
            (rgb1[1] - rgb2[1]) * scale, 0, 0, 0, rgb2[1] * scale + shift,
            (rgb1[2] - rgb2[2]) * scale, 0, 0, 0, rgb2[2] * scale + shift,
            0, 0, 0, 1, 0,
          ];
          return matrix;
        }
      }
      return [];
    });

    const maxHeight = ref(annotator.geoViewerRef.value.size().height);

    annotator.geoViewerRef.value.geoOn(geo.event.resize, (e: GeoEvent) => {
      maxHeight.value = e.height as number;
    });

    return {
      videoLayerTransparencyVals,
      videoLayerColorTransparencyOn,
      colorScaleOn,
      colorScaleMatrix,
      includesAttributeKey,
      attributes,
      maxHeight,
      selectedTrackIdRef,
    };
  },
});
</script>

<template>
  <div>
    <div
      v-if="includesAttributeKey"
      style="position: absolute; top: 0px; right: 0px"
    >
      <AttributeColorKey
        :attributes="attributes"
        :max-height="maxHeight"
        :selected-track-id="selectedTrackIdRef"
      />
    </div>
    <svg
      width="0"
      height="0"
      style="position: absolute; top: -1px; left: -1px"
    >
      <defs>
        <filter
          v-if="videoLayerColorTransparencyOn && videoLayerTransparencyVals.length"
          id="color-replace"
          color-interpolation-filters="sRGB"
        >
          <!-- Replace rgb(87,78,29) with blue. -->
          <feComponentTransfer>
            <feFuncR
              type="discrete"
              :tableValues="videoLayerTransparencyVals[0][0]"
            />
            <feFuncG
              type="discrete"
              :tableValues="videoLayerTransparencyVals[0][1]"
            />
            <feFuncB
              type="discrete"
              :tableValues="videoLayerTransparencyVals[0][2]"
            />
          </feComponentTransfer>

          <feColorMatrix
            type="matrix"
            values="1 0 0 0 0
                    0 1 0 0 0
                    0 0 1 0 0
                    1 1 1 1 -3"
            result="selectedColor"
          />

          <feComposite
            operator="out"
            in="SourceGraphic"
            result="notSelectedColor"
          />
          <feFlood
            flood-color="white"
            flood-opacity="0.0"
          />
          <feComposite
            operator="in"
            in2="selectedColor"
          />
          <feComposite
            operator="over"
            in2="notSelectedColor"
          />
        </filter>
        <filter
          v-if="colorScaleOn"
          id="colorScaleFilter"
          filterUnits="objectBoundingBox"
          x="0%"
          y="0%"
          width="100%"
          height="100%"
        >
          <feColorMatrix
            id="colorScale"
            in="SourceGraphic"
            type="matrix"
            :values="colorScaleMatrix"
          />
        </filter>
      </defs>
    </svg>
  </div>
</template>
