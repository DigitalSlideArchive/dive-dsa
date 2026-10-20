/**
 * @jest-environment jsdom
 */
/// <reference types="jest" />
/*
 * Point-click segmentation as driven through the mode manager: previews on the
 * selected detection, restoring on reset/cancel, and what happens on confirm.
 */
import Vue, { ref, shallowRef } from 'vue';
// eslint-disable-next-line import/no-extraneous-dependencies
import { mount } from '@vue/test-utils';
import CameraStore from 'vue-media-annotator/CameraStore';
import TrackFilterControls from 'vue-media-annotator/TrackFilterControls';
import GroupFilterControls from 'vue-media-annotator/GroupFilterControls';
import type { AggregateMediaController } from 'vue-media-annotator/components/annotators/mediaControllerType';
import PolygonBase from 'dive-common/recipes/polygonbase';
import HeadTail from 'dive-common/recipes/headtail';
import SegmentationPointClick from 'dive-common/recipes/segmentationpointclick';
import type { SegmentationPredictResponse } from 'dive-common/use/segmentation/types';
import { clientSettings } from 'dive-common/store/settings';
import useModeManager from './useModeManager';

const mockPrompt = jest.fn();
// The real service mounts a .vue dialog.
jest.mock('dive-common/vue-utilities/prompt-service', () => ({
  usePrompt: () => ({ prompt: mockPrompt, inputValue: jest.fn() }),
}));
jest.mock('platform/web-girder/api/divemetadata.service', () => ({
  deleteDiveDatasetMetadataKey: jest.fn(),
  setDiveDatasetMetadataKey: jest.fn(),
}));

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const square = (x0: number, size: number): [number, number][] => [[x0, 0], [x0 + size, 0], [x0 + size, size], [x0, size]];
const response: SegmentationPredictResponse = {
  success: true,
  polygons: [{ exterior: square(10, 20), holes: [] }],
  bounds: [10, 0, 30, 20],
};
const click = (x: number, y: number): GeoJSON.Feature<GeoJSON.Point> => ({
  type: 'Feature', geometry: { type: 'Point', coordinates: [x, y] }, properties: {},
});

function setup() {
  const markChangesPending = () => undefined;
  const cameraStore = new CameraStore({ markChangesPending });
  const groupFilters = new GroupFilterControls({
    sorted: cameraStore.sortedGroups, markChangesPending, remove: () => undefined,
  });
  const trackFilters = new TrackFilterControls({
    sorted: cameraStore.sortedTracks,
    remove: () => undefined,
    markChangesPending,
    lookupGroups: cameraStore.lookupGroups,
    groupFilterControls: groupFilters,
  });
  const frame = ref(0);
  const aggregateController = shallowRef({
    frame,
    flick: ref(0),
    nextFrame: () => { frame.value += 1; },
    seek: (f: number) => { frame.value = f; },
  } as unknown as AggregateMediaController);
  const segmentation = new SegmentationPointClick();
  const predict = jest.fn(async () => response);
  segmentation.initialize({ predictFn: predict });
  const polygonRecipe = new PolygonBase();
  const recipes = [polygonRecipe, new HeadTail(), segmentation];
  let manager!: ReturnType<typeof useModeManager>;
  const wrapper = mount(Vue.extend({
    setup() {
      manager = useModeManager({
        cameraStore,
        trackFilterControls: trackFilters,
        groupFilterControls: groupFilters,
        aggregateController,
        readonlyState: ref(false),
        recipes,
        datasetId: ref('dataset'),
      });
      return {};
    },
    render(h) { return h('div'); },
  }));
  const { trackStore } = cameraStore.camMap.value.get('singleCam')!;
  return {
    manager, segmentation, polygonRecipe, predict, cameraStore, trackStore, frame, wrapper,
  };
}

/** Select a detection with a box on frame 0 for editing and start segmenting. */
async function segmentExisting() {
  const ctx = setup();
  const track = ctx.trackStore.add(0, 'fish', undefined, 1);
  track.setFeature({ frame: 0, keyframe: true, bounds: [0, 0, 100, 100] });
  ctx.manager.handler.trackSelect(track.id, true);
  ctx.segmentation.activate();
  await flush();
  return { ...ctx, track };
}

async function place(ctx: { manager: ReturnType<typeof useModeManager> }, x: number, frame = 0) {
  ctx.manager.handler.updateGeoJSON('editing', frame, 0, click(x, 5), '', () => undefined);
  await flush();
}

