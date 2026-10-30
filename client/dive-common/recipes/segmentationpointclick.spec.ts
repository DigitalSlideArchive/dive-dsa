/// <reference types="jest" />
import Track from 'vue-media-annotator/track';
import type { SegmentationPredictRequest, SegmentationPredictResponse } from 'dive-common/use/segmentation/types';
import SegmentationPointClick, {
  SegmentationPointsState, SegmentationPredictionResult,
} from './segmentationpointclick';

const components = [
  { exterior: [[0, 0], [10, 0], [10, 10]] as [number, number][], holes: [] },
  { exterior: [[20, 0], [30, 0], [30, 10]] as [number, number][], holes: [] },
];
const success: SegmentationPredictResponse = {
  success: true, polygon: components[0].exterior, polygons: components, bounds: [0, 0, 30, 10], score: 0.8,
};

const click = (x: number, y: number, background = false): GeoJSON.Feature<GeoJSON.Point> => ({
  type: 'Feature', geometry: { type: 'Point', coordinates: [x, y] }, properties: background ? { background } : {},
});

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function harness({ initialize = true, activate = true } = {}) {
  const recipe = new SegmentationPointClick();
  const predict = jest.fn<Promise<SegmentationPredictResponse>, [SegmentationPredictRequest, number]>(async () => success);
  const ready = jest.fn(async () => undefined);
  if (initialize) recipe.initialize({ predictFn: predict, initializeServiceFn: ready });
  const events: Record<string, unknown[][]> = {};
  ['activate', 'points-updated', 'prediction-ready', 'prediction-error', 'prediction-reset',
    'prediction-confirmed', 'prediction-cancelled'].forEach((name) => {
    events[name] = [];
    recipe.bus.$on(name, (...args: unknown[]) => events[name].push(args));
  });
  const track = new Track(1, { begin: 0, end: 0 });
  return {
    recipe, predict, ready, events, track, activate: async () => { if (activate) { recipe.activate(); await flush(); } },
  };
}

async function clickAndWait(recipe: SegmentationPointClick, track: Track, x: number, background = false, frame = 0) {
  const response = recipe.update('editing', frame, track, [click(x, 5, background)]);
  await flush();
  return response;
}

it('is hidden until a platform initializes it', () => {
  const { recipe } = harness({ initialize: false });
  expect(recipe.toggleable.value).toBe(false);
  recipe.activate();
  expect(recipe.active.value).toBe(false);
  recipe.initialize({ predictFn: async () => success });
  expect(recipe.toggleable.value).toBe(true);
  recipe.disable();
  expect(recipe.toggleable.value).toBe(false);
});

it('loads the model on first activation and enters point placement', async () => {
  const {
    recipe, ready, events, activate,
  } = harness();
  recipe.activate();
  expect(recipe.loading.value).toBe(true);
  expect(recipe.active.value).toBe(false);
  await activate();
  expect(recipe.loading.value).toBe(false);
  expect(recipe.active.value).toBe(true);
  expect(events.activate[0][0]).toEqual({ editing: 'Point', key: '', recipeName: 'Segment' });
  recipe.deactivate();
  recipe.activate();
  // The model is only prepared once.
  expect(ready).toHaveBeenCalledTimes(1);
});

it('loads the model again after it was invalidated', async () => {
  const { recipe, ready, activate } = harness();
  await activate();
  recipe.deactivate();
  recipe.invalidateService();
  recipe.activate();
  expect(recipe.loading.value).toBe(true);
  await flush();
  expect(recipe.active.value).toBe(true);
  expect(ready).toHaveBeenCalledTimes(2);
});

it('stays inactive and reports the error when the model cannot load', async () => {
  const { recipe, ready, events } = harness();
  ready.mockRejectedValueOnce(new Error('offline'));
  recipe.activate();
  await flush();
  expect(recipe.active.value).toBe(false);
  expect(recipe.loading.value).toBe(false);
  expect(events['prediction-error'][0][0]).toBe('offline');
});

