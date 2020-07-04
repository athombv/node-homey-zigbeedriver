'use strict';

/**
 * Cluster capability configuration for `measure_power`.
 * @type {ClusterCapabilityConfiguration}
 * Add below code to your device driver to read the attributes and define the correct formatting
 * if (typeof this.activePowerFactor !== 'number') {
 *  const { acPowerMultiplier } = await zclNode.endpoints[this.getClusterEndpoint(CLUSTER.ELECTRICAL_MEASUREMENT)].clusters[CLUSTER.ELECTRICAL_MEASUREMENT.NAME].readAttributes('acPowerMultiplier');
 *  const { acPowerDivisor } = await zclNode.endpoints[this.getClusterEndpoint(CLUSTER.ELECTRICAL_MEASUREMENT)].clusters[CLUSTER.ELECTRICAL_MEASUREMENT.NAME].readAttributes('acPowerDivisor');
 *  this.activePowerFactor = acPowerMultiplier / acPowerDivisor;
 *  }
 */
module.exports = {
  get: 'activePower',
  getOpts: {
    getOnStart: true,
  },
  report: 'activePower',
  /**
   * @param {number} value
   * @returns {null|number}
   */
  reportParser(value) {
    const activePowerFactor = this.activePowerFactor || 1;
    if (value < 0) return null;
    return value * activePowerFactor;
  },
};
