'use strict';

const assert = require('assert');
const EventEmitter = require('events');
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

const { parseAttributeReport, _registerCapabilityGet } = ZigBeeDevice.prototype;

/** A device with an `onoff` capability reported by onOff, recording what its parser receives. */
function onOffDevice() {
  const parserCalls = [];
  const capabilityValues = [];
  const onOff = new EventEmitter();
  const device = {
    parserCalls,
    capabilityValues,
    log() {},
    debug() {},
    error() {},
    hasCapability: () => true,
    zclNode: { endpoints: { 1: { clusters: { onOff } } } },
    parseAttributeReport,
    _getClusterCapabilityConfiguration: () => ({
      endpoint: 1,
      getOpts: {},
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
  return device;
}

describe('ZigBeeDevice', () => {
  describe('parseAttributeReport', () => {
    it('should pass the report meta to the reportParser', async () => {
      const device = onOffDevice();

      const reportMeta = { transactionSequenceNumber: 42 };
      const result = await parseAttributeReport.call(device, 'onoff', CLUSTER.ON_OFF, { onOff: true }, reportMeta);

      assert.strictEqual(result, true);
      assert.deepStrictEqual(device.parserCalls, [{ value: true, reportMeta }]);
      assert.deepStrictEqual(device.capabilityValues, [{ capabilityId: 'onoff', value: true }]);
    });
  });

  describe('registered report listener', () => {
    it('should forward the report meta of an attr event to the reportParser', async () => {
      const device = onOffDevice();
      _registerCapabilityGet.call(device, 'onoff', CLUSTER.ON_OFF);

      // zigbee-clusters 3.9.0 and later emit the report meta as second argument
      const reportMeta = { transactionSequenceNumber: 42 };
      device.zclNode.endpoints[1].clusters.onOff.emit('attr.onOff', true, reportMeta);

      assert.deepStrictEqual(device.parserCalls, [{ value: true, reportMeta }]);
    });
  });
});
