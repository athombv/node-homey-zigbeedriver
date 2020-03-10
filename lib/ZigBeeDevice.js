'use strict';

const Homey = require('homey'); // eslint-disable-line
const {
  // eslint-disable-next-line no-unused-vars
  ZCLNode, Cluster, Endpoint, BasicCluster, getClusterName,
} = require('zigbee-clusters');

const { __, debounce } = require('./util');

// TODO battery node online event
// TODO add debug logging
// TODO: cluster reporting (_onReport)

const CAPABILITIES_DEBOUNCE = 500; // ms
const CONFIGURE_REPORTING_DEBOUNCE = 500; // ms
const CONFIGURED_ATTRIBUTE_REPORTING_STORE_KEY = 'configuredAttributeReporting';

/**
 * @typedef {string} CapabilityId - Homey.Device capability id (e.g. `onoff`)
 */

/**
 * @typedef {number} ClusterId - Zigbee {@link Cluster.ID} (e.g. 0 for {@link BasicCluster})
 */

/**
 * @typedef {number} EndpointId - Zigbee {@link Endpoint.ID} (e.g. 1)
 */

/**
 * @extends Homey.Device
 * @example
 * const { ZigBeeDevice } = require('zigbee-clusters');
 *
 * class ZigBeeBulb extends ZigBeeDevice {
 *   onNodeInit({ zclNode }) {
 *     await zclNode.endpoints[1].clusters.onoff.toggle();
 *   }
 * }
 */
class ZigBeeDevice extends Homey.Device {

  /**
   * This method can be overridden. It will be called when the {@link ZigBeeDevice} instance is
   * ready and did initialize a {@link ZCLNode}.
   * @param {ZCLNode} zclNode
   * @abstract
   */
  onNodeInit({ zclNode }) {

  }

  /**
   * @deprecated since v1.0.0 - Legacy from homey-meshdriver, use {@link onNodeInit} instead.
   * This method can be overridden. It will be called when the {@link ZigBeeDevice} instance is
   * ready and did initialize a {@link Homey.ZigBeeNode}.
   */
  onMeshInit() {

  }

  /**
   * This method can be overridden. It will be called when the {@link Homey.ZigBeeNode}
   * instance received a end device announce indication from the node itself. For sleepy devices
   * this means that the node is temporarily `online` to handle some requests. For powered
   * devices this usually means that they have been re-powered. Note: behaviour may differ between
   * devices.
   */
  onEndDeviceAnnounce() {
    this.log('Received end device announce indication');
  }

  /**
   * This method can be overridden to use different energy objects per Zigbee device `productId`.
   * @abstract
   * @returns {object.<{string}, {object}>}
   *
   * @example
   * class ZigBeeBulb extends ZigBeeDevice {
   *    get energyMap() {
   *      return {
   *        'TRADFRI bulb E14 W op/ch 400lm': {
   *          approximation: {
   *            usageOff: 0,
   *            usageOn: 10
   *          }
   *        },
   *        'TRADFRI bulb E27 RGB 1000lm': {
   *          approximation: {
   *            usageOff: 0,
   *            usageOn: 18
   *          }
   *        }
   *      }
   *    }
   *  }
   */
  get energyMap() {
    return {};
  }

  /**
   * Overrides {@link Homey.Device.getEnergy} to enable zigbee devices to expose a {@link energyMap}
   * object with different energy objects per Zigbee device `productId`. If the `energyMap`
   * object is available and has an entry for the `productId` of this device this entry will be
   * returned instead of the energy object in the drivers' manifest.
   * @since Homey v3.0.0
   * @returns {object} - Energy object
   */
  getEnergy() {
    const zigbeeProductId = this.getSetting('zb_product_id');
    if (zigbeeProductId && this.energyMap[zigbeeProductId]) {
      return this.energyMap[zigbeeProductId];
    }
    return super.getEnergy();
  }

  /**
   * @typedef {function} SetParserFunction
   *
   * This method is given a `setValue` and will use that to generate an object with the needed
   * command attributes as specified in {@link Cluster.COMMANDS}. This object will be provided
   * to the Cluster command as parameters when executed.
   *
   * @param {any} setValue
   * @returns {Promise<object|null>} - If return value is `null` the command will not be executed.
   */

  /**
   * @typedef {function} ReportParserFunction
   *
   * @todo this functionality is probably broken now
   *
   * This method is called when a report is received for the `report` attribute. In this method the
   * `reportValue` can be parsed and mapped to become a valid Homey.Device capability value.
   *
   * @param {any} reportValue
   * @returns {any|null|Promise} - If return value is `null` the Homey.Device
   * capability
   * value will not be changed.
   */

