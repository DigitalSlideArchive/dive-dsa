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

  it('defaults style opacity to fully opaque', () => {
    const mask = new VisualMask({
      id: 2,
      name: 'Opaque Mask',
      type: 'rectangle',
      frames: [],
    });

    expect(mask.style.opacity).toBe(1);
  });

  it('converts relative mask bounds to the current frame size for display', () => {
    const mask = new VisualMask({
      id: 3,
      name: 'Relative Mask',
      type: 'rectangle',
      useRelativePositioning: true,
      frames: [{
        frame: 10,
        bounds: [10, 20, 30, 40],
        keyframe: true,
      }],
    });

    expect(mask.getFeature(10, [200, 50])?.bounds).toEqual([20, 10, 60, 20]);
  });
});

describe('VisualMaskManager', () => {
  it('serializes per-camera visual masks with relative bounds by default', () => {
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
    manager.updateRectBounds('singleCam', 12, [10, 20, 30, 40], id, [200, 200]);

    expect(serializedMasks).toEqual({
      singleCam: [{
        id,
        name: 'Mask 1',
        enabled: true,
        useRelativePositioning: true,
        type: 'rectangle',
        frames: [{
          frame: 12,
          bounds: [5, 10, 15, 20],
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

  it('converts stored bounds when toggling relative positioning', () => {
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
    manager.updateRectBounds('singleCam', 12, [10, 20, 30, 40], id, [200, 200]);
    manager.setMaskRelativePositioning('singleCam', id, false, [200, 200]);

    expect(serializedMasks).toEqual({
      singleCam: [{
        id,
        name: 'Mask 1',
        enabled: true,
        useRelativePositioning: false,
        type: 'rectangle',
        frames: [{
          frame: 12,
          bounds: [10, 20, 30, 40],
          keyframe: true,
        }],
        style: {
          color: '#000000',
          fill: true,
          opacity: 1,
          strokeWidth: 3,
        },
      }],
    });
  });

  it('converts absolute masks to percentage bounds when enabling relative positioning', () => {
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
    manager.setMaskRelativePositioning('singleCam', id, false, [200, 200]);
    manager.updateRectBounds('singleCam', 12, [10, 20, 30, 40], id, [200, 200]);
    manager.setMaskRelativePositioning('singleCam', id, true, [200, 200]);

    expect(serializedMasks).toEqual({
      singleCam: [{
        id,
        name: 'Mask 1',
        enabled: true,
        useRelativePositioning: true,
        type: 'rectangle',
        frames: [{
          frame: 12,
          bounds: [5, 10, 15, 20],
          keyframe: true,
        }],
        style: {
          color: '#000000',
          fill: true,
          opacity: 1,
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

    const id = manager.addMask('singleCam');

    expect(manager.getMask('singleCam', id)?.type).toBe('rectangle');
    expect(manager.getMask('singleCam', id)?.useRelativePositioning).toBe(true);
    expect(manager.editingMode.value).toBe('rectangle');
  });
});
