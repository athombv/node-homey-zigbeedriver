'use strict';

const MAX_SATURATION = 254;

/**
 * Cluster capability configuration for `light_saturation`.
 * @type {ClusterCapabilityConfiguration}
 */
module.exports = {
  set: 'moveToSaturation',
  /**
   * @param {number} value
   * @returns {{saturation: number, transitionTime: (number|number)}}
   */
  setParser(value) {
    return {
      saturation: Math.round(value * MAX_SATURATION),
      transitionTime: this.getSetting('transition_time') ? Math.round(this.getSetting('transition_time') * 10) : 0,
    };
  },
  get: 'currentSaturation',
  getOpts: {
    getOnStart: true,
  },
  report: 'currentSaturation',
  /**
   * @param {number} value
   * @returns {number}
   */
  reportParser(value) {
    return value / MAX_SATURATION;
  },
};
