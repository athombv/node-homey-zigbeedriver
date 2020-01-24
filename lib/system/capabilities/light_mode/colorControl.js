'use strict';

const util = require('../../../util');

const maxHue = 254;
const maxSaturation = 254;

module.exports = {
  set: 'moveToColorTemperature',
  setParser(value) {
    switch (value) {
      case 'temperature': {
        return this.zclNode.endpoints[this.getClusterEndpoint('colorControl')].clusters.colorControl.moveToColorTemperature({
          colorTemperature: Math.round(util.mapValueRange(0, 1, this._colorTempMin, this._colorTempMax,
            this.getCapabilityValue('light_temperature'))),
          transitionTime: this.getSetting('transition_time') ? Math.round(this.getSetting('transition_time') * 10) : 0,
        })
          .then(res => {
            this.log('did moveToColorTemperature', res);
            return null;
          })
          .catch(err => new Error('failed_to_do_move_to_color_temp', err));
      }
      case 'color': {
        const lightHue = this.getCapabilityValue('light_hue');
        const lightSaturation = this.getCapabilityValue('light_saturation');

        return this.zclNode.endpoints[this.getClusterEndpoint('colorControl')].clusters.colorControl.moveToHueAndSaturation({
          hue: Math.round(lightHue * maxHue),
          saturation: Math.round(lightSaturation * maxSaturation),
          transitionTime: this.getSetting('transition_time') ? Math.round(this.getSetting('transition_time') * 10) : 0,
        }).then(() => {
          this.log('did moveToHueAndSaturation');
          return null;
        })
          .catch(err => new Error('failed_to_do_move_to_hue_and_saturation', err));
      }
      default:
        return null;
    }
  },
  get: 'colorMode',
  async reportParser(value) {
    switch (value) {
      case 0:
        return 'color';
      case 1: {
        // Get capability values to confirm light mode temperature
        let _currentHue = this.getCapabilityValue('light_hue');
        let _currentLightTemperature = this.getCapabilityValue('light_temperature');
        let _currentSaturation = this.getCapabilityValue('light_saturation');

        // If values are unknown retrieve them from device
        if (typeof _currentLightTemperature !== 'number'
          || typeof _currentSaturation !== 'number'
          || typeof _currentHue !== 'number') {
          try {
            const { colorTemperatureMireds, currentHue, currentSaturation } = await this.zclNode.endpoints[this.getClusterEndpoint('colorControl')].clusters.colorControl.readAttributes('colorTemperatureMireds', 'currentHue', 'currentSaturation');
            _currentLightTemperature = colorTemperatureMireds;
            _currentHue = currentHue;
            _currentSaturation = currentSaturation;
          } catch (err) {
            this.error('failed to get light temperature/light hue or light saturation', err);
            _currentLightTemperature = null;
            _currentHue = null;
            _currentSaturation = null;
          }
        }

        if (_currentLightTemperature > 0) return 'temperature'; // Probably temperature
        if (_currentHue > 0) return 'color'; // Probably color
        if (_currentSaturation > 0) return 'color'; // Probably color

        // Could not determine light mode with certainty, assume temperature
        return 'temperature';
      }
      case 2:
        return 'temperature';
      default:
        return null;
    }
  },
  report: 'colorMode',
  getOpts: {
    getOnStart: true,
  },
};
