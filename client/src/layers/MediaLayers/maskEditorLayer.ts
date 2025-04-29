import { MediaController } from 'vue-media-annotator/components/annotators/mediaControllerType';
import { Ref } from 'vue';
import { TypeStyling } from '../../StyleManager';

export default class MaskEditorLayer {
  annotator: MediaController;

  typeStyling: Ref<TypeStyling>;

  opacity: number;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  featureLayer: any;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  quad:any;

  width: number;

  height: number;

  editingImage: HTMLImageElement | null;

  canvas: HTMLCanvasElement | null;

  ctx: CanvasRenderingContext2D | null;

  constructor({
    annotator,
    typeStyling,
  }: { annotator: MediaController; typeStyling: Ref<TypeStyling>}) {
    this.annotator = annotator;
    this.typeStyling = typeStyling;
    this.opacity = 50;
    this.quad = {};
    this.width = 0;
    this.height = 0;
    this.editingImage = null;
    this.featureLayer = this.annotator.geoViewerRef.value.createLayer('feature', {
      features: ['quad.image'],
      renderer: 'canvas',
      autoshareRenderer: false,
    });
    [this.canvas] = this.featureLayer.canvas();
    console.log(this.canvas);
    this.quad = this.featureLayer.createFeature('quad');
    if (this.canvas) {
      this.ctx = this.canvas.getContext('2d');
    } else {
      this.ctx = null;
    }
  }

  setCanvas() {
    if (!this.canvas) {
      [this.canvas] = this.featureLayer.canvas();
      if (this.canvas) {
        this.ctx = this.canvas.getContext('2d');
      } else {
        this.ctx = null;
      }
    }
  }

  setEditingImage(data: { trackId: number, image: HTMLImageElement}) {
    const [width, height] = this.annotator.frameSize.value;
    this.width = width;
    this.height = height;
    this.editingImage = data.image;
    this.quad.data([
      {
        ul: { x: 0, y: 0 },
        lr: { x: width, y: height },
        image: this.editingImage,
      },
    ])
      .draw();
    this.featureLayer.visible(true);
    this.setCanvas();
    console.log(this.quad);
  }

  drawPoint(x: number, y:number) {
    console.log(`ctx: ${this.ctx} editingImage: ${this.editingImage} canvas: ${this.canvas}`);
    const updated = this.quad.featureGcsToDisplay({ x, y });
    console.log(updated);
    if (this.ctx && this.editingImage && this.canvas) {
      this.ctx.beginPath();
      this.ctx.arc(updated.x, updated.y, 5, 0, Math.PI * 2);
      this.ctx.fillStyle = 'red';
      this.ctx.fill();
      console.log('drawing Point');
    }
  }

  disable() {
    this.featureLayer.visible(false);
  }
}
