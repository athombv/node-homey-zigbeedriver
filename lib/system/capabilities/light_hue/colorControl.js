'use strict';

const MAX_HUE = 254;

/**
 * Cluster capability configuration for `light_hue`.
 * @type {ClusterCapabilityConfiguration}
 */
module.exports = {
  set: 'moveToHue',
  /**
   * @param {number} value
   * @returns {{transitionTime: (number|number), hue: number, direction: number}}
   */
  setParser(value) {
    return {
      hue: Math.round(value * MAX_HUE),
      direction: 0,
      transitionTime: this.getSetting('transition_time') ? Math.round(this.getSetting('transition_time') * 10) : 0,
    };
  },
  get: 'currentHue',
  getOpts: {
    getOnStart: true,
  },
  report: 'currentHue',
  /**
   * @param {number} value
   * @returns {number}
   */
  reportParser(value) {
    const result = value / MAX_HUE;
    this.debug(`\`light_hue\` → reportParser → currentHue: ${value} → parsed:`, result);
    return result;
  },
};
