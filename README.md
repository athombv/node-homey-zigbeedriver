# ZigBee Driver
Generic class to map ZigBee Clusters to Homey capabilities, for faster ZigBee App development.

## ZigBee docs

Please also read the Homey ZigBee docs here: [https://developers.athom.com/library/zigbee/](https://developers.athom.com/library/zigbee/)

## Installation

```
cd /path/to/com.your.homeyapp/
git submodule add https://github.com/athombv/node-homey-zigbeedriver.git node_modules/homey-zigbeedriver
cd node_modules/homey-zigbeedriver
npm install
```

## Example

File: `/drivers/mydriver/driver.js`

```javascript
'use strict';

const ZigBeeDriver = require('homey-zigbeedriver');

const tempMin = 250;
const tempMax = 454;
const maxBrightness = 255;

module.exports = new ZigBeeDriver('light-driver', {
    debug: false,
    capabilities: {
        dim: {
            command_endpoint: 0,
            command_cluster: 'genLevelCtrl',
            command_set: 'moveToLevel',
            command_set_parser: (value, node) => {
                return {
                    level: value * maxBrightness,
                    transtime: node.settings['transtime']
                };
            },
            command_get: 'currentLevel',
            command_report_parser: (value, node) => {
                return maxBrightness/value * 100;
            }
        },
        onoff: {
            command_endpoint: 0,
            command_cluster: 'genOnOff',
            command_set: (value, node) => {
                return value?'on':'off';
            },
            command_set_parser: (value, node) => {
                return {};
            },
            command_get: 'onOff',
            command_report_parser: (value, node) => {
                return value==1;
            }
        },
        light_temperature: {
            command_endpoint: 0,
            command_cluster: 'lightingColorCtrl',
            command_set: 'moveToColorTemp',
            command_set_parser: (value, node) => {
                return {
                    colortemp: Math.round(value * (tempMax - tempMin) + tempMin),
                    transtime: node.settings['transtime']
                }
            },
            command_get: 'colorTemperature',
            command_report_parser: (value, node) => {
                return tempMax-tempMin / value-tempMin
            }
        }
    }
});
```
