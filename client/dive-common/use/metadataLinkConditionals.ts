import type {
  Attribute,
  MetadataLinkOptions,
} from 'vue-media-annotator/use/AttributeTypes';

export interface MetadataLinkConditionalContext {
  /**
   * Parsed numeric value of the linked metadata key for this dataset.
   * Used for `min` / `max` modes. When missing, the updater allows the write (e.g. first set).
   */
  currentStoredNumber?: number;
}

export function parseMetadataFieldAsNumber(raw: unknown): number | undefined {
  if (raw === null || raw === undefined) {
    return undefined;
  }
  if (typeof raw === 'number') {
    return Number.isNaN(raw) ? undefined : raw;
  }
  if (typeof raw === 'string') {
    const x = Number(raw);
    return Number.isNaN(x) ? undefined : x;
  }
  return undefined;
}

/**
 * Returns whether a metadata link should write for this attribute value
 * when `useConditionals` is enabled.
 */
export default function shouldApplyMetadataLinkUpdate(
  attribute: Attribute,
  value: unknown,
  link: MetadataLinkOptions,
  context?: MetadataLinkConditionalContext,
): boolean {
  if (!link.useConditionals) {
    return true;
  }
  if (attribute.datatype === 'boolean') {
    return true;
  }
  if (attribute.datatype === 'number') {
    return evaluateNumberConditional(value, link, context);
  }
  if (attribute.datatype === 'text') {
    return evaluateStringConditional(value, link);
  }
  return true;
}

function evaluateNumberConditional(
  value: unknown,
  link: MetadataLinkOptions,
  context?: MetadataLinkConditionalContext,
): boolean {
  const nc = link.numberConditions;
  if (!nc?.mode) {
    return true;
  }
  const n = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(n)) {
    return false;
  }
  switch (nc.mode) {
    case 'min': {
      const cur = context?.currentStoredNumber;
      if (cur === undefined || Number.isNaN(cur)) {
        return true;
      }
      return n < cur;
    }
    case 'max': {
      const cur = context?.currentStoredNumber;
      if (cur === undefined || Number.isNaN(cur)) {
        return true;
      }
      return n > cur;
    }
    case 'greater_than': {
      const t = nc.threshold;
      if (t === undefined || t === null || Number.isNaN(Number(t))) {
        return false;
      }
      return n > t;
    }
    case 'less_than': {
      const t = nc.threshold;
      if (t === undefined || t === null || Number.isNaN(Number(t))) {
        return false;
      }
      return n < t;
    }
    default:
      return true;
  }
}

function evaluateStringConditional(value: unknown, link: MetadataLinkOptions): boolean {
  const sc = link.stringConditions;
  if (!sc?.substring?.length) {
    return false;
  }
  return String(value).includes(sc.substring);
}