it('ignores clicks while inactive', async () => {
  const { recipe, predict, track } = harness();
  expect(recipe.update('editing', 0, track, [click(1, 1)])).toEqual({ data: {}, union: [], unionWithoutBounds: [] });
  expect(predict).not.toHaveBeenCalled();
});

it('sends foreground and background points and emits each prediction', async () => {
  const {
    recipe, predict, events, track, activate,
  } = harness();
  await activate();
  const response = await clickAndWait(recipe, track, 5);
  // Geometry comes later via prediction-ready; the edit layer stays in point placement.
  expect(response).toEqual({
    data: {}, union: [], unionWithoutBounds: [], done: false,
  });
  await clickAndWait(recipe, track, 25, true);
  expect(predict.mock.calls[1][0]).toEqual({ points: [[5, 5], [25, 5]], pointLabels: [1, 0] });
  expect(events['prediction-ready']).toHaveLength(2);
  const result = events['prediction-ready'][1][0] as SegmentationPredictionResult;
  expect(result).toEqual({
    frameNum: 0, polygons: components, bounds: [0, 0, 30, 10], score: 0.8, outputMode: 'polygon',
  });
  const points = events['points-updated'].map(([state]) => (state as SegmentationPointsState).labels);
  expect(points[points.length - 1]).toEqual([1, 0]);
  expect(recipe.pointCount.value).toBe(2);
  expect(recipe.predictionCount.value).toBe(1);
  expect(recipe.icon.value).toBe('mdi-numeric-2-circle');
});

it('carries the binary mask and mask output mode when the model returns one', async () => {
  const {
    recipe, predict, events, track, activate,
  } = harness();
  await activate();
  const mask = { data: new Uint8Array(100).fill(1), width: 10, height: 10 };
  predict.mockResolvedValueOnce({ ...success, mask });
  await clickAndWait(recipe, track, 5);
  const result = events['prediction-ready'][0][0] as SegmentationPredictionResult;
  expect(result.outputMode).toBe('mask');
  expect(result.mask).toBe(mask);
  recipe.confirmPrediction();
  const [frames] = events['prediction-confirmed'][0] as [SegmentationPredictionResult[]];
  expect(frames[0].outputMode).toBe('mask');
  expect(frames[0].mask).toBe(mask);
});

it('ignores a repeated event for the same point', async () => {
  const {
    recipe, predict, track, activate,
  } = harness();
  await activate();
  await clickAndWait(recipe, track, 5);
  await clickAndWait(recipe, track, 5);
  expect(predict).toHaveBeenCalledTimes(1);
});

it('removes a point the model rejects and stays active', async () => {
  const {
    recipe, predict, events, track, activate,
  } = harness();
  await activate();
  await clickAndWait(recipe, track, 5);
  predict.mockResolvedValueOnce({ success: false, error: 'No object found for these prompts.' });
  await clickAndWait(recipe, track, 6);
  expect(recipe.points).toEqual([[5, 5]]);
  expect(recipe.active.value).toBe(true);
  expect(events['prediction-error'][0][0]).toContain('Latest point rejected');
  predict.mockRejectedValueOnce(new Error('boom'));
  await clickAndWait(recipe, track, 7);
  expect(recipe.points).toEqual([[5, 5]]);
});

it('keeps points per frame and confirms every frame with a polygon', async () => {
  const {
    recipe, events, track, activate,
  } = harness();
  await activate();
  await clickAndWait(recipe, track, 5, false, 0);
  recipe.handleFrameChange(3);
  expect(recipe.points).toEqual([]);
  await clickAndWait(recipe, track, 8, false, 3);
  recipe.handleFrameChange(0);
  expect(recipe.points).toEqual([[5, 5]]);
  recipe.confirmPrediction();
  const [frames] = events['prediction-confirmed'][0] as [SegmentationPredictionResult[]];
  expect(frames.map((f) => f.frameNum).sort()).toEqual([0, 3]);
  // Confirming leaves segmentation before listeners run (they may restart it).
  expect(recipe.active.value).toBe(false);
});

