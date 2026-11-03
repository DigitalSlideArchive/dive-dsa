/** URL query param that overrides the hierarchy base UI configuration for a viewer session */
export const CONFIG_FOLDER_PARAM = 'configFolderId';

/** Read a query parameter from a URL string (works with hash-less and vue-router history URLs) */
export function readUrlParam(href: string, name: string): string | null {
  const queryStart = href.indexOf('?');
  if (queryStart === -1) {
    return null;
  }
  const query = href.slice(queryStart + 1).split('#')[0];
  const found = query.split('&').find((item) => item.split('=')[0] === name);
  if (!found) {
    return null;
  }
  const value = found.split('=')[1];
  return value ? decodeURIComponent(value) : null;
}

export function readConfigFolderIdFromUrl(href: string = window.location.href): string | null {
  return readUrlParam(href, CONFIG_FOLDER_PARAM);
}