  /**
   * @typedef {object} ClusterCapabilityConfiguration
   *
   * @property {string} [set] - Cluster command as specified in {@link Cluster.COMMANDS}, this
   * command will be executed when the capability is set.
   * @property {SetParserFunction} [setParser] - Method that will be called before `set` is
   * called, to generate the parameters for the Cluster command execution.
   *
   * @property {string} [get] - Cluster attribute as specified in {@link Cluster.ATTRIBUTES}. This
   * attribute will be fetched by {@link Cluster.readAttributes} when the capability value needs
   * to be fetched.
   *
   * @property {string} [report] - Cluster attribute as specified in {@link Cluster.ATTRIBUTES}.
   * When a report is received for this attribute the respective `reportParser` will be called.
   * @property {ReportParserFunction} [reportParser]
   *
   * @property {object} [getOpts] - Options object specific for `get`.
   * @property {EndpointId} [getOpts.endpoint=0] - The {@link ZCLNode}'s endpoint to use for this
   * configuration. TODO: is this still the right default endpointId or should it become 1?
   * TODO: maybe rename to endpointId?
   * @property {boolean} [getOpts.getOnStart=false] - Fetches the `get` attribute when the
   * {@link ZCLNode} is first initialized and the capability value is unknown (i.e. `null`).
   * Note: this only works for non-sleepy devices.
   * @property {boolean} [getOpts.getOnOnline=false] - Fetches the `get` attribute when the
   * {@link ZCLNode} comes online (i.e. Homey received an end device announce indication,
   * directly after receiving this a sleepy node should be able to respond to any request).
   * @property {number|string} [getOpts.pollInterval] - Number: interval (in ms) to poll `get`.
   * String: the Homey.Device's setting key which represents a user configurable poll interval
   * value.
   */

  /**
   * Map a Zigbee cluster to a Homey.Device capability. Using the provided cluster configuration
   * a mapping will be made between the device's capability and the Zigbee cluster.
   * @param {CapabilityId} capabilityId - Homey.Device capability id (e.g. `onoff`)
   * @param {ClusterId} clusterId - Zigbee {@link Cluster.ID} (e.g. 0 for {@link BasicCluster})
   * TODO: clusterId changed from string to number
   * @param {ClusterCapabilityConfiguration} [clusterCapabilityConfiguration] - User provided
   * ClusterCapabilityMapConfiguration, these will override and extend the system cluster
   * capability map configuration if available (e.g. ./system/capabilities/onoff).
   */
  registerCapability(capabilityId, clusterId, clusterCapabilityConfiguration) {
    this._debug(`register capability ${capabilityId} with cluster ${getClusterName(clusterId)}`);
    if (typeof capabilityId !== 'string') throw new TypeError('expected_capability_id_string');
    if (typeof clusterId !== 'number') throw new TypeError('expected_cluster_id_number');

    // Register the Zigbee capability listener
    this._capabilities[capabilityId] = this._capabilities[capabilityId] || {};
    this._capabilities[capabilityId][clusterId] = this._capabilities[capabilityId][clusterId] || {};

    // Merge system and user clusterCapabilityConfiguration
    this._mergeSystemAndUserClusterCapabilityConfigurations(
      capabilityId, clusterId, clusterCapabilityConfiguration,
    );

    this._debug(`registered capability ${capabilityId} with cluster ${getClusterName(clusterId)}, configuration:`, this._capabilities[capabilityId][clusterId]);

    // Register get/set
    this._registerCapabilitySet(capabilityId, clusterId);
    this._registerCapabilityGet(capabilityId, clusterId);
  }

  /**
   * @typedef {object} MultipleCapabilitiesConfiguration
   * @property {CapabilityId} capabilityId
   * @property {ClusterId} clusterId
   * @property {ClusterCapabilityConfiguration} userOpts
   */

