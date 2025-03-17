import $ from 'jquery';
import _ from 'underscore';

import group from './group';

/**
 * Parse a <parameters> tag into a "panel" object.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function panel(panelTag: string, opts = {} as Record<string, any>) {
    const $panel = $(panelTag);
    const groups = _.filter(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        _.map($panel.find('parameters > label'), (g: any) => group(g, opts)),
        _.isObject
    );

    if (groups.length === 0) {
        return null;
    }

    return {
        advanced: $panel.attr('advanced') === 'true',
        groups
    };
}
