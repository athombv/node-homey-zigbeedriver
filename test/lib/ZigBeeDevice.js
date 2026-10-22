'use strict';

const assert = require('assert');
const Module = require('module');
const { describe, it } = require('node:test');
const { CLUSTER } = require('zigbee-clusters');

// `homey` is not a real module, the apps SDK injects it by patching `Module.prototype.require`.
// Do the same here so `ZigBeeDevice` can be required outside of a Homey app.
class HomeyBase {}

const originalRequire = Module.prototype.require;
Module.prototype.require = function homeyRequire(...args) {
  if (args[0] === 'homey') return { Device: HomeyBase, Driver: HomeyBase };
  return originalRequire.apply(this, args);
};

// eslint-disable-next-line import/order
const ZigBeeDevice = require('../../lib/ZigBeeDevice');

Module.prototype.require = originalRequire;

const { parseAttributeReport } = ZigBeeDevice.prototype;

describe('ZigBeeDevice', () => {
  describe('parseAttributeReport', () => {
    it('should pass the report meta to the reportParser', async () => {
      const parserCalls = [];
      const capabilityValues = [];
      const device = {
        log() {},
        debug() {},
        error() {},
        hasCapability: () => true,
        _getClusterCapabilityConfiguration: () => ({
          report: 'onOff',
          reportParser(value, reportMeta) {
            parserCalls.push({ value, reportMeta });
            return value;
          },
        }),
        async setCapabilityValue(capabilityId, value) {
          capabilityValues.push({ capabilityId, value });
        },
      };

      const reportMeta = { trxSequenceNumber: 42 };
      const result = await parseAttributeReport.call(device, 'onoff', CLUSTER.ON_OFF, { onOff: true }, reportMeta);

      assert.strictEqual(result, true);
      assert.deepStrictEqual(parserCalls, [{ value: true, reportMeta }]);
      assert.deepStrictEqual(capabilityValues, [{ capabilityId: 'onoff', value: true }]);
    });
  });
});