  /**
   * Register multiple Homey.Device capabilities with a {@link ClusterCapabilityConfiguration}.
   * When a capability is changed (or multiple in quick succession), the event will be debounced
   * with the other capabilities in the multipleCapabilitiesConfiguration array.
   * @param {MultipleCapabilitiesConfiguration[]} multipleCapabilitiesConfiguration -
   * Configuration options for multiple capability cluster mappings.
   * @param {function} multipleCapabilitiesListener - Called after debounce of
   * {@link CAPABILITIES_DEBOUNCE}. As fallback, if this function returns a falsy value or an Error
   * each changed capability will be processed individually instead of together.
   */
  registerMultipleCapabilities(
    multipleCapabilitiesConfiguration = [], multipleCapabilitiesListener,
  ) {
    this._debug(`register multiple capabilities [${multipleCapabilitiesConfiguration.map(x => x.capabilityId || x.capability).join(', ')}]`);

    // Loop all provided capability configurations
    multipleCapabilitiesConfiguration.forEach(capabilityConfiguration => {
      // TODO: `capability`, `cluster` and `opts` are legacy properties, remove with next major
      //  update
      const capabilityId = capabilityConfiguration.capabilityId
        || capabilityConfiguration.capability;
      const clusterId = capabilityConfiguration.clusterId || capabilityConfiguration.cluster;
      const userClusterCapabilityConfiguration = capabilityConfiguration.userOpts
        || capabilityConfiguration.opts || {};

      if (typeof capabilityId !== 'string') throw new TypeError('expected_capability_id_string');
      if (typeof clusterId !== 'number') throw new TypeError('expected_cluster_id_number');

      // Register the Zigbee capability listener
      const currentCapabilityObj = this._capabilities[capabilityId] || {};
      const currentCapabilityClusterObj = this._capabilities[capabilityId][clusterId] || {};

      this._capabilities[capabilityId] = currentCapabilityObj;
      this._capabilities[capabilityId][clusterId] = currentCapabilityClusterObj;

      // Override default system opts with user opts
      this._mergeSystemAndUserClusterCapabilityConfigurations(
        capabilityId, clusterId, userClusterCapabilityConfiguration,
      );

      this._debug(`register multiple capabilities → registered ${capabilityId}, with configuration:`, this._capabilities[capabilityId][clusterId]);

      // Register capability getter
      this._registerCapabilityGet(capabilityId, clusterId);
    });

    // TODO: test (was moved from for each to here)
    // Register multiple capabilities with a debounce
    this.registerMultipleCapabilityListener(
      // TODO: `capability` is legacy property, remove with next major update
      multipleCapabilitiesConfiguration.map(x => x.capabilityId || x.capability),
      async (valueObj, optsObj) => {
        this._debug(`multiple capabilities listener [${multipleCapabilitiesConfiguration.map(x => x.capabilityId || x.capability).join(', ')}]`, valueObj, optsObj);

        // Call the provided `multipleCapabilitiesListener` method to let the device handle the
        // multiple capability changes
        const result = await multipleCapabilitiesListener(valueObj, optsObj);

        // If it did not handle it for some reason, we will process each capability value one by one
        if (!result || result instanceof Error) {
          this._debug(`multiple capabilities listener [${multipleCapabilitiesConfiguration.map(x => x.capabilityId || x.capability).join(', ')}] → fallback`);

          // Loop all changed capabilities
          for (const capabilityId of Object.keys(valueObj)) {
            // Find capability object from configuration
            const capabilityObj = multipleCapabilitiesConfiguration
              .find(x => x.capabilityId === capabilityId || x.capability === capabilityId);

            const clusterId = capabilityObj.cluster;
            const value = valueObj[capabilityId];
            const opts = optsObj[capabilityId];

            // Try and get capability set object
            const capabilitySetObj = this._getCapabilityObj('set', capabilityId, clusterId);

            // Try to handle executing the capability change event
            try {
              await this._capabilityListener(
                capabilitySetObj,
                capabilityId,
                value,
                opts,
              );
            } catch (err) {
              break;
            }
          }
        }
      }, CAPABILITIES_DEBOUNCE,
    );
  }

  /**
   * Method that searches for the first occurrence of a clusterName in a device's endpoints and
   * returns the endpoint id.
   * @todo this method is changed from {string} clusterName to {number} clusterId
   * @param {ClusterId} clusterId
   * @returns {EndpointId} endpointId
   */
  getClusterEndpoint(clusterId) {
    if (typeof clusterId !== 'number') throw new TypeError('expected_cluster_id_number');
    if (!this.zclNode || !this.zclNode.endpoints) throw new Error('zcl_node_not_initialized');

    // Loop all endpoints for first occurrence of clusterId
    // eslint-disable-next-line no-restricted-syntax
    for (const [endpointId, endpoint] of Object.entries(this.zclNode.endpoints)) {
      if (endpoint.clusters && endpoint.clusters[clusterId]) { // TODO: this probably fails,
        // need to convert to Cluster.NAME first
        return Number(endpointId);
      }
    }

    // Not found, probably something wrong, return default
    return 0; // TODO: should return 0 or 1 as default endpointId?
  }

  // /**
  //  * Register an endpoint command listener, which is called when a command has been received from
  //  * the provided endpoint cluster combination.
  //  * @todo removed _bindCluster, what should happen here? should this be removed at all?
  //  * @param {ClusterId} clusterId - The ID of the cluster (e.g. `genBasic`)
  //  * @param {string} commandId - The ID of the Command (e.g. `onOff`)
  //  * @param {Function} triggerFn
  //  * @param {Object} triggerFn.rawReport - The raw report
  //  * @param {Object} triggerFn.parsedReport - The parsed report (parsed by the first available
  //  * `reportParser` method)
  //  * @param {number} [endpointId=0] - The endpoint index (e.g. 0)
  //  */
  // registerReportListener(clusterId, commandId, triggerFn, endpointId = 0) {
  //   const clusterEndpointId = `${endpointId}_${clusterId}`;
  //
  //   this._reportListeners[clusterEndpointId] = this._reportListeners[clusterEndpointId] || {};
  //   this._reportListeners[clusterEndpointId][commandId] = triggerFn;
  //
  //   // Lister on this cluster for specific commands
  //   this.node.on('command', command => { // TODO: changed?
  //     const commandEndpointId = command.endpoint;
  //     if (!commandEndpointId) this.error('command missing endpoint id', command);
  //     const commandClusterEndpointId = `${commandEndpointId}_${clusterId}`;
  //     if (this._reportListeners[commandClusterEndpointId]
  //       && this._reportListeners[commandClusterEndpointId][command.attr]
  //       && commandId === command.attr) {
  //       this._reportListeners[commandClusterEndpointId][command.attr](command.value);
  //     }
  //   });
  // }