it('confirm without a polygon leaves segmentation and reports a cancel', async () => {
  const { recipe, events, activate } = harness();
  await activate();
  recipe.confirm();
  expect(recipe.active.value).toBe(false);
  expect(events['prediction-confirmed']).toHaveLength(0);
  expect(events['prediction-cancelled']).toHaveLength(1);
});

it('reset clears the points, asks for a restore, and stays active', async () => {
  const {
    recipe, events, track, activate,
  } = harness();
  await activate();
  await clickAndWait(recipe, track, 5);
  recipe.resetPoints();
  expect(events['prediction-reset']).toHaveLength(1);
  expect(recipe.hasPoints()).toBe(false);
  expect(recipe.hasPendingPrediction()).toBe(false);
  expect(recipe.active.value).toBe(true);
  expect(recipe.icon.value).toBe('mdi-auto-fix');
});

it('refresh re-runs the current frame prediction with its existing points', async () => {
  const {
    recipe, predict, events, track, activate,
  } = harness();
  await activate();
  await clickAndWait(recipe, track, 5);
  recipe.refreshPrediction();
  await flush();
  expect(predict).toHaveBeenCalledTimes(2);
  expect(predict.mock.calls[1][0]).toEqual({ points: [[5, 5]], pointLabels: [1] });
  expect(events['prediction-ready']).toHaveLength(2);
  expect(recipe.points).toEqual([[5, 5]]);
});

it('a failed refresh keeps the points and the previous prediction', async () => {
  const {
    recipe, predict, events, track, activate,
  } = harness();
  await activate();
  await clickAndWait(recipe, track, 5);
  predict.mockResolvedValueOnce({ success: false, error: 'decoder busy' });
  recipe.refreshPrediction();
  await flush();
  expect(recipe.points).toEqual([[5, 5]]);
  expect(recipe.hasPendingPrediction()).toBe(true);
  expect(events['prediction-error'][0][0]).toBe('decoder busy');
});

it('delete while placing points discards the in-progress mask', async () => {
  const {
    recipe, events, track, activate,
  } = harness();
  await activate();
  await clickAndWait(recipe, track, 5);
  recipe.delete(0, track, '', 'Point');
  expect(events['prediction-reset']).toHaveLength(1);
  expect(recipe.hasPoints()).toBe(false);
});

it.each(['reset', 'deactivate', 'reinitialize'])('discards an in-flight result after %s', async (action) => {
  const {
    recipe, predict, events, track, activate,
  } = harness();
  await activate();
  let finish!: (result: SegmentationPredictResponse) => void;
  predict.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  recipe.update('editing', 0, track, [click(5, 5)]);
  expect(recipe.predicting.value).toBe(true);
  if (action === 'reset') recipe.resetPoints();
  if (action === 'deactivate') recipe.deactivate();
  if (action === 'reinitialize') recipe.initialize({ predictFn: predict });
  expect(recipe.predicting.value).toBe(false);
  finish(success);
  await flush();
  expect(events['prediction-ready']).toHaveLength(0);
  expect(recipe.predicting.value).toBe(false);
});

it('ignores an older prediction that finishes after a newer click', async () => {
  const {
    recipe, predict, events, track, activate,
  } = harness();
  await activate();
  let finish!: (result: SegmentationPredictResponse) => void;
  predict.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  recipe.update('editing', 0, track, [click(5, 5)]);
  await clickAndWait(recipe, track, 25);
  finish(success);
  await flush();
  expect(events['prediction-ready']).toHaveLength(1);
  expect(recipe.predicting.value).toBe(false);
});

it('confirms with Enter only when a polygon is ready', async () => {
  const {
    recipe, events, track, activate,
  } = harness();
  await activate();
  const enter = recipe.mousetrap().find((m) => m.bind === 'enter')!;
  enter.handler();
  expect(recipe.active.value).toBe(true);
  await clickAndWait(recipe, track, 5);
  enter.handler();
  expect(events['prediction-confirmed']).toHaveLength(1);
  expect(recipe.hotkey).toBe('6');
});
