'use strict';

/**
 * Cluster capability configuration for `alarm_motion`.
 * @type {ClusterCapabilityConfiguration}
 */
module.exports = {
  get: 'occupancy',
  report: 'occupancy',
  /**
   * @param {number} value
   * @returns {boolean}
   */
  reportParser(value) {
    const result = value === 1;
    this.debug(`\`alarm_motion\` → reportParser → occupancy: ${value} → parsed:`, result);
    return result;
  },
};
