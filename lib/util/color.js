'use strict';

const hsv = require('color-space/hsv');
const xyz = require('color-space/xyz');
const xyy = require('color-space/xyy');
const rgb = require('color-space/rgb');

/**
 * @typedef {Object} CIExyY
 * @property {number} x - CIE x (small x) value, range 0 - 1 (for Zigbee CurrentX multiply by
 * 65536)
 * @property {number} y - CIE y (small y) value, range 0 - 1 (for Zigbee CurrentY multiply by
 * 65536)
 * @property {number} Y - CIE Y value, range 0 - 100, this represents the luminance which is not
 * used by the Zigbee color control cluster.
 */

/**
 * @typedef {Object} HSV
 * @property {number} hue - Hue value, range 0 - 1.
 * @property {number} saturation - Saturation value, range 0 - 1.
 * @property {number} value - Value (brightness) value, range 0 - 1.
 */

/**
 * Method that converts colors from the HSV (or HSL) color space to the CIE (1931) color space.
 * @param {HSV} - HSV color object
 * @returns {CIExyY} - CIExyY color space object
 * @memberof Util
 */
function convertHSVToCIE({ hue, saturation, value }) {
  if (typeof hue !== 'number') hue = 1;
  if (typeof saturation !== 'number') saturation = 1;
  if (typeof value !== 'number') value = 1;

  const _rgb = hsv.rgb([hue * 360, saturation * 100, value * 100]);
  const _xyz = rgb.xyz(_rgb);
  const [x, y, Y] = xyz.xyy(_xyz);
  return { x, y, Y };
}

module.exports = {
  convertHSVToCIE,
};
