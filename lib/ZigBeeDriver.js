'use strict';

const events = require('events');
const fs = require('fs');

const nodeEvents = ['online', 'report'];

class ZigBeeDriver extends events.EventEmitter {
    constructor(driverId, options) {
        super();

        // Get driver specification as defined in app.json
        this.driverId = driverId;
        this.driver = findWhere(Homey.manifest.drivers, {id: driverId});
        console.log(this.driver);
        // set debug to true when debug is found in driver directory
        if (fs.existsSync('/drivers/' + driverId + '/debug')) {
            options.debug = true;
        }

        // Override default options with provided options object
        this.options = Object.assign({
            debug: false,
            beforeInit: false,
            capabilities: {},
        }, options);

        this.nodes = {};

        // Exports default driver functions
        this.init = this.init.bind(this);
        this.added = this.added.bind(this);
        this.deleted = this.deleted.bind(this);
        this.settings = this.settings.bind(this);

        this.capabilities = {};
        this.pollIntervals = {};

        // register unload cb
        if (Homey && Homey.on) {
            Homey.on('unload', this._onUnload.bind(this));
        }

        // bind set and get functions

        // Loop over all capabilities specified in app.json
        this.driver.capabilities.forEach(capabilityId => {
            if (typeof this.options.capabilities[capabilityId] === 'undefined') {
                throw new Error(`missing_options_capability: ${capabilityId}`);
            }

            // Create capability object
            this.capabilities[capabilityId] = {};

            // Define get function for capability
            this.capabilities[capabilityId].get = (deviceData, callback) => {
                this._debug('get', capabilityId);

                // Get node from stored nodes array
                const node = this.getNode(deviceData);
                if (node instanceof Error) return callback(node);

                // Get value from node state object
                let value = node.state[capabilityId];
                if (value instanceof Error) return callback(value);
                if (typeof value === 'undefined') value = null;
                return callback(null, value);
            };

            // Define set function for capability
            this.capabilities[capabilityId].set = (deviceData, value, callback) => {
                this._debug('set', capabilityId, value);

                // Get capability spec from driver.js and check if it is provided
                let optionsCapability = this.options.capabilities[capabilityId];
                if (typeof optionsCapability === 'undefined') {
                    return callback(new Error(`missing_options_capability: ${capabilityId}`));
                }

                // Force into array
                if (!Array.isArray(optionsCapability)) optionsCapability = [optionsCapability];

                // Get node from stored nodes array
                const node = this.getNode(deviceData);
                if (node instanceof Error) return callback(node);

                // Loop over nested capability definition
                optionsCapability.forEach(optionsCapabilityItem => {
                    let instance = node.instance;

                    // Abort if no command set parser is provided
                    if (typeof optionsCapabilityItem.command_set_parser !== 'function') return;

                    // Use the command set parser to parse the value into the correct format
                    const args = optionsCapabilityItem.command_set_parser(value, node);

                    //If command_set is an object, the command is the matching value
                    let command = optionsCapabilityItem.command_set;
                    if (typeof command === "undefined")return;
                    else if (typeof command === "function") command = command(value, node);

                    this._debug(`set ${optionsCapabilityItem.command_endpoint}:${optionsCapabilityItem.command_cluster}
					->${command}`, 'args:', args);

                    if (typeof instance.endpoints[optionsCapabilityItem.command_endpoint] === "undefined" ||
                        typeof instance.endpoints[optionsCapabilityItem.command_endpoint][optionsCapabilityItem.command_cluster] === "undefined") {
                        //node was not initialsed right
                        this._debug('Node was not initialsed right');
                        let err = new Error('ZigBee Error');
                        this.setUnavailable(deviceData, err);
                        return callback(err);
                    }

                    // Perform the command set on the node
                    instance.endpoints[optionsCapabilityItem.command_endpoint][optionsCapabilityItem.command_cluster].do(command, args, (err, rsp) => {
                        if (typeof rsp === "undefined" || typeof rsp.statusCode === "undefined" || rsp.statusCode !== 0) {
                            err = new Error('Could not set property ' + err.toString() || rsp.statusCode);
                        }
                        if (err) {
                            this._debug(err);
                            return callback(err);
                        }

                        node.state[capabilityId] = value;

                        this.realtime(deviceData, capabilityId, value);

                        return callback(null, node.state[capabilityId]);
                    });
                });
            };
        });
    }

