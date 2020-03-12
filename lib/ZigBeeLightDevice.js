'use strict';

const { CLUSTER } = require('zigbee-clusters');

const { mapValueRange, calculateDimDuration } = require('./util');
const ZigBeeDevice = require('./ZigBeeDevice');

const MAX_HUE = 254;
const MAX_DIM = 254;
const MAX_SATURATION = 254;

const ON_OFF = 'onOff';
const SET_ON = 'setOn';
const SET_OFF = 'setOff';
const CURRENT_LEVEL = 'currentLevel';

/**
 * `onoff` capability configuration used for {@link registerMultipleCapabilities}.
 * @type {MultipleCapabilitiesConfiguration}
 * @private
 */
const onoffCapabilityDefinition = {
  capability: 'onoff',
  cluster: CLUSTER.ON_OFF,
  opts: {
    get: ON_OFF,
    reportParser(value) {
      const result = value === 1;
      this.debug(`\`onoff\` → reportParser → onOff: ${value} → parsed:`, result);
      return result;
    },
    report: ON_OFF,
    getOpts: {
      getOnStart: true,
      getOnOnline: true, // When the light is powered off, and powered on again it often issues
      // an end device announce, this is a good moment to update the capability value in Homey
    },
  },
};

/**
 * `dim` capability configuration used for {@link registerMultipleCapabilities}.
 * @type {MultipleCapabilitiesConfiguration}
 * @private
 */
const dimCapabilityDefinition = {
  capability: 'dim',
  cluster: CLUSTER.LEVEL_CONTROL,
  opts: {
    get: CURRENT_LEVEL,
    reportParser(value) {
      const result = value / MAX_DIM;
      this.debug(`\`dim\` → reportParser → currentLevel: ${value} → parsed:`, result);
      return result;
    },
    report: CURRENT_LEVEL,
    getOpts: {
      getOnStart: true,
      getOnOnline: true, // When the light is powered off, and powered on again it often issues
      // an end device announce, this is a good moment to update the capability value in Homey
    },
  },
};

/**
 * The ZigBeeLightDevice class handles all light related capabilities [`onoff`, `dim`,
 * `light_mode`, `light_hue`, `light_saturation` and `light_temperature`] for a Zigbee device
 * that uses the {@link CLUSTER.LEVEL_CONTROL} with the command `moveToLevelWithOnOff` for
 * `onoff` and `dim`, and the {@link CLUSTER.COLOR_CONTROL} with the commands
 * `moveToHueAndSaturation`, `moveToHue` and `moveToColorTemperature` for `light_mode`,
 * `light_hue`, `light_saturation` and `light_temperature`.
 * @extends ZigBeeDevice
 *
 * @example
 * const { ZigBeeLightDevice } = require('zigbee-clusters');
 *
 * class ZigBeeBulb extends ZigBeeLightDevice {
 *    async onNodeInit({zclNode, node}) {
 *      await super.onNodeInit({zclNode, node});
 *      // Do custom stuff here
 *    }
 * }
 */
class ZigBeeLightDevice extends ZigBeeDevice {

