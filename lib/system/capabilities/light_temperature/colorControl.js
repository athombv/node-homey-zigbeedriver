'use strict';

const util = require('../../../util');

module.exports = {
  set: 'moveToColorTemperature',
  setParser(value) {
    return {
      colorTemperature: Math.round(util.mapValueRange(0, 1, this._colorTempMin, this._colorTempMax, value)),
      transitionTime: this.getSetting('transition_time') ? Math.round(this.getSetting('transition_time') * 10) : 0,
    };
  },
  get: 'colorTemperatureMireds',
  reportParser(value) {
    return util.mapValueRange(this._colorTempMin, this._colorTempMax, 0, 1, value);
  },
  report: 'colorTemperatureMireds',
  getOpts: {
    getOnStart: true,
  },
};
