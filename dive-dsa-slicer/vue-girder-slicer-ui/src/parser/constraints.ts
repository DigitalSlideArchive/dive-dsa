import $ from 'jquery';

import convert from './convert';

/**
 * Parse a `contraints` tag.
 */
export default function constraints(type: string, constraintsTag: HTMLElement) {
    const $c = $(constraintsTag);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const spec: Record<string, any> = {};
    const min = $c.find('minimum').text();
    const max = $c.find('maximum').text();
    const step = $c.find('step').text();
    if (min) {
        spec.min = convert(type, min);
    }
    if (max) {
        spec.max = convert(type, max);
    }
    if (step) {
        spec.step = convert(type, step);
    }
    return spec;
}