    /**
     * Method that will be called on driver
     * initialisation.
     * @param devicesData
     * @param callback
     * @returns {*}
     */
    init(devicesData, callback) {
        if (devicesData.length < 1) return callback(null, true);

        console.log(devicesData);

        let done = 0;

        // Loop over all installed devices
        devicesData.forEach((deviceData) => {

            // Initialize the nodes
            this.initNode(deviceData, () => {
                if (++done === devicesData.length) return callback(null, true);
            });
        });
    }

    /**
     * Method that will be called when a user
     * adds a device/node.
     * @param deviceData
     * @param callback
     * @returns {*}
     */
    added(deviceData, callback) {
        callback = callback || function () {
            };

        this.initNode(deviceData);
        return callback(null, true);
    }

    /**
     * Method that will be called when a user
     * deletes a device/node.
     * @param deviceData
     * @param callback
     */
    deleted(deviceData, callback) {
        callback = callback || function () {
            };

        this.deleteNode(deviceData);
        return callback(null, true);
    }

    /**
     * Method that will be called when a user
     * edits the device settings of a node.
     * @param deviceData
     * @param newSettingsObj
     * @param oldSettingsObj
     * @param changedKeysArr
     * @param callback
     * @returns {*}
     */
    settings(deviceData, newSettingsObj, oldSettingsObj, changedKeysArr, callback) {
        this._debug('settings()', 'newSettingsObj', newSettingsObj, 'oldSettingsObj', oldSettingsObj,
            'changedKeysArr', changedKeysArr);

        // Get node from stored nodes array
        const node = this.getNode(deviceData);
        if (node instanceof Error) return callback(node);

        // Loop over all changed values
        changedKeysArr.forEach((changedKey) => {
            // Store changed setting in node object
            node.settings[changedKey] = newSettingsObj[changedKey];
        });

        return callback(null, true);
    }

