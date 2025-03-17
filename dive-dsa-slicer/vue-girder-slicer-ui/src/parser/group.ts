import $ from 'jquery';
import _ from 'underscore';

import param from './param';

/**
 * Parse a parameter group (deliminated by <label> tags) within a
 * panel.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function group(label: string, opts: Record<string, any> = {}) {
    // parameter groups inside panels
    const $label = $(label);
    const $description = $label.siblings('description').length === 1 ? $label.siblings('description') : $label.next('description');
    const paramlist = ($label.siblings('label').length ? $label.nextUntil('label') : $label.siblings()).filter(':not(description)');
    const parameters = _.filter(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        _.map(paramlist, (p: any) => param(p, opts)),
        _.isObject
    );

    // don't add the panel if there are no input parameters
    if (parameters.length === 0) {
        return null;
    }

    return {
        label: $label.text(),
        description: $description.text(),
        parameters
    };
}
