'use strict';

const { CLUSTER } = require('zigbee-clusters');

const ZigBeeDevice = require('./ZigBeeDevice');
const { convertHSVToCIE } = require('./util');

const CIEMultiplier = 65279;

const MOVE_TO_COLOR = 'moveToColor';

/**
 * The ZigBeeXYLightDevice class handles all light related capabilities [`onoff`, `dim`,
 * `light_mode`, `light_hue`, `light_saturation` and `light_temperature`] for a Zigbee device
 * that uses the {@link CLUSTER.LEVEL_CONTROL} with the command `moveToLevelWithOnOff` for
 * `onoff` and `dim`, and the {@link CLUSTER.COLOR_CONTROL} with the commands
 * `moveToColor` for `light_mode`, `light_hue`, `light_saturation` and `light_temperature`.
 * @extends ZigBeeDevice
 *
 * @example
 * const { ZigBeeXYLightDevice } = require('zigbee-clusters');
 *
 * class ZigBeeBulb extends ZigBeeXYLightDevice {
 *    async onNodeInit({zclNode, node}) {
 *      await super.onNodeInit({zclNode, node});
 *      // Do custom stuff here
 *    }
 * }
 */
class ZigBeeXYLightDevice extends ZigBeeDevice {

  onNodeInit({ zclNode }) {
    const colorControlEndpointId = this.getClusterEndpoint(CLUSTER.COLOR_CONTROL.ID);
    const colorControlCluster = zclNode.endpoints[colorControlEndpointId].clusters.colorControl;

    // Register capabilities if present on device
    if (this.hasCapability('onoff')) this.registerCapability('onoff', CLUSTER.ON_OFF);
    if (this.hasCapability('dim')) this.registerCapability('dim', CLUSTER.LEVEL_CONTROL);

    // Register debounced capabilities
    const groupedCapabilities = [];
    if (this.hasCapability('light_hue')) {
      groupedCapabilities.push({
        capability: 'light_hue',
        cluster: CLUSTER.COLOR_CONTROL,
        opts: {
          set: MOVE_TO_COLOR,
          setParser(value) {
            const { x, y } = convertHSVToCIE({
              hue: value,
              saturation: this.getCapabilityValue('light_saturation'),
              value: this.getCapabilityValue('dim'),
            });

            const moveToColorCommand = {
              colorX: x * CIEMultiplier,
              colorY: y * CIEMultiplier,
              transitionTime: this.getSetting('transition_time') ? Math.round(this.getSetting('transition_time') * 10) : 0,
            };

            this.debug('registerMultipleCapabilities() → set individual hue', moveToColorCommand);

            return moveToColorCommand;
          },
        },
      });
    }
    if (this.hasCapability('light_saturation')) {
      groupedCapabilities.push({
        capability: 'light_saturation',
        cluster: CLUSTER.COLOR_CONTROL,
        opts: {
          set: MOVE_TO_COLOR,
          setParser(value) {
            const { x, y } = convertHSVToCIE({
              hue: this.getCapabilityValue('light_hue'),
              saturation: value,
              value: this.getCapabilityValue('dim'),
            });
            const moveToColorCommand = {
              colorX: x * CIEMultiplier,
              colorY: y * CIEMultiplier,
              transitionTime: this.getSetting('transition_time') ? Math.round(this.getSetting('transition_time') * 10) : 0,
            };

            this.debug('registerMultipleCapabilities() → set individual light_saturation', moveToColorCommand);

            return moveToColorCommand;
          },
        },
      });
    }
    if (this.hasCapability('light_temperature')) {
      groupedCapabilities.push({
        capability: 'light_temperature',
        cluster: CLUSTER.COLOR_CONTROL,
        opts: {
          set: MOVE_TO_COLOR,
          setParser(value) {
            // Correct a bit for a nice temperature curve
            const temperature = 0.2 + value / 4;

            const moveToColorCommand = {
              colorX: temperature * CIEMultiplier,
              colorY: temperature * CIEMultiplier,
              transitionTime: this.getSetting('transition_time') ? Math.round(this.getSetting('transition_time') * 10) : 0,
            };

            this.debug('registerMultipleCapabilities() → set individual light_temperature', moveToColorCommand);

            return moveToColorCommand;
          },
        },
      });
    }
    if (this.hasCapability('light_mode')) {
      groupedCapabilities.push({
        capability: 'light_mode',
        cluster: CLUSTER.COLOR_CONTROL,
        opts: {
          set: MOVE_TO_COLOR,
          setParser(value) {
            // Set color
            if (value === 'color') {
              const { x, y } = convertHSVToCIE({
                hue: this.getCapabilityValue('light_hue'),
                saturation: this.getCapabilityValue('light_saturation'),
                value: this.getCapabilityValue('dim'),
              });

              const moveToColorCommand = {
                colorX: x * CIEMultiplier,
                colorY: y * CIEMultiplier,
                transitionTime: this.getSetting('transition_time') ? Math.round(this.getSetting('transition_time') * 10) : 0,
              };

              this.debug('registerMultipleCapabilities() → set individual light_mode', moveToColorCommand);

              return moveToColorCommand;
            }
            // Set light temperature
            const temperature = 0.2 + this.getCapabilityValue('light_temperature') / 4;

            const moveToColorCommand = {
              colorX: temperature * CIEMultiplier,
              colorY: temperature * CIEMultiplier,
              transitionTime: this.getSetting('transition_time') ? Math.round(this.getSetting('transition_time') * 10) : 0,
            };

            this.debug('registerMultipleCapabilities() → set individual light_mode', moveToColorCommand);

            return moveToColorCommand;
          },
        },
      });
    }

    // Register multiple capabilities, they will be debounced when one of them is called
    // eslint-disable-next-line consistent-return
    this.registerMultipleCapabilities(groupedCapabilities, (valueObj = {}, optsObj = {}) => {
      this.log('registerMultipleCapabilities()', valueObj, optsObj);

      if (typeof valueObj.light_hue === 'number' && typeof valueObj.light_saturation === 'number') {
        const lightHue = valueObj.light_hue;
        const lightSaturation = valueObj.light_saturation;

        this.log('registerMultipleCapabilities() → set hue and saturation');
        const { x, y } = convertHSVToCIE({
          hue: lightHue,
          saturation: lightSaturation,
          value: this.getCapabilityValue('dim'),
        });

        const moveToColorCommand = {
          colorX: x * CIEMultiplier,
          colorY: y * CIEMultiplier,
          transitionTime: this.getSetting('transition_time') ? Math.round(this.getSetting('transition_time') * 10) : 0,
        };

        this.debug('registerMultipleCapabilities() → set hue and saturation', moveToColorCommand);

        return colorControlCluster.moveToColor(moveToColorCommand);
      }
      if (typeof valueObj.light_mode === 'string' && typeof valueObj.light_temperature === 'number') {
        const lightTemperature = valueObj.light_temperature;

        this.log('registerMultipleCapabilities() → set mode and temperature');

        const moveToColorCommand = {
          colorX: lightTemperature * CIEMultiplier,
          colorY: lightTemperature * CIEMultiplier,
          transitionTime: this.getSetting('transition_time') ? Math.round(this.getSetting('transition_time') * 10) : 0,
        };

        this.debug('registerMultipleCapabilities() → set mode and temperature', moveToColorCommand);

        return colorControlCluster.moveToColor(moveToColorCommand);
      }
      if (typeof valueObj.light_mode === 'string' && typeof valueObj.light_hue === 'number') {
        const lightHue = valueObj.light_hue;

        this.log('registerMultipleCapabilities() → set mode and hue');

        const { x, y } = convertHSVToCIE({
          hue: lightHue,
          saturation: this.getCapabilityValue('light_saturation'),
          value: this.getCapabilityValue('dim'),
        });

        const moveToColorCommand = {
          colorX: x * CIEMultiplier,
          colorY: y * CIEMultiplier,
          transitionTime: this.getSetting('transition_time') ? Math.round(this.getSetting('transition_time') * 10) : 0,
        };

        this.debug('registerMultipleCapabilities() → set mode and hue', moveToColorCommand);

        return colorControlCluster.moveToColor(moveToColorCommand);
      }
    });
    this.log('ZigBeeXYLightDevice is initialized');
  }

}

module.exports = ZigBeeXYLightDevice;