    /**
     * Initializes a device/node, asks z-wave chip
     * to find a node, and if found to provide
     * the necessary information to (re-) initialize
     * it.
     * @param deviceData
     * @param callback
     */
    initNode(deviceData, callback) {
        callback = callback || function () {
            };

        if (!(deviceData && deviceData.token)) return new Error('invalid_device_data');

        // Find zigbee node on network
        Homey.wireless('zigbee').getNode(deviceData, (err, zigbeeNode) => {
            if (err) {
                this.setUnavailable(deviceData, err);
                return callback(err);
            }

            this.setAvailable(deviceData);

            // Create new object in nodes array
            this.nodes[deviceData.token] = {
                instance: zigbeeNode,
                device_data: deviceData,
                randomId: Math.random().toString(),
                state: {},
                settings: {},
                pollIntervals: {},
                setPollIntervals: {}
            };

            // get older state
            let state = Homey.manager('settings').get(`zigbeedriver_${this.driverId}_${deviceData.token}_state`)
            if (state) {
                let when = new Date(state.when);
                if (((new Date) - when) < SAVED_STATE_TIMEOUT) {
                    this._debug(deviceData.token, 'Found saved state', state);
                    this.nodes[deviceData.token].state = state.state;
                }

                Homey.manager('settings').unset(`zigbeedriver_${this.driverId}_${deviceData.token}_state`);

            }

            nodeEvents.forEach((nodeEvent) => {
                zigbeeNode.on(nodeEvent, function () {
                    const args = Array.prototype.slice.call(arguments);
                    args.unshift(deviceData);
                    args.unshift(nodeEvent);
                    this.emit.apply(this, args);
                }.bind(this))
            });

            // Register eventListeners if debug
            if (this.options.debug === true) {

                this._debug('------------------------------------------');

                // log the entire Node
                this._debug('Node:', zigbeeNode.ieeeAddr);

                Object.keys(zigbeeNode.endpoints).forEach(endpointId => {
                    this._debug('- Endpoint:', endpointId);
                    this._debug('-- Clusters:');

                    Object.keys(zigbeeNode.endpoints[endpointId]).forEach(key => {
                        if (zigbeeNode.endpoints[endpointId][key] == null) return;
                        this._debug('---', key);
                        Object.keys(zigbeeNode.endpoints[endpointId][key].attrs).forEach(attr => {
                            this._debug('----', attr, ': ', zigbeeNode.endpoints[endpointId][key].attrs[attr])
                        })
                    });
                });

                this._debug('------------------------------------------');
                this._debug('');

                // attach event listeners
                nodeEvents.forEach((nodeEvent) => {
                    zigbeeNode.on(nodeEvent, function () {
                        this._debug(`node.on('${nodeEvent}')`, 'arguments:', arguments);
                    }.bind(this));
                });
            }

            // Register capabilities
            this.driver.capabilities.forEach(capabilityId => {

                // Get capability from options object (driver.js)
                let optionsCapability = this.options.capabilities[capabilityId];
                if (typeof optionsCapability === 'undefined') throw new Error(`missing_options_capability: ${capabilityId}`);

                // Force into array
                if (!Array.isArray(optionsCapability)) optionsCapability = [optionsCapability];

                // Get node from stored nodes array
                let node = this.getNode(deviceData);
                if (node instanceof Error) throw node;

                // Loop over potentially nested capability options object
                optionsCapability.forEach((optionsCapabilityItem) => {
                    let instance = node.instance;

                    if (typeof instance.endpoints[optionsCapabilityItem.command_endpoint] === 'undefined') {

                        // If capability was not defined as optional abort
                        if (!optionsCapabilityItem.optional) {
                            return this.setUnavailable(deviceData, `invalid_cluster_${optionsCapabilityItem.command_cluster}`);
                        } else {
                            // Capability was defined as optional and is therefore ignored
                            return this._debug(`optional_cluster_${optionsCapabilityItem.command_cluster} is currently not supported by node`);
                        }
                    }

                    // Check if command class exists on node, necessary because of variable command classes
                    if (instance.endpoints[optionsCapabilityItem.command_endpoint]) {

                        instance.on('report', (value, endpoint, cluster, attr) => {

                            if (cluster == optionsCapabilityItem.command_cluster &&
                                attr == optionsCapabilityItem.command_report) {

                                // Parse value
                                value = optionsCapabilityItem.command_report_parser(value, node);

                                // Abort
                                if (value === null) return;

                                // Update value in node state object
                                this.nodes[deviceData.token].state[capabilityId] = value;

                                if (value instanceof Error) return value;

                                // Emit realtime event
                                this.realtime(deviceData, capabilityId, value);

                            }
                        });
                    }
                    // If command get is specified and cc is supported by node, perform it
                    if (optionsCapabilityItem.command_get && instance.endpoints[optionsCapabilityItem.command_endpoint] && instance.endpoints[optionsCapabilityItem.command_endpoint][optionsCapabilityItem.command_cluster]) {


                        var get = function () {


                            let args = {};

                            // Use parser if provided
                            if (optionsCapabilityItem.command_get_parser) {
                                args = optionsCapabilityItem.command_get_parser();
                            }

                            // Check if node supports this command class
                            if (!instance.endpoints[optionsCapabilityItem.command_endpoint]) {
                                return console.error(`invalid_endpoint_${optionsCapabilityItem.command_endpoint}`);
                            }

                            // Check if node supports command get for this command class
                            if (!instance.endpoints[optionsCapabilityItem.command_endpoint][optionsCapabilityItem.command_cluster]) {
                                return console.error(`invalid_endpoint_${optionsCapabilityItem.command_endpoint}
								_cluster_${optionsCapabilityItem.command_cluster}`);
                            }

                            let cb = false;

                            // Check if callback is not disabled
                            if (optionsCapabilityItem.command_get_cb !== false) {
                                cb = (err, result) => {

                                    this._debug('get', optionsCapabilityItem.command_endpoint, optionsCapabilityItem.command_cluster,
                                        optionsCapabilityItem.command_get, 'args:', args, 'err:', err, 'result:', result);

                                    if (err) return; // this.setUnavailable( device_data, err.message || err.toString() );

                                    if (typeof optionsCapabilityItem.command_report_parser !== 'function') return;

                                    // Parse value using command report parser
                                    const value = optionsCapabilityItem.command_report_parser(result, node);
                                    if (value instanceof Error) return value;
                                    if (value === null) return;

                                    // Check if new value is different from old value
                                    const oldValue = this.nodes[deviceData.token].state[capabilityId];
                                    if (oldValue !== value) {
                                        this.nodes[deviceData.token].state[capabilityId] = value;
                                        this.realtime(deviceData, capabilityId, value);
                                    }
                                };
                            }

                            this._debug(`get ${optionsCapabilityItem.command_endpoint}->${optionsCapabilityItem.command_cluster}->${optionsCapabilityItem.command_get}`, 'args:', args, 'cb:', cb !== false);

                            // Call command get on node instance (with or without cb)
                            instance.endpoints[optionsCapabilityItem.command_endpoint][optionsCapabilityItem.command_cluster].read(optionsCapabilityItem.command_get, cb);
                        };

                        // // Define a setPollIntervals function for this capability
                        this.nodes[deviceData.token].setPollIntervals[capabilityId] = pollInterval => {

                            // If it is already set, clear it first
                            if (this.nodes[deviceData.token].pollIntervals[capabilityId]) {
                                clearInterval(this.nodes[deviceData.token].pollIntervals[capabilityId]);
                            }

                            // Do not poll if value is set to zero
                            if (pollInterval === 0) return;

                            // Create a new (poll) interval
                            this.nodes[deviceData.token].pollIntervals[capabilityId] = setInterval(() => {
                                this._debug('polling', capabilityId);
                                get.call(this);
                            }, pollInterval);
                        };

                        // Call the get defined above
                        get.call(this);

                        // If getOnWakeUp is set in driver.js
                        if (optionsCapabilityItem.getOnWakeUp) {
                            zigbeeNode.on('online', online => {
                                if (online) get.call(this);
                            });
                        }

                        // If pollInterval is set in driver.js
                        if (optionsCapabilityItem.pollInterval) {

                            // And it is a number
                            if (typeof optionsCapabilityItem.pollInterval === 'number') {

                                // Initiate poll interval
                                this.nodes[deviceData.token].setPollIntervals[capabilityId].call(this,
                                    optionsCapabilityItem.pollInterval);

                            } else if (optionsCapabilityItem.pollInterval.startsWith('poll_interval')) {

                                // Get poll interval value from settings
                                this.getSettings(deviceData, (err, settings) => {
                                    if (err) return console.error(err);

                                    // Initiate poll interval
                                    if (typeof settings[optionsCapabilityItem.pollInterval] === 'number') {
                                        this.nodes[deviceData.token].setPollIntervals[capabilityId].call(this,
                                            settings[optionsCapabilityItem.pollInterval] * 1000);
                                    }
                                });
                            } else {
                                this._debug('invalid pollInterval type, expected number or string');
                            }
                        }
                    } else {
                        this._debug('Device does not have', optionsCapabilityItem.command_endpoint, optionsCapabilityItem.command_cluster, optionsCapabilityItem.command_get);
                    }

                    // If report is specified and cc is supported by node, perform it
                    if (optionsCapabilityItem.command_report && instance.endpoints[optionsCapabilityItem.command_endpoint] && instance.endpoints[optionsCapabilityItem.command_endpoint][optionsCapabilityItem.command_cluster]) {

                        var report = function () {

                            let args = {};

                            // Check if node supports this command class
                            if (!instance.endpoints[optionsCapabilityItem.command_endpoint]) {
                                return console.error(`invalid_endpoint_${optionsCapabilityItem.command_endpoint}`);
                            }

                            // Check if node supports command report for this command class
                            if (!instance.endpoints[optionsCapabilityItem.command_endpoint][optionsCapabilityItem.command_cluster]) {
                                return console.error(`invalid_endpoint_${optionsCapabilityItem.command_endpoint}
								_cluster_${optionsCapabilityItem.command_cluster}`);
                            }

                            let minTime = optionsCapabilityItem.command_report_min ? optionsCapabilityItem.command_report_max : 3;
                            let maxTime = optionsCapabilityItem.command_report_max ? optionsCapabilityItem.command_report_max : 600;
                            let reqChange = optionsCapabilityItem.command_report_change ? optionsCapabilityItem.command_report_change : 5;

                            let cb = false;

                            this._debug(`register report ${optionsCapabilityItem.command_endpoint}->${optionsCapabilityItem.command_cluster}->${optionsCapabilityItem.command_report}`);

                            // Call command get on node instance (with or without cb)
                            instance.endpoints[optionsCapabilityItem.command_endpoint][optionsCapabilityItem.command_cluster].report(optionsCapabilityItem.command_report, minTime, maxTime, reqChange, (err, rsp) => {
                                if (err || typeof rsp.statusCode === "undefined" || rsp.statusCode != 0) this._debug('Something went wrong registering reporting', err ? err : '');
                            });
                        };
                        // Call the get defined above
                        report.call(this);
                    }
                });
            });

            // Store settings in node object
            this.getSettings(deviceData, (err, settings) => {
                if (err) return console.error(err);
                if (settings) {
                    for (let i in settings) {
                        this.nodes[deviceData.token].settings[i] = settings[i];
                    }
                }
            });

            // Check if beforeInit is specified and a function
            if (this.options.hasOwnProperty('beforeInit') && typeof this.options.beforeInit === 'function') {
                this.options.beforeInit(deviceData.token, () => {

                    // Emit initialisation of node is done
                    this.emit('initNode', deviceData.token);

                    return callback(null, zigbeeNode);
                });
            } else {

                // Emit initialisation of node is done
                this.emit('initNode', deviceData.token);

                return callback(null, zigbeeNode);
            }
        });
    }

