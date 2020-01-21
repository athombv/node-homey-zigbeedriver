'use strict';

module.exports = {
  get: 'occupancy',
  reportParser(value) {
    return value === 1;
  },
  report: 'occupancy',
};
