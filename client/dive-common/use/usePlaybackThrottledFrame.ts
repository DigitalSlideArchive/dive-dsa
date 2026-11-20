import {
  ref, Ref, watch, onBeforeUnmount, getCurrentInstance,
} from 'vue';
import { throttle } from 'lodash';

/**
 * A copy of the current frame for UI that is expensive to rebuild. It follows `frame`
 * immediately while paused, but at most once every `wait` ms while `playing`, and catches
 * up as soon as playback stops so the paused UI is exact.
 */
export default function usePlaybackThrottledFrame(
  frame: Readonly<Ref<number>>,
  playing: Readonly<Ref<boolean>>,
  wait = 250,
) {
  const throttledFrame = ref(frame.value);
  const syncWhilePlaying = throttle(() => {
    throttledFrame.value = frame.value;
  }, wait);
  const syncNow = () => {
    syncWhilePlaying.cancel();
    throttledFrame.value = frame.value;
  };
  watch(frame, () => {
    if (playing.value) {
      syncWhilePlaying();
    } else {
      syncNow();
    }
  });
  watch(playing, (isPlaying) => {
    if (!isPlaying) {
      syncNow();
    }
  });
  if (getCurrentInstance()) {
    onBeforeUnmount(() => syncWhilePlaying.cancel());
  }
  return throttledFrame;
}
