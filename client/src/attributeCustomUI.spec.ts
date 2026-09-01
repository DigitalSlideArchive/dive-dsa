/// <reference types="jest" />
import Track from './track';
import {
  resolveStickyAttributeValue,
  resolveAttributeCustomUI,
  buildCustomUIPayload,
  getCustomUIValueDisplayContent,
  getStickyValueIndicatorStyle,
  getStickyValueTooltip,
  getTruncatedCustomUIDisplayValue,
  shouldShowAttributeInCustomUI,
  CUSTOM_UI_VALUE_SPACE_PLACEHOLDER,
} from './use/attributeCustomUI';
import { Attribute } from './use/AttributeTypes';

describe('attributeCustomUI', () => {
  const stickyStatusAttr: Attribute = {
    belongs: 'detection',
    datatype: 'text',
    name: 'Status',
    key: 'detection_Status',
    customUI: {
      displayValue: true,
      stickyValue: true,
      stickyValueIndicator: { italic: true, underline: true },
    },
  };

  function makeTrackWithStatusKeyframes() {
    const track = Track.fromJSON({
      id: 0,
      begin: 0,
      end: 20,
      confidencePairs: [['customUI', 1]],
      attributes: {},
      features: [
        { frame: 0, bounds: [0, 0, 100, 100], keyframe: true, attributes: { Status: 'idle' } },
        { frame: 10, bounds: [0, 0, 100, 100], keyframe: true, attributes: { Status: 'tracking' } },
        { frame: 20, bounds: [0, 0, 100, 100], keyframe: true, attributes: {} },
      ],
    });
    return track;
  }

  it('inherits sticky detection values from previous keyframes', () => {
    const track = makeTrackWithStatusKeyframes();
    const frame5 = resolveStickyAttributeValue(stickyStatusAttr, {
      frame: 5,
      track,
      userLogin: null,
      stickyValue: true,
      currentValue: undefined,
    });
    expect(frame5.inherited).toBe(true);
    expect(frame5.value).toBe('idle');

    const frame15 = resolveStickyAttributeValue(stickyStatusAttr, {
      frame: 15,
      track,
      userLogin: null,
      stickyValue: true,
      currentValue: undefined,
    });
    expect(frame15.inherited).toBe(true);
    expect(frame15.value).toBe('tracking');
  });

  it('does not inherit when current value is set', () => {
    const track = makeTrackWithStatusKeyframes();
    const result = resolveStickyAttributeValue(stickyStatusAttr, {
      frame: 5,
      track,
      userLogin: null,
      stickyValue: true,
      currentValue: 'scanning',
    });
    expect(result.inherited).toBe(false);
    expect(result.value).toBe('scanning');
  });

  it('disables sticky for track-level attributes', () => {
    const trackAttr: Attribute = {
      belongs: 'track',
      datatype: 'text',
      name: 'TrackLabel',
      key: 'track_TrackLabel',
      customUI: { displayValue: true, stickyValue: true },
    };
    const resolved = resolveAttributeCustomUI(trackAttr);
    expect(resolved.stickyValue).toBe(false);
  });

  it('builds customUI payload with sticky indicator when configured', () => {
    const payload = buildCustomUIPayload({
      displayValue: true,
      stickyValue: true,
      stickyValueIndicator: { italic: true, underline: true },
      valuePosition: 'above',
      longValueMode: 'scroll',
    });
    expect(payload?.stickyValue).toBe(true);
    expect(payload?.stickyValueIndicator?.italic).toBe(true);
    expect(payload?.valuePosition).toBe('above');
    expect(payload?.longValueMode).toBe('scroll');
  });

  it('builds header value display options when valuePosition is header', () => {
    const payload = buildCustomUIPayload({
      displayValue: true,
      valuePosition: 'header',
      headerValueSeparator: '-',
      headerValueOffset: 10,
    });
    expect(payload?.valuePosition).toBe('header');
    expect(payload?.headerValueSeparator).toBe('-');
    expect(payload?.headerValueOffset).toBe(10);
  });

  it('resolves header separator and offset defaults', () => {
    const resolved = resolveAttributeCustomUI({
      belongs: 'detection',
      customUI: { displayValue: true, valuePosition: 'header' },
    });
    expect(resolved.headerValueSeparator).toBe(':');
    expect(resolved.headerValueOffset).toBe(4);
  });

  it('shows attributes with buttons or showWithoutButtons in custom UI', () => {
    const withButtons: Attribute = {
      belongs: 'detection',
      datatype: 'text',
      name: 'Status',
      key: 'detection_Status',
      shortcuts: [{ type: 'set', value: 'idle', button: { buttonText: 'Idle' } }],
    };
    const withoutButtons: Attribute = {
      belongs: 'detection',
      datatype: 'text',
      name: 'Notes',
      key: 'detection_Notes',
      customUI: { showWithoutButtons: true },
    };
    expect(shouldShowAttributeInCustomUI(withButtons, 1)).toBe(true);
    expect(shouldShowAttributeInCustomUI(withoutButtons, 0)).toBe(true);
  });

  it('applies sticky indicator styling on keyframe values, not inherited ones', () => {
    const indicator = {
      bold: true,
      italic: false,
      underline: false,
      fontSizeScale: 1.5,
      opacity: 1,
    };
    expect(getStickyValueIndicatorStyle(indicator, true).fontWeight).toBe('bold');
    expect(getStickyValueIndicatorStyle(indicator, true).fontSize).toBe('150%');
    expect(getStickyValueIndicatorStyle(indicator, false)).toEqual({});
  });

  it('formats sticky tooltip and truncated long values', () => {
    expect(getStickyValueTooltip(true, 'idle')).toBe('idle (inherited from previous keyframe)');
    expect(getStickyValueTooltip(false, 'idle')).toBe('idle');
    const longText = 'x'.repeat(60);
    expect(getTruncatedCustomUIDisplayValue(longText, longText.length, 'truncate')).toMatch(/\.\.\.$/);
  });

  it('reserves display space for empty values when configured', () => {
    expect(getCustomUIValueDisplayContent('', true)).toBe(CUSTOM_UI_VALUE_SPACE_PLACEHOLDER);
    expect(getCustomUIValueDisplayContent('', false)).toBe('');
    expect(getCustomUIValueDisplayContent('idle', true)).toBe('idle');
  });
});
