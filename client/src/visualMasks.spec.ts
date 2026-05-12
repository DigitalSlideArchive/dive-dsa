/// <reference types="jest" />
import VisualMaskManager, { VisualMask } from './visualMasks';
import StyleManager from './StyleManager';

describe('VisualMask', () => {
  it('persists the first shape until a later keyframe changes it', () => {
    const mask = new VisualMask({
      id: 1,
      name: 'Road Mask',
      type: 'rectangle',
      frames: [{
        frame: 10,
        bounds: [0, 0, 10, 10],
        keyframe: true,
      }, {
        frame: 20,
        bounds: [5, 5, 15, 15],
        keyframe: true,
      }],
    });

    expect(mask.getFeature(0)?.bounds).toEqual([0, 0, 10, 10]);
    expect(mask.getFeature(15)?.bounds).toEqual([0, 0, 10, 10]);
    expect(mask.getFeature(20)?.bounds).toEqual([5, 5, 15, 15]);
    expect(mask.getFeature(30)?.bounds).toEqual([5, 5, 15, 15]);
  });

describe('VisualMaskManager', () => {
  it('serializes per-camera visual masks with their styles', () => {
    const styleManager = new StyleManager({ markChangesPending: () => {} });
    let serializedMasks = {};
    const manager = new VisualMaskManager({
      markChangesPending: () => {},
      styleManager,
      syncConfiguration: (visualMasks) => {
        serializedMasks = visualMasks;
      },
    });

    const id = manager.addMask('singleCam');
    manager.setMaskStyle('singleCam', id, { color: '#ff0000', opacity: 0.5 });
    manager.updateRectBounds('singleCam', 12, [1, 2, 3, 4], id);

    expect(serializedMasks).toEqual({
      singleCam: [{
        id,
        name: 'Mask 1',
        enabled: true,
        type: 'rectangle',
        frames: [{
          frame: 12,
          bounds: [1, 2, 3, 4],
          keyframe: true,
        }],
        style: {
          color: '#ff0000',
          fill: true,
          opacity: 0.5,
          strokeWidth: 3,
        },
      }],
    });
  });

  it('always creates rectangle visual masks', () => {
    const styleManager = new StyleManager({ markChangesPending: () => {} });
    const manager = new VisualMaskManager({
      markChangesPending: () => {},
      styleManager,
      syncConfiguration: () => {},
    });

    const id = manager.addMask('singleCam', 'Polygon');

    expect(manager.getMask('singleCam', id)?.type).toBe('rectangle');
    expect(manager.editingMode.value).toBe('rectangle');
  });
});
