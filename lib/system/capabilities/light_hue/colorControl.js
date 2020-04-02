'use strict';

const {
  convertHSVToCIE,
  calculateDimDuration,
} = require('../../../util');

const CIE_MULTIPLIER = 65536;

/**
 * Cluster capability configuration for `light_hue`.
 * @type {ClusterCapabilityConfiguration}
 */
module.exports = {
  set: 'moveToColor',
  /**
   * @param {number} hue
   * @returns {{transitionTime: number, colorY: number, colorX: number}}
   */
  setParser(hue) {
    // Convert to CIE color space
    const saturation = typeof this.getCapabilityValue('light_saturation') === 'number'
      ? this.getCapabilityValue('light_saturation')
      : 1;

    // Convert HSV to xyY
    const { x, y } = convertHSVToCIE({ hue, saturation, value: 1 });

    // Execute move to color command
    return {
      colorX: x * CIE_MULTIPLIER,
      colorY: y * CIE_MULTIPLIER,
      transitionTime: calculateDimDuration({}, this.getSettings()),
    };
  },
};
