'use strict';

// eslint-disable-next-line node/no-unpublished-require
const Homey = require('homey');

const color = require('./color');

/**
 * Map a range of values to a new range.
 * @param {number} originalRangeStart
 * @param {number} originalRangeEnd
 * @param {number} newRangeStart
 * @param {number} newRangeEnd
 * @param {number} value
 * @returns {number} - Value mapped from original range to new range.
 * @memberof Util
 */
function mapValueRange(originalRangeStart, originalRangeEnd, newRangeStart, newRangeEnd, value) {
  if (typeof originalRangeStart !== 'number') throw new TypeError('expected_original_range_start_number');
  if (typeof originalRangeEnd !== 'number') throw new TypeError('expected_original_range_end_number');
  if (typeof newRangeStart !== 'number') throw new TypeError('expected_new_range_start_number');
  if (typeof newRangeEnd !== 'number') throw new TypeError('expected_new_range_end_number');
  if (typeof value !== 'number') throw new TypeError('expected_value_number');

  return newRangeStart + ((newRangeEnd - newRangeStart) / (originalRangeEnd - originalRangeStart))
    * (Math.min(Math.max(originalRangeStart, value), originalRangeEnd) - originalRangeStart);
}

/**
 * Calculate a transitionTime value for Zigbee clusters, it takes two parameters, `opts` and
 * `settings`. The former is the `opts` object provided by a
 * {@link Homey.Device.registerCapabilityListener} which can hold a `duration`
 * property (in milliseconds), The latter is an object which can hold a `transition_time` property
 * (in seconds).
 * @param opts {object}
 * @param opts.duration {number} - Duration property in milliseconds (preferred over
 * 'transition_time')
 * @param settings {object}
 * @param settings.transition_time {number} - Transition time property in seconds
 * @returns {number} transitionTime - Transition time (0 - 6553)
 * @memberof Util
 */
function calculateDimDuration(opts = {}, settings = {}) {
  let transitionTime = 0;
  if (typeof opts.duration === 'number') {
    transitionTime = opts.duration / 100;
  } else if (typeof settings.transition_time === 'number') {
    transitionTime = Math.round(settings.transition_time * 10);
  }
  // Cap the range between 0 and 6553
  return Math.max(Math.min(transitionTime, 6553), 0);
}

/**
 * @deprecated since v1.0.0 - Use {@link calculateDimDuration} instead.
 * @param opts {object}
 * @param opts.duration {number} - Duration property in milliseconds (preferred over
 * 'transition_time')
 * @param settings {object}
 * @param settings.transition_time {number} - Transition time property in seconds
 * @returns {number}
 * @memberof Util
 * @private
 */
function calculateZigBeeDimDuration(opts = {}, settings = {}) {
  return calculateDimDuration(opts, settings);
}

let localeFile;

/**
 * Method that loads a specific locale file based on provided `language`.
 * @param {string} [language=Homey.ManagerI18n.getLanguage()]
 * @private
 */
function loadLocales(language = Homey.ManagerI18n.getLanguage()) {
  try {
    // eslint-disable-next-line import/no-dynamic-require,global-require
    localeFile = require(`../locales/${language}.json`);
  } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND') {
      // eslint-disable-next-line no-console
      console.error(`Accessing non-existent locales file ../locales/${language}.json`);
    } else {
      throw err;
    }
  }
}

/**
 * Method that returns a translated string for a given key.
 * @param {string} localeKey - e.g. 'errors.unknown'
 * @returns {string}
 * @private
 * @memberof Util
 *
 * @example
 * <caption>./driver/my_driver/device.js</caption>
 * const { __ } = require('homey-zigbeedriver');
 * throw new Error(__('errors.unknown'));
 *
 * @example
 * <caption>./locales/en.json</caption>
 * {
 *   "errors": {
 *     "unknown": "An unknown error occurred"
 *   }
 * }
 */
function __(localeKey) {
  if (typeof localeKey !== 'string') throw TypeError('expected_locale_key_string');

  // Load locale file if not yet loaded
  if (!localeFile) loadLocales();

  // Fallback to english
  if (!localeFile) loadLocales('en');

  // Return translated string if found
  if (localeFile && typeof localeFile[localeKey] === 'string') {
    return localeFile[localeKey];
  }

  // Else return the given locale key
  return localeKey;
}

/**
 * Method that asserts a given cluster specification.
 * @param {ClusterSpecification} cluster
 * @private
 */
function assertClusterSpecification(cluster) {
  if (typeof cluster.ID !== 'number') throw new TypeError('expected_cluster_id_number');
  if (typeof cluster.NAME !== 'string') throw new TypeError('expected_cluster_name_string');
}

/**
 * Method that asserts a given `capabilityId`.
 * @param {CapabilityId} capabilityId
 * @private
 */
function assertCapabilityId(capabilityId, hasCapability) {
  if (typeof capabilityId !== 'string') throw new TypeError('expected_capability_id_string');
  if (typeof hasCapability === 'function' && hasCapability() === false) {
    throw new Error('capability_id_not_available_on_device');
  }
}

/**
 * Method that asserts if a zclNode is properly initialized.
 * @param {ZCLNode} zclNode
 * @param {EndpointId} [endpointId]
 * @param {ClusterSpecification} [cluster]
 */
function assertZCLNode(zclNode, endpointId, cluster) {
  if (cluster) assertClusterSpecification(cluster);
  if (!zclNode) throw new Error('missing_zcl_node_instance');
  if (typeof endpointId === 'number' && !zclNode.endpoints[endpointId]) {
    throw new Error('missing_endpoint_on_zcl_node');
  }
  if (typeof endpointId === 'number' && !zclNode.endpoints[endpointId].clusters[cluster.NAME]) {
    throw new Error('missing_cluster_on_endpoint_on_zcl_node');
  }
}

/**
 * Utility class with several color and range conversion methods.
 * @class Util
 */
module.exports = {
  convertRGBToCIE: color.convertRGBToCIE,
  convertHSVToCIE: color.convertHSVToCIE,
  convertHSVToRGB: color.convertHSVToRGB,
  convertRGBToHSV: color.convertRGBToHSV,
  mapValueRange,
  calculateDimDuration,
  calculateZigBeeDimDuration,
  __,
  assertClusterSpecification,
  assertCapabilityId,
  assertZCLNode,
};
