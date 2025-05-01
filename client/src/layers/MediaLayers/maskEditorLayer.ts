/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { MediaController } from 'vue-media-annotator/components/annotators/mediaControllerType';
import { Ref, watch } from 'vue';
import geo, { GeoEvent } from 'geojs';
import { cloneDeep } from 'lodash';
import { MaskEditingTools, UseMaskInterface } from 'vue-media-annotator/use/useMasks';
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

  brushSize: Ref<number>;

  upperLeftCorner: {x: number; y: number };

  lowerRightCorner: {x: number; y: number };

  trackId: number | null;

  constructor({
    annotator,
    typeStyling,
    editorOptions,
    editorFunctions,
  }: { annotator: MediaController; typeStyling: Ref<TypeStyling>, editorOptions: UseMaskInterface['editorOptions'], editorFunctions: UseMaskInterface['editorFunctions']}) {
    this.annotator = annotator;
    this.typeStyling = typeStyling;
    this.opacity = 50;
    this.quad = {};
    this.width = 0;
    this.height = 0;
    this.editingImage = null;
    this.trackId = null;
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
    this.noActionOptions.actions = [this.interactorOptions.actions[2], this.interactorOptions.actions[3]];
    this.upperLeftCorner = { x: 0, y: 0 };
    this.lowerRightCorner = { x: 0, y: 0 };
    this.color = 'white';
    this.featureLayer.geoOn(geo.event.mousemove, (e: GeoEvent) => {
      const { x, y } = e.geo;
      if (!e.buttons.left && this.mouseDown) {
        this.mouseDown = false;
        this.updateCanvas();
      }
      if (e.buttons.left) {
        if (x > 0 && x < this.width && y > 0 && y < this.height) {
          this.mouseDown = true;
          this.drawPoint(x, y);
        }
      }
    });

    this.brushSize = editorOptions.brushSize;
    watch(editorOptions.toolEnabled, async () => {
      if (editorOptions.toolEnabled.value === 'pointer') {
        this.annotator.geoViewerRef.value.interactor().options(this.interactorOptions);
        this.updateCanvas();
      } else {
        this.annotator.geoViewerRef.value.interactor().options(this.noActionOptions);
        if (editorOptions.toolEnabled.value === 'brush') {
          this.color = 'white';
        } else if (editorOptions.toolEnabled.value === 'eraser') {
          this.color = 'transparent';
        }
      }
    });
    this.featureLayer.opacity(editorOptions.opacity.value / 100.0);
    watch(editorOptions.opacity, () => {
      this.featureLayer.opacity(editorOptions.opacity.value / 100.0);
    });

    watch(editorOptions.triggerAction, () => {
      if (editorOptions.triggerAction.value === 'save' && this.trackId !== null && this.editingImage) {
        editorFunctions.addUpdateMaskFrame(this.trackId, this.editingImage);
        editorFunctions.setEditorOptions({ triggerAction: null });
      }
    });
  }

  updateCanvas() {
    if (this.canvas && this.ctx && this.editingImage) {
      // The Image needs to be redrawn at the proper size when switching back to controlled mode.
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = this.width;
      tempCanvas.height = this.height;
      const tempCtx = tempCanvas.getContext('2d');
      if (tempCtx) {
        tempCtx.drawImage(this.editingImage, 0, 0);
        // Next if we are zoomed in we need  to calculate the current bounds of the area
        const currentUpperLeft = this.annotator.geoViewerRef.value.displayToGcs({ x: 0, y: 0 });
        const currentLowerRight = this.annotator.geoViewerRef.value.displayToGcs({ x: this.canvas.width, y: this.canvas.height });
        const map = this.annotator.geoViewerRef.value;
        const imageUL = { x: 0, y: 0 };
        const imageLR = { x: this.width, y: this.height };

        // Intersect bounds in GCS
        const intersectUL = {
          x: Math.max(imageUL.x, currentUpperLeft.x),
          y: Math.max(imageUL.y, currentUpperLeft.y),
        };
        if (intersectUL.x < 0) {
          intersectUL.x = 0;
        }
        if (intersectUL.y < 0) {
          intersectUL.y = 0;
        }
        const intersectLR = {
          x: Math.min(imageLR.x, currentLowerRight.x),
          y: Math.min(imageLR.y, currentLowerRight.y),
        };
        if (intersectLR.x > this.width) {
          intersectLR.x = this.width;
        }
        if (intersectLR.y > this.height) {
          intersectLR.y = this.height;
        }
        // If no overlap, skip drawing
        if (intersectUL.x < intersectLR.x && intersectUL.y < intersectLR.y) {
          // Convert GCS to display (canvas) space
          const srcUL = map.gcsToDisplay(intersectUL);
          const srcLR = map.gcsToDisplay(intersectLR);
          const dstUL = map.gcsToDisplay(intersectUL);
          const dstLR = map.gcsToDisplay(intersectLR);

          const sx = srcUL.x;
          const sy = srcUL.y;
          const sWidth = srcLR.x - srcUL.x;
          const sHeight = srcLR.y - srcUL.y;

          const dx = intersectUL.x;
          const dy = intersectUL.y;
          const dWidth = intersectLR.x - intersectUL.x;
          const dHeight = intersectLR.y - intersectUL.y;
          tempCtx.clearRect(dx, dy, dWidth, dHeight);
          tempCtx.drawImage(this.canvas, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight);
        }
        this.editingImage.src = tempCanvas.toDataURL();
      }
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

  setEditingImage(data: { trackId: number, image: HTMLImageElement | undefined}) {
    const [width, height] = this.annotator.frameSize.value;
    this.trackId = data.trackId;
    this.width = width;
    this.height = height;
    this.upperLeftCorner = this.quad.featureGcsToDisplay({ x: 0, y: 0 });
    this.lowerRightCorner = this.quad.featureGcsToDisplay({ x: this.width, y: this.height });
    if (data.image) {
      this.editingImage = data.image;
    } else {
      this.editingImage = new Image(this.width, this.height);
    }
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
    this.featureLayer.node().css('filter', `url(#mask-filter-${data.trackId})`);
  }

  drawPoint(x: number, y:number) {
    const updated = this.quad.featureGcsToDisplay({ x, y });
    const brushGcsSize = this.quad.featureGcsToDisplay({ x: x + this.brushSize.value, y: y + this.brushSize.value });
    const updateBrushSize = brushGcsSize.x - updated.x;
    if (this.ctx && this.editingImage && this.canvas) {
      if (this.color === 'white') {
        this.ctx.beginPath();
        this.ctx.arc(updated.x, updated.y, updateBrushSize, 0, Math.PI * 2);
        this.ctx.fillStyle = 'white';
        this.ctx.fill();
      } else if (this.color === 'transparent') {
        this.ctx.save(); // Save the current state
        this.ctx.globalCompositeOperation = 'destination-out';
        this.ctx.beginPath();
        this.ctx.arc(updated.x, updated.y, updateBrushSize, 0, Math.PI * 2);
        this.ctx.fillStyle = 'rgba(0,0,0,1)'; // color doesn't matter when erasing
        this.ctx.fill();
        this.ctx.restore();
      }
    }
  }

  disable() {
    this.featureLayer.visible(false);
    this.annotator.geoViewerRef.value.interactor().options(this.interactorOptions);
    this.editingImage = null;
    this.trackId = null;
  }
}
