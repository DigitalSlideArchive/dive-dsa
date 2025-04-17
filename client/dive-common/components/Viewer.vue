<!-- eslint-disable max-len -->
<script lang="ts">
import {
  defineComponent, ref, toRef, computed, Ref, reactive, watch, inject, nextTick, onBeforeUnmount,
} from 'vue';
import type { Vue } from 'vue/types/vue';
import type Vuetify from 'vuetify/lib';
import { cloneDeep } from 'lodash';

/* VUE MEDIA ANNOTATOR */
import {
  useAttributes,
  useImageEnhancements,
  useLineChart,
  useTimeObserver,
  useEventChart,
  useMasks,
} from 'vue-media-annotator/use';
import {
  Track, Group,
  CameraStore,
  StyleManager, TrackFilterControls, GroupFilterControls,
  ConfigurationManager,
} from 'vue-media-annotator/index';
import { provideAnnotator } from 'vue-media-annotator/provides';

import {
  ImageAnnotator,
  VideoAnnotator,
  LayerManager,
  useMediaController,
} from 'vue-media-annotator/components';
import type { AnnotationId } from 'vue-media-annotator/BaseAnnotation';
import { getResponseError } from 'vue-media-annotator/utils';

/* DIVE COMMON */
import PolygonBase from 'dive-common/recipes/polygonbase';
import HeadTail from 'dive-common/recipes/headtail';
import EditorMenu from 'dive-common/components/EditorMenu.vue';
import ConfidenceFilter from 'dive-common/components/ConfidenceFilter.vue';
import UserGuideButton from 'dive-common/components/UserGuideButton.vue';
import DeleteControls from 'dive-common/components/DeleteControls.vue';
import MaskEditor from 'dive-common/components/MaskEditor.vue';
import ControlsContainer from 'dive-common/components/ControlsContainer.vue';
import Sidebar from 'dive-common/components/Sidebar.vue';
import { useModeManager, useSave } from 'dive-common/use';
import clientSettingsSetup, { clientSettings } from 'dive-common/store/settings';
import {
  useApi, FrameImage, DatasetType, DatasetMeta, DatasetMetaMutable,
} from 'dive-common/apispec';
import { usePrompt } from 'dive-common/vue-utilities/prompt-service';
import context from 'dive-common/store/context';
import { DiveConfiguration, UISettingsKey } from 'vue-media-annotator/ConfigurationManager';
import ImageEnhancementsVue from 'vue-media-annotator/components/ImageEnhancements.vue';
import RevisionHistoryVue from 'platform/web-girder/views/RevisionHistory.vue';
import { useStore } from 'platform/web-girder/store/types';
import UseTimelineFilters from 'vue-media-annotator/use/useTimelineFilters';
import { checkAttributes } from 'dive-common/use/useActions';
import SlicerTaskRunnerVue from 'platform/web-girder/views/SlicerTaskRunner.vue';
import useURLParameters from 'vue-media-annotator/use/useURLParameters';
import useUINotifications from 'platform/web-girder/UIControls';
import { getLatestRevision } from 'platform/web-girder/api/annotation.service';
import { OverlayPreferences } from 'vue-media-annotator/types';
import { useRoute } from 'vue-router/composables';
import AttributeShortcutToggle from './Attributes/AttributeShortcutToggle.vue';
import GroupSidebarVue from './GroupSidebar.vue';
import MultiCamToolsVue from './MultiCamTools.vue';
import PrevNext from './PrevNext.vue';
import AttributesSideBarVue from './Attributes/AttributesSideBar.vue';
import TypeThresholdVue from './TypeThreshold.vue';
import CustomUIBase from './CustomUI/CustomUIBase.vue';
import AttributeUserReviewVue from './Attributes/AttributeUserReview.vue';
import DatasetInfo from './DatasetInfo.vue';

export interface ImageDataItem {
  url: string;
  filename: string;
}

