import { XMLBaseValue } from "./parserTypes";

/**
 * Convert from a string to the given value type.
 * @param {string} type A widget type
 * @param {string} value The value to be converted
 * @returns {*} The converted value
 */
export default function convert(type: string, value: string) {
    let output: XMLBaseValue | undefined;
    if (type === 'number' || type === 'number-enumeration') {
        output = parseFloat(value);
    } else if (type === 'boolean') {
        output = (value.toLowerCase() === 'true');
    } else if (type === 'number-vector') {
        output = value.split(',').map(parseFloat);
    } else if (type === 'string-vector') {
        output = value.split(',');
    }
    return output || value;
}
