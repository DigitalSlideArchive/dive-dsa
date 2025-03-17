/**
 * Mapping from slicer parameter specs to control widget types.
 * @param {XML} param The full xml parameter spec
 * @return {string} The widget type
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function widget(param: any) {
    const typeMap = {
        integer: 'number',
        float: 'number',
        double: 'number',
        boolean: 'boolean',
        string: 'string',
        'integer-vector': 'number-vector',
        'float-vector': 'number-vector',
        'double-vector': 'number-vector',
        'string-vector': 'string-vector',
        'integer-enumeration': 'number-enumeration',
        'float-enumeration': 'number-enumeration',
        'double-enumeration': 'number-enumeration',
        'string-enumeration': 'string-enumeration',
        region: 'region',
        image: 'image',
        file: 'file',
        item: 'item',
        directory: 'directory',
        multi: 'multi'
    };
    type typeMapType = keyof typeof typeMap
    return typeMap[param.tagName as typeMapType];
}
