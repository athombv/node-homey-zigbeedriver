'use strict';

// eslint-disable-next-line node/no-unpublished-require
const Homey = require('homey');
const { debug } = require('zigbee-clusters');

const color = require('./color');

/**
 * Allows accessing an object by a nested string path.
 * @param object
 * @param path
 * @returns {*}
 * @private
 *
 * @example
 * const foo = {bar: { foobar: '123'} };
 * resolveKeyPath(foo, 'bar.foobar'); // returns '123'
 */
function resolveKeyPath(object = {}, path = '') {
  return path
    .split('.')
    .reduce((o, p) => (o ? o[p] : null), object);
}

/**
 * Map a range of values to a new range.
 * @param {number} originalRangeStart
 * @param {number} originalRangeEnd
 * @param {number} newRangeStart
 * @param {number} newRangeEnd
 * @param {number} value
 * @returns {number} - Value mapped from original range to new range.
 * @memberof Util
 */
function mapValueRange(originalRangeStart, originalRangeEnd, newRangeStart, newRangeEnd, value) {
  if (typeof originalRangeStart !== 'number') throw new TypeError('expected_original_range_start_number');
  if (typeof originalRangeEnd !== 'number') throw new TypeError('expected_original_range_end_number');
  if (typeof newRangeStart !== 'number') throw new TypeError('expected_new_range_start_number');
  if (typeof newRangeEnd !== 'number') throw new TypeError('expected_new_range_end_number');
  if (typeof value !== 'number') throw new TypeError('expected_value_number');

  return newRangeStart + ((newRangeEnd - newRangeStart) / (originalRangeEnd - originalRangeStart))
    * (Math.min(Math.max(originalRangeStart, value), originalRangeEnd) - originalRangeStart);
}

/**
 * Calculate a transitionTime value for Zigbee clusters, it takes one parameter: the `opts`
 * object provided by a {@link Homey.Device.registerCapabilityListener} which can hold a `duration`
 * property (in milliseconds).
 * @param [opts] {object}
 * @param [opts.duration] {number} - Duration property in milliseconds (preferred over
 * 'transition_time')
 * @returns {number} transitionTime - Transition time (0 - 6553)
 * @memberof Util
 */
function calculateDimDuration(opts = {}) {
  let transitionTime = 0;
  if (typeof opts.duration === 'number') {
    transitionTime = opts.duration / 100;
  }
  // Cap the range between 0 and 6553
  return Math.max(Math.min(transitionTime, 6553), 0);
}

/**
 * @deprecated since v1.0.0 - Use {@link calculateDimDuration} instead.
 * @param opts {object}
 * @param opts.duration {number} - Duration property in milliseconds (preferred over
 * 'transition_time')
 * @param settings {object}
 * @param settings.transition_time {number} - Transition time property in seconds
 * @returns {number}
 * @memberof Util
 * @private
 */
function calculateZigBeeDimDuration(opts = {}, settings = {}) {
  return calculateDimDuration(opts);
}

let localeFile;

/**
 * Method that loads a specific locale file based on provided `language`.
 * @param {string} [language=Homey.ManagerI18n.getLanguage()]
 * @private
 */
function loadLocales(language = Homey.ManagerI18n.getLanguage()) {
  try {
    // eslint-disable-next-line import/no-dynamic-require,global-require
    localeFile = require(`../../locales/${language}.json`);
  } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND') {
      // eslint-disable-next-line no-console
      console.error(`Accessing non-existent locales file ../../locales/${language}.json`);
    } else {
      throw err;
    }
  }
}

/**
 * Method that returns a translated string for a given key.
 * @param {string} localeKey - e.g. 'errors.unknown'
 * @returns {string}
 * @private
 * @memberof Util
 *
 * @example
 * <caption>./driver/my_driver/device.js</caption>
 * const { __ } = require('homey-zigbeedriver');
 * throw new Error(__('errors.unknown'));
 *
 * @example
 * <caption>./locales/en.json</caption>
 * {
 *   "errors": {
 *     "unknown": "An unknown error occurred"
 *   }
 * }
 */
function __(localeKey) {
  if (typeof localeKey !== 'string') throw TypeError('expected_locale_key_string');

  // Load locale file if not yet loaded
  if (!localeFile) loadLocales();

  // Fallback to english
  if (!localeFile) loadLocales('en');

  // Return translated string if found
  const localeValue = resolveKeyPath(localeFile, localeKey);
  if (localeFile && typeof localeValue === 'string') return localeValue;

  // Else return the given locale key
  return localeKey;
}

/**
 * Method that asserts a given cluster specification.
 * @param {ClusterSpecification} cluster
 * @private
 */
function assertClusterSpecification(cluster) {
  if (typeof cluster.ID !== 'number') throw new TypeError('expected_cluster_id_number');
  if (typeof cluster.NAME !== 'string') throw new TypeError('expected_cluster_name_string');
}

/**
 * Method that asserts a given `capabilityId`.
 * @param {CapabilityId} capabilityId
 * @param {function} hasCapability - Function that should return true when the {@link Homey.Device}
 * instance has the specified capability (e.g. {@link Homey.Device#hasCapability()}.
 * @private
 */
