'use strict';

const { ZigBeeDevice } = require('homey-zigbeedriver');
const { CLUSTER } = require('zigbee-clusters');

class Bulb extends ZigBeeDevice {

  // This method is triggered when the node has been initialized
  async onNodeInit({ zclNode }) {
    this.enableDebug(); // only for debugging purposes
    this.printNode(); // only for debugging purposes

    // Register onoff capability
    this.registerCapability('onoff', CLUSTER.ON_OFF);

    // Register dim capability
    this.registerCapability('dim', CLUSTER.LEVEL_CONTROL);

    // Configure attribute reporting (this requires a binding to be setup for the respective
    // cluster in the driver manifest)
    await this.configureAttributeReporting([
      {
        endpointId: 2,
        cluster: CLUSTER.COLOR_CONTROL,
        attributeName: 'currentHue',
        minInterval: 0,
        maxInterval: 300,
        minChange: 10,
      },
      {
        endpointId: 2,
        cluster: CLUSTER.COLOR_CONTROL,
        attributeName: 'currentSaturation',
        minInterval: 0,
        maxInterval: 300,
        minChange: 10,
      },
    ]);
  }

  onEndDeviceAnnounce() {
    this.log('device came online!');
  }

  async onFlowTrigger() {
    // Get the current dim level attribute value from the device
    const currentDimLevel = await this.getClusterCapabilityValue('dim',
      CLUSTER.COLOR_CONTROL);
    return currentDimLevel;
  }

  async onAnotherFlowTrigger(dimValue) {
    // Execute the dim command on the device with the provided dim value
    return this.setClusterCapabilityValue('dim', CLUSTER.LEVEL_CONTROL, dimValue, { duration: 500 });
  }

}

module.exports = Bulb;
