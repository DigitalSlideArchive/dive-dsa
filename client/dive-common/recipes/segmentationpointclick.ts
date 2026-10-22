/**
 * Segmentation Point-Click Recipe
 *
 * Click on an object to generate its polygon with a point-prompt
 * segmentation model (SAM2, run in the browser).
 *
 * - Activate with the wand button or the `6` hotkey
 * - Left click: add a foreground (include) point
 * - Shift+click or middle click: add a background (exclude) point
 * - Right click or Enter: confirm the result (polygon(s), or a mask when the
 *   SAM settings select mask output)
 * - Escape: clear the points and restore the detection
 *
 * Points are kept per frame. Each prediction emits `prediction-ready`, which
 * the mode manager applies to the selected track as a preview; confirming
 * emits `prediction-confirmed` with every frame that has a result.
 */
import Vue, { ref, Ref } from 'vue';

import Track from 'vue-media-annotator/track';
import Recipe, { UpdateResponse } from 'vue-media-annotator/recipe';
import { EditAnnotationTypes } from 'vue-media-annotator/layers';
import { Mousetrap } from 'vue-media-annotator/types';
import type {
  Point, SegmentationMask, SegmentationOutputMode, SegmentationPolygon,
  SegmentationPredictRequest, SegmentationPredictResponse,
} from 'dive-common/use/segmentation/types';
import { SegmentationPrimaryPolygonKey } from 'dive-common/use/segmentation/segmentationTrack';

export const SegmentationRecipeName = 'Segment';
export const SegmentationIcon = 'mdi-auto-fix';

const EmptyResponse: UpdateResponse = {
  data: {},
  union: [],
  unionWithoutBounds: [],
};

export interface SegmentationRecipeOptions {
  /** Run the model for the given prompts on a frame. */
  predictFn: (request: SegmentationPredictRequest, frameNum: number) => Promise<SegmentationPredictResponse>;
  /**
   * Prepare the model; called on activation. Rejecting keeps the recipe
   * inactive and reports the error.
   */
  initializeServiceFn?: () => Promise<void>;
}

/** A prediction for one frame. */
export interface SegmentationPredictionResult {
  frameNum: number;
  polygons: SegmentationPolygon[];
  bounds: [number, number, number, number] | null;
  score?: number;
  /** What confirming this prediction creates (default 'polygon'). */
  outputMode: SegmentationOutputMode;
  /** The binary mask to store on confirm; present in mask output mode. */
  mask?: SegmentationMask;
}

/** Points shown on the image for the frame being segmented. */
export interface SegmentationPointsState {
  points: Point[];
  labels: number[];
  frameNum: number;
}

interface FrameSegmentationData {
  points: Point[];
  labels: number[];
  prediction: SegmentationPredictionResult | null;
}

export default class SegmentationPointClick implements Recipe {
  active: Ref<boolean>;

  name: string;

  bus: Vue;

  toggleable: Ref<boolean>;

  icon: Ref<string>;

  /** Hotkey shown on the toolbar button. */
  hotkey = '6';

  /** True while the model is being downloaded/compiled on activation. */
  loading: Ref<boolean>;

  /** True while at least one prediction is in flight. */
  predicting: Ref<boolean>;

  /** Prompt points on the current frame. */
  pointCount: Ref<number>;

  /** Frames with a polygon ready to confirm. */
  predictionCount: Ref<number>;

  private predictFn: SegmentationRecipeOptions['predictFn'] | null = null;

  private initializeServiceFn: (() => Promise<void>) | null = null;

  private serviceInitialized = false;

  private pendingActivation = false;

  private currentFrame = 0;

  /** Per-frame points and predictions. */
  private frameData: Map<number, FrameSegmentationData> = new Map();

  /** Bumped whenever outstanding predictions must be ignored. */
  private predictionVersion = 0;

  private pendingPredictionCount = 0;

  /** Bumped when the in-flight count is reset, so stale requests do not decrement it. */
  private predictingEpoch = 0;

  constructor() {
    this.bus = new Vue();
    this.active = ref(false);
    this.name = SegmentationRecipeName;
    // Hidden until a platform provides a predict function.
    this.toggleable = ref(false);
    this.icon = ref(SegmentationIcon);
    this.loading = ref(false);
    this.predicting = ref(false);
    this.pointCount = ref(0);
    this.predictionCount = ref(0);
  }

  /** Provide the platform's model functions. Must be called before use. */
  initialize(options: SegmentationRecipeOptions): void {
    this.predictionVersion += 1;
    this.clearPredictingState();
    this.predictFn = options.predictFn;
    this.initializeServiceFn = options.initializeServiceFn || null;
    this.serviceInitialized = false;
    this.toggleable.value = true;
  }

