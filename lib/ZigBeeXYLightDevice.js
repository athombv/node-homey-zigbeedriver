'use strict';

const ZigBeeDevice = require('./ZigBeeDevice');
const util = require('./util');

const CIEMultiplier = 65279;

class ZigBeeXYLightDevice extends ZigBeeDevice {

  onMeshInit() {
    this.printNode();

    // Register capabilities if present on device
    if (this.hasCapability('onoff')) this.registerCapability('onoff', 'onOff');
    if (this.hasCapability('dim')) this.registerCapability('dim', 'levelControl');

    // Register debounced capabilities
    const groupedCapabilities = [];
    if (this.hasCapability('light_hue')) {
      groupedCapabilities.push({
        capability: 'light_hue',
        cluster: 'colorControl',
        opts: {
          set: 'moveToColor',
          setParser(value) {
            const { x, y } = util.convertHSVToCIE({
              hue: value,
              saturation: this.getCapabilityValue('light_saturation'),
              value: this.getCapabilityValue('dim'),
            });
            return {
              colorX: x * CIEMultiplier,
              colorY: y * CIEMultiplier,
              transitionTime: this.getSetting('transition_time') ? Math.round(this.getSetting('transition_time') * 10) : 0,
            };
          },
        },
      });
    }
    if (this.hasCapability('light_saturation')) {
      groupedCapabilities.push({
        capability: 'light_saturation',
        cluster: 'colorControl',
        opts: {
          set: 'moveToColor',
          setParser(value) {
            const { x, y } = util.convertHSVToCIE({
              hue: this.getCapabilityValue('light_hue'),
              saturation: value,
              value: this.getCapabilityValue('dim'),
            });
            return {
              colorX: x * CIEMultiplier,
              colorY: y * CIEMultiplier,
              transitionTime: this.getSetting('transition_time') ? Math.round(this.getSetting('transition_time') * 10) : 0,
            };
          },
        },
      });
    }
    if (this.hasCapability('light_temperature')) {
      groupedCapabilities.push({
        capability: 'light_temperature',
        cluster: 'colorControl',
        opts: {
          set: 'moveToColor',
          setParser(value) {
            // Correct a bit for a nice temperature curve
            const temperature = 0.2 + value / 4;
            return {
              colorX: temperature * CIEMultiplier,
              colorY: temperature * CIEMultiplier,
              transitionTime: this.getSetting('transition_time') ? Math.round(this.getSetting('transition_time') * 10) : 0,
            };
          },
        },
      });
    }
    if (this.hasCapability('light_mode')) {
      groupedCapabilities.push({
        capability: 'light_mode',
        cluster: 'colorControl',
        opts: {
          set: 'moveToColor',
          setParser(value) {
            // Set color
            if (value === 'color') {
              const { x, y } = util.convertHSVToCIE({
                hue: this.getCapabilityValue('light_hue'),
                saturation: this.getCapabilityValue('light_saturation'),
                value: this.getCapabilityValue('dim'),
              });
              return {
                colorX: x * CIEMultiplier,
                colorY: y * CIEMultiplier,
                transitionTime: this.getSetting('transition_time') ? Math.round(this.getSetting('transition_time') * 10) : 0,
              };
            }

            // Set light temperature
            const temperature = 0.2 + this.getCapabilityValue('light_temperature') / 4;
            return {
              colorX: temperature * CIEMultiplier,
              colorY: temperature * CIEMultiplier,
              transitionTime: this.getSetting('transition_time') ? Math.round(this.getSetting('transition_time') * 10) : 0,
            };
          },
        },
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
        const { x, y } = util.convertHSVToCIE({
          hue: lightHue,
          saturation: lightSaturation,
          value: this.getCapabilityValue('dim'),
        });

        return this.zclNode.endpoints[this.getClusterEndpoint('colorControl')].clusters.colorControl.moveToColor({
          colorX: x * CIEMultiplier,
          colorY: y * CIEMultiplier,
          transitionTime: this.getSetting('transition_time') ? Math.round(this.getSetting('transition_time') * 10) : 0,
        })
          .catch(() => {
            throw new Error('failed_to_do_move_to_hue_and_saturation');
          });
      } if (Object.prototype.hasOwnProperty.call(valueObj, 'light_mode') && Object.prototype.hasOwnProperty.call(valueObj, 'light_temperature')) {
        const lightTemperature = valueObj.light_temperature;

        this.log('registerMultipleCapabilityListener() -> set mode and temperature');

        return this.zclNode.endpoints[this.getClusterEndpoint('colorControl')].clusters.colorControl.moveToColor({
          colorX: lightTemperature * CIEMultiplier,
          colorY: lightTemperature * CIEMultiplier,
          transitionTime: this.getSetting('transition_time') ? Math.round(this.getSetting('transition_time') * 10) : 0,
        });
      } if (Object.prototype.hasOwnProperty.call(valueObj, 'light_mode') && Object.prototype.hasOwnProperty.call(valueObj, 'light_hue')) {
        const lightHue = valueObj.light_hue;

        this.log('registerMultipleCapabilityListener() -> set mode and hue');

        const { x, y } = util.convertHSVToCIE({
          hue: lightHue,
          saturation: this.getCapabilityValue('light_saturation'),
          value: this.getCapabilityValue('dim'),
        });

        return this.zclNode.endpoints[this.getClusterEndpoint('colorControl')].clusters.colorControl.moveToColor({
          colorX: x * CIEMultiplier,
          colorY: y * CIEMultiplier,
          transitionTime: this.getSetting('transition_time') ? Math.round(this.getSetting('transition_time') * 10) : 0,
        });
      }
    });
  }

}

module.exports = ZigBeeXYLightDevice;
