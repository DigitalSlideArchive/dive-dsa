/// <reference types="jest" />
import { ref, shallowRef } from 'vue';
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

/** Minimal CameraStore: a reactive id list plus lookup, like a single-camera TrackStore */
function mockCameraStore(tracks: Track[]) {
  const trackMap = new Map(tracks.map((t) => [t.id, t]));
  const annotationIds = ref(tracks.map((t) => t.id));
  return {
    camMap: shallowRef(new Map([['singleCam', { trackStore: { annotationIds } }]])),
    getAnyPossibleTrack: (id: number) => trackMap.get(id),
    addTrack(track: Track) {
      trackMap.set(track.id, track);
      annotationIds.value.push(track.id);
    },
  } as unknown as CameraStore & { addTrack: (track: Track) => void };
}

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
    cameraStore: mockCameraStore([track]),
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

describe('useAttributes numeric swimlane colors', () => {
  function makeSpeedTrack(values: [number, number][]) {
    const track = new Track(0, {
      meta: {},
      begin: 0,
      end: 0,
      confidencePairs: [['fullframe', 1]],
    });
    values.forEach(([frame, speed]) => {
      track.setFeature({
        frame,
        bounds: [0, 0, 640, 510],
        keyframe: true,
        interpolate: false,
      });
      track.setFeatureAttribute(frame, 'Speed', speed);
    });
    return track;
  }

  function setup(track: Track, speedAttribute: Attribute) {
    const attributes = UseAttributes({
      markChangesPending: jest.fn(),
      trackStyleManager: new StyleManager({ markChangesPending: jest.fn(), vuetify }),
      selectedTrackId: ref(0),
      cameraStore: mockCameraStore([track]),
      login: 'admin',
    });
    attributes.loadAttributes({ detection_Speed: speedAttribute });
    attributes.loadSwimlanes({
      Speed: {
        enabled: true,
        name: 'Speed',
        default: false,
        filter: {
          type: 'key',
          active: true,
          value: true,
          appliedTo: ['Speed'],
        },
        displaySettings: {
          display: 'static',
          trackFilter: ['all'],
          displayFrameIndicators: true,
        },
        settings: {},
      },
    });
    return attributes;
  }

  const speedAttribute = (): Attribute => ({
    belongs: 'detection',
    datatype: 'number',
    name: 'Speed',
    key: 'detection_Speed',
    color: '#123456',
    valueColors: { 0: '#000000', 10: '#ffffff', '': '#ff0000' },
  });

  it('interpolates colors between numeric value stops', () => {
    const track = makeSpeedTrack([[0, 0], [10, 5], [20, 10], [30, 20]]);
    const attributes = setup(track, speedAttribute());
    const { data } = attributes.attributeSwimlaneData.value.Speed.Speed;
    expect(data.map((sub) => sub.color)).toEqual([
      'rgb(0, 0, 0)',
      'rgb(128, 128, 128)',
      'rgb(255, 255, 255)',
      // d3 extrapolates past the last stop and clamps to the color range
      'rgb(255, 255, 255)',
    ]);
  });

  it('uses the static color when staticColor is set', () => {
    const track = makeSpeedTrack([[0, 0], [10, 5]]);
    const attributes = setup(track, { ...speedAttribute(), staticColor: true });
    const { data } = attributes.attributeSwimlaneData.value.Speed.Speed;
    expect(data.map((sub) => sub.color)).toEqual(['#123456', '#123456']);
  });

  it('falls back to the attribute color when there are no numeric stops', () => {
    const track = makeSpeedTrack([[0, 3]]);
    const attributes = setup(track, { ...speedAttribute(), valueColors: { '': '#ff0000' } });
    const { data } = attributes.attributeSwimlaneData.value.Speed.Speed;
    expect(data[0].color).toBe('#123456');
  });

  it('picks up valueColors changes made through setAttribute', () => {
    const track = makeSpeedTrack([[0, 0], [10, 10]]);
    const attributes = setup(track, speedAttribute());
    expect(attributes.attributeSwimlaneData.value.Speed.Speed.data[1].color).toBe('rgb(255, 255, 255)');
    const updated = { ...speedAttribute(), valueColors: { 0: '#000000', 10: '#00ff00' } };
    attributes.setAttribute({ data: updated, oldAttribute: speedAttribute() });
    expect(attributes.attributeSwimlaneData.value.Speed.Speed.data[1].color).toBe('rgb(0, 255, 0)');
  });
});