  /**
   * @deprecated since v1.0.0 - Use {@link configureAttributeReporting} instead.
   */
  async registerAttrReportListener() {
    throw new Error('You are using a deprecated function, please refactor'
      + ' registerAttrReportListener to configureAttributeReporting');
  }

  /**
   * Register an attribute report listener, which is called when a report has been received for
   * the provided endpoint cluster and attribute combination.
   * @param {ClusterId} clusterId
   * @param {string} attributeId - The ID of the attribute (e.g. `onOff`)
   * @param {number} [minInterval=0] - The minimum reporting interval in seconds (e.g. 10), the
   * default value is 0 which imposes no minimum limit (unless one is imposed by the
   * specification of the cluster using this reporting mechanism). Range: 0 - 65535.
   * @param {number} maxInterval - The maximum reporting interval in seconds (e.g. 300), this
   * value must be larger than 60 and larger than `minInterval`. When this parameter is set to
   * 65535 the device shall not issue reports for the specified attribute. When this parameter
   * is set to 0 and the `minInterval` is set to 65535 the device will revert back to its
   * default reporting configuration. Range: 0 - 65535.
   * @param {number} [minChange=1] - The minimum value the attribute has to change in order to
   * trigger a report. For attributes with 'discrete' data type this field is irrelevant. If
   * `minInterval` is set to 65535, and `maxInterval` to 0, this value will be set to 0. See
   * section 2.5.7.1.7 of the Zigbee Cluster Library specification version 1.0, revision 6.
   * @param {EndpointId} [endpointId=0] - The endpoint index (e.g. 0) // TODO: right default
   * @returns {Promise} Resolves if configuration succeeded
   */
  async configureAttributeReporting({
    clusterId,
    attributeId, // TODO: is this an id or a name?
    minInterval = 0,
    maxInterval,
    minChange = 1,
    endpointId = 0, // TODO: is this the right default value, or should we use 1?
  }) {
    if (minInterval < 1) throw new RangeError('invalid_min_interval_value');

    // Max interval must be larger than 60 and larger than minInterval or 0
    if (maxInterval !== 0 && (maxInterval < 60 || maxInterval < minInterval)) {
      throw new Error('invalid_max_interval_value');
    }

    // Check if endpoint and cluster exist on ZCLNode
    if (!this.zclNode.endpoints[endpointId]
      || !this.zclNode.endpoints[endpointId].clusters[clusterId]) {
      this.error(`Error: expected cluster ${getClusterName(clusterId)} on endpoint ${endpointId}`);
      throw new Error('missing_cluster_or_endpoint');
    }

    // See: section 2.5.7.1.7 of the Zigbee Cluster Library specification version 1.0, revision 6.
    if (maxInterval === 0 && minInterval === 65535) {
      minChange = 0;
    }

    this._debug(`configure attribute reporting (endpoint: ${endpointId}, cluster: ${getClusterName(clusterId)}, attribute: ${attributeId})`, {
      minInterval,
      maxInterval,
      minChange,
    });

    // Create variable to store all configurations, these will be iterated later on to configure
    // them all at once as much as possible
    this._attributeReportingConfigurations = this._attributeReportingConfigurations || new Map();

    // Return a new promise which will be resolved once the attribute reporting is configured
    return new Promise((resolve, reject) => {
      this._attributeReportingConfigurations.set(`${endpointId}:${clusterId}`, {
        ...this._attributeReportingConfigurations.get(`${endpointId}:${clusterId}`),
        [attributeId]: {
          minInterval,
          maxInterval,
          minChange,
        },
        resolves: [
          ...this._attributeReportingConfigurations.get(`${endpointId}:${clusterId}`).resolves,
          resolve,
        ],
        rejects: [
          ...this._attributeReportingConfigurations.get(`${endpointId}:${clusterId}`).rejects,
          reject,
        ],
      });

      // Call debounced configure attribute reporting method
      this._configureAttributeReporting(this._attributeReportingConfigurations);
    });
  }

  /**
   * Print the current node information, this contains information on the node's endpoints and
   * clusters (and if it is a sleepy device or not).
   */
  printNode() {
    this.log('------------------------------------------');

    // log the entire Node
    this.log('Node:', this.getData().token);
    this.log('- Receive when idle:', this.node.receiveWhenIdle);

    Object.keys(this.zclNode.endpoints)
      .forEach(endpointId => {
        this.log('- Endpoints:', endpointId);
        this.log('-- Clusters:');
        Object.keys(this.zclNode.endpoints[endpointId].clusters)
          .forEach(key => {
            this.log('---', key);
          });
        this.log('-- Bindings:');
        Object.keys(this.zclNode.endpoints[endpointId].bindings)
          .forEach(key => {
            this.log('---', key);
          });
      });

    this.log('------------------------------------------');
  }

