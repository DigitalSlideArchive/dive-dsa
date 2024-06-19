import { ref, Ref, watch } from 'vue';
import { AnnotationId } from 'vue-media-annotator/BaseAnnotation';

export default function useURLParameters(
  frame: Ref<number>,
  selectedTrackId: Ref<number | null>,
  mediaLoaded: Ref<boolean>,
  selectTrack: (trackId: AnnotationId | null, edit: boolean) => void,
  seek: (frame: number) => void,
) {
  const enableParams = ref(true);
  const setEnableURLParams = (val: boolean) => {
    enableParams.value = val;
  };
  watch([selectedTrackId, frame], () => {
    // update query parameters based on this value
    if (!enableParams.value) {
      return;
    }
    const values: string[] = [];
    if (selectedTrackId.value !== null) {
      values.push(`selectedTrackId=${selectedTrackId.value}`);
    }
    if (frame.value !== 0) {
      values.push(`frame=${frame.value}`);
    }
    const currentLocation = window.location.href;
    if (values.length === 0) {
      window.location.href = currentLocation.replace(/\?.*/, '');
      return;
    }
    const urlParameters = `?${values.join('&')}`;
    if (currentLocation.includes('?')) {
      window.location.href = currentLocation.replace(/\?.*/, urlParameters);
    } else {
      window.location.href = `${currentLocation}${urlParameters}`;
    }
  });

  const loadURLParams = () => {
    const currentLocation = window.location.href;
    if (currentLocation.includes('?')) {
      // Lets get everything after the ?
      const urlParams = currentLocation.slice(currentLocation.indexOf('?') + 1);
      const urlSplitParams = urlParams.split('&');

      const paramMapping: Record<string, string> = {};
      urlSplitParams.forEach((item) => {
        const splits = item.split('=');
        if (splits.length > 1) {
          [, paramMapping[splits[0]]] = splits;
        }
      });
      if (paramMapping.selectedTrackId !== undefined) {
        const trackId = parseInt(paramMapping.selectedTrackId, 10);
        if (!Number.isNaN(trackId)) {
          selectTrack(trackId, false);
        }
      }
      if (paramMapping.frame !== undefined) {
        const urlFrame = parseInt(paramMapping.frame, 10);
        if (!Number.isNaN(urlFrame)) {
          seek(urlFrame);
        }
      }
    }
  };
  watch(mediaLoaded, () => {
    loadURLParams();
  });

  return {
    setEnableURLParams,
    loadURLParams,
  };
}
