import { MediaController } from '../../components/annotators/mediaControllerType';

interface SegmentationPointData {
  x: number;
  y: number;
  label: number; // 1=foreground, 0=background
}

export const ForegroundPointColor = '#00FF00';
export const BackgroundPointColor = '#FF0000';

/**
 * Displays segmentation prompt points (green=foreground, red=background).
 * Not a BaseLayer: the points are UI feedback for the active segmentation,
 * not track data.
 */
export default class SegmentationPointsLayer {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private featureLayer: any;

  private annotator: MediaController;

  private points: SegmentationPointData[] = [];

  constructor(annotator: MediaController) {
    this.annotator = annotator;
    this.initialize();
  }

  private initialize() {
    const layer = this.annotator.geoViewerRef.value.createLayer('feature', {
      features: ['point'],
    });
    this.featureLayer = layer.createFeature('point');
    this.featureLayer.style({
      radius: 6,
      strokeWidth: 2,
      strokeColor: '#FFFFFF',
      fillColor: (data: SegmentationPointData) => (data.label === 1 ? ForegroundPointColor : BackgroundPointColor),
      fillOpacity: 0.85,
      strokeOpacity: 1,
    });
    this.featureLayer.position((data: SegmentationPointData) => ({
      x: data.x,
      y: data.y,
    }));
  }

  /**
   * @param points - [x, y] image coordinates
   * @param labels - 1=foreground, 0=background
   */
  updatePoints(points: [number, number][], labels: number[]) {
    this.points = points.map((p, i) => ({
      x: p[0],
      y: p[1],
      label: labels[i] ?? 1,
    }));
    this.redraw();
  }

  clear() {
    this.points = [];
    this.redraw();
  }

  private redraw() {
    this.featureLayer.data(this.points).draw();
  }
}
