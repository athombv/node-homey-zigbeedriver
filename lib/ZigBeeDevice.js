'use strict';

const Homey = require('homey'); // eslint-disable-line
// eslint-disable-next-line no-unused-vars
const {
  ZCLNode, Cluster, Endpoint, BasicCluster, getClusterId,
} = require('zigbee-clusters');

const { __ } = require('./util');

// TODO battery node online event
// TODO: think about clusterIds vs clusterNames
// TODO: export clusterIds/names as constants from zigbee-clusters?

const CAPABILITIES_DEBOUNCE = 500; // ms

/**
 * @typedef {string} CapabilityId - Homey.Device capability id (e.g. `onoff`)
 * @typedef {number} ClusterId - Zigbee {@link Cluster.ID} (e.g. 0 for {@link BasicCluster})
 * @typedef {number} EndpointId - Zigbee {@link Endpoint.ID} (e.g. 1)
 */

/**
 * @extends Homey.Device
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
   * This method can be overridden. It will be called when the {@link ZigBeeDevice} instance is
   * ready and did initialize a {@link ZigBeeNode}.
   * @deprecated - Legacy from homey-meshdriver, use {@link onNodeInit} instead.
   */
  onMeshInit() {

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
   * Overrides `Homey.Device.getEnergy` to enable zigbee devices to expose a {@link energyMap}
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
   * Method is given a `setValue` and will generate based an object with the needed command
   * attributes as specified in {@link Cluster.COMMANDS}. This object will be provided to the
   * Cluster command as parameters when executed.
   *
   * @param {any} setValue
   * @returns {Promise<object|null>} - If return value is `null` the command will not be executed.
   */

  /**
   * @typedef {function} ReportParserFunction
   *
   * @todo this functionality is probably broken now
   *
   * Method is called when a report is received for the `report` attribute. In this method the
   * `reportValue` can be parsed and mapped to become a valid Homey.Device capability value.
   *
   * @param {any} reportValue
   * @returns {Promise<any|null>} - If return value is `null` the Homey.Device capability
   * value will not be changed.
   */

  /**
   * @typedef {object} ClusterCapabilityMapConfiguration
   *
   * @property {string} [set] - Cluster command as specified in {@link Cluster.COMMANDS}, this
   * command will be executed when the capability is set.
   * @property {SetParserFunction} setParser - Method that will be called before `set` is
   * called, to generate the parameters for the Cluster command execution.
   *
   * @property {string} [get] - Cluster attribute as specified in {@link Cluster.ATTRIBUTES}. This
   * attribute will be fetched by {@link Cluster.readAttributes} when the capability value needs
   * to be fetched.
   *
   * @property {string} [report] - Cluster attribute as specified in {@link Cluster.ATTRIBUTES}.
   * When a report is received for this attribute the respective `reportParser` will be called.
   * @property {ReportParserFunction} reportParser
   *
   * @property {object} [getOpts] - Options object specific for `get`.
   * @property {EndpointId} [getOpts.endpoint=0] - The {@link ZCLNode}'s endpoint to use for this
   * configuration. TODO: is this still the right default endpointId or should it become 1?
   * @property {boolean} [getOpts.getOnStart=false] - Fetches the `get` attribute when the
   * {@link ZCLNode} is first initialized.
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
   * @param {ClusterCapabilityMapConfiguration} [userOpts] - User provided
   * ClusterCapabilityMapConfiguration, these will override and extend the system cluster
   * capability map configuration if available (e.g. ./system/capabilities/onoff).
   */
  registerCapability(capabilityId, clusterId, userOpts) {
    if (typeof capabilityId !== 'string') throw new TypeError('expected_capability_id_string');
    if (typeof clusterId !== 'number') throw new TypeError('expected_cluster_id_number');

    // Register the Zigbee capability listener
    this._capabilities[capabilityId] = this._capabilities[capabilityId] || {};
    this._capabilities[capabilityId][clusterId] = this._capabilities[capabilityId][clusterId] || {};

    // Merge systemOpts & userOpts
    this._mergeSystemAndUserOpts(capabilityId, clusterId, userOpts);

    // Register get/set
    this._registerCapabilitySet(capabilityId, clusterId);
    this._registerCapabilityGet(capabilityId, clusterId);
  }

  /**
   * @typedef {object} MultipleCapabilitiesConfiguration
   * @property {CapabilityId} capabilityId
   * @property {ClusterId} clusterId
   * @property {ClusterCapabilityMapConfiguration} userOpts
   */

  /**
   * Register multiple Homey.Device capabilities with a {@link ClusterCapabilityMapConfiguration}.
   * When a capability is changed (or multiple in quick succession), the event will be debounced
   * with the other capabilities in the multipleCapabilitiesConfiguration array.
   * @param {MultipleCapabilitiesConfiguration[]} multipleCapabilitiesConfiguration -
   * Configuration options for multiple capability cluster mappings.
   * @param {function} callback - Called after debounce of {@link CAPABILITIES_DEBOUNCE}
   */
  registerMultipleCapabilities(multipleCapabilitiesConfiguration = [], callback) {
    // Loop all provided capabilities
    multipleCapabilitiesConfiguration.forEach(capabilityObj => {
      // TODO: `capability`, `cluster` and `opts` are legacy properties, remove with next major
      //  update
      const capabilityId = capabilityObj.capabilityId || capabilityObj.capability;
      const clusterId = capabilityObj.clusterId || capabilityObj.cluster;
      const userOpts = capabilityObj.userOpts || capabilityObj.opts || {};

      if (typeof capabilityId !== 'string') throw new TypeError('expected_capability_id_string');
      if (typeof clusterId !== 'number') throw new TypeError('expected_cluster_id_number');

      // Register the Zigbee capability listener
      const currentCapabilityObj = this._capabilities[capabilityId] || {};
      const currentCapabilityClusterObj = this._capabilities[capabilityId][clusterId] || {};

      this._capabilities[capabilityId] = currentCapabilityObj;
      this._capabilities[capabilityId][clusterId] = currentCapabilityClusterObj;

      // Override default system opts with user opts
      this._mergeSystemAndUserOpts(capabilityId, clusterId, userOpts);

      // Register capability getter
      this._registerCapabilityGet(capabilityId, clusterId);

      // Register debounced capabilities set
      this._registerCapabilitiesSet(multipleCapabilitiesConfiguration, callback);
    });
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

    // Loop all endpoints for first occurrence of clusterName
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

  /**
   * Register an endpoint command listener, which is called when a command has been received from
   * the provided endpoint
   * cluster combination.
   * @todo removed _bindCluster, what should happen here? should this be removed at all?
   * @param {ClusterId} clusterId - The ID of the cluster (e.g. `genBasic`)
   * @param {string} commandId - The ID of the Command (e.g. `onOff`)
   * @param {Function} triggerFn
   * @param {Object} triggerFn.rawReport - The raw report
   * @param {Object} triggerFn.parsedReport - The parsed report (parsed by the first available
   * `reportParser` method)
   * @param {number} [endpointId=0] - The endpoint index (e.g. 0)
   */
  registerReportListener(clusterId, commandId, triggerFn, endpointId = 0) {
    const clusterEndpointId = `${endpointId}_${clusterId}`;

    this._reportListeners[clusterEndpointId] = this._reportListeners[clusterEndpointId] || {};
    this._reportListeners[clusterEndpointId][commandId] = triggerFn;

    // Lister on this cluster for specific commands
    this.node.on('command', command => { // TODO: changed?
      const commandEndpointId = command.endpoint;
      if (!commandEndpointId) this.error('command missing endpoint id', command);
      const commandClusterEndpointId = `${commandEndpointId}_${clusterId}`;
      if (this._reportListeners[commandClusterEndpointId]
        && this._reportListeners[commandClusterEndpointId][command.attr]
        && commandId === command.attr) {
        this._reportListeners[commandClusterEndpointId][command.attr](command.value);
      }
    });
  }

  /**
   * @deprecated - Use {@link registerAttributeReportListener} instead.
   * @returns {Promise<*>}
   */
  async registerAttrReportListener(...args) {
    return this.registerAttributeReportListener(...args);
  }

  /**
   * Register an attribute report listener, which is called when a report has been received for
   * the provided endpoint
   * cluster and attribute combination.
   * @param {ClusterId} clusterId
   * @param {string} attrId - The ID of the attribute (e.g. `onOff`)
   * @param {number} minInt - The minimal reporting interval in seconds (e.g. 10 (seconds))
   * @param {number} maxInt - The maximal reporting interval in seconds (e.g. 300 (seconds))
   * @param {number} repChange - Reportable change; the attribute should report its value when
   * the value is changed more than this setting, for attributes of analog data type this
   * argument is mandatory.
   * @param {Function} triggerFn - Function that will be called when attribute report data is
   * received
   * @param {EndpointId} [endpointId=0] - The endpoint index (e.g. 0)
   * @returns {Promise} Resolves if configuration succeeded
   *
   * @todo should this be renamed/changed to configure reporting?
   */
  async registerAttributeReportListener(
    clusterId,
    attrId,
    minInt,
    maxInt,
    repChange = null,
    triggerFn,
    endpointId = 0,
  ) {
    const reportId = `attrReport_${endpointId}_${clusterId}_${attrId}`;
    const clusterEndpointId = `${endpointId}_${clusterId}`;

    // minInt must be greater than or equal to 1
    if (minInt < 1) throw new Error('invalid_min_int_report_value');

    // maxInt must be larger than 60 and larger than minInt or 0
    if (maxInt !== 0 && (maxInt < 60 || maxInt < minInt)) {
      throw new Error('invalid_max_int_report_value');
    }

    // Check if endpoint cluster combi exists
    if (!this.zclNode.endpoints[endpointId]
      || !this.zclNode.endpoints[endpointId].clusters[clusterId]) {
      throw new Error('invalid_endpoint_cluster_combination');
    }

    // Check if already configured
    const alreadyConfigured = this.getStoreValue(reportId);
    const currentAttrReportListeners = this._attrReportListeners[clusterEndpointId] || {};
    this._attrReportListeners[clusterEndpointId] = currentAttrReportListeners; // TODO: remove
    // init to constructor

    // Store callback
    this._attrReportListeners[clusterEndpointId][attrId] = triggerFn;

    // Make sure to configure just once
    if (alreadyConfigured
      && alreadyConfigured.minInt === minInt
      && alreadyConfigured.maxInt === maxInt
      && alreadyConfigured.repChange === repChange) {
      this.log(`registerAttrReportListener() -> already configured attr reporting ${reportId}`);
      return true;
    }

    // If was registered before unregister it first
    this.unsetStoreValue(reportId);

    return new Promise((resolve, reject) => {
      // Add to queue
      this._configureReportRequests.push({
        reportId,
        endpointId,
        clusterId,
        attrId,
        minInt,
        maxInt,
        repChange,
        promise: {
          resolve,
          reject,
        },
      });

      // If not already binding start the binding process
      if (!this.configureReportInProcess) this._configureReport();
    });
  }

  /**
   * Print the current Node information with Endpoints and Clusters
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
   * Enable {@link _debug} statements in {@link ZigBeeDevice} instances.
   */
  enableDebug() {
    this._debugEnabled = true;
  }

  /**
   * Disable {@link _debug} statements in {@link ZigBeeDevice} instances.
   */
  disableDebug() {
    this._debugEnabled = false;
  }

  /**
   * Method is called by the Homey Apps SDK when the {@link Homey.Device} instance is
   * initialized. It will configure this {@link ZigBeeDevice} instance and retrieve a
   * {@link ZigBeeNode} instance from {@link ManagerZigBee}. This ZigBeeNode instance will then
   * be used to create a {@link ZCLNode} instance.
   * @private
   */
  onInit() {
    super.onInit();
    this._debugEnabled = false;
    this._pollIntervals = {};

    this._capabilities = {};
    this._reportListeners = {};
    this._attrReportListeners = {};
    this._pollIntervalsKeys = {};
    this._configureReportRequests = [];

    Homey.ManagerZigBee.getNode(this)
      .then(async node => {
        this.node = node;
        this.node.on('endDeviceAnnounce', () => {
          this.log('endDeviceAnnounce');
          this.onEndDeviceAnnounce();
        });
        // Check if `getEnergy` method is available (Homey >=v3.0.0)
        if (typeof this.getEnergy === 'function') {
          const energyObject = this.getEnergy();
          await this.setEnergy(energyObject);
        }

        this.log('ZigBeeDevice has been initialized');

        // Create ZCLNode instance
        this.zclNode = new ZCLNode(this.node);

        // Legacy from homey-meshdriver
        this.onMeshInit();

        // TODO: new method in favor of onMeshInit
        this.onNodeInit({ zclNode: this.zclNode }); // TODO: should this also provide node?
      })
      .catch(err => {
        this.error(err);

        const unavailableMessage = __(err.message) || __('error.unknown');
        this.setUnavailable(unavailableMessage)
          .catch(unavailableErr => this.error('could not set device unavailable', unavailableErr));
      });
  }

  /**
   * Remove all listeners and intervals from node
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
  }

  /**
   * @private
   */
  _registerCapabilityGet(capabilityId, clusterId) {
    const capabilityGetObj = this._getCapabilityObj('get', capabilityId, clusterId);

    // get initial value on start if null, unless it's an offline battery device and the
    // getOnOnline flag is also set
    if (capabilityGetObj.opts.getOnStart
      && this.getCapabilityValue(capabilityId) === null
      && this.node.receiveWhenIdle === true) { // TODO: these properties are different
      this._getCapabilityValue(capabilityId, clusterId)
        .catch(err => {
          this.error(`could not get value for capability: ${capabilityId} on cluster: ${clusterId}`, err);
        });
    }

    if (capabilityGetObj.opts.getOnOnline) {
      this.node.on('endDeviceAnnounce', () => {
        this._debug(`Received end device announce indication, getting clusterId '${clusterId}' for capabilityId '${capabilityId}'`);
        this._getCapabilityValue(capabilityId, clusterId)
          .catch(err => {
            this.error(`could not get value for capability: ${capabilityId} on cluster: ${clusterId}`, err);
          });
      });
    }

    if (capabilityGetObj.opts.pollInterval) {
      let pollInterval;

      if (typeof capabilityGetObj.opts.pollInterval === 'number') {
        pollInterval = capabilityGetObj.opts.pollInterval;
      }

      if (typeof capabilityGetObj.opts.pollInterval === 'string') {
        pollInterval = this.getSetting(capabilityGetObj.opts.pollInterval);
        this._pollIntervalsKeys[capabilityGetObj.opts.pollInterval] = {
          capabilityId,
          clusterId,
        };
      }

      this._setPollInterval(capabilityId, clusterId, pollInterval);
    }
  }

  /**
   * @private
   */
  _setPollInterval(capabilityId, clusterId, pollInterval) {
    if (this._pollIntervals[capabilityId][clusterId]) {
      clearInterval(this._pollIntervals[capabilityId][clusterId]);
    }

    if (pollInterval < 1) return;

    this._pollIntervals[capabilityId][clusterId] = setInterval(() => {
      this._debug(`Polling clusterId '${clusterId}' for capabilityId '${capabilityId}'`);
      this._getCapabilityValue(capabilityId, clusterId);
    }, pollInterval);
  }

  /**
   * @private
   */
  async _getCapabilityValue(capabilityId, clusterId) {
    const capabilityGetObj = this._getCapabilityObj('get', capabilityId, clusterId);

    let parsedPayload = {};

    if (typeof capabilityGetObj.parser === 'function') {
      parsedPayload = await capabilityGetObj.parser.call(this);
      if (parsedPayload instanceof Error) {
        this.error(parsedPayload);
        return;
      }
    }

    // TODO: do read attributes
    // eslint-disable-next-line no-console
    console.log('_getCapabilityValue', capabilityId, clusterId, capabilityGetObj);
    // try {
    //   const cluster = capabilityGetObj.zclNode.endpoints[capabilityGetObj.endpoint]
    //   .clusters[capabilityGetObj.clusterId];
    //   return cluster.readAttributes(capabilityGetObj.commandId)
    //     .then(res => this._onReport(capabilityId, capabilityGetObj.clusterId, res))
    //     .catch(err => this.error(err));
    // } catch (err) {
    //   return this.error(err);
    // }
  }

  /**
   * @private
   */
  _registerCapabilitySet(capabilityId, clusterId) {
    const capabilitySetObj = this._getCapabilityObj('set', capabilityId, clusterId);
    this.registerCapabilityListener(capabilityId, async (value, opts) => {
      return this._registerCapabilityListenerHandler(capabilitySetObj, capabilityId, value, opts);
    });
  }

  /**
   * @param {object} capabilitiesOpts
   * @param {function} fn
   * @private
   */
  _registerCapabilitiesSet(capabilitiesOpts, fn) {
    // Register multiple capabilities with a debouncer
    this.registerMultipleCapabilityListener(
      capabilitiesOpts.map(x => x.capability),
      async (valueObj, optsObj) => {
        // Let the app try to handle the debounced capabilities updates
        const result = await fn(valueObj, optsObj);

        // If it did not handle it for some reason, return to the defaults
        if (!result || result instanceof Error) {
          // Loop all changed capabilities
          // eslint-disable-next-line no-restricted-syntax
          for (const capabilityId of Object.keys(valueObj)) {
            const capabilityObj = capabilitiesOpts.find(x => x.capability === capabilityId);
            const clusterId = capabilityObj.cluster;
            const value = valueObj[capabilityId];
            const opts = optsObj[capabilityId];

            // Try and get capability set object
            const capabilitySetObj = this._getCapabilityObj('set', capabilityId, clusterId);
            if (capabilitySetObj instanceof Error) {
              this.error(`capabilitySetObj ${capabilityId} ${clusterId} is error`, capabilitySetObj);
              break;
            }

            // Try to handle executing the capability change event
            try {
              await this._registerCapabilityListenerHandler(
                capabilitySetObj,
                capabilityId,
                value,
                opts,
              );
            } catch (err) {
              this.error('_registerCapabilityListenerHandler() -> failed', err);
              break;
            }
          }
        }
      }, CAPABILITIES_DEBOUNCE,
    );
  }

  /**
   * @param capabilitySetObj
   * @param capabilityId
   * @param value
   * @param opts
   * @returns {Promise.<*>}
   * @private
   */
  async _registerCapabilityListenerHandler(capabilitySetObj, capabilityId, value, opts) {
    this.log(`set ${capabilityId} -> ${value}`);
    if (typeof capabilitySetObj.parser !== 'function') throw new Error('parser_is_not_a_function');

    let { commandId } = capabilitySetObj;
    if (typeof capabilitySetObj.commandId === 'function') commandId = capabilitySetObj.commandId(value, opts);
    const parsedPayload = await capabilitySetObj.parser.call(this, value, opts);
    if (parsedPayload instanceof Error) throw parsedPayload;
    if (parsedPayload === null) {
      this._debug(`WARNING: got parsedPayload null from capability (${capabilityId}) set parser, ignoring set.`);
      return 'IGNORED';
    }

    try {
      const cluster = capabilitySetObj.zclNode.endpoints[capabilitySetObj.endpoint]
        .clusters[capabilitySetObj.clusterId];
      return cluster[commandId](parsedPayload) // TODO: this changed
        .catch(err => {
          // TODO: better error handling
          this.error(`Error: could not perform ${commandId} on ${capabilitySetObj.clusterId}`, err);
          throw new Error('error_reaching_device'); // TODO: i18n?
        });
    } catch (err) {
      return Promise.reject(err);
    }
  }

  /**
   * @param {CapabilityId} capabilityId
   * @param {ClusterId} clusterId
   * @param {ClusterCapabilityMapConfiguration} [userOpts]
   * @private
   */
  _mergeSystemAndUserOpts(capabilityId, clusterId, userOpts) {
    // Merge systemOpts & userOpts
    let systemOpts = {};
    try {
      // eslint-disable-next-line global-require,import/no-dynamic-require
      const systemCapability = require(`./system/capabilities/${capabilityId}/${clusterId}.js`);
      systemOpts = Homey.util.recursiveDeepCopy(systemCapability); // TODO: fix this

      // Bind correct scope
      // eslint-disable-next-line no-restricted-syntax
      for (const i in systemOpts) {
        if (Object.prototype.hasOwnProperty.call(systemOpts, i) && typeof systemOpts[i] === 'function') {
          systemOpts[i] = systemOpts[i].bind(this);
        }
      }
    } catch (err) {
      if (err.code !== 'MODULE_NOT_FOUND' || err.message.indexOf(`/system/capabilities/${capabilityId}/${clusterId}.js`) < 0) {
        process.nextTick(() => {
          throw err;
        });
      }
    }

    let _userOpts;
    // Insert default endpoint zero
    if (userOpts && !Object.prototype.hasOwnProperty.call(userOpts, 'endpoint')) {
      _userOpts = {
        ...userOpts,
        endpoint: this.getClusterEndpoint(clusterId),
      };
    } else if (typeof userOpts === 'undefined') _userOpts = { endpoint: this.getClusterEndpoint(clusterId) };

    this._capabilities[capabilityId][clusterId] = {

      ...systemOpts || {},
      ..._userOpts || {},
    };
  }

  /**
   * @private
   */
  async _onReport(capabilityId, clusterId, payload) {
    const capabilityReportObj = this._getCapabilityObj('report', capabilityId, clusterId);
    if (typeof capabilityReportObj.parser !== 'function') return null;

    const parsedPayload = await capabilityReportObj.parser.call(this, payload);
    if (parsedPayload instanceof Error) return null;
    if (parsedPayload === null) return null;

    this.setCapabilityValue(capabilityId, parsedPayload);

    return parsedPayload;
  }

  /**
   * @private
   */
  _getCapabilityObj(commandType, capabilityId, clusterId) {
    const capability = this._capabilities[capabilityId];
    let cluster;

    if (typeof clusterId !== 'undefined') {
      cluster = capability[clusterId];
    } else {
      throw new Error('missing_zigbee_cluster_id');
    }

    if (typeof cluster === 'undefined') throw new Error('missing_zigbee_capability');
    const commandId = cluster[commandType];
    const parser = cluster[`${commandType}Parser`] || null;
    const opts = cluster[`${commandType}Opts`] || {};
    const { zclNode } = this;

    if (typeof commandId === 'string' || typeof commandId === 'function') {
      return {
        clusterId,
        commandId,
        endpoint: cluster.endpoint,
        parser,
        opts,
        zclNode,
      };
    }

    throw new Error(`capability_${commandType}_is_not_a_function_or_string`);
  }

  /**
   * Start report configuring process, if there are more than one configurations required
   * perform them one after another.
   * @todo rewrite this
   * @returns {Promise}
   * @private
   */
  // eslint-disable-next-line consistent-return
  async _configureReport() {
    // Mark configuring true
    this.configureReportInProcess = true;

    // Get next configure obj in queue
    const configureReportObj = this._configureReportRequests.shift();

    try {
      // TODO: changed?
      // TODO: allow configure reporting for multiple attributes at once?
      await this.zclNode.endpoints[configureReportObj.endpointId]
        .clusters[configureReportObj.clusterId]
        .configureReporting({
          [configureReportObj.attrId]: {
            minInterval: configureReportObj.minInt,
            maxInterval: configureReportObj.maxInt,
            minChange: configureReportObj.repChange,
          },
        });
      // .report(
      // configureReportObj.attrId,
      // configureReportObj.minInt,
      // configureReportObj.maxInt,
      // configureReportObj.repChange
      // );

      this.log(`registerAttrReportListener() -> configured attr reporting ${configureReportObj.reportId}`);

      // Store configuration succeeded
      this.setStoreValue(configureReportObj.reportId, {
        minInt: configureReportObj.minInt,
        maxInt: configureReportObj.maxInt,
        repChange: configureReportObj.repChange,
      });

      if (configureReportObj.promise) configureReportObj.promise.resolve();
    } catch (err) {
      this.error(`registerAttrReportListener() -> error could not configure ${configureReportObj.reportId}`, err);
      if (configureReportObj.promise) configureReportObj.promise.reject(err);
    }

    // If queue not empty continue, else mark as done
    if (this._configureReportRequests.length > 0) return this._configureReport();
    this.configureReportInProcess = false;
  }

  // TODO: doc
  onEndDeviceAnnounce() {
    // TODO: override
  }

  /**
   * Debug logging method. Will only log to stdout if enabled via {@link enableDebug}.
   * @param args
   * @private
   */
  _debug(...args) {
    if (this._debugEnabled) {
      this.log.bind(this, '[dbg]').apply(this, args);
    }
  }

}

module.exports = ZigBeeDevice;