export default defineComponent({
  components: {
    ControlsContainer,
    DeleteControls,
    MaskEditor,
    Sidebar,
    LayerManager,
    VideoAnnotator,
    ImageAnnotator,
    ConfidenceFilter,
    UserGuideButton,
    EditorMenu,
    AttributeShortcutToggle,
    PrevNext,
  },

  // TODO: remove this in vue 3
  props: {
    id: {
      type: String,
      required: true,
    },
    revision: {
      type: Number,
      default: undefined,
    },
    readOnlyMode: {
      type: Boolean,
      default: false,
    },
  },
  setup(props, ctx) {
    const { prompt } = usePrompt();
    const loadError = ref('');
    const baseMulticamDatasetId = ref(null as string | null);
    const datasetId = toRef(props, 'id');
    const multiCamList: Ref<string[]> = ref(['singleCam']);
    const defaultCamera = ref('singleCam');
    const playbackComponent = ref(undefined as Vue | undefined);
    const readonlyState = computed(() => props.readOnlyMode || props.revision !== undefined);
    const {
      aggregateController,
      onResize,
      clear: mediaControllerClear,
    } = useMediaController();
    const { time, updateTime, initialize: initTime } = useTimeObserver();
    const route = useRoute();
    const imageData = ref({ singleCam: [] } as Record<string, FrameImage[]>);
    const datasetType: Ref<DatasetType> = ref('image-sequence');
    const datasetName = ref('');
    const saveInProgress = ref(false);
    const videoUrl: Ref<Record<string, string>> = ref({});
    const latestRevisionId = ref(0); // Latest Revision from the revision endpoint if the revision prop is 0
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const overlays: Ref<Readonly<{url: string; filename: string; id: string; metadata?: Record<string, any>}[] | undefined>> = ref(undefined);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mediaMasks: Ref<Readonly<{url: string; filename: string; id: string; metadata?: Record<string, any>}[] | undefined>> = ref(undefined);

    const {
      loadDetections, loadMetadata, saveMetadata, saveConfiguration, transferConfiguration,
    } = useApi();
    const progress = reactive({
      // Loaded flag prevents annotator window from populating
      // with stale data from props, for example if a persistent store
      // like vuex is used to drive them.
      loaded: false,
      // Tracks loaded
      progress: 0,
      // Total tracks
      total: 0,
    });
    const controlsRef = ref();
    const controlsHeight = ref(0);
    const controlsCollapsed = ref(false);

    const progressValue = computed(() => {
      if (progress.total > 0 && (progress.progress !== progress.total)) {
        return Math.round((progress.progress / progress.total) * 100);
      }
      return 0;
    });

    /**
     * Annotation window style source based on value of timeline visualization
     */
    const colorBy = computed(() => {
      if (controlsRef.value?.currentView === 'Groups') {
        return 'group';
      }
      return 'track';
    });

    const store = useStore();

    const {
      save: saveToServer,
      markChangesPending,
      discardChanges,
      pendingSaveCount,
      addCamera: addSaveCamera,
      removeCamera: removeSaveCamera,
      configurationId,
      setConfigurationId,
    } = useSave(datasetId, readonlyState);

    const {
      imageEnhancements,
      brightness,
      intercept,
      setSVGFilters,
    } = useImageEnhancements();

    const recipes = [
      new PolygonBase(),
      new HeadTail(),
    ];

    watch(() => route.query, (newQuery) => {
      if (newQuery.selectedTrackId) {
        const selectedTrackId = parseInt(newQuery.selectedTrackId as string, 10);
        if (progress.loaded) {
          globalHandler.trackSelect(selectedTrackId);
        }
      }
    });

    const vuetify = inject('vuetify') as Vuetify;
    const trackStyleManager = new StyleManager({ markChangesPending, vuetify });
    const groupStyleManager = new StyleManager({ markChangesPending, vuetify });

    const cameraStore = new CameraStore({ markChangesPending });
    // eslint-disable-next-line max-len
    const configurationManager = new ConfigurationManager({
      configurationId, setConfigurationId, saveConfiguration, transferConfiguration,
    });

    // This context for removal
    const removeGroups = (id: AnnotationId) => {
      cameraStore.removeGroups(id);
    };
    const groupFilters = new GroupFilterControls({
      sorted: cameraStore.sortedGroups,
      markChangesPending,
      remove: removeGroups,
    });

    // This context for removal
    const removeTracks = (id: AnnotationId) => {
      cameraStore.removeTracks(id);
    };
    const trackFilters = new TrackFilterControls({
      sorted: cameraStore.sortedTracks,
      remove: removeTracks,
      markChangesPending,
      lookupGroups: cameraStore.lookupGroups,
      groupFilterControls: groupFilters,
    });

    clientSettingsSetup(trackFilters.allTypes);

    function rgbToHex(r: number, g: number, b: number) {
      // eslint-disable-next-line no-bitwise, no-mixed-operators
      return `#${(1 << 24 | r << 16 | g << 8 | b).toString(16).slice(1)}`;
    }

    watch(overlays, () => {
      // Make sure clientSettings utilize overlays
      const tempOverlay: OverlayPreferences[] = [];
      if (overlays.value?.length) {
        for (let i = 0; i < overlays.value.length; i += 1) {
          const overlayData = overlays.value[i].metadata || {};
          let transparentHex = '#000000';
          if (overlayData.transparency?.length) {
            const baseHex = overlayData.transparency[0].rgb;
            transparentHex = rgbToHex(baseHex[0], baseHex[1], baseHex[2]);
          }
          let blackHex = '#000000';
          let whiteHex = '#FFFFFF';
          if (overlayData.colorScale) {
            blackHex = overlayData.colorScale.black;
            whiteHex = overlayData.colorScale.white;
          }
          tempOverlay.push({
            name: overlays.value[i]?.metadata?.name || overlays.value[i].filename,
            enabled: i === 0,
            opacity: clientSettings.annotatorPreferences.overlays[i]?.opacity || 25,
            colorTransparency: !!(overlayData.transparency),
            overrideValue: !!(overlayData.transparency),
            overrideColor: transparentHex,
            overrideVariance: (overlayData.transparency?.variance || 0),
            colorScale: !!(overlayData.colorScale),
            blackColorScale: blackHex,
            whiteColorScale: whiteHex,
          });
        }
      }
      clientSettings.annotatorPreferences.overlays = tempOverlay;
    });

    // Provides wrappers for actions to integrate with settings
    const {
      linkingTrack,
      linkingCamera,
      multiSelectList,
      multiSelectActive,
      selectedFeatureHandle,
      selectedTrackId,
      editingGroupId,
      handler,
      editingMode,
      editingDetails,
      visibleModes,
      selectedKey,
      selectedCamera,
      editingTrack,
    } = useModeManager({
      recipes,
      trackFilterControls: trackFilters,
      groupFilterControls: groupFilters,
      cameraStore,
      aggregateController,
      readonlyState,
    });

    const {
      attributesList: attributes,
      loadAttributes,
      loadTimelines,
      loadSwimlanes,
      loadFilters,
      setAttribute,
      deleteAttribute,
      attributeFilters,
      deleteAttributeFilter,
      addAttributeFilter,
      modifyAttributeFilter,
      sortAndFilterAttributes,
      setTimelineEnabled,
      setTimelineGraph,
      setTimelineDefault,
      removeTimelineFilter,
      attributeTimelineData,
      timelineGraphs,
      timelineEnabled,
      timelineDefault,
      setSwimlaneEnabled,
      setSwimlaneGraph,
      setSwimlaneDefault,
      removeSwimlaneFilter,
      attributeSwimlaneData,
      swimlaneGraphs,
      swimlaneEnabled,
      swimlaneDisplaySettings,
      swimlaneDefault,
      getAttributeValueColor,
      attributeKeyVisible,
    } = useAttributes({
      markChangesPending,
      trackStyleManager,
      selectedTrackId,
      cameraStore,
      pendingSaveCount,
      login: store.state.User.user?.login || '',
    });

    const {
      initializeMaskData,
      setFrameRate,
      getMask,
      getFolderRLEMasks,
    } = useMasks(time.frame);

    const allSelectedIds = computed(() => {
      const selected = selectedTrackId.value;
      if (selected !== null) {
        return multiSelectList.value.concat(selected);
      }
      return multiSelectList.value;
    });

    const { lineChartData } = useLineChart({
      enabledTracks: trackFilters.enabledAnnotations,
      typeStyling: trackStyleManager.typeStyling,
      allTypes: trackFilters.allTypes,
    });

    const { eventChartData } = useEventChart({
      enabledTracks: trackFilters.enabledAnnotations,
      selectedTrackIds: allSelectedIds,
      typeStyling: trackStyleManager.typeStyling,
    });

    const { eventChartData: groupChartData } = useEventChart({
      enabledTracks: groupFilters.enabledAnnotations,
      typeStyling: groupStyleManager.typeStyling,
      selectedTrackIds: computed(() => {
        if (editingGroupId.value !== null) {
          return [editingGroupId.value];
        }
        return [];
      }),
    });

    const useTimelineFilters = UseTimelineFilters({
      enabledTracks: trackFilters.enabledAnnotations,
      selectedTrackIds: allSelectedIds,
      typeStyling: trackStyleManager.typeStyling,
      checkAttributes,
    });

    async function trackSplit(trackId: AnnotationId | null, frame: number) {
      if (typeof trackId === 'number') {
        const track = cameraStore.getTrack(trackId, selectedCamera.value);
        const groups = cameraStore.lookupGroups(trackId);
        let newtracks: [Track, Track];
        try {
          newtracks = track.split(frame, cameraStore.getNewTrackId(), cameraStore.getNewTrackId() + 1);
        } catch (err) {
          await prompt({
            title: 'Error while splitting track',
            text: err as string,
            positiveButton: 'OK',
          });
          return;
        }
        const result = await prompt({
          title: 'Confirm',
          text: 'Do you want to split the selected track?',
          confirm: true,
        });
        if (!result) {
          return;
        }
        const wasEditing = editingTrack.value;
        handler.trackSelect(null);
        const trackStore = cameraStore.camMap.value.get(selectedCamera.value)?.trackStore;
        if (trackStore) {
          trackStore.remove(trackId);
          trackStore.insert(newtracks[0]);
          trackStore.insert(newtracks[1]);
        }
        if (groups.length) {
          // If the track belonged to groups, add the new tracks
          // to the same groups the old tracks belonged to.
          const groupStore = cameraStore.camMap.value.get(selectedCamera.value)?.groupStore;
          if (groupStore) {
            groupStore.trackRemove(trackId);
            groups.forEach((group) => {
              group.removeMembers([trackId]);
              group.addMembers({
                [newtracks[0].id]: { ranges: [[newtracks[0].begin, newtracks[0].end]] },
                [newtracks[1].id]: { ranges: [[newtracks[1].begin, newtracks[1].end]] },
              });
            });
          }
        }
        handler.trackSelect(newtracks[1].id, wasEditing);
      }
    }

    // Remove a track from within a camera multi-track into it's own track
    function unlinkCameraTrack(trackId: AnnotationId, camera: string) {
      const track = cameraStore.getTrack(trackId, camera);
      handler.trackSelect(null, false);
      const newTrack = Track.fromJSON({
        id: cameraStore.getNewTrackId(),
        meta: track.meta,
        begin: track.begin,
        end: track.end,
        features: track.features,
        confidencePairs: track.confidencePairs,
        attributes: track.attributes,
      });
      handler.removeTrack([trackId], true, camera);
      const trackStore = cameraStore.camMap.value.get(camera)?.trackStore;
      if (trackStore) {
        trackStore.insert(newTrack, { imported: false });
      }
      handler.trackSelect(newTrack.trackId);
    }
    /**
     * Takes a BaseTrack and a merge Track and will attempt to merge the existing track
     * into the camera and baseTrack.
     * Requires that baseTrack doesn't have a track for the camera already
     * Also requires that the mergeTrack isn't a track across multiple cameras.
     */
    function linkCameraTrack(baseTrack: AnnotationId, linkTrack: AnnotationId, camera: string) {
      cameraStore.camMap.value.forEach((subCamera, key) => {
        const { trackStore } = subCamera;
        if (trackStore && trackStore.getPossible(linkTrack) && key !== camera) {
          throw Error(`Attempting to link Track: ${linkTrack} to camera: ${camera} where there the track exists in another camera: ${key}`);
        }
      });
      const track = cameraStore.getTrack(linkTrack, camera);
      const selectedTrack = cameraStore.getAnyTrack(baseTrack);
      handler.removeTrack([linkTrack], true, camera);
      const newTrack = Track.fromJSON({
        id: baseTrack,
        meta: track.meta,
        begin: track.begin,
        end: track.end,
        features: track.features,
        confidencePairs: selectedTrack.confidencePairs,
        attributes: track.attributes,
      });
      const trackStore = cameraStore.camMap.value.get(camera)?.trackStore;
      if (trackStore) {
        trackStore.insert(newTrack, { imported: false });
      }
      handler.trackSelect(newTrack.id);
    }
    watch(linkingTrack, () => {
      if (linkingTrack.value !== null && selectedTrackId.value !== null) {
        linkCameraTrack(selectedTrackId.value, linkingTrack.value, linkingCamera.value);
        handler.stopLinking();
      }
    });
    async function save() {
      // If editing the track, disable editing mode before save
      saveInProgress.value = true;
      if (editingTrack.value) {
        handler.trackSelect(selectedTrackId.value, false);
      }
      try {
        await saveToServer({
          customTypeStyling: trackStyleManager.getTypeStyles(trackFilters.allTypes),
          customGroupStyling: groupStyleManager.getTypeStyles(groupFilters.allTypes),
          confidenceFilters: trackFilters.confidenceFilters.value,
          // TODO Group confidence filters are not yet supported.
        });
        const revisions = (await getLatestRevision(datasetId.value)).data;
        if (revisions.length) {
          latestRevisionId.value = revisions[0].revision;
        }
      } catch (err) {
        let text = 'Unable to Save Data';
        if (err.response && err.response.status === 403) {
          text = 'You do not have permission to Save Data to this Folder.';
        }
        await prompt({
          title: 'Error while Saving Data',
          text,
          positiveButton: 'OK',
        });
        saveInProgress.value = false;
        throw err;
      }
      saveInProgress.value = false;
    }

    function saveThreshold() {
      saveMetadata(datasetId.value, {
        confidenceFilters: trackFilters.confidenceFilters.value,
      });
    }

    // Navigation Guards used by parent component
    async function warnBrowserExit(event: BeforeUnloadEvent) {
      if (pendingSaveCount.value === 0) return;
      event.preventDefault();
      // eslint-disable-next-line no-param-reassign
      event.returnValue = '';
    }
    async function navigateAwayGuard(): Promise<boolean> {
      let result = true;
      if (pendingSaveCount.value > 0) {
        result = await prompt({
          title: 'Save Items',
          text: 'There is unsaved data, would you like to continue or cancel and save?',
          positiveButton: 'Discard and Leave',
          negativeButton: 'Don\'t Leave',
          confirm: true,
        });
      }
      return result;
    }

    const selectCamera = async (camera: string, editMode = false) => {
      if (linkingCamera.value !== '' && linkingCamera.value !== camera) {
        await prompt({
          title: 'In Linking Mode',
          text: ['Currently in Linking Mode, please hit OK and Escape to exit',
            'Linking mode or choose another Track in the highlighted Camera to Link'],
          positiveButton: 'OK',
        });
        return;
      }
      // EditTrack is set false by the LayerMap before executing this
      if (selectedTrackId.value !== null) {
        // If we had a track selected and it still exists with
        // a feature length of 0 we need to remove it
        const track = cameraStore.getPossibleTrack(selectedTrackId.value, selectedCamera.value);
        if (track && track.features.length === 0) {
          handler.trackAbort();
        }
      }
      selectedCamera.value = camera;
      /**
       * Enters edit mode if no track exists for the camera and forcing edit mode
       * or if a track exists and are alrady in edit mode we don't set it again
       * Remember trackEdit(number) is a toggle for editing mode
       */
      if (selectedTrackId.value !== null && (editMode || editingTrack.value)) {
        const track = cameraStore.getPossibleTrack(selectedTrackId.value, selectedCamera.value);
        if (track === undefined || !editingTrack.value) {
        //Stay in edit mode for the current track
          handler.trackEdit(selectedTrackId.value);
        }
      }
      ctx.emit('change-camera', camera);
    };
    // Handles changing camera using the dropdown or mouse clicks
    // When using mouse clicks and right button it will remain in edit mode for the selected track
    const changeCamera = (camera: string, event?: MouseEvent) => {
      if (selectedCamera.value === camera) {
        return;
      }
      if (event) {
        event.preventDefault();
      }
      // Left click should kick out of editing mode automatically
      if (event?.button === 0) {
        editingTrack.value = false;
      }
      selectCamera(camera, event?.button === 2);
      ctx.emit('change-camera', camera);
    };

    const initializeConfig = (config: { metadata: DatasetMeta & DatasetMetaMutable;
    diveConfig: DiveConfiguration & {metadata: DatasetMetaMutable}; }) => {
      const meta = config.metadata;
      const configMeta = Object.keys(config.diveConfig.metadata).length ? config.diveConfig.metadata : config.metadata;
      if (config.diveConfig.prevNext) {
        configurationManager.setPrevNext(config.diveConfig.prevNext);
      }
      if (config.diveConfig.hierarchy) {
        configurationManager.setHierarchy(config.diveConfig.hierarchy);
      }
      if (config.diveConfig.configOwners) {
        configurationManager.setConfigOwners(config.diveConfig.configOwners);
      }
      if (config.diveConfig.metadata.configuration) {
        configurationManager.setConfiguration(
          config.diveConfig.metadata.configuration,
        );

        if (config.diveConfig.metadata.configuration.general?.baseConfiguration) {
          configurationManager.setConfigurationId(
            config.diveConfig.metadata.configuration.general.baseConfiguration,
          );
        }
        if (config.diveConfig.metadata.configuration.filterTimelines) {
          useTimelineFilters.loadFilterTimelines(config.diveConfig.metadata.configuration.filterTimelines);
        }
      }
      const flatUIMap = configurationManager.getFlatUISettingMap();
      ctx.emit('get-ui-settings', flatUIMap);
      return { meta, configMeta };
    };
    /** Trigger data load */
    const loadData = async () => {
      try {
        // Close and reset sideBar
        context.resetActive();
        let config = await loadMetadata(datasetId.value);
        if (props.revision > 0) {
          latestRevisionId.value = props.revision;
        } else {
          const revisionInfo = (await getLatestRevision(datasetId.value)).data;
          if (revisionInfo.length > 0) {
            latestRevisionId.value = revisionInfo[0].revision;
          }
        }

        let { meta, configMeta } = initializeConfig(config);
        // Sets a configuration if it isn't initialized and reloads it
        if (!configurationManager.configuration.value) {
          configurationManager.saveConfiguration(datasetId.value, configMeta.configuration);
          config = await loadMetadata(datasetId.value);
          const initResults = initializeConfig(config);
          meta = initResults.meta;
          configMeta = initResults.configMeta;
        }
        const defaultCameraMeta = meta.multiCamMedia?.cameras[meta.multiCamMedia.defaultDisplay];
        baseMulticamDatasetId.value = datasetId.value;
        if (defaultCameraMeta !== undefined && meta.multiCamMedia) {
          /* We're loading a multicamera dataset */
          const { cameras } = meta.multiCamMedia;
          multiCamList.value = Object.keys(cameras);
          defaultCamera.value = meta.multiCamMedia.defaultDisplay;
          changeCamera(defaultCamera.value);
          baseMulticamDatasetId.value = datasetId.value;
          if (!selectedCamera.value) {
            throw new Error('Multicamera dataset without default camera specified.');
          }
        }
        /* Otherwise, complete loading of the dataset */
        trackStyleManager.populateTypeStyles(meta.customTypeStyling);
        groupStyleManager.populateTypeStyles(meta.customGroupStyling);
        if (configMeta.customTypeStyling) {
          trackFilters.importTypes(Object.keys(configMeta.customTypeStyling), false);
          trackStyleManager.populateTypeStyles(configMeta.customTypeStyling);
        }
        if (configMeta.customGroupStyling) {
          groupFilters.importTypes(Object.keys(configMeta.customGroupStyling), false);
          groupStyleManager.populateTypeStyles(configMeta.customGroupStyling);
        }
        if (configMeta.attributes) {
          loadAttributes(configMeta.attributes);
        }
        if (configMeta.timelines) {
          loadTimelines(configMeta.timelines);
        }
        if (configMeta.swimlanes) {
          loadSwimlanes(configMeta.swimlanes);
        }
        if (configMeta.filters) {
          loadFilters(configMeta.filters);
        }
        trackFilters.setConfidenceFilters(configMeta.confidenceFilters);
        datasetName.value = meta.name;
        initTime({
          frameRate: meta.fps,
          originalFps: meta.originalFps || null,
        });
        for (let i = 0; i < multiCamList.value.length; i += 1) {
          const camera = multiCamList.value[i];
          let cameraId = baseMulticamDatasetId.value;
          if (multiCamList.value.length > 1) {
            cameraId = `${baseMulticamDatasetId.value}/${camera}`;
          }
          // eslint-disable-next-line no-await-in-loop
          const subCameraMeta = (await loadMetadata(cameraId)).metadata;
          datasetType.value = subCameraMeta.type as DatasetType;

          imageData.value[camera] = cloneDeep(subCameraMeta.imageData) as FrameImage[];
          if (subCameraMeta.videoUrl) {
            videoUrl.value[camera] = subCameraMeta.videoUrl;
          }
          if (subCameraMeta.overlays) {
            overlays.value = subCameraMeta.overlays;
          }
          if (subCameraMeta.masks) {
            mediaMasks.value = subCameraMeta.masks;
          }
          cameraStore.addCamera(camera);
          addSaveCamera(camera);
          if (mediaMasks.value?.length) {
            setFrameRate(meta.fps);
            initializeMaskData({ masks: mediaMasks.value });
            getFolderRLEMasks(cameraId);
          }

          // eslint-disable-next-line no-await-in-loop
          const { tracks, groups } = await loadDetections(cameraId, props.revision);
          progress.total = tracks.length + groups.length;
          const trackStore = cameraStore.camMap.value.get(camera)?.trackStore;
          const groupStore = cameraStore.camMap.value.get(camera)?.groupStore;
          if (trackStore && groupStore) {
            for (let j = 0; j < tracks.length; j += 1) {
              if (j % 4000 === 0) {
              /* Every N tracks, yeild some cycles for other scheduled tasks */
                progress.progress = j;
                // eslint-disable-next-line no-await-in-loop
                await new Promise((resolve) => window.setTimeout(resolve, 500));
              }
              trackStore.insert(Track.fromJSON(tracks[j]), { imported: true });
            }
            for (let j = 0; j < groups.length; j += 1) {
              if (j % 4000 === 0) {
              /* Every N tracks, yeild some cycles for other scheduled tasks */
                progress.progress = tracks.length + j;
                // eslint-disable-next-line no-await-in-loop
                await new Promise((resolve) => window.setTimeout(resolve, 500));
              }
              groupStore.insert(Group.fromJSON(groups[j]), { imported: true });
            }
          }
        }
        progress.loaded = true;
        cameraStore.camMap.value.forEach((_cam, key) => {
          if (!multiCamList.value.includes(key)) {
            cameraStore.removeCamera(key);
            removeSaveCamera(key);
          }
        });
        // If multiCam add Tools and remove group Tools
        if (cameraStore.camMap.value.size > 1) {
          context.unregister({
            description: 'Group Manager',
            component: GroupSidebarVue,
            width: 300,
          });
          context.register({
            component: MultiCamToolsVue,
            description: 'Multi Camera Tools',
            width: 300,
          });
        } else {
          context.unregister({
            component: MultiCamToolsVue,
            description: 'Multi Camera Tools',
          });
          context.register({
            description: 'Group Manager',
            component: GroupSidebarVue,
          });
        }
        if (!configurationManager.getUISetting('UISlicerCLI')) {
          context.unregister({
            description: 'Slicer Tasks',
            component: SlicerTaskRunnerVue,
          });
        }

        if (!configurationManager.getUISetting('UIGroupManager')) {
          context.unregister({
            description: 'Group Manager',
            component: GroupSidebarVue,
          });
        }
        if (!configurationManager.getUISetting('UIImageEnhancements')) {
          context.unregister({
            description: 'Image Enhancmentsr',
            component: ImageEnhancementsVue,
          });
        }
        if (!configurationManager.getUISetting('UIAttributeDetails')) {
          context.unregister({
            description: 'Attrbute Details',
            component: AttributesSideBarVue,
          });
        }
        if (!configurationManager.getUISetting('UIAttributeUserReview')) {
          context.unregister({
            description: 'Attribute User Review',
            component: AttributeUserReviewVue,
          });
        }
        if (!configurationManager.getUISetting('UIDatasetInfo')) {
          context.unregister({
            description: 'Dataset Info',
            component: DatasetInfo,
          });
        }

        if (!configurationManager.getUISetting('UIThresholdControls')) {
          context.unregister({
            description: 'Threshold Controls',
            component: TypeThresholdVue,
          });
        }
        if (!configurationManager.getUISetting('UIRevisionHistory')) {
          context.unregister({
            description: 'Revision History',
            component: RevisionHistoryVue,
          });
        }
        if (configurationManager.configuration.value?.customUI) {
          context.register({
            description: configurationManager.configuration.value.customUI.title || 'CustomUI',
            width: configurationManager.configuration.value.customUI.width,
            component: CustomUIBase,
          });
        }
        context.resetActive();
      } catch (err) {
        progress.loaded = false;
        console.error(err);
        const errorEl = document.createElement('div');
        errorEl.innerHTML = getResponseError(err);
        loadError.value = errorEl.innerText
          .concat(". If you don't know how to resolve this, please contact the server administrator.");
        throw err;
      }
      if (attributeKeyVisible.value) {
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        globalHandler.setAnnotationState({ visible: ['rectangle', 'Polygon', 'LineString', 'text', 'attributeKey'] });
      }
      nextTick(() => {
        useURLParameters(
          aggregateController.value.frame,
          selectedTrackId,
          mediaLoaded,
          handler.trackSelect,
          aggregateController.value.seek,
        );
        if (!getUISetting('UIContextBarDefaultNotOpen')) {
          context.toggle();
        }
      });
    };
    loadData();
    const reloadAnnotations = async () => {
      progress.loaded = false;
      mediaControllerClear();
      cameraStore.clearAll();
      discardChanges();
      await loadData();
    };
    const uiNotification = useUINotifications({
      prompt, handler, aggregateController, reloadAnnotations, datasetId,
    });

    watch(datasetId, reloadAnnotations);
    watch(readonlyState, () => handler.trackSelect(null, false));

    function handleResize() {
      if (controlsRef.value) {
        controlsHeight.value = controlsRef.value.$el.clientHeight;
        onResize();
      }
    }
    const observer = new ResizeObserver(handleResize);
    /* On a reload this will watch the controls element and add on observer
     * so that once done loading the or if the controlsRef is collapsed it will resize all cameras
    */
    watch(controlsRef, (previous) => {
      if (previous) observer.unobserve(previous.$el);
      if (controlsRef.value) observer.observe(controlsRef.value.$el);
    });
    watch(controlsCollapsed, async () => {
      await nextTick();
      handleResize();
    });
    onBeforeUnmount(() => {
      if (controlsRef.value) observer.unobserve(controlsRef.value.$el);
    });

    const updateTimelineHeight = async () => {
      await nextTick();
      handleResize();
    };
    const globalHandler = {
      ...handler,
      save,
      trackSplit,
      setAttribute,
      deleteAttribute,
      reloadAnnotations,
      setSVGFilters,
      selectCamera,
      linkCameraTrack,
      unlinkCameraTrack,
      setConfigurationId,
    };

    const useAttributeFilters = {
      attributeFilters,
      addAttributeFilter,
      deleteAttributeFilter,
      modifyAttributeFilter,
      sortAndFilterAttributes,
      setTimelineEnabled,
      setTimelineGraph,
      setTimelineDefault,
      removeTimelineFilter,
      attributeTimelineData,
      timelineGraphs,
      timelineEnabled,
      timelineDefault,
      setSwimlaneEnabled,
      setSwimlaneGraph,
      setSwimlaneDefault,
      removeSwimlaneFilter,
      attributeSwimlaneData,
      swimlaneGraphs,
      swimlaneEnabled,
      swimlaneDisplaySettings,
      swimlaneDefault,
      getAttributeValueColor,
    };

    provideAnnotator(
      {
        annotatorPreferences: toRef(clientSettings, 'annotatorPreferences'),
        attributes,
        configurationManager,
        uiNotification,
        cameraStore,
        datasetId,
        editingMode,
        groupFilters,
        groupStyleManager,
        multiSelectList,
        pendingSaveCount,
        progress,
        revisionId: toRef(props, 'revision'),
        latestRevisionId,
        selectedCamera,
        selectedKey,
        selectedTrackId,
        editingGroupId,
        time,
        trackFilters,
        trackStyleManager,
        visibleModes,
        readOnlyMode: readonlyState,
        imageEnhancements,
        masks: { getMask },
      },
      globalHandler,
      useAttributeFilters,
      useTimelineFilters,
    );

    const { visible } = usePrompt();

    const getUISetting = (key: UISettingsKey) => configurationManager.getUISetting(key);
    const mediaLoaded = ref(false);
    const runActions = () => {
      mediaLoaded.value = true;
      if (configurationManager.configuration.value?.actions) {
        const { actions } = configurationManager.configuration.value;
        for (let i = 0; i < actions.length; i += 1) {
          handler.processAction(actions[i]);
        }
      }
    };

    return {
      /* props */
      aggregateController,
      confidenceFilters: trackFilters.confidenceFilters,
      cameraStore,
      controlsRef,
      controlsHeight,
      controlsCollapsed,
      colorBy,
      clientSettings,
      datasetName,
      datasetType,
      editingTrack,
      editingMode,
      editingDetails,
      eventChartData,
      groupChartData,
      imageData,
      lineChartData,
      loadError,
      multiSelectActive,
      pendingSaveCount,
      progress,
      progressValue,
      saveInProgress,
      playbackComponent,
      recipes,
      selectedFeatureHandle,
      selectedTrackId,
      editingGroupId,
      selectedKey,
      trackFilters,
      videoUrl,
      overlays,
      visibleModes,
      frameRate: time.frameRate,
      originalFps: time.originalFps,
      context,
      readonlyState,
      brightness,
      intercept,
      attributeKeyVisible,
      /* methods */
      handler: globalHandler,
      save,
      saveThreshold,
      updateTime,
      updateTimelineHeight,
      // multicam
      multiCamList,
      defaultCamera,
      selectedCamera,
      changeCamera,
      // For Navigation Guarding
      navigateAwayGuard,
      warnBrowserExit,
      reloadAnnotations,
      visible,
      getUISetting,
      runActions,
    };
  },
});
</script>

