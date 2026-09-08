'use strict';

const assert = require('assert');
const Module = require('module');
const { EventEmitter } = require('events');
const {
  describe, it, beforeEach, afterEach, mock,
} = require('node:test');

// `homey` is not a real module, the apps SDK injects it by patching `Module.prototype.require`.
// Do the same here so `ZigBeeLightDevice` can be required outside of a Homey app.
class HomeyBase {

  async onUninit() {
    // The SDK's own `Device.onUninit` is a no-op too
  }

}

const originalRequire = Module.prototype.require;
Module.prototype.require = function homeyRequire(...args) {
  if (args[0] === 'homey') return { Device: HomeyBase, Driver: HomeyBase };
  return originalRequire.apply(this, args);
};

// eslint-disable-next-line import/order
const ZigBeeLightDevice = require('../../lib/ZigBeeLightDevice');

Module.prototype.require = originalRequire;

const {
  changeOnOff, changeDimLevel, registerAttributeReportListeners, onUninit,
  readTransitionTimes, scheduleTransitionTimesRead, onEndDeviceAnnounce,
} = ZigBeeLightDevice.prototype;

const CURRENT_LEVEL_MID_TRANSITION = 7;
const DIM_READBACK_DELAY = 1000;

function createDevice({
  capabilities = ['onoff', 'dim'],
  clusters = ['levelControl', 'onOff'],
  onOffTransitionTime,
  onTransitionTime,
  remainingTimes = [],
} = {}) {
  const device = {
    capabilityValues: [],
    commands: [],
    readAttributesCalls: 0,
    _dimCommandAt: 0,
    _dimTransitionEndsAt: 0,
    _dimCommandCount: 0,
    _onOffTransitionTime: null,
    _onTransitionTime: null,
    _transitionTimesReadTimeout: null,
    _dimReadbackTimeout: null,
    readTransitionTimes: ZigBeeLightDevice.prototype.readTransitionTimes,
    applyTransitionTimes: ZigBeeLightDevice.prototype.applyTransitionTimes,
    _scheduleDimReadback: ZigBeeLightDevice.prototype._scheduleDimReadback,
    homey: {
      setTimeout: (fn, ms) => setTimeout(fn, ms),
      clearTimeout: timeout => clearTimeout(timeout),
    },
    _attributeReportListeners: [],
    _addAttributeReportListener: ZigBeeLightDevice.prototype._addAttributeReportListener,
    log() {},
    debug() {},
    error() {},
    onOffCluster: Object.assign(new EventEmitter(), {
      async setOn() {
        device.commands.push({ command: 'setOn' });
      },
      async setOff() {
        device.commands.push({ command: 'setOff' });
      },
    }),
    levelControlCluster: Object.assign(new EventEmitter(), {
      async readAttributes(attributes) {
        device.readAttributesCalls++;
        // A device leaves an attribute it does not support out of the result
        const values = {};
        if (attributes.includes('currentLevel')) {
          values.currentLevel = CURRENT_LEVEL_MID_TRANSITION;
        }
        if (attributes.includes('remainingTime') && remainingTimes.length) {
          values.remainingTime = remainingTimes.shift();
        }
        if (attributes.includes('onOffTransitionTime') && onOffTransitionTime !== undefined) {
          values.onOffTransitionTime = onOffTransitionTime;
        }
        if (attributes.includes('onTransitionTime') && onTransitionTime !== undefined) {
          values.onTransitionTime = onTransitionTime;
        }
        return values;
      },
      async moveToLevelWithOnOff({ level }) {
        device.commands.push({ command: 'moveToLevelWithOnOff', level });
      },
    }),
    hasCapability(capabilityId) {
      return capabilities.includes(capabilityId);
    },
    getClusterEndpoint(cluster) {
      return clusters.includes(cluster.NAME) ? 1 : null;
    },
    getCapabilityValue(capabilityId) {
      const written = device.capabilityValues.filter(v => v.capabilityId === capabilityId).pop();
      return written ? written.value : true;
    },
    async setCapabilityValue(capabilityId, value) {
      device.capabilityValues.push({ capabilityId, value });
    },
  };
  // Use the real getters, they decide which transition time applies and when one is running
  for (const name of ['onCommandTransitionTime', 'isDimTransitionRunning', 'hasDimOnLevelControl']) {
    Object.defineProperty(device, name,
      Object.getOwnPropertyDescriptor(ZigBeeLightDevice.prototype, name));
  }

  return device;
}