  /**
   * Enable {@link ZigBeeDevice._debug} statements.
   */
  enableDebug() {
    this._debugEnabled = true;
  }

  /**
   * Disable {@link ZigBeeDevice._debug} statements.
   */
  disableDebug() {
    this._debugEnabled = false;
  }

  /**
   * Method is called by the Homey Apps SDK when the {@link Homey.Device} instance is
   * initialized. It will configure this {@link ZigBeeDevice} instance and retrieve a
   * {@link Homey.ZigBeeNode} instance from {@link Homey.ManagerZigBee}. This ZigBeeNode instance
   * will then be used to create a {@link ZCLNode} instance.
   * @private
   */
  onInit() {
    super.onInit();

    this._debugEnabled = false;
    this._pollIntervals = {};
    this._capabilities = {};

    // Create a debounced version of this._configureAttributeReporting
    this._configureAttributeReporting = debounce(
      this._configureAttributeReporting,
      CONFIGURE_REPORTING_DEBOUNCE,
    );

    // Get ZigBeeNode instance from ManagerZigBee
    Homey.ManagerZigBee.getNode(this)
      .then(async node => {
        this.node = node;

        // Bind end device announce listener
        this.node.on('endDeviceAnnounce', this.onEndDeviceAnnounce.bind(this));

        // Check if `getEnergy` method is available (Homey >=v3.0.0)
        if (typeof this.getEnergy === 'function') {
          const energyObject = this.getEnergy();
          await this.setEnergy(energyObject);
        }

        // Create ZCLNode instance
        this.zclNode = new ZCLNode(this.node);

        this.log('ZigBeeDevice has been initialized');

        // Legacy from homey-meshdriver
        this.onMeshInit();

        // Call overridable method with initialized ZCLNode
        this.onNodeInit({ zclNode: this.zclNode }); // TODO: should this also provide node?
      })
      .catch(err => {
        this.error('Error: could not initialize node', err);

        const unavailableMessage = __(err.message) || __('error.node_initialization');
        this.setUnavailable(unavailableMessage)
          .catch(unavailableErr => this.error('could not set device unavailable', unavailableErr));
      });
  }

  /**
   * Remove all listeners and intervals from node.
   */
  onDeleted() {
    // Remove listeners on node
    if (this.node) this.node.removeAllListeners(); // TODO: destroy zclNode?

    // Clear all pollIntervals
    if (this._pollIntervals) { // Sometimes it is null/undefined for some reason
      Object.keys(this._pollIntervals)
        .forEach(capabilityId => {
          Object.values(this._pollIntervals[capabilityId])
            .forEach(interval => {
              clearInterval(interval);
            });
        });
    }
    this._debug('deleted ZigBeeDevice instance');
  }

  /**
   * Method that handles registering the `get` part of the {@link
    * ClusterCapabilityConfiguration}. If {@link ClusterCapabilityConfiguration.getOpts.getOnStart}
   * is set, the node is a non-sleepy device and the capability value is currently unknown,
   * execute the cluster command that will retrieve the capability value from the device.
   * Additionally, if {@link ClusterCapabilityConfiguration.getOpts.getOnOnline} is set the
   * cluster command will be executed to retrieve the capability value when the device sends an
   * end device announce indication. Finally, if
   * {@link ClusterCapabilityConfiguration.getOpts.pollInterval} is set to either a number or a
   * string (setting key) a poll interval will be registered which executes the cluster command
   * to retrieve the capability value.
   * @param {CapabilityId} capabilityId
   * @param {ClusterId} clusterId
   * @private
   */
  _registerCapabilityGet(capabilityId, clusterId) {
    const { opts } = this._getCapabilityObj('get', capabilityId, clusterId);
    const { getOnStart, getOnOnline, pollInterval } = opts;

    // Get initial value on start if null, unless it's an offline battery device and the
    // getOnOnline flag is also set

    // If the `getOnStart` option is set and the node is not a sleepy device and the capability
    // value is unknown go execute _getClusterAttributeValue. This situation is almost always
    // only after the first init of a device after pairing.
    if (getOnStart
      && this.getCapabilityValue(capabilityId) === null
      && this.node.receiveWhenIdle !== true) {
      this._getClusterAttributeValue(capabilityId, clusterId)
        .catch(err => {
          this.error(`Error: could not get value for capability: ${capabilityId} on cluster: ${clusterId}`, err);
        });
    }

    // When node comes online (i.e. sends an end device announce indication) execute
    // _getClusterAttributeValue when `getOnOnline` is set to true.
    if (getOnOnline) {
      this.node.on('endDeviceAnnounce', () => {
        this._debug('Received end device announce indication and `getOnOnline` is configured');
        this._getClusterAttributeValue(capabilityId, clusterId)
          .catch(err => {
            this.error(`could not get value for capability: ${capabilityId} on cluster: ${clusterId}`, err);
          });
      });
    }

    // Configure poll intervals if needed
    if (pollInterval) {
      // If poll interval is a number treat it as the interval in ms
      if (typeof pollInterval === 'number') {
        this._setPollInterval(capabilityId, clusterId, pollInterval);

        // Else if poll interval is a string treat it as a settings key on the device instance,
        // this setting should return a number value representing the interval in ms
      } else if (typeof pollInterval === 'string') {
        this._setPollInterval(capabilityId, clusterId, this.getSetting(pollInterval));
      }
    }
  }

