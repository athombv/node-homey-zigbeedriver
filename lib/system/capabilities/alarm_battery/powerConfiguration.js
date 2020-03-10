'use strict';

module.exports = {
  get: 'batteryVoltage',
  reportParser(value) {
    // Check if setting batteryThreshold exists otherwise if batteryThreshold in device.js exist
    // use that, if both not exist use value 1
    const batteryThreshold = this.getSetting('batteryThreshold') || this.batteryThreshold || 1;
    // console.log(batThreshold);
    return value <= batteryThreshold;
  },
  report: 'batteryVoltage',
};
