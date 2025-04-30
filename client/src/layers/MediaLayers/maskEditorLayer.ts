/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { MediaController } from 'vue-media-annotator/components/annotators/mediaControllerType';
import { Ref, watch } from 'vue';
import geo, { GeoEvent } from 'geojs';
import { cloneDeep } from 'lodash';
import { UseMaskInterface } from 'vue-media-annotator/use/useMasks';
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

  mouseDown: boolean;

  interactorOptions: any | null;

  noActionOptions: any;

  color: 'white' | 'transparent';

  constructor({
    annotator,
    typeStyling,
    editorOptions,
  }: { annotator: MediaController; typeStyling: Ref<TypeStyling>, editorOptions: UseMaskInterface['editorOptions']}) {
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
    this.quad = this.featureLayer.createFeature('quad');
    if (this.canvas) {
      this.ctx = this.canvas.getContext('2d');
    } else {
      this.ctx = null;
    }
    this.mouseDown = false;
    this.interactorOptions = this.annotator.geoViewerRef.value.interactor().options();
    this.noActionOptions = cloneDeep(this.interactorOptions);
    this.noActionOptions.actions = [];
    this.color = 'white';
    this.featureLayer.geoOn(geo.event.mousemove, (e: GeoEvent) => {
      const { x, y } = e.geo;
      if (!e.buttons.left && this.mouseDown) {
        this.mouseDown = false;
      }
      if (e.buttons.left) {
        if (x > 0 && x < this.width && y > 0 && y < this.height) {
          this.mouseDown = true;
          this.drawPoint(x, y);
        }
      }
    });
    watch(editorOptions.toolEnabled, () => {
      if (editorOptions.toolEnabled.value === 'pointer') {
        this.annotator.geoViewerRef.value.interactor().options(this.interactorOptions);
        if (this.canvas && this.ctx && this.editingImage) {
          this.editingImage.src = this.canvas.toDataURL();
        }
      } else {
        this.annotator.geoViewerRef.value.interactor().options(this.noActionOptions);
        if (editorOptions.toolEnabled.value === 'brush') {
          this.color = 'white';
        } else if (editorOptions.toolEnabled.value === 'eraser') {
          this.color = 'transparent';
        }
      }
    });
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
    const updated = this.quad.featureGcsToDisplay({ x, y });
    if (this.ctx && this.editingImage && this.canvas) {
      if (this.color === 'white') {
        this.ctx.beginPath();
        this.ctx.arc(updated.x, updated.y, 5, 0, Math.PI * 2);
        this.ctx.fillStyle = 'white';
        this.ctx.fill();
      } else if (this.color === 'transparent') {
        this.ctx.save(); // Save the current state
        this.ctx.globalCompositeOperation = 'destination-out';
        this.ctx.beginPath();
        this.ctx.arc(updated.x, updated.y, 5, 0, Math.PI * 2);
        this.ctx.fillStyle = 'rgba(0,0,0,1)'; // color doesn't matter when erasing
        this.ctx.fill();
        this.ctx.restore();
      }
    }
  }

  disable() {
    this.featureLayer.visible(false);
  }
}
