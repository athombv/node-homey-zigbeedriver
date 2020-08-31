'use strict';

const { CLUSTER } = require('zigbee-clusters');

/**
 * Cluster capability configuration for `target_temperature`.
 * @type {ClusterCapabilityConfiguration}
 * Add below code to your device driver to read the attributes and define the correct formatting
 * try {
 *   const occupancyValue = await this.zclNode.endpoints[this.getClusterEndpoint(CLUSTER.THERMOSTAT)].clusters[CLUSTER.THERMOSTAT.NAME].readAttributes('occupancy');
 *   this.heatingType = occupancyValue['ocupancy'];
 *   this.log('Read occupancy Value: ', occupancyValue);
 *   if (typeof this.heatingType !== 'number') {
 *      this.heatingType = 1;
 *      this.log('occupancyValue did not return a value!');
 *   }
 * } catch (err) {
 *   this.log('could not read occupancy');
 *   this.log(err);
 *   this.heatingType = 1;
 * }
 */

module.exports = {
  set: 'occupiedHeatingSetpoint',
  setParser(value) {
    if (this.heatingType === 1) {

      try {
        this.zclNode.endpoints[this.getClusterEndpoint(CLUSTER.THERMOSTAT)].clusters[CLUSTER.THERMOSTAT.NAME].writeAttributes({occupiedHeatingSetpoint: Math.round(value * 1000 / 10)})
        } catch (err) {
          this.log('could not write occupiedHeatingSetpoint');
          this.log(err);
        }
      return null;
    }
    if (this.heatingType === 0) {
      try {
        this.zclNode.endpoints[this.getClusterEndpoint(CLUSTER.THERMOSTAT)].clusters[CLUSTER.THERMOSTAT.NAME].writeAttributes({unoccupiedHeatingSetpoint: Math.round(value * 1000 / 10)})
        } catch (err) {
          this.log('could not write unoccupiedHeatingSetpoint');
          this.log(err);
        }
      return null;
    }
  },

  get: 'occupiedHeatingSetpoint',
  getOpts: {
    getOnStart: true,
  },
  report: 'occupiedHeatingSetpoint',
  async reportParser(value) {
   if (this.heatingType === 1) {
     try {
      const targetTemperature = await this.zclNode.endpoints[this.getClusterEndpoint(CLUSTER.THERMOSTAT)].clusters[CLUSTER.THERMOSTAT.NAME].readAttributes('occupiedHeatingSetpoint');
        this.heatingSetpoint = targetTemperature['occupiedHeatingSetpoint'];
        this.log('Read occupiedHeatingSetpoint Value: ', targetTemperature);
      } catch (err) {
        this.log('could not read occupiedHeatingSetpoint');
        this.log(err);
      }
    }
    if (this.heatingType === 0) {
      try {
       const targetTemperature = await this.zclNode.endpoints[this.getClusterEndpoint(CLUSTER.THERMOSTAT)].clusters[CLUSTER.THERMOSTAT.NAME].readAttributes('unoccupiedHeatingSetpoint');
       this.heatingSetpoint = targetTemperature['unoccupiedHeatingSetpoint'];
       this.log('unoccupiedHeatingSetpoint Value: ', targetTemperature);
      } catch (err) {
        this.log('could not read unoccupiedHeatingSetpoint');
        this.log(err);
      }
    }
    return Math.round((this.heatingSetpoint / 100) * 10) / 10;
  }
};
