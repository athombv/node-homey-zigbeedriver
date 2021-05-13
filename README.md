# Homey ZigbeeDriver

This module can be used to make the development of Zigbee apps for Homey easier.

It is essentially a map-tool from Homey-capabilities to Zigbee endpoints and clusters.

This module requires Homey Apps SDK v3.

## Related Modules

* [node-homey-oauth2app](https://github.com/athombv/node-homey-oauth2app) — Module for OAuth2 apps
* [node-homey-rfdriver](https://github.com/athombv/node-homey-rfdriver) — Module for RF drivers
* [node-homey-zwavedriver](https://github.com/athombv/node-homey-zwavedriver) — Module for Z-Wave drivers

## Installation

```bash
$ npm install homey-zigbeedriver
```

Also checkout [`zigbee-clusters`](https://github.com/athombv/node-zigbee-clusters) if you want to do more advanced things or implement a driver for a Zigbee device without `homey-zigbeedriver`.

```bash
$ npm install zigbee-clusters
```

## Requirements

This module requires Homey Apps SDK v3.

## Usage

Your device should extend ZigBeeDevice. Start by looking at the docs for [`ZigBeeDevice`](https://athombv.github.io/node-homey-zigbeedriver/ZigBeeDevice.html). This is the class you most likely want to extend from. If you are implementing a `light` device take a look at [`ZigBeeLightDevice`](https://athombv.github.io/node-homey-zigbeedriver/ZigBeeLightDevice.html).

See [examples/exampleBulb.js](https://github.com/athombv/node-homey-zigbeedriver/blob/master/examples/exampleBulb.js) and [examples/tradfriBulb.json](https://github.com/athombv/node-homey-zigbeedriver/blob/master/examples/exampleBulb.json)

## Documentation
See [https://athombv.github.io/node-homey-zigbeedriver](https://athombv.github.io/node-homey-zigbeedriver)

## Deprecations and breaking changes for homey-zigbeedriver

This is a non exhaustive list of deprecations and breaking changes in `homey-zigbeedriver` with respect to `homey-meshdriver` which might be good to be aware of:

- `MeshDevice` is removed in favour of `ZigBeeDevice`.
- `onMeshInit()` is deprecated in favour of `onNodeInit()`.
- `this.node.on(‘online’)` is removed in favour of `this.onEndDeviceAnnounce()`.
- `getClusterEndpoint` returns `null` if not found.
- `cluster` property is changed from string value (e.g. `genOnOff`) to an object which is exported by `const { CLUSTER } = require(‘zigbee-clusters’);`
- `registerReportListener` is deprecated in favour of `BoundCluster` implementation.
- `registerAttrReportListener` is deprecated in favour of `configureAttributeReporting`.
- `calculateZigbeeDimDuration` renamed to `calculateLevelControlTransitionTime`.
- `calculateColorControlTransitionTime` is added for the `colorControl` cluster.
- `ZigBeeXYLightDevice` is removed in favour of `ZigBeeLightDevice`, it detects if the light supports hue and saturation or XY only.