beforeEach(() => {
  clientSettings.trackSettings.newTrackSettings.mode = 'Track';
  clientSettings.trackSettings.newTrackSettings.modeSettings.Track.autoAdvanceFrame = false;
  clientSettings.trackSettings.newTrackSettings.modeSettings.Detection.continuous = false;
});

it('enters point placement and previews each prediction on the detection', async () => {
  const ctx = await segmentExisting();
  expect(ctx.manager.editingMode.value).toBe('Point');
  await place(ctx, 15);
  expect(ctx.predict).toHaveBeenCalledWith({ points: [[15, 5]], pointLabels: [1] }, 0);
  expect(ctx.track.getFeature(0)[0]?.bounds).toEqual([10, 0, 30, 20]);
  expect(ctx.track.getFeatureGeometry(0, { type: 'Polygon' })).toHaveLength(1);
  expect(ctx.manager.segmentationPoints.value).toEqual({ points: [[15, 5]], labels: [1], frameNum: 0 });
});

it('reset restores the detection and keeps segmenting', async () => {
  const ctx = await segmentExisting();
  await place(ctx, 15);
  ctx.segmentation.resetPoints();
  expect(ctx.track.getFeature(0)[0]?.bounds).toEqual([0, 0, 100, 100]);
  expect(ctx.track.getFeatureGeometry(0, { type: 'Polygon' })).toHaveLength(0);
  expect(ctx.segmentation.active.value).toBe(true);
  expect(ctx.manager.segmentationPoints.value.points).toEqual([]);
});

it('reset removes the points and previewed polygon after moving to another frame', async () => {
  const ctx = await segmentExisting();
  await place(ctx, 15);
  expect(ctx.track.getFeatureGeometry(0, { type: 'Polygon' })).toHaveLength(1);
  // The current frame now has no points, but frame 0 still shows the polygon.
  ctx.frame.value = 1;
  await flush();
  expect(ctx.segmentation.pointCount.value).toBe(0);
  expect(ctx.segmentation.predictionCount.value).toBe(1);
  ctx.segmentation.resetPoints();
  expect(ctx.track.getFeature(0)[0]?.bounds).toEqual([0, 0, 100, 100]);
  expect(ctx.track.getFeatureGeometry(0, { type: 'Polygon' })).toHaveLength(0);
  expect(ctx.segmentation.hasPoints()).toBe(false);
  expect(ctx.segmentation.hasPendingPrediction()).toBe(false);
  expect(ctx.segmentation.active.value).toBe(true);
});

it('leaving the detection discards the unconfirmed mask', async () => {
  const ctx = await segmentExisting();
  await place(ctx, 15);
  ctx.manager.handler.trackAbort();
  expect(ctx.track.getFeature(0)[0]?.bounds).toEqual([0, 0, 100, 100]);
  expect(ctx.segmentation.active.value).toBe(false);
  expect(ctx.manager.selectedTrackId.value).toBeNull();
});

it('confirming keeps the mask and switches to polygon editing of it', async () => {
  const ctx = await segmentExisting();
  await place(ctx, 15);
  ctx.manager.confirmSegmentation();
  expect(ctx.track.getFeature(0)[0]?.bounds).toEqual([10, 0, 30, 20]);
  expect(ctx.segmentation.active.value).toBe(false);
  expect(ctx.polygonRecipe.active.value).toBe(true);
  expect(ctx.manager.editingMode.value).toBe('Polygon');
  expect(ctx.manager.selectedKey.value).toBe('');
  // Nothing left to restore once confirmed.
  ctx.manager.handler.trackAbort();
  expect(ctx.track.getFeature(0)[0]?.bounds).toEqual([10, 0, 30, 20]);
});

it('confirming a mask result stores a mask instead of a polygon', async () => {
  const ctx = await segmentExisting();
  // The store hook must run before `hasMask` is flagged, so the render the
  // flag triggers already finds the mask data instead of warning it missing.
  let hasMaskWhenStored: boolean | undefined;
  const createMask = jest.fn(async () => {
    hasMaskWhenStored = ctx.track.getFeature(0)[0]?.hasMask;
  });
  ctx.manager.setSegmentationMaskCreator(createMask);
  const mask = { data: new Uint8Array(100).fill(1), width: 10, height: 10 };
  ctx.predict.mockResolvedValue({ ...response, mask });
  await place(ctx, 15);
  // Previewed as an outline polygon until confirmed.
  expect(ctx.track.getFeatureGeometry(0, { type: 'Polygon' })).toHaveLength(1);
  expect(ctx.track.getFeature(0)[0]?.hasMask).toBeUndefined();
  ctx.manager.confirmSegmentation();
  await flush();
  expect(createMask).toHaveBeenCalledWith(ctx.track.id, 0, mask);
  expect(hasMaskWhenStored).toBeUndefined();
  const [feature] = ctx.track.getFeature(0);
  expect(feature?.hasMask).toBe(true);
  expect(feature?.bounds).toEqual([10, 0, 30, 20]);
  expect(ctx.track.getFeatureGeometry(0, { type: 'Polygon' })).toHaveLength(0);
  expect(ctx.manager.visibleModes.value).toContain('Mask');
  expect(ctx.polygonRecipe.active.value).toBe(false);
  expect(ctx.manager.editingMode.value).toBe('rectangle');
  // Nothing left to restore once confirmed.
  ctx.manager.handler.trackAbort();
  expect(ctx.track.getFeature(0)[0]?.hasMask).toBe(true);
});

