'use strict';

const util = require('../../../util');

const maxDim = 254;

/**
 * Cluster capability configuration for `dim`.
 * @type {ClusterCapabilityConfiguration}
 */
module.exports = {
  set: 'moveToLevelWithOnOff',
  /**
   * @param {number} value
   * @param {object} opts
   * @returns {{transitionTime: number, level: number}}
   */
  setParser(value, opts = {}) {
    if (value === 0) {
      this.setCapabilityValue('onoff', false);
    } else if (this.getCapabilityValue('onoff') === false && value > 0) {
      this.setCapabilityValue('onoff', true);
    }

    return {
      level: Math.round(value * maxDim),
      transitionTime: util.calculateDimDuration(opts, this.getSettings()),
    };
  },
  get: 'currentLevel',
  getOpts: {
    getOnStart: true,
  },
  report: 'currentLevel',
  /**
   * @param {number} value
   * @returns {number}
   */
  reportParser(value) {
    const result = value / maxDim;
    this.debug(`\`dim\` → reportParser → currentLevel: ${value} → parsed:`, result);
    return result;
  },
};
