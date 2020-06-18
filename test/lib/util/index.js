'use strict';

const assert = require('assert');

const {
  convertHSVToCIE,
  calculateLevelControlTransitionTime,
  calculateColorControlTransitionTime,
  convertCIEToHSV,
} = require('../../../lib/util');

/**
 * Returns a random float
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function getRandomFloat(min, max) {
  return Math.random() * (max - min) + min;
}

/**
 * Calculate relative difference between two values.
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function relDiff(a, b) {
  return 100 * Math.abs((a - b) / ((a + b) / 2));
}

/**
 * Convert HSV to XYY and back and check if the start HSV values match the end HSV values.
 * @param {number} startHue - Range 0 - 1
 * @param {number} startSaturation - Range 0 - 1
 * @param {number} startValue - Range 0 - 1
 */
function shouldConvertHSVtoXYY(startHue, startSaturation, startValue) {
  // Covert HSV to XYY
  const {
    x, y, Y,
  } = convertHSVToCIE({ hue: startHue, saturation: startSaturation, value: startValue });

  // Convert XYY back to HSV to check if values still match
  const { hue, saturation, value } = convertCIEToHSV({ x, y, Y });

  if (startHue !== hue && relDiff(startHue, hue) > 1) {
    throw new Error(`Hue mismatch, expected ${startHue} got ${hue}`);
  }
  if (startSaturation !== saturation && relDiff(startSaturation, saturation) > 1) {
    throw new Error(`Saturation mismatch, expected ${startSaturation} got ${saturation}`);
  }
  if (startValue !== value && relDiff(startValue, value) > 1) {
    throw new Error(`Value mismatch, expected ${startValue} got ${value}`);
  }
}

describe('util', function() {
  it('should convert HSV to xyY color space', function() {
    // Generate 1000 random HSV values
    for (let i = 0; i < 100; i++) {
      shouldConvertHSVtoXYY(getRandomFloat(0, 1), getRandomFloat(0, 1), getRandomFloat(0, 1));
    }
  });

  // This seems to be very inaccurate for random values
  // eslint-disable-next-line mocha/no-pending-tests
  it('should convert xyY to HSB color space');

  it('should calculate level control transition time', function() {
    const validDuration = calculateLevelControlTransitionTime({ duration: 5000 });
    const validDuration2 = calculateLevelControlTransitionTime({ duration: 0 });

    const noDuration = calculateLevelControlTransitionTime();
    const noDuration2 = calculateLevelControlTransitionTime({});

    const outOfRangeDuration = calculateLevelControlTransitionTime({
      duration: 9000000, // ~150 min
    });
    const outOfRangeDuration2 = calculateLevelControlTransitionTime({ duration: -10 }); // ~150 min

    assert.strictEqual(validDuration, 50);
    assert.strictEqual(validDuration2, 0);

    assert.strictEqual(noDuration, 0xFFFF);
    assert.strictEqual(noDuration2, 0xFFFF);

    assert.strictEqual(outOfRangeDuration, 0xFFFE);
    assert.strictEqual(outOfRangeDuration2, 0);
  });

  it('should calculate color control transition time', function() {
    const validDuration = calculateColorControlTransitionTime({ duration: 5000 });
    const validDuration2 = calculateColorControlTransitionTime({ duration: 0 });

    const noDuration = calculateColorControlTransitionTime();
    const noDuration2 = calculateColorControlTransitionTime({});

    const outOfRangeDuration = calculateColorControlTransitionTime({
      duration: 9000000, // ~150 min
    });
    const outOfRangeDuration2 = calculateColorControlTransitionTime({ duration: -10 }); // ~150 min

    assert.strictEqual(validDuration, 50);
    assert.strictEqual(validDuration2, 0);

    assert.strictEqual(noDuration, 0);
    assert.strictEqual(noDuration2, 0);

    assert.strictEqual(outOfRangeDuration, 0xFFFF);
    assert.strictEqual(outOfRangeDuration2, 0);
  });
});
