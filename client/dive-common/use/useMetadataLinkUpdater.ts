import { Attribute } from 'vue-media-annotator/use/AttributeTypes';
import { StringKeyObject } from 'vue-media-annotator/BaseAnnotation';
import type Track from 'vue-media-annotator/track';
import { useHandler, useAttributes } from 'vue-media-annotator/provides';
import { useStore } from 'platform/web-girder/store/types';
import { usePrompt } from 'dive-common/vue-utilities/prompt-service';
import {
  getDiveDatasetMetadataRow,
  setDiveDatasetMetadataKey,
} from 'platform/web-girder/api/divemetadata.service';
import shouldApplyMetadataLinkUpdate, {
  parseMetadataFieldAsNumber,
} from 'dive-common/use/metadataLinkConditionals';

type MetadataWritableValue = string | number | boolean;

const METADATA_LINK_WRITE_DEBOUNCE_MS = 150;
type PendingMetadataWrite = {
  value: MetadataWritableValue;
  timer: ReturnType<typeof setTimeout>;
  resolves: Array<() => void>;
  rejects: Array<(error: unknown) => void>;
};
const pendingMetadataWrites = new Map<string, PendingMetadataWrite>();

function queueMetadataWrite(
  datasetId: string,
  metadataRootId: string,
  metadataKey: string,
  value: MetadataWritableValue,
) {
  const writeKey = `${datasetId}::${metadataRootId}::${metadataKey}`;
  let pending = pendingMetadataWrites.get(writeKey);
  if (pending) {
    pending.value = value;
    clearTimeout(pending.timer);
  } else {
    pending = {
      value,
      timer: setTimeout(() => undefined, 0),
      resolves: [],
      rejects: [],
    };
    pendingMetadataWrites.set(writeKey, pending);
  }

  pending.timer = setTimeout(async () => {
    const current = pendingMetadataWrites.get(writeKey);
    if (!current) {
      return;
    }
    try {
      await setDiveDatasetMetadataKey(datasetId, metadataRootId, metadataKey, current.value);
      current.resolves.forEach((resolve) => resolve());
    } catch (error) {
      current.rejects.forEach((reject) => reject(error));
    } finally {
      pendingMetadataWrites.delete(writeKey);
    }
  }, METADATA_LINK_WRITE_DEBOUNCE_MS);

  return new Promise<void>((resolve, reject) => {
    const current = pendingMetadataWrites.get(writeKey);
    if (!current) {
      resolve();
      return;
    }
    current.resolves.push(resolve);
    current.rejects.push(reject);
  });
}

export interface MetadataLinkUpdateContext {
  featureAttributes?: StringKeyObject & { userAttributes?: StringKeyObject };
  userLogin?: string | null;
  /** Current frame; with `track`, enables dynamic key from segment keyframes. */
  frame?: number;
  track?: Track;
}

function readAttributeValueFromFeature(
  attrs: MetadataLinkUpdateContext['featureAttributes'],
  src: Attribute,
  userLogin: string | null | undefined,
): unknown {
  if (!attrs) {
    return undefined;
  }
  if (src.user && userLogin && attrs.userAttributes?.[userLogin]) {
    return (attrs.userAttributes[userLogin] as StringKeyObject)[src.name];
  }
  return (attrs as StringKeyObject)[src.name];
}

/**
 * Resolves the metadata key name from the key-source attribute only when that attribute has a
 * real stored value that matches one of its predefined (locked) options.
 */
