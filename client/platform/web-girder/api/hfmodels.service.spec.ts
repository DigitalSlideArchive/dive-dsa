/**
 * @jest-environment jsdom
 */
/// <reference types="jest" />
import { HUGGING_FACE_HOST, localModelHost, modelHostFor } from './hfmodels.service';

jest.mock('platform/web-girder/plugins/girder', () => ({
  __esModule: true,
  default: { apiRoot: 'api/v1', get: jest.fn(), put: jest.fn() },
}));

const tiny = 'onnx-community/sam2.1-hiera-tiny-ONNX';
const small = 'onnx-community/sam2.1-hiera-small-ONNX';
const stored = new Set([tiny]);

it('serves stored models locally and the rest from the Hub in auto mode', () => {
  expect(modelHostFor({ source: 'auto' }, stored, tiny)).toBe(localModelHost());
  expect(modelHostFor({ source: 'auto' }, stored, small)).toBeNull();
});

it('always uses the Hub in huggingface mode', () => {
  expect(modelHostFor({ source: 'huggingface' }, stored, tiny)).toBeNull();
});

it('never falls back to the Hub in local mode', () => {
  expect(modelHostFor({ source: 'local' }, stored, small)).toBe(localModelHost());
});

it('uses the custom host in custom mode', () => {
  expect(modelHostFor({ source: 'custom', customHost: 'https://m.example.org/' }, stored, tiny))
    .toBe('https://m.example.org/');
});

it('builds an absolute local host URL ending in a slash', () => {
  expect(localModelHost()).toBe(new URL('api/v1/dive_hf_models/', window.location.href).href);
  expect(HUGGING_FACE_HOST.endsWith('/')).toBe(true);
});