/** Let the unawaited dim readback promise chain in `changeOnOff` run to completion. */
async function flush(ms = DIM_READBACK_DELAY) {
  mock.timers.tick(ms);
  for (let i = 0; i < 5; i++) {
    await new Promise(resolve => setImmediate(resolve));
  }
}

describe('ZigBeeLightDevice', function() {
  describe('changeOnOff()', function() {
    beforeEach(function() {
      mock.timers.enable({ apis: ['setTimeout'] });
    });

    afterEach(function() {
      mock.timers.reset();
    });

    it('updates `dim` from the read `currentLevel` when the light is only turned on', async function() {
      const device = createDevice();

      await changeOnOff.call(device, true);
      await flush();

      assert.deepStrictEqual(device.capabilityValues, [
        { capabilityId: 'dim', value: CURRENT_LEVEL_MID_TRANSITION / 254 },
      ]);
    });

    it('does not overwrite `dim` when a dim command was issued before the on/off command', async function() {
      const device = createDevice();

      await changeDimLevel.call(device, 0.5);
      await changeOnOff.call(device, true);
      await flush();

      assert.deepStrictEqual(device.commands, [
        { command: 'moveToLevelWithOnOff', level: 127 },
        { command: 'setOn' },
      ]);
      assert.deepStrictEqual(device.capabilityValues, []);
      assert.strictEqual(device.readAttributesCalls, 0);
    });

    it('does not overwrite `dim` when a dim command was issued after the on/off command', async function() {
      const device = createDevice();

      const onOffPromise = changeOnOff.call(device, true);
      await changeDimLevel.call(device, 0.5);
      await onOffPromise;
      await flush();

      assert.deepStrictEqual(device.capabilityValues, []);
      assert.strictEqual(device.readAttributesCalls, 0);
    });

    it('does not overwrite `dim` when a dim command arrives while the readback is in flight', async function() {
      const device = createDevice();
      const { readAttributes } = device.levelControlCluster;
      device.levelControlCluster.readAttributes = async (...args) => {
        await changeDimLevel.call(device, 0.5);
        return readAttributes(...args);
      };

      await changeOnOff.call(device, true);
      await flush();

      assert.deepStrictEqual(device.capabilityValues, []);
      assert.strictEqual(device.readAttributesCalls, 1);
    });

    it('does not overwrite `dim` when a dim command landed just before the grace period ends', async function() {
      const device = createDevice();

      await changeDimLevel.call(device, 0.5);
      device._dimCommandAt = Date.now() - 400; // Simultaneous API writes land this far apart

      await changeOnOff.call(device, true);
      await flush();

      assert.deepStrictEqual(device.capabilityValues, []);
      assert.strictEqual(device.readAttributesCalls, 0);
    });

    it('does not keep guarding past the transition time the device was given', async function() {
      const device = createDevice();

      // Out of range, the command clamps it to 65534 tenths of a second
      await changeDimLevel.call(device, 0.5, { duration: 9000000 });

      assert.strictEqual(device._dimTransitionEndsAt - device._dimCommandAt, 6553400);
    });

    it('does not overwrite `dim` while the transition of an older dim command is still running', async function() {
      const device = createDevice();

      await changeDimLevel.call(device, 0.5, { duration: 8000 });
      device._dimCommandAt = Date.now() - 5000; // Older than the grace period, still fading

      await changeOnOff.call(device, true);
      await flush();

      assert.deepStrictEqual(device.capabilityValues, []);
      assert.strictEqual(device.readAttributesCalls, 0);
    });

    it('updates `dim` once the transition of the last dim command has finished', async function() {
      const device = createDevice();

      await changeDimLevel.call(device, 0.5, { duration: 100 });
      device._dimCommandAt = Date.now() - 5000;
      device._dimTransitionEndsAt = Date.now() - 4900;

      await changeOnOff.call(device, true);
      await flush();

      assert.deepStrictEqual(device.capabilityValues, [
        { capabilityId: 'dim', value: CURRENT_LEVEL_MID_TRANSITION / 254 },
      ]);
    });

    it('stops guarding the dim transition once the light is turned off', async function() {
      const device = createDevice();

      await changeDimLevel.call(device, 0.5, { duration: 8000 });
      await changeOnOff.call(device, false);

      assert.strictEqual(device._dimTransitionEndsAt, 0);
    });

    it('updates `dim` when the last dim command is older than the grace period', async function() {
      const device = createDevice();
      device._dimCommandAt = Date.now() - 5000;

      await changeOnOff.call(device, true);
      await flush();

      assert.deepStrictEqual(device.capabilityValues, [
        { capabilityId: 'dim', value: CURRENT_LEVEL_MID_TRANSITION / 254 },
      ]);
    });

    it('reads the level again when the light was turned off after the dim command', async function() {
      const device = createDevice();

      await changeDimLevel.call(device, 0.5);
      await changeOnOff.call(device, false);
      device.capabilityValues.length = 0;

      await changeOnOff.call(device, true);
      await flush();

      // The off already set `dim` to zero, so skipping the readback would leave it there
      assert.deepStrictEqual(device.capabilityValues, [
        { capabilityId: 'dim', value: CURRENT_LEVEL_MID_TRANSITION / 254 },
      ]);
    });

    it('reads again when the device says it is still transitioning', async function() {
      const device = createDevice({ remainingTimes: [20, 0] });

      await changeOnOff.call(device, true);
      await flush();

      assert.strictEqual(device.readAttributesCalls, 1);
      assert.deepStrictEqual(device.capabilityValues, []);

      await flush(2000); // The device said two seconds were left

      assert.strictEqual(device.readAttributesCalls, 2);
      assert.deepStrictEqual(device.capabilityValues, [
        { capabilityId: 'dim', value: CURRENT_LEVEL_MID_TRANSITION / 254 },
      ]);
    });

    it('gives up rather than write a level the device is still moving away from', async function() {
      const device = createDevice({ remainingTimes: [20, 20, 20, 20, 20] });

      await changeOnOff.call(device, true);
      await flush();
      for (let i = 0; i < 4; i++) await flush(2000);

      assert.strictEqual(device.readAttributesCalls, 3);
      assert.deepStrictEqual(device.capabilityValues, []);
    });

    it('drops a readback for a light that is off by the time it runs', async function() {
      const device = createDevice({ onOffTransitionTime: 80 });
      await readTransitionTimes.call(device); // The device ramps over eight seconds

      await changeOnOff.call(device, true);
      await changeOnOff.call(device, false);
      await device.setCapabilityValue('onoff', false); // Homey commits this after the listener

      await flush(9000);

      // The off set `dim` to zero, the readback still pending from the on may not undo that
      assert.deepStrictEqual(device.capabilityValues.filter(v => v.capabilityId === 'dim'), [
        { capabilityId: 'dim', value: 0 },
      ]);
    });

    it('stops guarding the level when the dim command fails', async function() {
      const device = createDevice();
      device.levelControlCluster.moveToLevelWithOnOff = async () => {
        throw new Error('Timeout');
      };

      await assert.rejects(changeDimLevel.call(device, 0.5, { duration: 8000 }));

      assert.strictEqual(device._dimCommandAt, 0);
      assert.strictEqual(device._dimTransitionEndsAt, 0);
    });

    it('leaves a newer dim command alone when an older one fails', async function() {
      const device = createDevice();
      let failFirstCommand;
      const firstCommandSent = new Promise(resolve => {
        device.levelControlCluster.moveToLevelWithOnOff = async () => {
          resolve();
          await new Promise(fail => {
            failFirstCommand = fail;
          });
          throw new Error('Timeout');
        };
      });

      const failing = changeDimLevel.call(device, 0.5, { duration: 8000 });
      await firstCommandSent;
      device.levelControlCluster.moveToLevelWithOnOff = async () => {};
      await changeDimLevel.call(device, 0.8, { duration: 8000 });
      const { _dimCommandAt, _dimTransitionEndsAt } = device;
      failFirstCommand();
      await assert.rejects(failing);

      assert.strictEqual(device._dimCommandAt, _dimCommandAt);
      assert.strictEqual(device._dimTransitionEndsAt, _dimTransitionEndsAt);
    });

    it('sets `dim` to zero when the light is turned off', async function() {
      const device = createDevice();

      await changeOnOff.call(device, false);

      assert.deepStrictEqual(device.capabilityValues, [{ capabilityId: 'dim', value: 0 }]);
    });
  });

  describe('readTransitionTimes()', function() {
    beforeEach(function() {
      mock.timers.enable({ apis: ['setTimeout'] });
    });

    afterEach(function() {
      mock.timers.reset();
    });

    it('stores the transition time the device applies on its own, in milliseconds', async function() {
      const device = createDevice({ onOffTransitionTime: 50 });

      await readTransitionTimes.call(device);

      assert.strictEqual(device._onOffTransitionTime, 5000);
    });

    it('keeps the transition time unknown when the device does not report one', async function() {
      const device = createDevice({ onOffTransitionTime: undefined });

      await readTransitionTimes.call(device);

      assert.strictEqual(device._onOffTransitionTime, null);
    });

    it('keeps the transition time unknown when the device cannot be reached', async function() {
      const device = createDevice();
      device.levelControlCluster.readAttributes = async () => {
        throw new Error('Timeout');
      };

      await readTransitionTimes.call(device);

      assert.strictEqual(device._onOffTransitionTime, null);
    });

    it('reads the transition time of an `On` command when the device has its own', async function() {
      const device = createDevice({ onOffTransitionTime: 50, onTransitionTime: 20 });

      await readTransitionTimes.call(device);

      assert.strictEqual(device._onTransitionTime, 2000);
      assert.strictEqual(device.onCommandTransitionTime, 2000);
    });

    it('falls back to `onOffTransitionTime` when the device has no separate one', async function() {
      const device = createDevice({ onOffTransitionTime: 50, onTransitionTime: 0xFFFF });

      await readTransitionTimes.call(device);

      assert.strictEqual(device._onTransitionTime, null);
      assert.strictEqual(device.onCommandTransitionTime, 5000);
    });

    it('drops its own transition time when the device stops reporting one', async function() {
      const device = createDevice({ onOffTransitionTime: 50, onTransitionTime: 20 });
      await readTransitionTimes.call(device);
      assert.strictEqual(device.onCommandTransitionTime, 2000);

      device.levelControlCluster.readAttributes = async () => ({
        onOffTransitionTime: 50, onTransitionTime: 0xFFFF,
      });
      await readTransitionTimes.call(device);

      assert.strictEqual(device.onCommandTransitionTime, 5000);
    });

    it('waits for the device to finish ramping before reading `currentLevel`', async function() {
      const device = createDevice({ onTransitionTime: 50 });
      await readTransitionTimes.call(device);
      device.readAttributesCalls = 0;

      await changeOnOff.call(device, true);
      await flush(); // The old fixed delay is not enough now

      assert.strictEqual(device.readAttributesCalls, 0);

      await flush(4000);

      assert.deepStrictEqual(device.capabilityValues, [
        { capabilityId: 'dim', value: CURRENT_LEVEL_MID_TRANSITION / 254 },
      ]);
    });

    it('does not read from a device without a dim capability', function() {
      const device = createDevice({ capabilities: ['onoff'] });

      scheduleTransitionTimesRead.call(device);
      mock.timers.tick(60000);

      assert.strictEqual(device.readAttributesCalls, 0);
    });

    it('does not overwrite `dim` while the device fades over its own transition time', async function() {
      const device = createDevice({ onOffTransitionTime: 80 });
      await readTransitionTimes.call(device);
      device.readAttributesCalls = 0;

      await changeDimLevel.call(device, 0.5); // No duration, so the device decides
      device._dimCommandAt = Date.now() - 5000; // Older than the grace period, still fading

      await changeOnOff.call(device, true);
      await flush();

      assert.deepStrictEqual(device.capabilityValues, []);
      assert.strictEqual(device.readAttributesCalls, 0);
    });
  });

  describe('onEndDeviceAnnounce()', function() {
    it('does not touch `dim` or `onoff` while a dim transition is running', async function() {
      const device = createDevice();

      // A fade to zero has already set `onoff` false, a level above zero would undo that
      await changeDimLevel.call(device, 0, { duration: 8000 });
      device.capabilityValues.length = 0;
      await onEndDeviceAnnounce.call(device);

      assert.deepStrictEqual(device.capabilityValues, []);
    });

    it('updates `dim` and `onoff` when no transition is running', async function() {
      const device = createDevice();

      await onEndDeviceAnnounce.call(device);

      assert.deepStrictEqual(device.capabilityValues, [
        { capabilityId: 'dim', value: CURRENT_LEVEL_MID_TRANSITION / 254 },
        { capabilityId: 'onoff', value: true },
      ]);
    });
  });

  describe('registerAttributeReportListeners()', function() {
    it('updates `dim` from a `currentLevel` attribute report', async function() {
      const device = createDevice();

      registerAttributeReportListeners.call(device);
      device.levelControlCluster.emit('attr.currentLevel', 127);
      await new Promise(resolve => setImmediate(resolve));

      assert.deepStrictEqual(device.capabilityValues, [{ capabilityId: 'dim', value: 127 / 254 }]);
    });

    it('ignores a `currentLevel` attribute report from halfway a dim transition', async function() {
      const device = createDevice();
      registerAttributeReportListeners.call(device);

      await changeDimLevel.call(device, 0.5, { duration: 8000 });
      device.capabilityValues.length = 0;
      device.levelControlCluster.emit('attr.currentLevel', 40);
      await new Promise(resolve => setImmediate(resolve));

      assert.deepStrictEqual(device.capabilityValues, []);
    });

    it('updates `dim` from a `currentLevel` attribute report once the transition has finished', async function() {
      const device = createDevice();
      registerAttributeReportListeners.call(device);

      await changeDimLevel.call(device, 0.5, { duration: 8000 });
      device.capabilityValues.length = 0;
      device._dimTransitionEndsAt = Date.now() - 1;
      device.levelControlCluster.emit('attr.currentLevel', 127);
      await new Promise(resolve => setImmediate(resolve));

      assert.deepStrictEqual(device.capabilityValues, [{ capabilityId: 'dim', value: 127 / 254 }]);
    });

    it('updates `onoff` from an `onOff` attribute report', async function() {
      const device = createDevice();

      registerAttributeReportListeners.call(device);
      device.onOffCluster.emit('attr.onOff', false);
      await new Promise(resolve => setImmediate(resolve));

      assert.deepStrictEqual(device.capabilityValues, [{ capabilityId: 'onoff', value: false }]);
    });

    it('does not listen for clusters the device does not have', function() {
      const device = createDevice({ clusters: [] });

      registerAttributeReportListeners.call(device);

      assert.strictEqual(device.levelControlCluster.listenerCount('attr.currentLevel'), 0);
      assert.strictEqual(device.onOffCluster.listenerCount('attr.onOff'), 0);
    });

    it('removes its listeners again on uninit', async function() {
      const device = createDevice();

      registerAttributeReportListeners.call(device);
      await onUninit.call(device);

      assert.strictEqual(device.levelControlCluster.listenerCount('attr.currentLevel'), 0);
      assert.strictEqual(device.onOffCluster.listenerCount('attr.onOff'), 0);
    });

    it('does not listen for capabilities the device does not have', function() {
      const device = createDevice({ capabilities: ['onoff'] });

      registerAttributeReportListeners.call(device);

      assert.strictEqual(device.levelControlCluster.listenerCount('attr.currentLevel'), 0);
      assert.strictEqual(device.onOffCluster.listenerCount('attr.onOff'), 1);
    });
  });
});
