'use strict';

const util = require('../../../util');

/**
 * Cluster capability configuration for `light_temperature`.
 * @type {ClusterCapabilityConfiguration}
 */
module.exports = {
  set: 'moveToColorTemperature',
  /**
   * @param {number} value
   * @returns {{transitionTime: (number|number), colorTemperature: number}}
   */
  setParser(value) {
    const colorTemperature = Math.round(util.mapValueRange(
      0,
      1,
      this._colorTempMin,
      this._colorTempMax,
      value,
    ));
    return {
      colorTemperature,
      transitionTime: this.getSetting('transition_time') ? Math.round(this.getSetting('transition_time') * 10) : 0,
    };
  },
  get: 'colorTemperatureMireds',
  getOpts: {
    getOnStart: true,
  },
  report: 'colorTemperatureMireds',
  /**
   * @param {number} value
   * @returns {number}
   */
  reportParser(value) {
    const result = util.mapValueRange(this._colorTempMin, this._colorTempMax, 0, 1, value);
    this.debug(`\`light_temperature\` → reportParser → colorTemperatureMireds: ${value} → parsed:`, result);
    return result;
  },
};
