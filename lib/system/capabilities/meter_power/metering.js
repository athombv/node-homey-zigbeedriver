'use strict';

/**
 * Cluster capability configuration for `measure_power`.
 * @type {ClusterCapabilityConfiguration}
 * Add below code to your device driver to read the attributes and define the correct formatting 
 * if (typeof this.meteringFactor !== 'number') {
 *   const { multiplier } = await zclNode.endpoints[this.getClusterEndpoint(CLUSTER.METERING)].clusters[CLUSTER.METERING.NAME].readAttributes('multiplier');
 *   const { divisor } = await zclNode.endpoints[this.getClusterEndpoint(CLUSTER.METERING)].clusters[CLUSTER.METERING.NAME].readAttributes('divisor');
 *   this.meteringFactor = multiplier / divisor;
 *   this.debug('meteringFactor:', multiplier, divisor, this.meteringFactor);
 *  }
 */
module.exports = {
  get: 'currentSummationDelivered',
  getOpts: {
    getOnStart: true,
  },
  report: 'currentSummationDelivered',
  /**
   * @param {number} value
   * @returns {null|number}
   */
  reportParser(value) {
    const meteringFactor = this.meteringFactor || 1;
    if (value < 0) return null;
    return value * meteringFactor;
  },
};
