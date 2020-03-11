'use strict';

/**
 * Cluster capability configuration for `measure_temperature`.
 * @type {ClusterCapabilityConfiguration}
 */
module.exports = {
  get: 'measuredValue',
  report: 'measuredValue',
  /**
   * @param {number} value
   * @returns {number}
   */
  reportParser(value) {
    const result = Math.round((value / 100) * 10) / 10;
    this.debug(`\`measure_temperature\` → reportParser → measuredValue: ${value} → parsed:`, result);
    return result;
  },
};
