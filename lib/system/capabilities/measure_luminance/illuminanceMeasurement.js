'use strict';

module.exports = {
  get: 'measuredValue',
  reportParser(value) {
    return Math.round(10 ** ((value - 1) / 10000));
  },
  report: 'measuredValue',
};