function assertCapabilityId(capabilityId, hasCapability) {
  if (typeof capabilityId !== 'string') throw new TypeError('expected_capability_id_string');
  if (typeof hasCapability === 'function' && hasCapability(capabilityId) === false) {
    throw new Error('capability_id_not_available_on_device');
  }
}

/**
 * Method that asserts if a zclNode is properly initialized.
 * @param {ZCLNode} zclNode
 * @param {EndpointId} [endpointId]
 * @param {ClusterSpecification} [cluster]
 * @private
 */
function assertZCLNode(zclNode, endpointId, cluster) {
  if (cluster) assertClusterSpecification(cluster);
  if (!zclNode) throw new Error('missing_zcl_node_instance');
  if (typeof endpointId === 'number' && !zclNode.endpoints[endpointId]) {
    throw new Error('missing_endpoint_on_zcl_node');
  }
  if (typeof endpointId === 'number' && !zclNode.endpoints[endpointId].clusters[cluster.NAME]) {
    throw new Error('missing_cluster_on_endpoint_on_zcl_node');
  }
}

/**
 * Plain JS implementation of debounce, returns a function which will be debounced when called.
 * @param {function} fn - Function to debounce
 * @param {number} interval - Time in ms the function will be debounced.
 * @param {boolean} [immediate=false] - If true then leading debounce, false then trailing debounce.
 * @returns {Function} - Debounced function
 * @memberof Util
 */
function debounce(fn, interval, immediate = false) {
  if (typeof fn !== 'function') throw new TypeError('expected_fn_function');
  if (typeof interval !== 'number') throw new TypeError('expected_interval_number');
  if (typeof immediate !== 'boolean') throw new TypeError('expected_immediate_boolean');

  let timeout;
  return function debounced(...args) {
    const context = this;

    // Create function to execute after debounce interval has expired
    const later = function later() {
      timeout = null;

      // Do not trigger immediately (trailing debounce)
      if (!immediate) fn.apply(context, ...args);
    };

    // Trigger immediately (leading debounce)
    const callNow = immediate && !timeout;
    clearTimeout(timeout);
    timeout = setTimeout(later, interval);
    if (callNow) fn.apply(context, ...args);
  };
}

/**
 * Plain JS implementation of throttle, returns a function that will be throttled when called.
 * @param {function} fn - Function to throttle.
 * @param {number} interval - Time to wait in ms.
 * @returns {Function} - Throttled function
 * @memberof Util
 */
function throttle(fn, interval) {
  if (typeof fn !== 'function') throw new TypeError('expected_fn_function');
  if (typeof interval !== 'number') throw new TypeError('expected_interval_number');

  let time = Date.now();
  return function throttled() {
    if ((time + interval - Date.now()) < 0) {
      fn();
      time = Date.now();
    }
  };
}

/**
 * Async version of `setTimeout`.
 * @param {number} timeout - milliseconds
 * @returns {Promise<unknown>}
 * @memberof Util
 */
async function wait(timeout) {
  if (typeof timeout !== 'number') throw new TypeError('expected_timeout_number');
  return new Promise(resolve => setTimeout(resolve, timeout));
}

/**
 * Method that applies a retry strategy to the provided async function. By default the async
 * function will be retried directly, override 'interval' for a different strategy.
 * @param {AsyncFunction} method - Method to execute and retry when failed
 * @param {Number} [times=1] - Number of times the `method` will be retried after failure.
 * @param {number|function} [interval=0] - Function (dynamic retry interval) or Number
 * (static retry interval).
 * @returns {Promise<unknown>}
 * @memberof Util
 */
function wrapAsyncWithRetry(
  method,
  times = 1,
  interval = 0,
) {
  if (typeof method !== 'function') throw TypeError('expected_function');
  if (typeof times !== 'number') throw TypeError('expected_times_number');
  if (typeof interval !== 'number' && typeof interval !== 'function') {
    throw TypeError('expected_interval_number_or_function');
  }
  return new Promise((resolve, reject) => {
    let retries = 0;

    // Create function which executes the provided method and resolves the promise if success,
    // if failure it will wait for the provided interval and then execute the method again.
    function executeMethod() {
      method()
        .then(resolve)
        .catch(err => {
          if (times > retries) {
            retries += 1;

            // Determine time to wait
            const waitTime = typeof interval === 'function' ? interval(retries) : interval;
            return wait(waitTime).then(executeMethod);
          }
          return reject(err);
        });
    }

    // Start the execution
    executeMethod();
  });
}

/**
 * Enables or disables debug logging in the [`zigbee-clusters`](https://github.com/athombv/node-zigbee-clusters) module.
 * @param {boolean} flag - Set to true to enable logging
 * @param {string} namespaces - As specified by `debug` npm module (e.g.
 * `zigbee-clusters:bound-cluster:*`).
 * @memberof Util
 *
 * @example
 *
 * const { Util } = require('homey-zigbeedriver');
 * Util.debugZigbeeClusters(true);
 */
function debugZigbeeClusters(...args) {
  return debug(...args);
}

/**
 * Utility class with several color and range conversion methods.
 * @class Util
 */
module.exports = {
  ...color,
  mapValueRange,
  calculateDimDuration,
  calculateZigBeeDimDuration,
  __,
  assertClusterSpecification,
  assertCapabilityId,
  assertZCLNode,
  wrapAsyncWithRetry,
  wait,
  debounce,
  throttle,
  debugZigbeeClusters,
};
