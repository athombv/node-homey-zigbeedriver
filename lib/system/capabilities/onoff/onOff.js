'use strict';

/**
 * Cluster capability configuration for `onoff`.
 * @type {ClusterCapabilityConfiguration}
 */
module.exports = {
  get: 'onOff',
  getOpts: {
    getOnStart: true,
  },
  set: value => (value ? 'setOn' : 'setOff'),
  /**
   * Return empty object, the command specifies the action for this cluster ('setOn'/setOff').
   * @returns {{}}
   */
  setParser: () => ({}),
  report: 'onOff',
  /**
   * @param {number} value
   * @returns {boolean}
   */
  reportParser(value) {
    const result = value === 1;
    this.debug(`\`onoff\` → reportParser → onOff: ${value} → parsed:`, result);
    return result;
  },
};
