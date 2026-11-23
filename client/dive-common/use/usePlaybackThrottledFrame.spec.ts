/// <reference types="jest" />
import { nextTick, ref } from 'vue';
import usePlaybackThrottledFrame from './usePlaybackThrottledFrame';

describe('usePlaybackThrottledFrame', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('follows every frame while paused', async () => {
    const frame = ref(0);
    const playing = ref(false);
    const throttled = usePlaybackThrottledFrame(frame, playing, 250);
    frame.value = 1;
    await nextTick();
    expect(throttled.value).toBe(1);
    frame.value = 2;
    await nextTick();
    expect(throttled.value).toBe(2);
  });

  it('updates at most once per wait while playing', async () => {
    const frame = ref(0);
    const playing = ref(true);
    const throttled = usePlaybackThrottledFrame(frame, playing, 250);
    frame.value = 1;
    await nextTick();
    // leading edge
    expect(throttled.value).toBe(1);
    for (let f = 2; f <= 6; f += 1) {
      frame.value = f;
      // eslint-disable-next-line no-await-in-loop
      await nextTick();
    }
    expect(throttled.value).toBe(1);
    jest.advanceTimersByTime(250);
    // trailing edge picks up the latest frame
    expect(throttled.value).toBe(6);
  });

  it('catches up immediately when playback stops', async () => {
    const frame = ref(0);
    const playing = ref(true);
    const throttled = usePlaybackThrottledFrame(frame, playing, 250);
    frame.value = 1;
    await nextTick();
    frame.value = 7;
    await nextTick();
    expect(throttled.value).toBe(1);
    playing.value = false;
    await nextTick();
    expect(throttled.value).toBe(7);
    // no stale trailing update afterwards
    jest.advanceTimersByTime(500);
    expect(throttled.value).toBe(7);
  });
});