  /**
   * Method that handles registering the `set` part of the
   * {@link ClusterCapabilityConfiguration}. When a capability value is changed (i.e. the
   * capability listener is called {@link Homey.Device.registerCapabilityListener}) the
   * {@link _capabilityListener} will be called which handles converting the
   * capability value change to a Zigbee command in order to actually change the device's state.
   * @param {CapabilityId} capabilityId
   * @param {ClusterId} clusterId
   * @private
   */
  _registerCapabilitySet(capabilityId, clusterId) {
    const capabilitySetObj = this._getCapabilityObj('set', capabilityId, clusterId);

    // Register the capability and attach a listener to act on a capability change by the user
    this.registerCapabilityListener(capabilityId, async (value, opts) => {
      return this._capabilityListener(capabilitySetObj, capabilityId, value, opts);
    });
  }

  /**
   * Starts the poll interval (and clears it if it was already running). On each interval
   * {@link _getClusterAttributeValue} will be called to fetch the capability value from the
   * device by doing a `readAttributes`.
   * @param {CapabilityId} capabilityId
   * @param {ClusterId} clusterId
   * @param {number} pollInterval - interval in ms (min. 1)
   * @private
   */
  _setPollInterval(capabilityId, clusterId, pollInterval) {
    if (this._pollIntervals[capabilityId][clusterId]) {
      clearInterval(this._pollIntervals[capabilityId][clusterId]);
    }

    // Values 1 are rejected
    if (pollInterval < 1) return;

    this._debug(`set poll interval for capability: ${capabilityId}, cluster: ${getClusterName(clusterId)} to ${pollInterval}ms`);

    // Set interval
    this._pollIntervals[capabilityId][clusterId] = setInterval(() => {
      this._debug(`polling cluster ${getClusterName(clusterId)} for capability ${capabilityId}`);
      this._getClusterAttributeValue(capabilityId, clusterId).catch(err => {
        this.error(`Error: polling cluster ${getClusterName(clusterId)} for capability ${capabilityId}`, err);
      });
    }, pollInterval);
  }

  /**
   * Method reads the `get` part of the {@link ClusterCapabilityConfiguration} and based on that
   * performs a `readAttributes` call on the cluster. It will trigger {@link _onReport} once the
   * new value is received which will parse the result.
   * @todo make public version of this method?
   * @param {CapabilityId} capabilityId
   * @param {ClusterId} clusterId
   * @returns {Promise<null|any>}
   * @private
   */
  async _getClusterAttributeValue(capabilityId, clusterId) {
    const {
      endpoint, commandId, zclNode,
    } = this._getCapabilityObj('get', capabilityId, clusterId);

    this.log(`get → ${capabilityId} → read attributes (cluster: ${getClusterName(clusterId)}, attributeId: ${commandId}, endpoint: ${endpoint})`);

    // Read attribute from ZCLNode
    const result = await zclNode.endpoints[endpoint].clusters[clusterId]
      .readAttributes(commandId)
      .catch(err => {
        this.error(`Error: get → ${capabilityId} → read attributes (cluster: ${getClusterName(clusterId)}, attributeId: ${commandId}, endpoint: ${endpoint})`, err);
        throw err;
      });

    this._debug(`get → ${capabilityId} → read attributes (cluster: ${getClusterName(clusterId)}, attributeId: ${commandId}, endpoint: ${endpoint}) → raw result:`, result);

    // Parse the raw result
    const parsedResult = this._onReport(capabilityId, clusterId, result);
    this.log(`get → ${capabilityId} → read attributes (cluster: ${getClusterName(clusterId)}, attributeId: ${commandId}, endpoint: ${endpoint}) → parsed result`, parsedResult);
    return parsedResult;
  }