describe('useAttributes graph recompute triggers', () => {
  function makeRegionTrack(id: number, type = 'fullframe') {
    const track = new Track(id, {
      meta: {},
      begin: 0,
      end: 0,
      confidencePairs: [[type, 1]],
    });
    track.setFeature({
      frame: 0, bounds: [0, 0, 10, 10], keyframe: true, interpolate: false,
    });
    track.setFeatureAttribute(0, 'Region', 'Scolon');
    return track;
  }

  function setup(
    tracks: Track[],
    displaySettings: DisplayTrackFilterSettings,
    selected: number | null = 0,
  ) {
    const cameraStore = mockCameraStore(tracks);
    const selectedTrackId = ref<number | null>(selected);
    const attributes = UseAttributes({
      markChangesPending: jest.fn(),
      trackStyleManager: new StyleManager({ markChangesPending: jest.fn(), vuetify }),
      selectedTrackId,
      cameraStore,
      login: 'admin',
    });
    attributes.loadAttributes({ detection_Region: regionAttribute });
    attributes.loadSwimlanes({
      Region: {
        enabled: true,
        name: 'Region',
        default: false,
        filter: {
          type: 'key', active: true, value: true, appliedTo: ['all'],
        },
        displaySettings,
        settings: {},
      },
    });
    return { attributes, cameraStore, selectedTrackId };
  }

  const staticDisplay: DisplayTrackFilterSettings = { display: 'static', trackFilter: ['all'] };

  it('rebuilds when the displayed track is edited', () => {
    const track = makeRegionTrack(0);
    const { attributes } = setup([track], staticDisplay);
    expect(attributes.attributeSwimlaneData.value.Region.Region.data.map((d) => d.value)).toEqual(['Scolon']);
    track.setFeature({
      frame: 10, bounds: [0, 0, 10, 10], keyframe: true, interpolate: false,
    });
    track.setFeatureAttribute(10, 'Region', 'Rectum');
    expect(attributes.attributeSwimlaneData.value.Region.Region.data.map((d) => d.value)).toEqual(['Scolon', 'Rectum']);
  });

  it('does not rebuild when a different track is edited', () => {
    const shown = makeRegionTrack(0);
    const other = makeRegionTrack(1);
    const { attributes } = setup([shown, other], staticDisplay);
    const before = attributes.attributeSwimlaneData.value;
    other.setFeatureAttribute(0, 'Region', 'Rectum');
    expect(attributes.attributeSwimlaneData.value).toBe(before);
  });

  it('hides a selected-mode graph when the track type is not in trackFilter', () => {
    const track = makeRegionTrack(0, 'fish');
    const { attributes } = setup([track], { display: 'selected', trackFilter: ['bird'] });
    expect(attributes.swimlaneEnabled.value.Region).toBe(false);
    expect(attributes.attributeSwimlaneData.value.Region).toBeUndefined();
    // Filter state is derived, not written back into the saved graph config
    expect('filtered' in attributes.swimlaneGraphs.value.Region).toBe(false);
  });

  it('updates when the track type changes into the trackFilter', () => {
    const track = makeRegionTrack(0, 'fish');
    const { attributes } = setup([track], { display: 'selected', trackFilter: ['bird'] });
    expect(attributes.swimlaneEnabled.value.Region).toBe(false);
    track.setType('bird');
    expect(attributes.swimlaneEnabled.value.Region).toBe(true);
    expect(attributes.attributeSwimlaneData.value.Region.Region.data).toHaveLength(1);
  });

  it('shows a pinned track once it is created', () => {
    const { attributes, cameraStore } = setup(
      [],
      { display: 'pinned', pinnedTrackId: 5, trackFilter: ['all'] },
      null,
    );
    expect(attributes.swimlaneEnabled.value.Region).toBe(false);
    cameraStore.addTrack(makeRegionTrack(5));
    expect(attributes.swimlaneEnabled.value.Region).toBe(true);
    expect(attributes.attributeSwimlaneData.value.Region.Region.data.map((d) => d.value)).toEqual(['Scolon']);
  });
});

describe('useAttributes sortAndFilterAttributes', () => {
  function makeAttr(name: string, belongs: 'track' | 'detection', datatype: Attribute['datatype'] = 'text'): Attribute {
    return {
      belongs, datatype, name, key: `${belongs}_${name}`,
    };
  }

  function setup() {
    return UseAttributes({
      markChangesPending: jest.fn(),
      trackStyleManager: new StyleManager({ markChangesPending: jest.fn(), vuetify }),
      selectedTrackId: ref(null),
      cameraStore: mockCameraStore([]),
      login: 'admin',
    });
  }

  const list = [
    makeAttr('beta', 'detection'),
    makeAttr('Alpha', 'detection'),
    makeAttr('gamma', 'detection', 'number'),
    makeAttr('Zeta', 'track'),
    makeAttr('delta', 'detection', 'number'),
  ];

  it('sorts alphabetically, ignoring case, and only for the requested mode', () => {
    const { sortAndFilterAttributes } = setup();
    const names = sortAndFilterAttributes(list, 'detection', {}, 0, []).map((a) => a.name);
    expect(names).toEqual(['Alpha', 'beta', 'delta', 'gamma']);
    expect(sortAndFilterAttributes(list, 'track', {}, 0, []).map((a) => a.name)).toEqual(['Zeta']);
  });

  it('does not let a highlighted-attribute reorder leak into later calls', () => {
    const { sortAndFilterAttributes } = setup();
    const highlighted = sortAndFilterAttributes(list, 'detection', {}, 0, [], list[2]);
    expect(highlighted.map((a) => a.name)).toEqual(['gamma', 'Alpha', 'beta', 'delta']);
    highlighted.reverse();
    expect(sortAndFilterAttributes(list, 'detection', {}, 0, []).map((a) => a.name))
      .toEqual(['Alpha', 'beta', 'delta', 'gamma']);
  });

  it('re-sorts when given a new attribute list', () => {
    const { sortAndFilterAttributes } = setup();
    sortAndFilterAttributes(list, 'detection', {}, 0, []);
    const updated = [...list, makeAttr('aardvark', 'detection')];
    expect(sortAndFilterAttributes(updated, 'detection', {}, 0, []).map((a) => a.name))
      .toEqual(['aardvark', 'Alpha', 'beta', 'delta', 'gamma']);
  });

  it('numeric mode still orders by the current values', () => {
    const { sortAndFilterAttributes } = setup();
    const names = sortAndFilterAttributes(list, 'detection', { gamma: 1, delta: 5, beta: 'x' }, 1, [])
      .map((a) => a.name);
    expect(names).toEqual(['delta', 'gamma', 'beta', 'Alpha']);
  });
});
