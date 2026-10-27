'use strict';

const assert = require('assert');
const Module = require('module');
const { describe, it } = require('node:test');
const { CLUSTER, ZCLNode, zclFrames } = require('zigbee-clusters');

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
  const device = {
    parserCalls,
    capabilityValues,
    log() {},
    debug() {},
    error() {},
    hasCapability: () => true,
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
    it('should pass the report meta of a received report to the reportParser', async () => {
      const node = {
        endpointDescriptors: [{ endpointId: 1, inputClusters: [CLUSTER.ON_OFF.ID] }],
        sendFrame: () => Promise.resolve(),
      };
      const device = onOffDevice();
      device.zclNode = new ZCLNode(node);
      _registerCapabilityGet.call(device, 'onoff', CLUSTER.ON_OFF);

      // A real report through zigbee-clusters, so the meta has the key it actually emits
      const report = new zclFrames.ZCLStandardHeader();
      report.frameControl.directionToClient = true;
      report.frameControl.disableDefaultResponse = true;
      report.trxSequenceNumber = 42;
      report.cmdId = 0x0a; // Report Attributes
      report.data = Buffer.from([0x00, 0x00, 0x10, 0x01]); // onOff, boolean, true
      await node.handleFrame(1, CLUSTER.ON_OFF.ID, report.toBuffer(), {});

      assert.deepStrictEqual(device.parserCalls, [
        { value: true, reportMeta: { transactionSequenceNumber: 42 } },
      ]);
    });
  });
});
