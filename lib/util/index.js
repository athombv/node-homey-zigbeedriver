'use strict';

// eslint-disable-next-line node/no-unpublished-require
const Homey = require('homey');

const color = require('./color');

// Get current language
const language = Homey.ManagerI18n.getLanguage();

// eslint-disable-next-line import/no-dynamic-require
const localeFile = require(`../locales/${language}.json`);

/**
 * Map a range of values to a different range of values.
 * @param inputStart
 * @param inputEnd
 * @param outputStart
 * @param outputEnd
 * @param input
 * @returns {number|null}
 * @memberof Util
 */
function mapValueRange(inputStart, inputEnd, outputStart, outputEnd, input) {
  if (typeof inputStart !== 'number' || typeof inputEnd !== 'number'
    || typeof outputStart !== 'number' || typeof outputEnd !== 'number'
    || typeof input !== 'number') {
    return null;
  }
  return outputStart + ((outputEnd - outputStart) / (inputEnd - inputStart))
    * (Math.min(Math.max(inputStart, input), inputEnd) - inputStart);
}

/**
 * Calculate a transitionTime value for Zigbee clusters, it takes two parameters, opts and
 * settings. Opts is the opts object
 * provided by a capabilityListener which can hold a duration property (in milliseconds),
 * settings is an object which can hold a 'transition_time' property (in seconds). If none are
 * available, the default is 0. The valid value range is
 * 0 - 6553.
 * @param opts {object}
 * @param opts.duration {number} - Duration property in milliseconds (preferred over
 * 'transition_time')
 * @param settings {object}
 * @param settings.transition_time {number} - Transition time property in seconds
 * @returns {number}
 */
function calculateZigBeeDimDuration(opts = {}, settings = {}) {
  let transitionTime = 0;
  if (Object.prototype.hasOwnProperty.call(opts, 'duration')) {
    transitionTime = opts.duration / 100;
  } else if (typeof settings.transition_time === 'number') {
    transitionTime = Math.round(settings.transition_time * 10);
  }
  // Cap the range between 0 and 6553
  return Math.max(Math.min(transitionTime, 6553), 0);
}

/**
 * Method that returns a translated string for a given key
 * @param {string} localeKey - e.g. 'errors.unknown'
 * @returns {string}
 * @private
 */
function __(localeKey) {
  try {
    return localeFile[localeKey];
  } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND') console.error(`Accessing non-existent locales file ../locales/${language}.json`);
    throw err;
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
  calculateZigBeeDimDuration,
  __,
};
