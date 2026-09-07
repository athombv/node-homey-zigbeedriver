'use strict';

const assert = require('assert');
const Module = require('module');
const {
  describe, it, beforeEach, afterEach, mock,
} = require('node:test');

// `homey` is not a real module, the apps SDK injects it by patching `Module.prototype.require`.
// Do the same here so `ZigBeeLightDevice` can be required outside of a Homey app.
class HomeyBase {}

const originalRequire = Module.prototype.require;
Module.prototype.require = function homeyRequire(...args) {
  if (args[0] === 'homey') return { Device: HomeyBase, Driver: HomeyBase };
  return originalRequire.apply(this, args);
};

// eslint-disable-next-line import/order
const ZigBeeLightDevice = require('../../lib/ZigBeeLightDevice');

Module.prototype.require = originalRequire;

const { changeOnOff, changeDimLevel } = ZigBeeLightDevice.prototype;

const CURRENT_LEVEL_MID_TRANSITION = 7;
const DIM_READBACK_DELAY = 1000;

function createDevice() {
  let resolveReadAttributes;
  const device = {
    capabilityValues: [],
    commands: [],
    readAttributesCalled: new Promise(resolve => {
      resolveReadAttributes = resolve;
    }),
    _dimCommandAt: 0,
    log() {},
    debug() {},
    error() {},
    onOffCluster: {
      async setOn() {
        device.commands.push({ command: 'setOn' });
      },
      async setOff() {
        device.commands.push({ command: 'setOff' });
      },
    },
    levelControlCluster: {
      async readAttributes() {
        resolveReadAttributes();
        return { currentLevel: CURRENT_LEVEL_MID_TRANSITION };
      },
      async moveToLevelWithOnOff({ level }) {
        device.commands.push({ command: 'moveToLevelWithOnOff', level });
      },
    },
    getCapabilityValue() {
      return true;
    },
    async setCapabilityValue(capabilityId, value) {
      device.capabilityValues.push({ capabilityId, value });
    },
  };
  return device;
}

/** Let the unawaited dim readback promise chain in `changeOnOff` run to completion. */
async function flush(device) {
  mock.timers.tick(DIM_READBACK_DELAY);
  await device.readAttributesCalled;
  for (let i = 0; i < 3; i++) {
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
      await flush(device);

      assert.deepStrictEqual(device.capabilityValues, [
        { capabilityId: 'dim', value: CURRENT_LEVEL_MID_TRANSITION / 254 },
      ]);
    });

    it('does not overwrite `dim` when a dim command was issued before the on/off command', async function() {
      const device = createDevice();

      await changeDimLevel.call(device, 0.5);
      await changeOnOff.call(device, true);
      await flush(device);

      assert.deepStrictEqual(device.commands, [
        { command: 'moveToLevelWithOnOff', level: 127 },
        { command: 'setOn' },
      ]);
      assert.deepStrictEqual(device.capabilityValues, []);
    });

    it('does not overwrite `dim` when a dim command was issued after the on/off command', async function() {
      const device = createDevice();

      const onOffPromise = changeOnOff.call(device, true);
      await changeDimLevel.call(device, 0.5);
      await onOffPromise;
      await flush(device);

      assert.deepStrictEqual(device.capabilityValues, []);
    });

    it('updates `dim` when the last dim command is older than the grace period', async function() {
      const device = createDevice();
      device._dimCommandAt = Date.now() - 5000;

      await changeOnOff.call(device, true);
      await flush(device);

      assert.deepStrictEqual(device.capabilityValues, [
        { capabilityId: 'dim', value: CURRENT_LEVEL_MID_TRANSITION / 254 },
      ]);
    });

    it('sets `dim` to zero when the light is turned off', async function() {
      const device = createDevice();

      await changeOnOff.call(device, false);

      assert.deepStrictEqual(device.capabilityValues, [{ capabilityId: 'dim', value: 0 }]);
    });
  });
});