function dynamicKeyFromSourceValue(src: Attribute, raw: unknown): string | null {
  if (raw === undefined || raw === null) {
    return null;
  }
  if (typeof raw !== 'string') {
    return null;
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  if (!src.values?.length) {
    return null;
  }
  const matchesPredefined = src.values.some((v) => String(v).trim() === trimmed);
  return matchesPredefined ? trimmed : null;
}

function dynamicKeySourceUsesSegments(src: Attribute): boolean {
  return !!src.shortcuts?.some((s) => s.segment);
}

/** Start frame of the segment containing `frame`, or null. Ranges are [start,end] pairs from keyframes. */
function segmentStartFrameIfInside(
  track: Track,
  attrName: string,
  frame: number,
  userForRanges: string | null,
): number | null {
  const rangeVals = track.getFrameAttributeRanges([attrName], userForRanges);
  const ranges = rangeVals[attrName];
  if (!ranges?.length) {
    return null;
  }
  for (let i = 0; i < ranges.length; i += 2) {
    const start = ranges[i];
    const end = ranges[i + 1];
    if (frame >= start && frame <= end) {
      return start;
    }
  }
  return null;
}

/**
 * Value of the dynamic-key source attribute, including segment keyframes: between detection
 * keyframes `getFeature` is interpolated without attributes, so we read from the segment start
 * when that attribute uses segment shortcuts and the current frame lies inside a segment.
 */
function resolveDynamicKeySourceRaw(
  src: Attribute,
  context: MetadataLinkUpdateContext | undefined,
): unknown {
  const userLogin = context?.userLogin ?? null;
  const rawFromContext = readAttributeValueFromFeature(
    context?.featureAttributes,
    src,
    userLogin,
  );
  if (dynamicKeyFromSourceValue(src, rawFromContext) !== null) {
    return rawFromContext;
  }
  if (
    !dynamicKeySourceUsesSegments(src)
    || !context?.track
    || context.frame === undefined
  ) {
    return rawFromContext;
  }
  const userForRanges = src.user ? userLogin : null;
  const segmentStart = segmentStartFrameIfInside(
    context.track,
    src.name,
    context.frame,
    userForRanges,
  );
  if (segmentStart === null) {
    return rawFromContext;
  }
  const [feat] = context.track.getFeature(segmentStart);
  return readAttributeValueFromFeature(feat?.attributes, src, userLogin);
}

export default function useMetadataLinkUpdater() {
  const { prompt } = usePrompt();
  const store = useStore();
  const handler = useHandler();
  const attributes = useAttributes();

  const updateAttributeMetadataLink = async (
    attribute: Attribute,
    value: unknown,
    context?: MetadataLinkUpdateContext,
  ) => {
    if (attribute.belongs !== 'detection' || !attribute.metadataLink?.updateValue) {
      return;
    }
    const link = attribute.metadataLink;
    let metadataKey = link.key?.trim() || '';
    if (link.useDynamicKeyFromAttribute && link.dynamicKeyAttributeKey) {
      const src = attributes.value.find((a) => a.key === link.dynamicKeyAttributeKey);
      if (!src || src.belongs !== 'detection') {
        return;
      }
      const raw = resolveDynamicKeySourceRaw(src, context);
      const resolved = dynamicKeyFromSourceValue(src, raw);
      if (!resolved) {
        return;
      }
      metadataKey = resolved;
    }
    if (!metadataKey) {
      return;
    }
    const metadataRootId = handler.getDiveMetadataRootId();
    const datasetId = store.state.Dataset.meta?.id;
    if (!metadataRootId || !datasetId) {
      return;
    }
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
      return;
    }

    let currentStoredNumber: number | undefined;
    const numMode = link.numberConditions?.mode;
    if (
      link.useConditionals
      && attribute.datatype === 'number'
      && (numMode === 'min' || numMode === 'max')
    ) {
      try {
        const row = await getDiveDatasetMetadataRow(metadataRootId, datasetId);
        currentStoredNumber = parseMetadataFieldAsNumber(row?.[metadataKey]);
      } catch {
        currentStoredNumber = undefined;
      }
    }

    if (!shouldApplyMetadataLinkUpdate(attribute, value, link, { currentStoredNumber })) {
      return;
    }
    try {
      await queueMetadataWrite(datasetId, metadataRootId, metadataKey, value);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      const errorMsg = error?.response?.data?.message || error;
      let promptText = `Failed to update metadata key: ${metadataKey}. Error: ${errorMsg}`;
      if (errorMsg.includes('No editable keys in the metadata to update')) {
        promptText = `The metadata key: ${metadataKey} is not editable. Please contact the administrator/owner of the DIVEMetadata to unlock it.`;
      }
      await prompt({
        title: 'Metadata Error',
        text: promptText,
        positiveButton: 'OK',
      });
    }
  };

  return {
    updateAttributeMetadataLink,
  };
}