  async onNodeInit({ zclNode }) {
    const onOffClusterEndpoint = this.getClusterEndpoint(CLUSTER.ON_OFF);
    const levelControlClusterEndpoint = this.getClusterEndpoint(CLUSTER.LEVEL_CONTROL);
    const colorControlEndpoint = this.getClusterEndpoint(CLUSTER.COLOR_CONTROL);

    if (onOffClusterEndpoint === null) throw new Error('missing_on_off_cluster');
    if (levelControlClusterEndpoint === null) throw new Error('missing_level_control_cluster');
    if (colorControlEndpoint === null) throw new Error('missing_color_control_cluster');

    const levelControlCluster = zclNode.endpoints[levelControlClusterEndpoint].clusters.levelControl;
    const onOffCluster = zclNode.endpoints[onOffClusterEndpoint].clusters.onOff;
    const colorControlCluster = zclNode.endpoints[colorControlEndpoint].clusters.colorControl;

    // Register multiple capabilities, they will be debounced when one of them is called
    this.registerMultipleCapabilities(
      [onoffCapabilityDefinition, dimCapabilityDefinition],
      // TODO: fix eslint below
      // eslint-disable-next-line consistent-return
      (valueObj = {}, optsObj = {}) => {
        // Bulb is turned on/off
        if (typeof valueObj.onoff === 'boolean') {
          if (typeof valueObj.dim === 'number' && valueObj.onoff && valueObj.dim > 0) {
            this.log('registerMultipleCapabilities() → turned on and dimmed to', valueObj.dim);
            const moveToLevelWithOnOff = {
              level: Math.round(valueObj.dim * MAX_DIM),
              transitionTime: calculateDimDuration(optsObj.dim, this.getSettings()),
            };
            this.debug('registerMultipleCapabilities() → turned on and dimmed → moveToLevelWithOnOff', moveToLevelWithOnOff);

            // Bulb is turned on and dimmed to a value, then just dim
            return levelControlCluster.moveToLevelWithOnOff(moveToLevelWithOnOff);
          }
          if (typeof valueObj.dim === 'number' && valueObj.onoff === false) {
            this.log('registerMultipleCapabilities() → turned off and dimmed to', valueObj.dim);

            // Bulb is turned off and dimmed to a value, then turn off
            this.debug('registerMultipleCapabilities() → turned off and dimmed →', valueObj.onoff ? SET_ON : SET_OFF);
            return onOffCluster[valueObj.onoff ? SET_ON : SET_OFF]();
          }
          if (typeof valueObj.dim === 'number' && valueObj.onoff === true && valueObj.dim === 0) {
            // Device is turned on and dimmed to zero, then just turn off
            this.log('registerMultipleCapabilities() → turned on and dimmed to zero → setOff');
            return onOffCluster.setOff();
          }

          this.log(`registerMultipleCapabilities() → turned on/off → ${valueObj.onoff ? SET_ON : SET_OFF}`);

          // Device is only turned on/off, request new dim level afterwards
          return onOffCluster[valueObj.onoff ? SET_ON : SET_OFF]()
            // TODO: fix eslint below
            // eslint-disable-next-line consistent-return
            .then(async () => {
              if (valueObj.onoff === false) {
                await this.setCapabilityValue('dim', 0); // Set dim to zero when turned off
              } else if (valueObj.onoff) {
                this.debug(`registerMultipleCapabilities() → turned on/off → ${valueObj.onoff ? SET_ON : SET_OFF} → read/update attribute ${CURRENT_LEVEL}`);
                const { currentLevel } = await levelControlCluster.readAttributes(CURRENT_LEVEL);
                return this.setCapabilityValue('dim', Math.max(0.01, currentLevel / MAX_DIM)); // Always set dim to 0.01 or higher since bulb is turned on
              }
            });
        }
        if (typeof valueObj.dim === 'number') { // Bulb is only dimmed
          this.log('registerMultipleCapabilities() → dimmed to', valueObj.dim);

          // Update onoff value
          if (valueObj.dim === 0) {
            this.setCapabilityValue('onoff', false).catch(err => this.error('failed to set onoff capability value', err));
          } else if (this.getCapabilityValue('onoff') === false && valueObj.dim > 0) {
            this.setCapabilityValue('onoff', true).catch(err => this.error('failed to set onoff capability value', err));
          }

          const moveToLevelWithOnOffCommand = {
            level: Math.round(valueObj.dim * MAX_DIM),
            transitionTime: calculateDimDuration(optsObj.dim, this.getSettings()),
          };
          this.debug('registerMultipleCapabilities() → dimmed → moveToLevelWithOnOff', moveToLevelWithOnOffCommand);

          // Execute dim
          return levelControlCluster.moveToLevelWithOnOff(moveToLevelWithOnOffCommand);
        }
      },
    );

    // Register debounced capabilities
    const groupedCapabilities = [];
    if (this.hasCapability('light_hue')) {
      groupedCapabilities.push({
        capability: 'light_hue',
        cluster: CLUSTER.COLOR_CONTROL,
      });
    }
    if (this.hasCapability('light_saturation')) {
      groupedCapabilities.push({
        capability: 'light_saturation',
        cluster: CLUSTER.COLOR_CONTROL,
      });
    }
    if (this.hasCapability('light_temperature')) {
      this._colorTempMin = this.getStoreValue('colorTempMin');
      this._colorTempMax = this.getStoreValue('colorTempMax');

      if (typeof this._colorTempMin !== 'number' || typeof this._colorTempMax !== 'number') {
        try {
          this.debug('read attributes \'colorTempPhysicalMinMireds\', \'colorTempPhysicalMaxMireds\'');

          const { colorTempPhysicalMinMireds, colorTempPhysicalMaxMireds } = await colorControlCluster.readAttributes('colorTempPhysicalMinMireds', 'colorTempPhysicalMaxMireds');
          this._colorTempMin = colorTempPhysicalMinMireds;
          this._colorTempMax = colorTempPhysicalMaxMireds;
          this.debug('read attributes \'colorTempPhysicalMinMireds\','
            + ' \'colorTempPhysicalMaxMireds\'', {
            colorTempPhysicalMinMireds,
            colorTempPhysicalMaxMireds,
          });
          if (typeof this._colorTempMin === 'number') this.setStoreValue('colorTempMin', this._colorTempMin);
          else this.error('retrieved nun-numeric colorTempMin', this._colorTempMin);
          if (typeof this._colorTempMax === 'number') this.setStoreValue('colorTempMax', this._colorTempMax);
          else this.error('retrieved nun-numeric colorTempMax', this._colorTempMax);
        } catch (err) {
          this.error('could not get colorTempMin and colorTempMax', err);
        }
      }

      groupedCapabilities.push({
        capability: 'light_temperature',
        cluster: CLUSTER.COLOR_CONTROL,
      });
    }
    if (this.hasCapability('light_mode')) {
      groupedCapabilities.push({
        capability: 'light_mode',
        cluster: CLUSTER.COLOR_CONTROL,
      });
    }

    // Register multiple capabilities, they will be debounced when one of them is called
    // eslint-disable-next-line consistent-return
    this.registerMultipleCapabilities(groupedCapabilities, (valueObj, optsObj) => {
      this.debug('registerMultipleCapabilities()', valueObj, optsObj);

      if (typeof valueObj.light_hue === 'number' && typeof valueObj.light_saturation === 'number') {
        this.log('registerMultipleCapabilities() → set hue and saturation');
        const lightHue = valueObj.light_hue;
        const lightSaturation = valueObj.light_saturation;

        const moveToHueAndSaturationCommand = {
          hue: Math.round(lightHue * MAX_HUE),
          saturation: Math.round(lightSaturation * MAX_SATURATION),
          transitionTime: this.getSetting('transition_time') ? Math.round(this.getSetting('transition_time') * 10) : 0,
        };
        this.debug('registerMultipleCapabilities() → set hue and saturation →'
          + ' moveToHueAndSaturation', moveToHueAndSaturationCommand);

        return colorControlCluster.moveToHueAndSaturation(moveToHueAndSaturationCommand)
          .catch(() => {
            throw new Error('failed_to_do_move_to_hue_and_saturation');
          });
      }
      if (typeof valueObj.light_mode === 'string' && typeof valueObj.light_temperature === 'number') {
        this.log('registerMultipleCapabilities() → set mode and temperature');
        const colorTemperature = Math.round(
          mapValueRange(
            0,
            1,
            this._colorTempMin,
            this._colorTempMax,
            valueObj.light_temperature,
          ),
        );

        const moveToColorTemperatureCommand = {
          colorTemperature,
          transitionTime: this.getSetting('transition_time') ? Math.round(this.getSetting('transition_time') * 10) : 0,
        };

        this.debug('registerMultipleCapabilities() → set mode and temperature →'
          + ' moveToColorTemperature', moveToColorTemperatureCommand);

        return colorControlCluster.moveToColorTemperature(moveToColorTemperatureCommand);
      }
      if (typeof valueObj.light_mode === 'string' && typeof valueObj.light_hue === 'number') {
        this.log('registerMultipleCapabilities() → set mode and hue');
        const moveToHueCommand = {
          hue: Math.round(valueObj.light_hue * MAX_HUE),
          direction: 0,
          transitionTime: this.getSetting('transition_time') ? Math.round(this.getSetting('transition_time') * 10) : 0,
        };
        this.debug('registerMultipleCapabilities() → set mode and hue →'
          + ' moveToHue', moveToHueCommand);
        return colorControlCluster.moveToHue(moveToHueCommand);
      }
    });
    this.log('ZigBeeLightDevice is initialized');
  }

}


module.exports = ZigBeeLightDevice;
