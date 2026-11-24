/// <reference types="jest" />
import { ref } from 'vue';
import MaskLayer, { MaskLayerIdleRenders } from './maskLayer';

function makeAnnotator() {
  const created: Record<string, jest.Mock>[] = [];
  const geoViewer = {
    createLayer: jest.fn(() => {
      const draw = jest.fn();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const quad: any = { draw };
      quad.data = jest.fn(() => quad);
      let visible = true;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const layer: any = {
        createFeature: jest.fn(() => quad),
        node: jest.fn(() => ({ css: jest.fn() })),
        opacity: jest.fn(),
        visible: jest.fn((val?: boolean) => {
          if (val === undefined) return visible;
          visible = val;
          return layer;
        }),
        quadDraw: draw,
      };
      created.push(layer as unknown as Record<string, jest.Mock>);
      return layer;
    }),
    deleteLayer: jest.fn(),
  };
  const annotator = {
    geoViewerRef: ref(geoViewer),
    frameSize: ref([100, 50]),
  };
  return { annotator, geoViewer, created };
}

function mask(trackId: number, data = new Uint8Array(4)) {
  return {
    trackId, type: 'fish', mask: data, width: 1, height: 2,
  };
}

describe('MaskLayer', () => {
  it('skips redrawing a quad whose mask buffer has not changed', () => {
    const { annotator, created } = makeAnnotator();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const layer = new MaskLayer({ annotator: annotator as any, typeStyling: ref({}) as any });
    const data = new Uint8Array(4);
    layer.setSegmenationLuminanceRLE([mask(1, data)]);
    layer.setSegmenationLuminanceRLE([mask(1, data)]);
    expect(created).toHaveLength(1);
    expect(created[0].quadDraw).toHaveBeenCalledTimes(1);
    layer.setSegmenationLuminanceRLE([mask(1, new Uint8Array(4))]);
    expect(created[0].quadDraw).toHaveBeenCalledTimes(2);
  });

  it('hides only tracks missing from the frame', () => {
    const { annotator, created } = makeAnnotator();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const layer = new MaskLayer({ annotator: annotator as any, typeStyling: ref({}) as any });
    layer.setSegmenationLuminanceRLE([mask(1), mask(2)]);
    created.forEach((l) => l.visible.mockClear());
    layer.setSegmenationLuminanceRLE([mask(1)]);
    expect(created[0].visible).not.toHaveBeenCalled();
    expect(created[1].visible).toHaveBeenCalledWith(false);
  });

  it('deletes layers that stay idle', () => {
    const { annotator, geoViewer } = makeAnnotator();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const layer = new MaskLayer({ annotator: annotator as any, typeStyling: ref({}) as any });
    layer.setSegmenationLuminanceRLE([mask(1), mask(2)]);
    for (let i = 0; i < MaskLayerIdleRenders; i += 1) {
      layer.setSegmenationLuminanceRLE([mask(1)]);
    }
    expect(geoViewer.deleteLayer).not.toHaveBeenCalled();
    layer.setSegmenationLuminanceRLE([mask(1)]);
    expect(geoViewer.deleteLayer).toHaveBeenCalledTimes(1);
    expect(Object.keys(layer.featureLayers)).toEqual(['1']);
  });
});
