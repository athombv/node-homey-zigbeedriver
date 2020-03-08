'use strict';

const { ZigBeeDevice } = require('homey-zigbeedriver');

class MyZigBeeDevice extends ZigBeeDevice {

  onMeshInit() {
    this.log('MyZigBeeDevice has been initialized');
  }

}

module.exports = MyZigBeeDevice;
