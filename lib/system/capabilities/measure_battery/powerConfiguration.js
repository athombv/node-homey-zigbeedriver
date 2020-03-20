'use strict';

/**
 * Cluster capability configuration for `measure_battery`.
 * @type {ClusterCapabilityConfiguration}
 */
module.exports = {
  get: 'batteryPercentageRemaining',
  getOpts: {
    getOnOnline: true,
  },
  report: 'batteryPercentageRemaining',
  /**
   * @param {number} value
   * @returns {null|number}
   */
  reportParser(value) {
    this.debug(`\`measure_battery\` → reportParser → batteryPercentageRemaining: ${value}`);
    // Max value 200, 255 indicates invalid or unknown reading
    if (value <= 200 && value !== 255) {
      const result = Math.round(value / 2);
      this.debug(`\`measure_battery\` → reportParser → batteryPercentageRemaining: ${value} → parsed:`, result);
      return result;
    }
    return null;
  },
};
