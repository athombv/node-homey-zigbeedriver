'use strict';

const {
  mapValueRange,
  calculateDimDuration,
} = require('../../../util');

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
    const colorTemperature = Math.round(mapValueRange(
      0,
      1,
      this.getStoreValue('colorTempMin'),
      this.getStoreValue('colorTempMax'),
      value,
    ));
    return {
      colorTemperature,
      transitionTime: calculateDimDuration({}, this.getSettings()),
    };
  },
  get: 'colorTemperatureMireds',
  getOpts: {
    getOnStart: true,
    getOnOnline: true,
  },
  report: 'colorTemperatureMireds',
  /**
   * @param {number} value
   * @returns {number}
   */
  reportParser(value) {
    return mapValueRange(this.getStoreValue('colorTempMin'), this.getStoreValue('colorTempMax'), 0, 1, value);
  },
};
