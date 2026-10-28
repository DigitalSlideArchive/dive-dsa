/// <reference types="jest" />
import { ref } from 'vue';
import type Vuetify from 'vuetify/lib';
import StyleManager from '../StyleManager';
import Track from '../track';
import type CameraStore from '../CameraStore';
import UseAttributes from './useAttributes';
import { Attribute, DisplayTrackFilterSettings } from './AttributeTypes';

const vuetify = {
  preset: {
    theme: {
      themes: {
        dark: {
          accent: 'blue',
        },
      },
    },
  },
} as Vuetify;

const regionAttribute: Attribute = {
  belongs: 'detection',
  datatype: 'text',
  name: 'Region',
  key: 'detection_Region',
  values: ['Scolon', 'Rectum'],
  valueColors: { Scolon: '#FFA628', Rectum: '#F6E428' },
};

function makeTrack(keyframes: [number, string | undefined][]) {
  const track = new Track(0, {
    meta: {},
    begin: 0,
    end: 0,
    confidencePairs: [['fullframe', 1]],
  });
  keyframes.forEach(([frame, region]) => {
    track.setFeature({
      frame,
      bounds: [0, 0, 640, 510],
      keyframe: true,
      interpolate: false,
    });
    if (region !== undefined) {
      track.setFeatureAttribute(frame, 'Region', region);
    }
  });
  return track;
}

function getRegionSwimlane(track: Track, renderMode?: DisplayTrackFilterSettings['renderMode']) {
  const attributes = UseAttributes({
    markChangesPending: jest.fn(),
    trackStyleManager: new StyleManager({ markChangesPending: jest.fn(), vuetify }),
    selectedTrackId: ref(0),
    cameraStore: { getAnyPossibleTrack: () => track } as unknown as CameraStore,
    pendingSaveCount: ref(0),
    login: 'admin',
  });
  attributes.loadAttributes({ detection_Region: regionAttribute });
  attributes.loadSwimlanes({
    Region: {
      enabled: true,
      name: 'Region',
      default: false,
      filter: {
        type: 'key',
        active: true,
        value: true,
        appliedTo: ['Region'],
      },
      displaySettings: {
        display: 'static',
        trackFilter: ['all'],
        displayFrameIndicators: true,
        renderMode,
      },
      settings: {},
    },
  });
  return attributes.attributeSwimlaneData.value.Region.Region.data;
}

describe('useAttributes swimlane data', () => {
  it('starts a new subsection for a keyframe that repeats the previous value', () => {
    const track = makeTrack([
      [0, undefined],
      [4500, 'Scolon'],
      [16000, 'Rectum'],
      [18623, 'Rectum'],
      [23600, 'Rectum'],
      [24133, undefined],
    ]);
    const data = getRegionSwimlane(track);
    expect(data.map((sub) => sub.begin)).toEqual([4500, 16000, 18623, 23600]);
    expect(data.map((sub) => sub.end)).toEqual([16000, 18623, 23600, 23601]);
    expect(data.map((sub) => sub.value)).toEqual(['Scolon', 'Rectum', 'Rectum', 'Rectum']);
    expect(data[1].color).toBe('#F6E428');
    expect(data[2].color).toBe('#F6E428');
  });

  it('keeps one subsection per keyframe in segments mode', () => {
    const track = makeTrack([
      [10, 'Scolon'],
      [20, 'Scolon'],
      [30, 'Rectum'],
    ]);
    const data = getRegionSwimlane(track, 'segments');
    expect(data.map((sub) => [sub.begin, sub.end])).toEqual([[10, 20], [20, 30], [30, 31]]);
  });
});
