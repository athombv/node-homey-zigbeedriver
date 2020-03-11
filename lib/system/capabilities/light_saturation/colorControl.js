'use strict';

const maxSaturation = 254;

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
      saturation: Math.round(value * maxSaturation),
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
    const result = value / maxSaturation;
    this.debug(`\`light_saturation\` → reportParser → currentSaturation: ${value} → parsed:`, result);
    return result;
  },
};