  /** Remove the platform functions, e.g. for media that cannot be segmented. */
  disable(): void {
    this.deactivate();
    this.predictFn = null;
    this.initializeServiceFn = null;
    this.serviceInitialized = false;
    this.toggleable.value = false;
  }

  private frame(frameNum: number): FrameSegmentationData {
    let data = this.frameData.get(frameNum);
    if (!data) {
      data = { points: [], labels: [], prediction: null };
      this.frameData.set(frameNum, data);
    }
    return data;
  }

  private syncCounts(): void {
    this.pointCount.value = this.frameData.get(this.currentFrame)?.points.length ?? 0;
    this.predictionCount.value = Array.from(this.frameData.values())
      .filter((data) => data.prediction !== null).length;
  }

  private emitPoints(frameNum = this.currentFrame): void {
    this.syncCounts();
    const data = this.frameData.get(frameNum);
    this.bus.$emit('points-updated', {
      points: data ? data.points.map((p) => [...p] as Point) : [],
      labels: data ? [...data.labels] : [],
      frameNum,
    } as SegmentationPointsState);
  }

  private updateIcon(): void {
    const count = this.frameData.get(this.currentFrame)?.points.length ?? 0;
    this.icon.value = count > 1 ? `mdi-numeric-${Math.min(count, 9)}-circle` : SegmentationIcon;
  }

  private clearPredictingState(): void {
    this.predictingEpoch += 1;
    this.pendingPredictionCount = 0;
    this.predicting.value = false;
  }

  /** Drop all points and predictions without restoring anything. */
  private reset(): void {
    this.predictionVersion += 1;
    this.clearPredictingState();
    this.frameData.clear();
    this.updateIcon();
    this.emitPoints();
  }

  /** Points on the current frame. */
  get points(): Point[] {
    return this.frameData.get(this.currentFrame)?.points ?? [];
  }

  /** Track the frame being shown; points are kept for every frame. */
  handleFrameChange(newFrame: number): void {
    if (newFrame === this.currentFrame) return;
    this.currentFrame = newFrame;
    if (!this.active.value) return;
    this.updateIcon();
    this.emitPoints(newFrame);
  }

  private async makePrediction(
    frameNum: number,
    isFirstPoint: boolean,
    rejectPointOnFailure = true,
  ): Promise<void> {
    const data = this.frameData.get(frameNum);
    if (!this.predictFn || !data || !data.points.length) return;
    this.predictionVersion += 1;
    const version = this.predictionVersion;
    const epoch = this.predictingEpoch;
    const request: SegmentationPredictRequest = {
      points: data.points.map((p) => [...p] as Point),
      pointLabels: [...data.labels],
    };
    this.pendingPredictionCount += 1;
    this.predicting.value = true;
    try {
      const response = await this.predictFn(request, frameNum);
      if (version !== this.predictionVersion) return;
      const polygons = (response.polygons ?? []).filter((p) => p.exterior.length >= 3);
      if (response.success && (polygons.length || response.mask)) {
        data.prediction = {
          frameNum,
          polygons,
          bounds: response.bounds ?? null,
          score: response.score,
          outputMode: response.mask ? 'mask' : 'polygon',
          mask: response.mask,
        };
        this.syncCounts();
        this.bus.$emit('prediction-ready', data.prediction);
      } else if (rejectPointOnFailure) {
        this.rejectLatestPoint(frameNum, response.error || 'Prediction failed', isFirstPoint);
      } else {
        // A refresh (e.g. after a settings change) keeps its prompt points
        // and the previously displayed polygon when it cannot re-run.
        this.bus.$emit('prediction-error', response.error || 'Prediction failed');
      }
    } catch (error) {
      if (version !== this.predictionVersion) return;
      const message = error instanceof Error ? error.message : 'Prediction failed';
      if (rejectPointOnFailure) {
        this.rejectLatestPoint(frameNum, message, isFirstPoint);
      } else {
        this.bus.$emit('prediction-error', message);
      }
    } finally {
      if (epoch === this.predictingEpoch && this.pendingPredictionCount > 0) {
        this.pendingPredictionCount -= 1;
        if (this.pendingPredictionCount === 0) this.predicting.value = false;
      }
    }
  }

  /** Remove the point the model could not use and stay in segmentation mode. */
  private rejectLatestPoint(frameNum: number, error: string, isFirstPoint: boolean): void {
    const data = this.frameData.get(frameNum);
    if (data) {
      data.points.pop();
      data.labels.pop();
    }
    this.updateIcon();
    this.emitPoints(frameNum);
    this.bus.$emit('prediction-error', isFirstPoint ? error : `Latest point rejected by segmentation: ${error}`);
  }

