import { readUrlParam, readConfigFolderIdFromUrl } from './configFolderParam';

describe('configFolderParam', () => {
  it('reads params', () => {
    expect(readUrlParam('http://x/viewer/1?frame=3&configFolderId=abc', 'configFolderId')).toBe('abc');
    expect(readConfigFolderIdFromUrl('http://x/viewer/1?diveMetadataRootId=z')).toBeNull();
    expect(readConfigFolderIdFromUrl('http://x/viewer/1')).toBeNull();
    expect(readConfigFolderIdFromUrl('http://x/viewer/1?configFolderId=')).toBeNull();
  });
});