<template>
  <v-main class="viewer">
    <v-app-bar
      app
      class="flex-nowrap"
    >
      <slot name="title" />
      <prev-next
        v-if="getUISetting('UINextPrev')"
        class="pr-2"
      >
        <template #middle>
          <slot name="prevnextmiddle" />
        </template>
      </prev-next>
      <span
        class="title pl-3 flex-row"
        style="white-space:nowrap;overflow:hidden;text-overflow: ellipsis;"
      >
        {{ datasetName }}
        <div
          v-if="readonlyState"
          class="mx-auto my-0 pa-0"
          style="line-height:0.2em;"
        >
          <v-tooltip
            bottom
          >
            <template #activator="{ on }">
              <v-chip
                class="warning pr-1"
                style="white-space:nowrap;display:inline"
                small
                v-on="on"
              >
                Read Only Mode
                <v-icon
                  class="pl-1"
                  small
                >mdi-information-outline</v-icon>
              </v-chip>
            </template>
            <span>Read Only Mode: Editing, Deleting and Importing actions are disabled</span>
          </v-tooltip>
        </div>
      </span>
      <v-spacer />
      <template #extension>
        <EditorMenu
          v-if="getUISetting('UIToolBar')"
          v-bind="{
            editingMode,
            visibleModes,
            editingTrack,
            recipes,
            multiSelectActive,
            editingDetails,
            overlays,
            groupEditActive: editingGroupId !== null,
          }"
          :get-u-i-setting="getUISetting"
          :tail-settings.sync="clientSettings.annotatorPreferences.trackTails"
          :overlay-settings.sync="clientSettings.annotatorPreferences.overlays"
          :attribute-key="attributeKeyVisible"
          @set-annotation-state="handler.setAnnotationState"
          @exit-edit="handler.trackAbort"
        >
          <template slot="delete-controls">
            <delete-controls
              v-bind="{ editingMode, selectedFeatureHandle }"
              class="mr-2"
              @delete-point="handler.removePoint"
              @delete-annotation="handler.removeAnnotation"
              @toggle-time="handler.toggleKeyFrame"
            />
          </template>
          <template slot="additional-controls">
            <MaskEditor v-if="editingMode === 'Mask'" />
          </template>
        </EditorMenu>
        <v-spacer v-else />
        <v-select
          v-if="multiCamList.length > 1"
          :value="selectedCamera"
          :items="multiCamList"
          label="Camera"
          class="shrink"
          style="width: 180px;"
          outlined
          hide-details
          dense
          @change="changeCamera"
        >
          <template #item="{ item }">
            {{ item }} {{ item === defaultCamera ? '(Default)' : '' }}
          </template>
        </v-select>
        <v-divider
          vertical
          class="mx-2"
        />
        <v-icon
          v-if="getUISetting('UIContextBar') && Object.values(context.componentMap).length && getUISetting('UIContextBarNotStatic')"
          @click="context.toggle()"
        >
          {{ context.state.active ? 'mdi-chevron-right-box' : 'mdi-chevron-left-box' }}
        </v-icon>

        <slot name="extension-right" />
      </template>

      <slot name="title-right" />
      <user-guide-button annotating />
      <attribute-shortcut-toggle
        v-if="getUISetting('UIKeyboardShortcuts')"
        class="pr-1"
        :hotkeys-disabled="visible() || readonlyState"
      />

      <v-tooltip
        v-if="getUISetting('UISave')"
        bottom
        :disabled="!readonlyState"
      >
        <template #activator="{ on }">
          <v-badge
            overlap
            bottom
            :color="readonlyState ? 'warning' : undefined"
            :icon="readonlyState ? 'mdi-exclamation-thick' : undefined"
            :content="!readonlyState ? pendingSaveCount : undefined"
            :value="readonlyState || pendingSaveCount > 0"
            offset-x="14"
            offset-y="18"
          >
            <div v-on="on">
              <v-btn
                icon
                :disabled="readonlyState || pendingSaveCount === 0 || saveInProgress"
                @click="save"
              >
                <v-icon>mdi-content-save</v-icon>
              </v-btn>
            </div>
          </v-badge>
        </template>
        <span>Read only mode, cannot save changes</span>
      </v-tooltip>
    </v-app-bar>

    <v-row
      no-gutters
      class="fill-height"
      style="min-width: 700px;"
    >
      <sidebar
        v-if="getUISetting('UISideBar')"
        :enable-slot="context.state.active !== 'TypeThreshold'"
        @import-types="trackFilters.importTypes($event)"
        @track-seek="aggregateController.seek($event)"
      >
        <template v-if="context.state.active !== 'TypeThreshold'">
          <v-divider />
          <ConfidenceFilter
            v-if="getUISetting('UIConfidenceThreshold')"
            class="ma-2 mb-0"
            :confidence.sync="confidenceFilters.default"
            @end="saveThreshold"
          >
            <a
              v-if="getUISetting('UIThresholdControls')"
              style="text-decoration: underline; color: white;"
              @click="context.toggle('TypeThreshold')"
            >
              Advanced
            </a>
          </ConfidenceFilter>
        </template>
      </sidebar>
      <v-col
        style="position: relative;"
        class="d-flex flex-column grow"
        dense
      >
        <div
          v-if="progress.loaded"
          v-mousetrap="[
            { bind: 'n', handler: () => !readonlyState && handler.trackAdd() },
            { bind: 'r', handler: () => aggregateController.resetZoom() },
            { bind: 'esc', handler: () => getUISetting('UISelection') && handler.trackAbort() },
          ]"
          class="d-flex flex-column grow"
        >
          <div class="d-flex grow">
            <div
              v-for="camera in multiCamList"
              :key="camera"
              class="d-flex flex-column grow"
              :style="{ height: `calc(100% - ${controlsHeight}px)` }"
              @mousedown.left="changeCamera(camera, $event)"
              @mouseup.right="changeCamera(camera, $event)"
            >
              <component
                :is="datasetType === 'image-sequence' ? 'image-annotator' : 'video-annotator'"
                v-if="(imageData[camera].length || videoUrl[camera]) && progress.loaded"
                ref="subPlaybackComponent"
                class="fill-height"
                :class="{ 'selected-camera': selectedCamera === camera && camera !== 'singleCam' }"
                v-bind="{
                  imageData: imageData[camera],
                  videoUrl: videoUrl[camera],
                  updateTime,
                  frameRate,
                  originalFps,
                  camera,
                  brightness,
                  intercept,
                }"
                @loaded="runActions"
              >
                <LayerManager
                  v-if="progress.loaded"
                  :camera="camera"
                  :overlays="overlays"
                />
              </component>
            </div>
          </div>
          <ControlsContainer
            ref="controlsRef"
            class="shrink"
            :collapsed.sync="controlsCollapsed"
            v-bind="{
              lineChartData, eventChartData, groupChartData, datasetType,
            }"
            @select-track="handler.trackSelect"
            @timeline-height="updateTimelineHeight()"
          />
        </div>
        <div
          v-else
          class="d-flex justify-center align-center fill-height"
        >
          <v-alert
            v-if="loadError"
            type="error"
            prominent
            max-width="60%"
          >
            <p class="ma-2">
              {{ loadError }}
            </p>
          </v-alert>
          <v-progress-circular
            v-else
            :indeterminate="progressValue === 0"
            :value="progressValue"
            size="100"
            width="15"
            color="light-blue"
            class="main-progress-linear"
            rotate="-90"
          >
            <span v-if="progressValue === 0">Loading</span>
            <span v-else>{{ progressValue }}%</span>
          </v-progress-circular>
        </div>
      </v-col>
      <slot name="right-sidebar" />
    </v-row>
  </v-main>
</template>

<style lang="scss">
html {
  overflow-y: auto;
 scrollbar-face-color: #646464;
  scrollbar-base-color: #646464;
  scrollbar-3dlight-color: #646464;
  scrollbar-highlight-color: #646464;
  scrollbar-track-color: #000;
  scrollbar-arrow-color: #000;
  scrollbar-shadow-color: #646464;
}
::-webkit-scrollbar { width: 10px; height: 3px;}
::-webkit-scrollbar-button {  background-color: #666; height: 0px; }
::-webkit-scrollbar-track {  background-color: #646464;}
::-webkit-scrollbar-track-piece { background-color: #1E1E1E;}
::-webkit-scrollbar-thumb { height: 30px; background-color: #666; border-radius: 3px;}
::-webkit-scrollbar-corner { background-color: #646464;}
::-webkit-resizer { background-color: #666;}

.text-xs-center {
  text-align: center !important;
}
</style>
