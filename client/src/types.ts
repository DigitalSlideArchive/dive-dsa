export interface Mousetrap {
  bind: string;
  handler: () => unknown;
}

export interface AnnotatorPreferences {
  trackTails: {
    before: number;
    after: number;
  };
  overlays: {
    opacity: number;
    colorTransparency: boolean;
    overrideValue?: boolean;
    overrideColor?: string;
    overrideVariance?: number;
    colorScale: boolean;
    blackColorScale?: string;
    whiteColorScale?: string;
  };
}
