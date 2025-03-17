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
export default function parse(spec: string | object, opts?: object): object;
