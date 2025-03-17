import $ from 'jquery';
import _ from 'underscore';

import panel from './panel';
import { XMLPanel, XMLSpecification, XMLSpecificationStrings } from './parserTypes';

/**
 * This is a parser for Slicer's GUI Schema:
 *   https://www.slicer.org/slicerWiki/index.php/Slicer3:Execution_Model_Documentation#XML_Schema
 */

/**
 * Parse a Slicer GUI spec into a json object for rendering
 * the controlsPanel view.  This function parses into the following structure:
 *
 * * global metadata
 *   * panels[] -- each is rendered in a different panel
 *     * groups[] -- each is rendered together separated by a horizontal line
 *       * parameters[] -- individual parameters
 *
 * @param {string|object} spec The slicer GUI spec content (accepts parsed or unparsed xml)
 * @param {object} [opts] When provided this object will used to provide information about
 *     the outputs of the spec.
 * @returns {object}
 */
export default function parse(spec: string | object, opts = {} as object) {
    if (_.isString(spec)) {
        spec = $.parseXML(spec);
    }

    const $spec = $(spec).find('executable:first');

    // top level metadata
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gui: XMLSpecification = {
        title: $spec.find('executable > title').text(),
        description: $spec.find('executable > description').text(),
        version: '0',
        panels: [],
        license: '',
    };

    // optional metadata
    ['version', 'documentation-url', 'license', 'contributor', 'acknowledgements'].forEach((key) => {
        const val = $spec.find(`executable > ${key}:first`);
        if (val.length > 0) {
            if (key !== 'panels') {
                gui[key as keyof XMLSpecificationStrings] = val.text();
            }
        }
    });

    const panels = _.filter(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        _.map($spec.find('executable > parameters'), (p: any) => panel(p, opts)),
        _.isObject
    );
    if (panels) {
        gui.panels = panels as XMLPanel[];
    }

    return gui;
}
