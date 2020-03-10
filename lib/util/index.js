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
 * property (in milliseconds), The latter is an object which can hold a 'transition_time' property
 * (in seconds).
 * @param opts {object}
 * @param opts.duration {number} - Duration property in milliseconds (preferred over
 * 'transition_time')
 * @param settings {object}
 * @param settings.transition_time {number} - Transition time property in seconds
 * @returns {number} transitionTime=0 - Transition time (0 - 6553)
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
 */
function calculateZigBeeDimDuration(opts = {}, settings = {}) {
  return calculateDimDuration(opts, settings);
}

let localeFile;

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
 * Returns a debounced function instance.
 * @param {function} callback - original function to be debounced
 * @param {number} [delay=500]
 * @returns {function} - debounced version of original function
 */
function debounce(callback, delay = 500) {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      timeoutId = null;
      callback(...args);
    }, delay);
  };
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
  debounce,
  __,
};
