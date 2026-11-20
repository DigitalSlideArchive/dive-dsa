/**
 * @jest-environment jsdom
 */
/// <reference types="jest" />

describe('textMeasure', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.resetModules();
  });

  function fakeContext(ascent: number) {
    return {
      font: '',
      measureText: jest.fn(() => ({ actualBoundingBoxAscent: ascent })),
    } as unknown as CanvasRenderingContext2D;
  }

  it('reuses one context and measures each font once', async () => {
    const context = fakeContext(10);
    const getContext = jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as never);
    const { getLineHeight, getMeasureContext } = await import('./textMeasure');
    expect(getLineHeight('bold 16px sans-serif', 15)).toBeCloseTo(13);
    expect(getLineHeight('bold 16px sans-serif', 15)).toBeCloseTo(13);
    expect(getMeasureContext()).toBe(context);
    expect(getContext).toHaveBeenCalledTimes(1);
    expect(context.measureText).toHaveBeenCalledTimes(1);
  });

  it('falls back without a context and tries again later', async () => {
    const getContext = jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const { getLineHeight } = await import('./textMeasure');
    expect(getLineHeight('bold 12px sans-serif', 15)).toBe(15);
    getContext.mockReturnValue(fakeContext(20) as never);
    expect(getLineHeight('bold 12px sans-serif', 15)).toBeCloseTo(26);
  });
});
