'use strict';

/**
 * Cluster capability configuration for `measure_luminance`.
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
    const result = Math.round(10 ** ((value - 1) / 10000));
    this.debug(`\`measure_luminance\` → reportParser → measuredValue: ${value} → parsed:`, result);
    return result;
  },
};