  /**
   * This method is called when a user changes a capability value in Homey, it will get the
   * `set` part of the {@link ClusterCapabilityConfiguration}, parse the payload by calling the
   * {@link ClusterCapabilityConfiguration.setParser}, and finally execute the cluster command
   * as configured by {@link ClusterCapabilityConfiguration.set}.
   * @param {CapabilityObject} capabilitySetObj
   * @param {CapabilityId} capabilityId
   * @param {*} value
   * @param {Homey.Device.registerCapabilityListener.listener.opts} [opts={}]
   * @returns {Promise<string|*>}
   * @private
   */
  async _capabilityListener(capabilitySetObj = {}, capabilityId, value, opts = {}) {
    let { commandId } = capabilitySetObj;
    const {
      parser, zclNode, endpoint, clusterId,
    } = capabilitySetObj;

    if (typeof parser !== 'function') throw new TypeError('parser_is_not_a_function');
    if (!(zclNode instanceof ZCLNode)) throw new TypeError('expected_zcl_node_instance');
    if (typeof endpoint !== 'number') throw new TypeError('expected_endpoint_number');
    if (typeof clusterId !== 'number') throw new TypeError('expected_cluster_id_number');

    this.log(`set ${capabilityId} → ${value} (cluster: ${getClusterName(clusterId)}, endpoint: ${endpoint})`);

    // `commandId` can be a function, in that case call the function to convert to a string value
    if (typeof commandId === 'function') commandId = commandId(value, opts);

    // Call the `setParser` to generate the command properties which will be passed when
    // executing the cluster command
    const parsedPayload = await parser.call(this, value, opts);
    if (parsedPayload instanceof Error) throw parsedPayload;

    // In the case that the parser returns `null` do not continue executing the command
    if (parsedPayload === null) {
      this._debug(`WARNING: set ${capabilityId} → ${value} (command: ${commandId}, cluster: ${getClusterName(clusterId)}, endpoint: ${endpoint}) returned \`null\`, ignoring command set`);
      return 'IGNORED'; // TODO: is this the best solution?
    }

    this._debug(`set ${capabilityId} → ${value} (command: ${commandId}, cluster: ${getClusterName(clusterId)}, endpoint: ${endpoint}), parsed payload:`, parsedPayload);

    // Execute the cluster command
    return zclNode.endpoints[endpoint].clusters[clusterId][commandId](parsedPayload)
      .catch(err => {
        // TODO: better error handling
        this.error(`Error: could not perform ${commandId} on cluster: ${getClusterName(clusterId)}, endpoint: ${endpoint} for capability ${capabilityId}`, err);
        throw new Error(__('error.command_failed'));
      });
  }

  /**
   * Method that merges two {@link ClusterCapabilityConfiguration} objects. There are system
   * ClusterCapabilityConfigurations (see ./lib/system/capabilities) and user
   * ClusterCapabilityConfigurations. When registering a capability by default the system
   * configuration will be applied, if desired a user configuration can be provided
   * {@link registerCapability.userOpts} which will extend the system configuration (i.e. user
   * configuration overrules system configuration).
   * @param {CapabilityId} capabilityId
   * @param {ClusterId} clusterId
   * @param {ClusterCapabilityConfiguration} [userClusterCapabilityConfiguration]
   * @private
   */
  _mergeSystemAndUserClusterCapabilityConfigurations(
    capabilityId, clusterId, userClusterCapabilityConfiguration,
  ) {
    if (typeof capabilityId !== 'string') throw new TypeError('expected_capability_id_string');
    if (typeof clusterId !== 'number') throw new TypeError('expected_cluster_id_number');

    // Merge systemConfiguration & userOpts
    let systemConfiguration = {};
    try {
      // Get the system configuration
      // eslint-disable-next-line global-require,import/no-dynamic-require
      const systemConfigurationFile = require(`./system/capabilities/${capabilityId}/${clusterId}.js`);
      systemConfiguration = Homey.util.recursiveDeepCopy(systemConfigurationFile);

      // Bind correct scope on functions
      // eslint-disable-next-line no-restricted-syntax
      for (const i in systemConfiguration) {
        if (typeof systemConfiguration[i] === 'function') {
          systemConfiguration[i] = systemConfiguration[i].bind(this);
        }
      }
    } catch (err) {
      if (err.code !== 'MODULE_NOT_FOUND' || err.message.indexOf(`/system/capabilities/${capabilityId}/${clusterId}.js`) < 0) {
        process.nextTick(() => {
          throw err;
        });
      }
    }

    // Determine endpoint, search for it based on the clusterId
    let { endpoint } = userClusterCapabilityConfiguration;
    if (typeof endpoint !== 'number') {
      endpoint = this.getClusterEndpoint(clusterId);
    }

    this._capabilities[capabilityId][clusterId] = {
      ...systemConfiguration || {},
      ...userClusterCapabilityConfiguration,
      endpoint,
    };
  }


