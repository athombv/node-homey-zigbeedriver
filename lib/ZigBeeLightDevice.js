'use strict';

const ZigBeeDevice = require('./ZigBeeDevice');
const util = require('./util');

const maxHue = 254;
const maxDim = 254;
const maxSaturation = 254;

const onoffCapabilityDefinition = {
  capability: 'onoff',
  cluster: 'onOff',
  opts: {
    get: 'onOff',
    reportParser(value) {
      return value === 1;
    },
    report: 'onOff',
    getOpts: {
      getOnStart: true,
    },
  },
};

const dimCapabilityDefinition = {
  capability: 'dim',
  cluster: 'levelControl',
  opts: {
    get: 'currentLevel',
    reportParser(value) {
      return value / maxDim;
    },
    report: 'currentLevel',
    getOpts: {
      getOnStart: true,
    },
  },
};

class ZigBeeLightDevice extends ZigBeeDevice {

  async onMeshInit() {
    // Register multiple capabilities, they will be debounced when one of them is called
    this.registerMultipleCapabilities(
      [onoffCapabilityDefinition, dimCapabilityDefinition],
      // TODO: fix eslint below
      // eslint-disable-next-line consistent-return
      (valueObj, optsObj) => {
      // Bulb is turned on/off
        if (Object.prototype.hasOwnProperty.call(valueObj, 'onoff')) {
          if (Object.prototype.hasOwnProperty.call(valueObj, 'dim') && valueObj.onoff && valueObj.dim > 0) {
          // Bulb is turned on and dimmed to a value, then just dim
            return this.zclNode.endpoints[this.getClusterEndpoint('levelControl')].clusters.levelControl.moveToLevelWithOnOff({
              level: Math.round(valueObj.dim * maxDim),
              transitionTime: util.calculateZigBeeDimDuration(optsObj.dim, this.getSettings()),
            });
          }
          if (Object.prototype.hasOwnProperty.call(valueObj, 'dim') && valueObj.onoff === false) {
          // Bulb is turned off and dimmed to a value, then turn off
            return this.zclNode.endpoints[this.getClusterEndpoint('onOff')].clusters.onOff[valueObj.onoff ? 'setOn' : 'setOff']();
          }
          if (Object.prototype.hasOwnProperty.call(valueObj, 'dim') && valueObj.onoff === true && valueObj.dim === 0) {
          // Device is turned on and dimmed to zero, then just turn off
            return this.zclNode.endpoints[this.getClusterEndpoint('onOff')].clusters.onOff.setOff();
          }

          // Device is only turned on/off, request new dim level afterwards
          return this.zclNode.endpoints[this.getClusterEndpoint('onOff')].clusters.onOff[valueObj.onoff ? 'setOn' : 'setOff']()
            // TODO: fix eslint below
            // eslint-disable-next-line consistent-return
            .then(async () => {
              if (valueObj.onoff === false) {
                await this.setCapabilityValue('dim', 0); // Set dim to zero when turned off
              } else if (valueObj.onoff) {
                const { currentLevel } = await this.zclNode.endpoints[this.getClusterEndpoint('levelControl')].clusters.levelControl.readAttributes('currentLevel');
                return this.setCapabilityValue('dim', Math.max(0.01, currentLevel / maxDim)); // Always set dim to 0.01 or higher since bulb is turned on
              }
            });
        }
        if (Object.prototype.hasOwnProperty.call(valueObj, 'dim')) { // Bulb is only dimmed
        // Update onoff value
          if (valueObj.dim === 0) {
            this.setCapabilityValue('onoff', false).catch(err => this.error('failed to set onoff capability value', err));
          } else if (this.getCapabilityValue('onoff') === false && valueObj.dim > 0) {
            this.setCapabilityValue('onoff', true).catch(err => this.error('failed to set onoff capability value', err));
          }

          // Execute dim
          return this.zclNode.endpoints[this.getClusterEndpoint('levelControl')].clusters.levelControl.moveToLevelWithOnOff({
            level: Math.round(valueObj.dim * maxDim),
            transitionTime: util.calculateZigBeeDimDuration(optsObj.dim, this.getSettings()),
          });
        }
      },
    );

    // Register debounced capabilities
    const groupedCapabilities = [];
    if (this.hasCapability('light_hue')) {
      groupedCapabilities.push({
        capability: 'light_hue',
        cluster: 'colorControl',
      });
    }
    if (this.hasCapability('light_saturation')) {
      groupedCapabilities.push({
        capability: 'light_saturation',
        cluster: 'colorControl',
      });
    }
    if (this.hasCapability('light_temperature')) {
      this._colorTempMin = this.getStoreValue('colorTempMin');
      this._colorTempMax = this.getStoreValue('colorTempMax');

      if (typeof this._colorTempMin !== 'number' || typeof this._colorTempMax !== 'number') {
        try {
          const { colorTempPhysicalMinMireds, colorTempPhysicalMaxMireds } = await this.zclNode.endpoints[this.getClusterEndpoint('colorControl')].clusters.colorControl.readAttributes('colorTempPhysicalMinMireds', 'colorTempPhysicalMaxMireds');
          this._colorTempMin = colorTempPhysicalMinMireds;
          this._colorTempMax = colorTempPhysicalMaxMireds;

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
        cluster: 'colorControl',
      });
    }
    if (this.hasCapability('light_mode')) {
      groupedCapabilities.push({
        capability: 'light_mode',
        cluster: 'colorControl',
      });
    }

    // Register multiple capabilities, they will be debounced when one of them is called
    // TODO: fix eslint below
    // eslint-disable-next-line consistent-return
    this.registerMultipleCapabilities(groupedCapabilities, (valueObj, optsObj) => {
      this.log('registerMultipleCapabilityListener()', valueObj, optsObj);

      if (Object.prototype.hasOwnProperty.call(valueObj, 'light_hue') && Object.prototype.hasOwnProperty.call(valueObj, 'light_saturation')) {
        const lightHue = valueObj.light_hue;
        const lightSaturation = valueObj.light_saturation;

        this.log('registerMultipleCapabilityListener() -> set hue and saturation');

        return this.zclNode.endpoints[this.getClusterEndpoint('colorControl')].clusters.colorControl.moveToHueAndSaturation({
          hue: Math.round(lightHue * maxHue),
          saturation: Math.round(lightSaturation * maxSaturation),
          transitionTime: this.getSetting('transition_time') ? Math.round(this.getSetting('transition_time') * 10) : 0,
        })
          .catch(() => {
            throw new Error('failed_to_do_move_to_hue_and_saturation');
          });
      }
      if (Object.prototype.hasOwnProperty.call(valueObj, 'light_mode') && Object.prototype.hasOwnProperty.call(valueObj, 'light_temperature')) {
        this.log('registerMultipleCapabilityListener() -> set mode and temperature');

        const colorTemperature = Math.round(
          util.mapValueRange(
            0,
            1,
            this._colorTempMin,
            this._colorTempMax,
            valueObj.light_temperature,
          ),
        );
        return this.zclNode.endpoints[this.getClusterEndpoint('colorControl')].clusters.colorControl
          .moveToColorTemperature({
            colorTemperature,
            transitionTime: this.getSetting('transition_time') ? Math.round(this.getSetting('transition_time') * 10) : 0,
          });
      }
      if (Object.prototype.hasOwnProperty.call(valueObj, 'light_mode') && Object.prototype.hasOwnProperty.call(valueObj, 'light_hue')) {
        this.log('registerMultipleCapabilityListener() -> set mode and hue');

        return this.zclNode.endpoints[this.getClusterEndpoint('colorControl')].clusters.colorControl.moveToHue({
          hue: Math.round(valueObj.light_hue * maxHue),
          direction: 0,
          transitionTime: this.getSetting('transition_time') ? Math.round(this.getSetting('transition_time') * 10) : 0,
        });
      }
    });
  }

}


module.exports = ZigBeeLightDevice;