  /** Called by the mode manager for every edit-layer event. */
  update(
    mode: 'in-progress' | 'editing',
    frameNum: number,
    track: Track,
    data: GeoJSON.Feature<GeoJSON.LineString | GeoJSON.Polygon | GeoJSON.Point>[],
  ): Readonly<UpdateResponse> {
    if (!this.active.value) return EmptyResponse;
    const pointFeature = data.find((d) => d.geometry.type === 'Point') as GeoJSON.Feature<GeoJSON.Point> | undefined;
    if (!pointFeature) return EmptyResponse;
    this.currentFrame = frameNum;
    const frame = this.frame(frameNum);
    const coords = [
      pointFeature.geometry.coordinates[0],
      pointFeature.geometry.coordinates[1],
    ] as Point;
    const last = frame.points[frame.points.length - 1];
    const label = pointFeature.properties?.background === true ? 0 : 1;
    const isDuplicate = last && last[0] === coords[0] && last[1] === coords[1]
      && frame.labels[frame.labels.length - 1] === label;
    if (!isDuplicate) {
      const isFirstPoint = frame.points.length === 0;
      frame.points.push(coords);
      frame.labels.push(label);
      this.updateIcon();
      this.emitPoints(frameNum);
      this.makePrediction(frameNum, isFirstPoint);
    }
    // The polygon is applied by the mode manager when the prediction arrives;
    // returning nothing here keeps the edit layer in point placement.
    return { ...EmptyResponse, done: false };
  }

  /** Deleting while placing points discards the in-progress mask. */
  delete(frame: number, track: Track, key: string, type: EditAnnotationTypes): void {
    if (type === 'Point' && this.active.value) this.resetPoints();
  }

  // eslint-disable-next-line class-methods-use-this
  deletePoint(): void {
    // Prompt points are not polygon vertices; nothing to delete here.
  }

  /** Load the model if needed, then enter point placement mode. */
  activate(): void {
    // Re-pressing 6 / clicking the wand while already segmenting is a no-op:
    // restarting would drop the prompt points without restoring the preview.
    if (!this.toggleable.value || this.loading.value || this.active.value) return;
    if (this.initializeServiceFn && !this.serviceInitialized) {
      this.loading.value = true;
      this.icon.value = 'mdi-loading mdi-spin';
      this.pendingActivation = true;
      this.initializeServiceFn()
        .then(() => {
          this.serviceInitialized = true;
          if (this.pendingActivation) this.completeActivation();
        })
        .catch((error) => {
          const message = error instanceof Error ? error.message : 'Unable to load the segmentation model';
          this.bus.$emit('prediction-error', message);
        })
        .finally(() => {
          this.pendingActivation = false;
          this.loading.value = false;
          this.updateIcon();
        });
    } else {
      this.completeActivation();
    }
  }

  private completeActivation(): void {
    this.active.value = true;
    this.reset();
    this.bus.$emit('activate', {
      editing: 'Point' as EditAnnotationTypes,
      key: SegmentationPrimaryPolygonKey,
      recipeName: this.name,
    });
  }

  deactivate(): void {
    this.active.value = false;
    this.pendingActivation = false;
    this.loading.value = false;
    this.reset();
  }

  /** Any frame has a polygon that can be confirmed. */
  hasPendingPrediction(): boolean {
    return Array.from(this.frameData.values()).some((data) => data.prediction !== null);
  }

  /** Any frame has prompt points. */
  hasPoints(): boolean {
    return Array.from(this.frameData.values()).some((data) => data.points.length > 0);
  }

  /**
   * Re-run the current frame's prediction with its existing points, e.g.
   * after the polygon point budget changed. The frame stays encoded, so
   * this only re-runs the prompt decoder.
   */
  refreshPrediction(): void {
    if (!this.active.value) return;
    const data = this.frameData.get(this.currentFrame);
    if (!data?.points.length) return;
    this.makePrediction(this.currentFrame, false, false);
  }

  /** Clear every frame's points and ask listeners to restore the detection. */
  resetPoints(): void {
    this.predictionVersion += 1;
    this.clearPredictingState();
    this.bus.$emit('prediction-reset');
    this.reset();
  }

  /** Commit every frame's polygon and leave segmentation mode. */
  confirmPrediction(): void {
    const frames = Array.from(this.frameData.values())
      .map((data) => data.prediction)
      .filter((p): p is SegmentationPredictionResult => p !== null);
    if (!frames.length) return;
    // Deactivate first: listeners may start a new segmentation (continuous mode).
    this.deactivate();
    this.bus.$emit('prediction-confirmed', frames);
  }

  /** Right click / Enter: confirm when there is a polygon, otherwise just leave. */
  confirm(): void {
    if (!this.active.value) return;
    if (this.hasPendingPrediction()) {
      this.confirmPrediction();
    } else {
      this.deactivate();
      this.bus.$emit('prediction-cancelled');
    }
  }

  mousetrap(): Mousetrap[] {
    return [
      {
        bind: 'enter',
        handler: () => {
          if (this.active.value && this.hasPendingPrediction()) this.confirmPrediction();
        },
      },
    ];
  }
}
