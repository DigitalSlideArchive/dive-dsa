import { Ref, watch, reactive } from 'vue';
import { cloneDeep, merge } from 'lodash';
import { AnnotatorPreferences } from 'vue-media-annotator/types';
import {
  isSamDevicePreference, isSamModel, SamDevicePreference, SamModel,
} from 'dive-common/use/segmentation/samModels';
import {
  normalizeSegmentationPolygonPoints, SegmentationMaxPolygonPoints,
} from 'dive-common/use/segmentation/constants';
import {
  isSegmentationOutputMode, SegmentationOutputMode,
} from 'dive-common/use/segmentation/types';

interface AnnotationSettings {
  typeSettings: {
    showEmptyTypes: boolean;
    lockTypes: boolean;
  };
  trackSettings: {
    newTrackSettings: {
      mode: 'Track' | 'Detection';
      type: string;
      modeSettings: {
        Track: {
          autoAdvanceFrame: boolean;
          interpolate: boolean;
        };
        Detection: {
          continuous: boolean;
        };
      };
    };
    deletionSettings: {
      promptUser: boolean;
    };
  };
  groupSettings: {
    newGroupSettings: {
      type: string;
    };
  };
  /** Browser point-click (SAM2) segmentation */
  segmentationSettings: {
    /** Model downloaded and cached on first use */
    model: SamModel;
    /** Where the model runs: prefer a hardware GPU, or force GPU/CPU */
    device: SamDevicePreference;
    /**
     * Base polygon vertex budget per outline ring. It may grow to 4x this
     * while simplifying a complex outline (see maskGeometry).
     */
    polygonPoints: number;
    /** Whether confirming a segmentation creates a polygon or a mask. */
    outputMode: SegmentationOutputMode;
  };
  rowsPerPage: number;
  annotationFPS: number;
  annotatorPreferences: AnnotatorPreferences;
}

const defaultSettings: AnnotationSettings = {
  trackSettings: {
    newTrackSettings: {
      mode: 'Track' as 'Track' | 'Detection',
      type: 'unknown',
      modeSettings: {
        Track: {
          autoAdvanceFrame: false,
          interpolate: false,
        },
        Detection: {
          continuous: false,
        },
      },
    },
    deletionSettings: {
      promptUser: true,
    },
  },
  groupSettings: {
    newGroupSettings: {
      type: 'unknown',
    },
  },
  typeSettings: {
    showEmptyTypes: false,
    lockTypes: false,
  },
  segmentationSettings: {
    model: 'sam2',
    device: 'auto',
    polygonPoints: SegmentationMaxPolygonPoints,
    outputMode: 'polygon',
  },
  rowsPerPage: 20,
  annotationFPS: 10,
  annotatorPreferences: {
    trackTails: {
      before: 20,
      after: 10,
    },
    overlays: [],
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function hydrate(obj: any): AnnotationSettings {
  const hydrated = merge(cloneDeep(defaultSettings), obj);
  // Drop stored values from options that no longer exist.
  if (!isSamModel(hydrated.segmentationSettings.model)) {
    hydrated.segmentationSettings.model = defaultSettings.segmentationSettings.model;
  }
  if (!isSamDevicePreference(hydrated.segmentationSettings.device)) {
    hydrated.segmentationSettings.device = defaultSettings.segmentationSettings.device;
  }
  hydrated.segmentationSettings.polygonPoints = normalizeSegmentationPolygonPoints(
    hydrated.segmentationSettings.polygonPoints,
  );
  if (!isSegmentationOutputMode(hydrated.segmentationSettings.outputMode)) {
    hydrated.segmentationSettings.outputMode = defaultSettings.segmentationSettings.outputMode;
  }
  return hydrated;
}

//Load default settings initially
const storedSettings = JSON.parse(localStorage.getItem('Settings') || '{}');
const clientSettings = reactive(hydrate(storedSettings));

function saveSettings() {
  localStorage.setItem('Settings', JSON.stringify(clientSettings));
}

export default function setup(allTypes: Ref<Readonly<string[]>>) {
  // If a type is deleted, reset the default new track type to unknown
  watch(allTypes, (newval) => {
    if (newval.indexOf(clientSettings.trackSettings.newTrackSettings.type) === -1) {
      clientSettings.trackSettings.newTrackSettings.type = 'unknown';
    }
  });
}
watch(clientSettings, saveSettings);

export {
  clientSettings,
  AnnotationSettings,
  hydrate,
};
