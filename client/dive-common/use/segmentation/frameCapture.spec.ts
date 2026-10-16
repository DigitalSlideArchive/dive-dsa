/// <reference types="jest" />
import { findQuadMedia, mediaReady } from './frameCapture';

const featureLayer = (data: unknown[]) => ({ features: () => [{ data: () => data }] });

it('finds the image texture of an image annotator quad', () => {
  const image = { naturalWidth: 640, naturalHeight: 480, complete: true };
  const viewer = { layers: () => [featureLayer([]), featureLayer([{ ul: {}, lr: {}, image }])] };
  expect(findQuadMedia(viewer)).toEqual({
    kind: 'image', source: image, width: 640, height: 480,
  });
});

it('finds the video texture of a video annotator quad', () => {
  const video = { videoWidth: 1920, videoHeight: 1080 };
  const viewer = { layers: () => [featureLayer([{ video }])] };
  expect(findQuadMedia(viewer)).toMatchObject({ kind: 'video', width: 1920, height: 1080 });
});

it('returns null without media or a map', () => {
  expect(findQuadMedia(undefined)).toBeNull();
  expect(findQuadMedia({ layers: () => [{}] })).toBeNull();
});

it('treats seeking or undecoded video and incomplete images as not ready', () => {
  const video = (seeking: boolean, readyState: number) => ({
    kind: 'video' as const, source: { seeking, readyState } as unknown as HTMLVideoElement, width: 10, height: 10,
  });
  expect(mediaReady(video(false, 4))).toBe(true);
  expect(mediaReady(video(true, 4))).toBe(false);
  expect(mediaReady(video(false, 1))).toBe(false);
  const image = (complete: boolean, width = 10) => ({
    kind: 'image' as const, source: { complete } as unknown as HTMLImageElement, width, height: 10,
  });
  expect(mediaReady(image(true))).toBe(true);
  expect(mediaReady(image(false))).toBe(false);
  expect(mediaReady(image(true, 0))).toBe(false);
});
