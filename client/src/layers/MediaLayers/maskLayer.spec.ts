/// <reference types="jest" />
import { ref } from 'vue';
import { binaryMaskToCropped } from 'vue-media-annotator/use/rle';
import MaskLayer from './maskLayer';

function makeAnnotator() {
  const quad: { data: jest.Mock; draw: jest.Mock } = { data: jest.fn(), draw: jest.fn() };
  quad.data.mockReturnValue(quad);
  let visible = true;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layer: any = {
    createFeature: jest.fn(() => quad),
    opacity: jest.fn(),
    visible: jest.fn((val?: boolean) => {
      if (val === undefined) return visible;
      visible = val;
      return layer;
    }),
  };
  const geoViewer = { createLayer: jest.fn(() => layer) };
  const annotator = { geoViewerRef: ref(geoViewer), frameSize: ref([200, 100]) };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const maskLayer = new MaskLayer({ annotator: annotator as any, typeStyling: ref({}) as any });
  return {
    maskLayer, geoViewer, layer, quad,
  };
}

/** 4x2 mask with pixels at (1..2, 0..1) */
const cropped = (color = '#ff0000') => binaryMaskToCropped(new Uint8Array([0, 1, 1, 0, 0, 1, 1, 0]), 4, 2, color);

describe('MaskLayer', () => {
  it('uses one layer and one quad per mask, scaled to the frame', () => {
    const { maskLayer, geoViewer, quad } = makeAnnotator();
    maskLayer.setMasks([{ trackId: 1, mask: cropped() }, { trackId: 2, mask: cropped('#00ff00') }]);
    expect(geoViewer.createLayer).toHaveBeenCalledTimes(1);
    const [data] = quad.data.mock.calls[0];
    expect(data).toHaveLength(2);
    // mask is 4x2 in a 200x100 frame: x scale 50, y scale 50
    expect(data[0].ul).toEqual({ x: 50, y: 0 });
    expect(data[0].lr).toEqual({ x: 150, y: 100 });
    expect(data[0].texture).toMatchObject({ width: 2, height: 2, type: 'RGBA' });
  });

  it('reuses quad datums and skips redraws for unchanged masks', () => {
    const { maskLayer, quad } = makeAnnotator();
    const a = cropped();
    const b = cropped('#00ff00');
    maskLayer.setMasks([{ trackId: 1, mask: a }]);
    maskLayer.setMasks([{ trackId: 1, mask: a }]);
    expect(quad.draw).toHaveBeenCalledTimes(1);
    maskLayer.setMasks([{ trackId: 1, mask: a }, { trackId: 2, mask: b }]);
    expect(quad.draw).toHaveBeenCalledTimes(2);
    // same datum object for `a`, so geojs keeps its built quad and texture
    expect(quad.data.mock.calls[1][0][0]).toBe(quad.data.mock.calls[0][0][0]);
  });

  it('hides the layer when there are no masks and skips empty masks', () => {
    const { maskLayer, layer, quad } = makeAnnotator();
    maskLayer.setMasks([{ trackId: 1, mask: cropped() }]);
    maskLayer.setMasks([{ trackId: 1, mask: binaryMaskToCropped(new Uint8Array(8), 4, 2, '#fff') }]);
    expect(layer.visible).toHaveBeenLastCalledWith(false);
    expect(quad.draw).toHaveBeenCalledTimes(1);
    maskLayer.setMasks([{ trackId: 1, mask: cropped() }]);
    expect(layer.visible).toHaveBeenLastCalledWith(true);
  });
});
