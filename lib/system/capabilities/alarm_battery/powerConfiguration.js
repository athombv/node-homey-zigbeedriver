'use strict';

/**
 * Cluster capability configuration for `alarm_battery`.
 * @type {ClusterCapabilityConfiguration}
 */
module.exports = {
  get: 'batteryVoltage',
  report: 'batteryVoltage',
  /**
   * @param {number} value
   * @returns {boolean}
   */
  reportParser(value) {
    // Check if setting `batteryThreshold` exists otherwise use Homey.Device#batteryThreshold if
    // it exists use that, if both don't exist fallback to default value 1.
    const batteryThreshold = this.getSetting('batteryThreshold') || this.batteryThreshold || 1;
    return value <= batteryThreshold;
  },
};