    /**
     * Method called when a user
     * deletes a device/node from Homey.
     * @param deviceData
     * @returns {Error}
     */
    deleteNode(deviceData) {
        if (!(deviceData && deviceData.token)) return new Error('invalid_device_data');

        const node = this.getNode(deviceData);
        if (node instanceof Error) return node;

        // Remove listeners on reports
        this.nodes[deviceData.token].instance.removeAllListeners('report');

        // Emit that devices has been deleted
        this.emit('deleteNode', deviceData.token);

        // Remove it from the nodes list
        delete this.nodes[deviceData.token];
    }

    /**
     * Returns node from internal nodes list.
     * @param deviceData
     * @returns {*}
     */
    getNode(deviceData) {

        if (!(deviceData && deviceData.token)) return new Error('invalid_device_data');

        return this.nodes[deviceData.token] || new Error('invalid_node');
    }

    /**
     * Debug method that will enable logging when
     * debug: true is provided in the main options
     * object.
     * @private
     */
    _debug() {
        if (this.options.debug) {
            const args = Array.prototype.slice.call(arguments);
            args.unshift('[debug]');
            console.log.apply(null, args);
        }
    }

    /**
     * Fired when the app unloads
     * to save all battery data
     * @private
     */
    _onUnload() {

        for (let nodeId in this.nodes) {
            let node = this.nodes[nodeId];
            if (node.instance.battery !== true) continue;

            Homey.manager('settings').set(`zigbeedriver_${this.driverId}_${nodeId}_state`, {
                state: node.state,
                when: new Date()
            });

        }

    }
}

/**
 * Plain js implementation of underscore's findWhere.
 * @param array
 * @param criteria
 * @returns {*}
 */
function findWhere(array, criteria) {
    return array.find(item => Object.keys(criteria).every(key => item[key] === criteria[key]));
}

module.exports = ZigBeeDriver;