  /**
   * Method that handles an attribute report. Currently this is only called after manually
   * reading attributes by calling {@link _getClusterAttributeValue}. It parses the result
   * using the {@link ReportParserFunction}.
   * @TODO this should also be called when a node sends reports after binding for example.
   * @param {CapabilityId} capabilityId
   * @param {ClusterId} clusterId
   * @param {*} payload
   * @returns {Promise<null|*>} - Returns `null` if parsing failed or yielded no result.
   * @private
   */
  async _onReport(capabilityId, clusterId, payload) {
    const { parser } = this._getCapabilityObj('report', capabilityId, clusterId);
    if (typeof parser !== 'function') return null;

    this._debug(`handle report (cluster: ${getClusterName(clusterId)}, capability: ${capabilityId}), raw payload:`, payload);

    const parsedPayload = await parser.call(this, payload);
    if (parsedPayload instanceof Error) return null;
    if (parsedPayload === null) return null;

    this.log(`handle report (cluster: ${getClusterName(clusterId)}, capability: ${capabilityId}), parsed payload:`, parsedPayload);

    // Update capability value in Homey
    this.setCapabilityValue(capabilityId, parsedPayload);

    return parsedPayload;
  }

  /**
   * @typedef {object} CapabilityObject
   * @property {ClusterId} clusterId
   * @property {string|function} commandId
   * @property {number} endpoint
   * @property {function} parser
   * @property {object} opts
   * @property {ZCLNode} zclNode
   * @private
   */

  /**
   * Method that returns the capability configuration for a registered capability
   * (see {@link registerCapability}) based on the provided `commandType`.
   * @param {'get'|'set'|'report'} commandType
   * @param {CapabilityId} capabilityId
   * @param {ClusterId} clusterId
   * @returns {CapabilityObject}
   * @private
   */
  _getCapabilityObj(commandType, capabilityId, clusterId) {
    const capability = this._capabilities[capabilityId];
    if (typeof clusterId === 'undefined') throw new Error('missing_cluster_id');

    const cluster = capability[clusterId];
    if (typeof cluster === 'undefined') throw new Error('missing_cluster_configuration');

    const commandId = cluster[commandType];
    const parser = cluster[`${commandType}Parser`] || null;
    const opts = cluster[`${commandType}Opts`] || {};
    const { zclNode } = this;

    if (typeof commandId === 'string' || typeof commandId === 'function') {
      throw new Error(`capability_${commandType}_is_not_a_function_or_string`);
    }

    return {
      clusterId,
      commandId,
      endpoint: cluster.endpoint,
      parser,
      opts,
      zclNode,
    };
  }

  /**
   * Loops all `configureAttributeReportingConfigurations` and will set them using the minimum
   * amount of `configureReporting` calls (multiple attributes will be configured at once for a
   * single cluster). The device's store value {@link CONFIGURED_ATTRIBUTE_REPORTING_STORE_KEY}
   * will be updated to reflect the configured attribute reporting configuration with an
   * additional `lastUpdated` value.
   * @returns {Promise}
   * @private
   */
  // eslint-disable-next-line consistent-return
  async _configureAttributeReporting(configureAttributeReportingConfigurations) {
    // Loop all available attribute reporting configurations per endpointId:clusterId combination
    for (const [
      id,
      configureAttributeReportingConfiguration,
    ] of configureAttributeReportingConfigurations) {
      // Destructure all necessary properties
      const [endpointId, clusterId] = id.split(':');
      const {
        resolves,
        rejects,
        ...configureAttributeReportingConfigurationRest
      } = configureAttributeReportingConfiguration;

      // Execute configure reporting command
      await this.zclNode.endpoints[endpointId].clusters[clusterId]
        .configureReporting(configureAttributeReportingConfigurationRest)
        .then(async res => {
          this._debug(`configured attribute reporting (endpoint: ${endpointId}, cluster: ${getClusterName(clusterId)})`, configureAttributeReportingConfigurationRest);
          resolves.forEach(resolve => resolve(res));

          // Add last updated property to attribute reporting configuration object
          for (const obj of configureAttributeReportingConfigurationRest) {
            obj.lastUpdated = Date.now();
          }

          // Store configuration succeeded
          await this.setStoreValue(CONFIGURED_ATTRIBUTE_REPORTING_STORE_KEY, {
            ...this.getStoreValue(CONFIGURED_ATTRIBUTE_REPORTING_STORE_KEY),
            [id]: {
              ...this.getStoreValue(CONFIGURED_ATTRIBUTE_REPORTING_STORE_KEY)[id],
              ...configureAttributeReportingConfigurationRest,
            },
          });

          return res;
        })
        .catch(err => {
          this.error(`Error: configuring attribute reporting (endpoint: ${endpointId}, cluster: ${getClusterName(clusterId)})`, configureAttributeReportingConfigurationRest);
          rejects.forEach(reject => reject(err));
        });

      // Remove this entry since it is handled
      configureAttributeReportingConfigurations.delete(id);
    }
  }

  /**
   * Debug logging method. Will only log to stdout if enabled via {@link enableDebug}.
   * @param {*} args
   * @private
   */
  _debug(...args) {
    if (this._debugEnabled) {
      this.log.bind(this, '[dbg]').apply(this, args);
    }
  }

}

module.exports = ZigBeeDevice;
