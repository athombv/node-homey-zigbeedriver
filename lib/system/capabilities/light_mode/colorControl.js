'use strict';

const { CLUSTER } = require('zigbee-clusters');
const util = require('../../../util');

const MAX_HUE = 254;
const MAX_SATURATION = 254;

/**
 * Cluster capability configuration for `light_mode`.
 * @type {ClusterCapabilityConfiguration}
 */
module.exports = {
  set: 'moveToColorTemperature',
  /**
   * @param {'temperature'|'color'} value
   * @returns {null|Promise<T | Error>|Promise<T>}
   */
  setParser(value) {
    const colorControlEndpoint = this.getClusterEndpoint(CLUSTER.COLOR_CONTROL);
    if (colorControlEndpoint === null) throw new Error('missing_color_control_cluster');
    const colorControlCluster = this.zclNode.endpoints[colorControlEndpoint].clusters.colorControl;
    switch (value) {
      case 'temperature': {
        const colorTemperature = Math.round(util.mapValueRange(
          0,
          1,
          this._colorTempMin,
          this._colorTempMax,
          this.getCapabilityValue('light_temperature'),
        ));
        const moveToColorTemperatureCommand = {
          colorTemperature,
          transitionTime: this.getSetting('transition_time') ? Math.round(this.getSetting('transition_time') * 10) : 0,
        };
        this.debug('set → `light_mode`: \'temperature\' → setParser → moveToColorTemperature', moveToColorTemperatureCommand);

        return colorControlCluster.moveToColorTemperature(moveToColorTemperatureCommand)
          .then(res => {
            this.debug('set → `light_mode`: \'temperature\' → setParser → moveToColorTemperature'
              + ' success', res);
            return null; // Return `null` to prevent the default command from being send
          })
          .catch(err => {
            this.error('Error: could not set → `light_mode`: \'temperature\' → setParser →'
              + ' moveToColorTemperature', err);
            throw err;
          });
      }
      case 'color': {
        const lightHue = this.getCapabilityValue('light_hue');
        const lightSaturation = this.getCapabilityValue('light_saturation');

        const moveToHueAndSaturation = {
          hue: Math.round(lightHue * MAX_HUE),
          saturation: Math.round(lightSaturation * MAX_SATURATION),
          transitionTime: this.getSetting('transition_time') ? Math.round(this.getSetting('transition_time') * 10) : 0,
        };

        this.debug('set → `light_mode`: \'color\' → setParser → moveToHueAndSaturation', moveToHueAndSaturation);

        return colorControlCluster.moveToHueAndSaturation(moveToHueAndSaturation)
          .then(res => {
            this.debug('set → `light_mode`: \'color\' → setParser → moveToHueAndSaturation'
              + ' success', res);
            return null; // Return `null` to prevent the default command from being send
          })
          .catch(err => {
            this.error('Error: could not set → `light_mode`: \'color\' → setParser →'
              + ' moveToHueAndSaturation', err);
            throw err;
          });
      }
      default:
        return null;
    }
  },
  get: 'colorMode',
  getOpts: {
    getOnStart: true,
  },
  report: 'colorMode',
  /**
   * @param {0|1|2} value
   * @returns {Promise<string|null>}
   */
  async reportParser(value) {
    const colorControlEndpoint = this.getClusterEndpoint(CLUSTER.COLOR_CONTROL);
    if (colorControlEndpoint === null) throw new Error('missing_color_control_cluster');
    const colorControlCluster = this.zclNode.endpoints[colorControlEndpoint].clusters.colorControl;
    switch (value) {
      case 0:
        this.debug(`\`light_mode\` → reportParser → colorMode: ${value} → parsed: 'color'`);
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
            this.debug(`\`light_mode\` → reportParser → colorMode: ${value} → read attributes 'colorTemperatureMireds', 'currentHue' and 'currentSaturation'`);
            const { colorTemperatureMireds, currentHue, currentSaturation } = await colorControlCluster.readAttributes('colorTemperatureMireds', 'currentHue', 'currentSaturation');
            _currentLightTemperature = colorTemperatureMireds;
            _currentHue = currentHue;
            _currentSaturation = currentSaturation;
            this.debug(`\`light_mode\` → reportParser → colorMode: ${value} → read attributes result`, {
              colorTemperatureMireds,
              currentHue,
              currentSaturation,
            });
          } catch (err) {
            this.error('Error: could not read attributes \'colorTemperatureMireds\','
              + ' \'currentHue\' and \'currentSaturation\'', err);
            _currentLightTemperature = null;
            _currentHue = null;
            _currentSaturation = null;
          }
        }

        if (_currentLightTemperature > 0) { // Probably temperature
          this.debug(`\`light_mode\` → reportParser → colorMode: ${value} → parsed: 'temperature'`);
          return 'temperature';
        }
        if (_currentHue > 0) { // Probably color
          this.debug(`\`light_mode\` → reportParser → colorMode: ${value} → parsed: 'color'`);
          return 'color';
        }
        if (_currentSaturation > 0) { // Probably color
          this.debug(`\`light_mode\` → reportParser → colorMode: ${value} → parsed: 'color'`);
          return 'color';
        }
        this.debug(`\`light_mode\` → reportParser → colorMode: ${value} → parsed: 'temperature'`);
        // Could not determine light mode with certainty, assume temperature
        return 'temperature';
      }
      case 2:
        this.debug(`\`light_mode\` → reportParser → colorMode: ${value} → parsed: 'temperature'`);
        return 'temperature';
      default:
        this.debug(`\`light_mode\` → reportParser → colorMode: ${value} → parsed: default to 'temperature'`);
        return null;
    }
  },
};
