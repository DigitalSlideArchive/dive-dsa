import { normalizeLaunchConfigs, splitLaunchConfigs } from './launchConfigs';

const mk = (id: string, order?: number, folder = 'f') => ({
  id, label: id, configurationFolderId: folder, order,
});

describe('launchConfigs', () => {
  it('normalizes and sorts', () => {
    expect(normalizeLaunchConfigs(undefined)).toEqual([]);
    const out = normalizeLaunchConfigs([mk('b', 2), mk('bad', 0, ''), mk('a', 1), mk('c')]);
    expect(out.map((c) => c.id)).toEqual(['c', 'a', 'b']);
  });
  it('splits inline vs overflow', () => {
    const list = ['a', 'b', 'c', 'd', 'e'].map((i) => mk(i));
    const { inline, overflow } = splitLaunchConfigs(list);
    expect(inline).toHaveLength(3);
    expect(overflow).toHaveLength(2);
  });
});
