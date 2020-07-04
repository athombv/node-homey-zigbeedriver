'use strict';

const { CLUSTER } = require('zigbee-clusters');
const commandMap = {
  up: {
    command: 'upOpen',
  },
  idle: {
    command: 'stop',
  },
  down: {
    command: 'downClose',
  },
};

/**
 * Cluster capability configuration for `windowcoverings_state`.
 * @type {ClusterCapabilityConfiguration}
 */
module.exports = {
  set: value => commandMap[value].command,
  setParser: () => ({}),
};