it('cancelling a mask preview restores the detection and stores nothing', async () => {
  const ctx = await segmentExisting();
  const createMask = jest.fn(async () => undefined);
  ctx.manager.setSegmentationMaskCreator(createMask);
  const mask = { data: new Uint8Array(100).fill(1), width: 10, height: 10 };
  ctx.predict.mockResolvedValue({ ...response, mask });
  await place(ctx, 15);
  ctx.manager.handler.trackAbort();
  expect(createMask).not.toHaveBeenCalled();
  expect(ctx.track.getFeature(0)[0]?.hasMask).toBeUndefined();
  expect(ctx.track.getFeature(0)[0]?.bounds).toEqual([0, 0, 100, 100]);
});

it('switching tools keeps the previewed mask', async () => {
  const ctx = await segmentExisting();
  await place(ctx, 15);
  ctx.manager.handler.setAnnotationState({ editing: 'rectangle' });
  ctx.manager.handler.trackAbort();
  expect(ctx.track.getFeature(0)[0]?.bounds).toEqual([10, 0, 30, 20]);
});

it('switching tools converts a previewed mask result into a stored mask', async () => {
  const ctx = await segmentExisting();
  const createMask = jest.fn(async () => undefined);
  ctx.manager.setSegmentationMaskCreator(createMask);
  const mask = { data: new Uint8Array(100).fill(1), width: 10, height: 10 };
  ctx.predict.mockResolvedValue({ ...response, mask });
  await place(ctx, 15);
  ctx.manager.handler.setAnnotationState({ editing: 'rectangle' });
  await flush();
  expect(createMask).toHaveBeenCalledWith(ctx.track.id, 0, mask);
  expect(ctx.track.getFeature(0)[0]?.hasMask).toBe(true);
  expect(ctx.track.getFeatureGeometry(0, { type: 'Polygon' })).toHaveLength(0);
});

it('a cancelled segmentation with no mask returns to box editing', async () => {
  const ctx = await segmentExisting();
  ctx.manager.confirmSegmentation();
  expect(ctx.segmentation.active.value).toBe(false);
  expect(ctx.manager.editingMode.value).toBe('rectangle');
});

it('a new detection without a confirmed mask is removed on escape', async () => {
  const ctx = setup();
  const id = ctx.manager.handler.trackAdd();
  ctx.segmentation.activate();
  await flush();
  await place(ctx, 15);
  expect(ctx.trackStore.getPossible(id)?.getFeature(0)[0]).toBeTruthy();
  ctx.manager.handler.trackAbort();
  expect(ctx.trackStore.getPossible(id)).toBeUndefined();
});

it('continuous detection mode keeps segmenting the next new detection', async () => {
  clientSettings.trackSettings.newTrackSettings.mode = 'Detection';
  clientSettings.trackSettings.newTrackSettings.modeSettings.Detection.continuous = true;
  const ctx = setup();
  const first = ctx.manager.handler.trackAdd();
  ctx.segmentation.activate();
  await flush();
  await place(ctx, 15);
  ctx.manager.confirmSegmentation();
  await flush();
  expect(ctx.trackStore.getPossible(first)?.getFeature(0)[0]?.bounds).toEqual([10, 0, 30, 20]);
  expect(ctx.manager.selectedTrackId.value).not.toBe(first);
  expect(ctx.segmentation.active.value).toBe(true);
  expect(ctx.manager.editingMode.value).toBe('Point');
});

it('shows a prompt when segmentation fails', async () => {
  const ctx = await segmentExisting();
  ctx.predict.mockRejectedValueOnce(new Error('frame not ready'));
  await place(ctx, 15);
  expect(mockPrompt).toHaveBeenCalledWith({ title: 'Segmentation Error', text: ['frame not ready'] });
  expect(ctx.track.getFeature(0)[0]?.bounds).toEqual([0, 0, 100, 100]);
});
