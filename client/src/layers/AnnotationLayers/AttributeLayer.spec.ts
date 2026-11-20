/**
 * @jest-environment jsdom
 */
/// <reference types="jest" />
import type { Attribute, AttributeRendering } from '../../use/AttributeTypes';
import type { TypeStyling } from '../../StyleManager';
import Track from '../../track';
import type { FrameDataTrack } from '../LayerTypes';
import AttributeLayer, { defaultFormatter } from './AttributeLayer';

function render(overrides: Partial<AttributeRendering> = {}): AttributeRendering {
  return {
    typeFilter: ['all'],
    displayName: '',
    displayColor: 'auto',
    displayTextSize: 12,
    valueColor: 'auto',
    valueTextSize: 12,
    order: 0,
    location: 'outside',
    box: false,
    boxColor: 'auto',
    boxThickness: 1,
    layout: 'vertical',
    displayWidth: { type: 'px', val: 10 },
    displayHeight: { type: 'px', val: 10 },
    ...overrides,
  };
}

function attr(
  name: string,
  belongs: Attribute['belongs'],
  datatype: Attribute['datatype'],
  extra: Partial<Attribute> = {},
): Attribute {
  return {
    name,
    belongs,
    datatype,
    key: `${belongs}_${name}`,
    render: render({ displayName: `${name}:` }),
    ...extra,
  };
}

/** Build the per-attribute color functions without needing a GeoJS annotator */
function colorFunctions(attributes: Attribute[], user = '') {
  const holder = {} as AttributeLayer;
  AttributeLayer.prototype.updateRenderAttributes.call(holder, attributes, user);
  return holder.autoColorIndex;
}

function makeAnnotation(
  type: string,
  detectionAttributes: Record<string, unknown>,
  trackAttributes: Record<string, unknown> = {},
): FrameDataTrack {
  const track = Track.fromJSON({
    id: 1,
    meta: {},
    attributes: trackAttributes,
    confidencePairs: [[type, 1]],
    begin: 0,
    end: 0,
    features: [{ frame: 0, bounds: [0, 0, 100, 100], attributes: detectionAttributes }],
  });
  return {
    selected: false,
    editing: false,
    track,
    groups: [],
    features: track.features[0],
    styleType: [type, 1],
  } as FrameDataTrack;
}

const typeStyling = { color: () => 'gray' } as unknown as TypeStyling;

/** [text, color] pairs of the value lines (every second entry is the attribute's name line) */
function valueLines(annotation: FrameDataTrack, attributes: Attribute[], user = '') {
  const rows = defaultFormatter(annotation, attributes, user, typeStyling, colorFunctions(attributes, user), 0) || [];
  return rows.filter((_, i) => i % 2 === 1).map((row) => [row.text, row.color]);
}

function nameLines(annotation: FrameDataTrack, attributes: Attribute[]) {
  const rows = defaultFormatter(annotation, attributes, '', typeStyling, colorFunctions(attributes), 0) || [];
  return rows.filter((_, i) => i % 2 === 0).map((row) => [row.text, row.color]);
}

describe('AttributeLayer defaultFormatter', () => {
  beforeAll(() => {
    // jsdom has no canvas; the formatter falls back to a default line height without one
    jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  });

  const fishOnly = attr('FishOnly', 'detection', 'text', {
    color: '#aaaaaa',
    valueColors: { a: '#aa0000' },
    render: render({ displayName: 'FishOnly:', typeFilter: ['fish'] }),
  });
  const status = attr('Status', 'detection', 'text', {
    color: '#0000ff',
    valueColors: { open: '#ff0000' },
  });
  const flag = attr('Flag', 'detection', 'boolean', {
    color: '#111111',
    valueColors: { true: '#00ff00' },
  });

  it('uses each attribute\'s own colors after another is filtered out by type', () => {
    const annotation = makeAnnotation('bird', { FishOnly: 'a', Status: 'open' });
    expect(valueLines(annotation, [fishOnly, status])).toEqual([['open', '#ff0000']]);
    expect(nameLines(annotation, [fishOnly, status])).toEqual([['Status:', '#0000ff']]);
  });

  it('colors boolean attributes and the attributes after them', () => {
    const annotation = makeAnnotation('bird', { Flag: true, Status: 'open' });
    expect(valueLines(annotation, [flag, status])).toEqual([
      ['true', '#00ff00'],
      ['open', '#ff0000'],
    ]);
  });

  it('falls back to the attribute color for a boolean value without a value color', () => {
    const annotation = makeAnnotation('bird', { Flag: false });
    expect(valueLines(annotation, [flag])).toEqual([['false', '#111111']]);
  });

  it('reads the user value for a user track attribute after a filtered attribute', () => {
    const owner = attr('Owner', 'track', 'text', { user: true, color: '#123456' });
    const annotation = makeAnnotation(
      'bird',
      { FishOnly: 'a' },
      { Owner: 'shared', userAttributes: { bob: { Owner: 'mine' } } },
    );
    expect(valueLines(annotation, [fishOnly, owner], 'bob')).toEqual([['mine', '#123456']]);
  });
});
