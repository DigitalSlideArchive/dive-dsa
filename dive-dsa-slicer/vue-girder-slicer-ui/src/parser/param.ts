import $ from 'jquery';
import _ from 'underscore';

import widget from './widget';
import convert from './convert';
import defaultValue from './defaultValue';
import constraints from './constraints';

/**
 * Parse a parameter spec.
 * @param {XML} param The parameter spec
 * @returns {object}
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function param(paramTag: any , opts: Record<string, any> = {}) {
    const $param = $(paramTag);
    let type = widget(paramTag) as string;
    let values = {};
    let channel: JQuery<HTMLElement> | string = $param.find('channel');
    const id = $param.find('name').text() || $param.find('longflag').text();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const extra: Record<string, any> = {};

    if (channel.length > 0) {
        channel = channel.text();
    } else {
        channel = 'input';
    }

    if ($param.find('index').text().length > 0) {
        extra.required = true;
    }
    if ((type === 'file' || type === 'image') && channel === 'output') {
        type = 'new-file';
        extra.extensions = $param.attr('fileExtensions');
        extra.reference = $param.attr('reference');
    } else if (channel === 'output') {
        opts.output = true;
        opts.params = _.extend(opts.params || {}, {
            [id]: type
        });
        return null;
    } else if (channel === 'input' && ['image', 'file', 'item', 'directory', 'multi'].includes(type)) {
        extra.defaultNameMatch = $param.attr('defaultNameMatch');
        extra.defaultPathMatch = $param.attr('defaultPathMatch');
        extra.defaultRelativePath = $param.attr('defaultRelativePath');
        if (type !== 'directory') {
            extra.multiple = $param.attr('multiple') === 'true';
        }
    }
    if (channel === 'input' && $param.attr('datalist')) {
        extra.datalist = true;
    }
    if (type === 'region') {
        extra.shapes = $param.attr('shapes');
    }

    if (!type) {
        console.warn('Unhandled parameter type "' + paramTag.tagName + '"'); // eslint-disable-line no-console
    }

    if (type === 'string-enumeration' || type === 'number-enumeration') {
        values = {
            values: _.map($param.find('element'), (el) => {
                return convert(type, $(el).text());
            })
        };
    }

    return _.extend(
        {
            type: type,
            slicerType: paramTag.tagName,
            title: $param.find('label').text(),
            description: $param.find('description').text(),
            channel,
            id
        },
        values,
        defaultValue(type, $param.find('default')),
        constraints(type, $param.find('constraints').get(0) as HTMLElement),
        extra
    );
}
