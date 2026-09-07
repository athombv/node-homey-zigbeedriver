'use strict';

const Homey = require('homey');

class ZigBeeDriver extends Homey.Driver {

  /**
   * @private
   * @type {Map<Token, ZCLNode>}
   */
  _zclNodes = new Map();

}

module.exports = ZigBeeDriver;
