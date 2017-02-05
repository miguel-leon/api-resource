/**
 * @author Miguel Leon
 * @file
 * REST resources access library
 * =============================
 * A factory which creates a Resource object that can interact in a higher level of abstraction with
 * REST apis that are not straight forward to call because of complex logic, intricate url schemes or
 * extensive use of query params.
 * Supports interceptors affecting only these requests instead of every one.
 */
(function (angular, undefined) {
	'use strict';

	var isUndefined = angular.isUndefined,
	    isDefined   = angular.isDefined,
	    isObject    = angular.isObject,
	    isArray     = angular.isArray,
	    isFunction  = angular.isFunction,
	    isString    = angular.isString,
	    extend      = angular.extend,
	    forEach     = angular.forEach;

	/**
	 * @typedef {Object} HttpInterceptor - see $http documentation
	 * @see https://docs.angularjs.org/api/ng/service/$http
	 */
	/**
	 * @ngdoc provider
	 * @name apiResourceProvider
	 * @kind namespace
	 * @property {string}                  baseUrl         - base url for all resource calls.
	 * @property {Object.<Action>}         actionsDefaults - map of default definitions for actions.
	 *     e.g. `{save: {method: 'post'}, query: {method: 'get', isArray: true}}`
	 * @property {Array.<HttpInterceptor>} interceptors - use method
	 * [`pushInterceptor()`]{@link apiResourceProvider#pushInterceptor}
	 * to push interceptors to the array `interceptors`
	 */
	/**
	 * @ngdoc service
	 * @name apiResource
	 * @function apiResource
	 * @param {string}          route          - url A parameterized URL template with parameters prefixed by `:`
	 *     as in `/user/:username`. Appended to `baseUrl`
	 * @param {Object<Action>} actions        - map of available actions for the resource with its definition.
	 * @param {Object}          resourceConfig - http default config for the resource. see $http documentation.
	 *     Additionally it can contain an attribute `{number} interceptorLimit` which delimits the number of
	 *      interceptors applied from the interceptors array.
	 * @returns {Resource.constructor}
	 *     The class Resource generated will have a class method for each action defined.
	 *     These methods will send the first argument as request body if needed.
	 *     This methods return an instance of the class, or an array of instances if `isArray` is true for the action.
	 *     The instances of this class will have a method `$_action_` for each non `isArray` action. These methods
	 *      will return the promise of the request directly instead of the resource.
	 *     The class methods for non `isArray` actions will have a sub-method `each` that can be call with an array
	 *      to make a call to the action with each element of the array and return an array of instances.
	 *     The resource instance may encapsulate primitive data or even arrays if `isArray` is not true.
	 *     The promise of the request will have the same result as argument unless `ignoreResponse` is defined
	 *      for the action.
	 * @example var MyResource = apiResource('api/my/route', {get: myActionDefinition});
	 */
	/**
	 * @typedef {Object} Action
	 * @property {string}        method         - the http method. If missing, it falls to the defined for this action in
	 *      actionsDefaults, or it falls again to be the same as the action name.
	 *     Useful for when the action is called get or delete.
	 * @property {string}        subRoute       - final part of the url needed for intricate url schemes with
	 *      multiple routes for the same resource.
	 * @property {boolean}       isArray        - set true if the expected return data for the action is an array.
	 *     This array will also contain the property `$promise`.
	 *     Each item in the array will be a resource instance.
	 *     The action will throw an error if the data to be send or the data received is not an array.
	 * @property {boolean}       ignoreResponse - set true if the response data is to be ignore in requests
	 *      with body. The argument for the promise will be the raw data.
	 * @property {Object|string} params         - map with values to be captured for the url params
	 *      from the action arguments. Each value can be a function, the value itself if constant, or a string mapper.
	 *    The possible values for the string are:
	 *    - `'='`: the value is mapped to the same key of an object in the data of the action.
	 *    - `'@_number_'`: the value is mapped to the argument number specified.
	 *    - `'@_key_[._key_[...]]'`: the value is mapped to the dotted path specified of an object in the first argument of the action.
	 *
	 * The property params itself can be a string that gets mapped in the same way as above.
	 *     e.g. `{myId: '='}` o `{myId: '@myId'}` -> `myId = arguments[0].myId`
	 * @property {Object|string} queryParams    - map with values to be captured for the request query params
	 *      from the action arguments.
	 *     The property is mapped in the same manner as `params`.
	 * @property {boolean}       hasData        - set to true when the action doesn't have a body, but the resource
	 *      needs to be initialized with the first argument as though it were the body of the request.
	 * @property {Function}      postProcess    - single interceptor like function that post process the resource as
	 *      the last part of the promise chain, before extending the object with the retrieved data.
	 *     The function must return the post processed resource.
	 * @property {boolean} skipOnMissingParams  - skip http call is there are missing parameters.
	 */
	angular.module('api-resource', []).provider('apiResource',
	function () {
		var baseUrl = '';
		/**
		 * Getter/Setter. Configure base url to be used for requests.
		 * @method apiResourceProvider#baseUrl
		 * @param {string} [url]
		 * @returns {string|Object} if `value` is a string, returns `apiResourceProvider` for chaining.
		 *     otherwise, returns current `baseUrl` value.
		 */
		this.baseUrl = function (url) {
			if (isString(url)) {
				baseUrl = url;
				return this;
			}
			return baseUrl;
		};

		var actionsDefaults = {};
		/**
		 * Getter/Setter. Defaults options per action name.
		 * @method apiResourceProvider#actionsDefaults
		 * @param {Object} [actions]
		 * @returns {Object} if `actions` is defined returns `apiResourceProvider` for chaining;
		 *     otherwise returns the actions defaults.
		 */
		this.actionsDefaults = function (actions) {
			if (isUndefined(actions)) return actionsDefaults;
			verifyActions(actions);
			extend(actionsDefaults, actions);
			return this;
		};

		/**
		 * @member {Array} apiResourceProvider#interceptors
		 * @description Array containing service factories for all synchronous or asynchronous
		 * processing of requests or responses.
		 */
		var interceptorFactories = this.interceptors = [];
		/**
		 * Push interceptors
		 * @method apiResourceProvider#pushInterceptor
		 * @param {...(string|function)} - interceptors
		 * @param {Array} - interceptors
		 * @returns {Object} `apiResourceProvider` for chaining.
		 */
		this.pushInterceptor = function () {
			var args = isArray(arguments[0]) ? arguments[0] : arguments;
			for (var i = 0; i < args.length; i++) interceptorFactories.push(args[i]);
			return this;
		};

		/**
		 * @class AbstractResource
		 * @param {Promise|boolean(true)} promise
		 * @property {Promise} $promise - Promise for the requested resource
		 * @property {boolean} [$$unresolved] - Whether the resource promise has been resolved
		 */
		function AbstractResource(promise) {
			if (promise === true) {
				delete this.$$unresolved;
			}
			else {
				this.$promise = promise;
				this.$$unresolved = true;
			}
		}

		/**
		 * Extracts the raw value of the resource instance
		 * @method AbstractResource#$unwrap
		 * @returns {*}
		 */
		AbstractResource.prototype.$unwrap = function () {
			if (this.hasOwnProperty('$value')) return this.$value;
			var isArray = this.hasOwnProperty('$$length');
			var data = isArray ? [] : {};
			extend(data, this);
			if (isArray) delete data.$$length;
			delete data.$promise;
			delete data.$$unresolved;
			return data;
		};
		AbstractResource.prototype.toJSON = AbstractResource.prototype.$unwrap;

		/**
		 * @namespace apiResource
		 * @variation 1
		 * @see apiResource
		 */
		/**
		 * The service instance apiResource. A resource factory that creates Resource objects.
		 * @method apiResourceProvider#$get
		 * @returns ResourceFactory
		 */
		this.$get = function ($injector, $q, $http) {
			if (!baseUrl) throw new Error('The base url for apiResource service must be configured');
			var instancedInterceptors = [];

			forEach(interceptorFactories, function (interceptorFactory) {
				instancedInterceptors.push(isString(interceptorFactory) ?
				$injector.get(interceptorFactory) : $injector.invoke(interceptorFactory));
			});

			var defaultConfig = {interceptorLimit: instancedInterceptors.length};

			return function ResourceFactory(route, actions, resourceConfig) {
				if (!route) throw new Error('Argument route is missing');
				route = route.toString();
				verifyActions(actions);
				verifyConfig(resourceConfig, defaultConfig);

				resourceConfig = extend({
					url: baseUrl + route
				}, defaultConfig, resourceConfig);

				/**
				 * Wraps data objects seamlessly and data Arrays or primitives with a especial attribute.
				 * Has a method for each action, and an equivalent method in the prototype, for instance calls.
				 * @class Resource
				 * @extends AbstractResource
				 * @param {*} data - to create from.
				 */
				function Resource(data) {
					if (isUndefined(data) || data === null) return;
					if (isObject(data)) {
						extend(this, data);
						if (isArray(data)) this.$$length = data.length;
					}
					else {
						this.$value = data;
					}
				}

				inherit(Resource, AbstractResource);

				forEach(actions, function (action, name) {
					action = extend({method: name}, actionsDefaults[name], action);
					var hasBody = action.hasData || /^(POST|PUT|PATCH)$/i.test(action.method);

					/**
					 * @function apiResource(1)~performAction
					 * @param {*} data
					 * @param {Array} args - arguments of the exposed function must be made available here
					 * @returns {Promise}
					 */
					function performAction(data, args) {
						var actionConfig = extend({method: action.method}, resourceConfig);
						if (hasBody) actionConfig.data = data;
						if (action.subRoute) actionConfig.url = actionConfig.url + action.subRoute;
						var urlParams = extractParams(action.params, args, data);
						actionConfig.url = replaceUrlParams(actionConfig.url, urlParams);
						var queryParams = actionConfig.params = extractParams(action.queryParams, args, data);
						if (action.skipOnMissingParams &&
						((urlParams && urlParams.$$missing) || (queryParams && queryParams.$$missing))) {
							return $q.when(null);
						}

						var rawResponse;
						var promise = $q.when(actionConfig);
						promise = throughRequestInterceptors(promise, actionConfig.interceptorLimit);
						promise = promise.then(function (config) {
							return $http(config)
							.then(function (response) {
								rawResponse = response;
								return response;
							});
						});
						promise = throughResponseInterceptors(promise, actionConfig.interceptorLimit);
						promise = promise.then(function (response) {
							// in case no interceptor unwrapped the data from the response.
							return rawResponse === response ? response.data : response;
						});
						if (action.postProcess) promise = promise.then(action.postProcess);
						return promise;
					}

					function updateResource(resource) {
						return function (data) {
							if (hasBody && action.ignoreResponse) return data;
							Resource.call(resource, data);
							return resource;
						};
					}

					function updateResourceArray(resources, callback) {
						return function (data) {
							if (hasBody && action.ignoreResponse) return data;
							if (isDefined(data) && data !== null) {
								if (!isArray(data)) throw ExpectedArrayError(name);
								data.forEach(callback);
							}
							return resources;
						};
					}

					/**
					 * Resource class call for an action.
					 * @method [action name]
					 * @memberof Resource
					 * @param {*} data
					 * @params {*} [...]
					 * @returns {Resource|Array.<Resource>} - Array when action.isArray = true.
					 */
					Resource[name] = function (data) {
						var promise, args = Array.prototype.slice.call(arguments, hasBody);
						var resource, resources;

						if (hasBody) {
							if (isUndefined(data) || data === null) {
								throw MissingBodyError(name, action.method);
							}
						}
						else {
							data = null;
						}

						if (action.isArray) {
							if (hasBody) {
								if (!isArray(data)) throw ExpectedArrayError(name);
								resources = data.map(function (item) {
									return new Resource(item);
								});
							}
							else {
								resources = [];
							}
							promise = performAction(data, args)
							.finally(AbstractResource.bind(resources, true))
							.then(updateResourceArray(resources, hasBody ? modifyResource : pushNewResource));
							AbstractResource.call(resources, promise);
							return resources;
						}
						else {
							resource = new Resource(data);
							promise = performAction(data, args)
							.finally(AbstractResource.bind(resource, true))
							.then(updateResource(resource));
							AbstractResource.call(resource, promise);
							return resource;
						}

						function modifyResource(item, index) {
							Resource.call(resources[index], item);
						}

						function pushNewResource(item) {
							resources.push(new Resource(item));
						}
					};

					// Add instance call only if !isArray for the action.
					if (!action.isArray) {
						/**
						 * Resource instance call for an non array action.
						 * @method Resource#$[action name]
						 * @params {*} [...]
						 * @returns {Promise} - promise of the action, same as this.$promise.
						 */
						Resource.prototype['$' + name] = function () {
							if (this.$$unresolved) throw UnresolvedRequest(name);
							var data = this.$unwrap();
							var promise = performAction(data, arguments)
							.finally(AbstractResource.bind(this, true))
							.then(updateResource(this));
							AbstractResource.call(this, promise);
							return promise;
						};

						/**
						 * A version for applying non array actions to each element of an array.
						 * @alias [action name].each
						 * @memberof! Resource
						 * @param  {Array} arrdata
						 * @return {Array.<Resource>}
						 */
						Resource[name].each = function (arrdata) {
							if (!isArray(arrdata)) {
								throw ExpectedTypeError('Argument for action ' + name + '.each', 'Array');
							}
							return arrdata.map(function (data) {
								return Resource[name](data);
							});
						};
					}
				});
				return Resource;
			};

			function throughRequestInterceptors(promise, limit) {
				for (var i = 0; i < limit; i++) {
					var interceptor = instancedInterceptors[i];
					if (interceptor.request || interceptor.requestError) {
						promise = promise.then(interceptor.request, interceptor.requestError);
					}
				}
				return promise;
			}

			function throughResponseInterceptors(promise, limit) {
				for (var i = 0; i < limit; i++) {
					var interceptor = instancedInterceptors[i];
					if (interceptor.response || interceptor.responseError) {
						promise = promise.then(interceptor.response, interceptor.responseError);
					}
				}
				return promise;
			}
		};

		function extractParams(params, args, data) {
			if (isUndefined(params)) return null;
			var done = isString(params);
			if (done) params = extract(params, data);
			if (!isObject(params)) throw ExpectedTypeError('Params for http request', 'Object');
			if (done) return params;
			var proto = Object.create(null);
			var extracted = Object.create(proto);
			forEach(params, function (value, key) {
				if (isFunction(value)) {
					value = value();
				}
				extracted[key] = isString(value) ? extract(value, data && data[key]) : value;
				if (isUndefined(extracted[key]) || extracted[key] === null) {
					proto.$$missing = true;
				}
			});
			return extracted;

			function extract(str, _default) {
				if (str === '=') return _default;
				if (str.charAt(0) === '@') {
					str = str.slice(1);
					var result = /^\d+/.exec(str);
					if (result) {
						var pos = result[0];
						if (pos === str) {
							return args[pos];
						}
						else {
							var i = pos.length;
							if (str.charAt(i) === '.') {
								return lookupDottedPath(args[pos], str.slice(i + 1));
							}
						}
					}
					return lookupDottedPath(data, str);
				}
				return str;
			}
		}

		function replaceUrlParams(url, params) {
			forEach(params, function (value, key) {
				url = url.replace(':' + key, value);
			});
			return url;
		}

		function lookupDottedPath(obj, path) {
			var keys = path.split('.');
			for (var i = 0, ii = keys.length; i < ii && isDefined(obj); i++) {
				var key = keys[i];
				obj = (obj !== null) ? obj[key] : undefined;
			}
			return obj;
		}

		function verifyActions(actions) {
			if (!isObject(actions)) throw ExpectedTypeError('Argument actions', 'Object');
			forEach(actions, verifyAction);
		}

		function verifyAction(action, name) {
			if (!isObject(action)) {
				throw ExpectedTypeError('Options' + actionMsg(), 'Object');
			}
			if (action.hasOwnProperty('subRoute') && !isString(action.subRoute)) {
				action.subRoute = action.subRoute.toString();
			}
			if (action.hasOwnProperty('postProcess') && !isFunction(action.postProcess)) {
				throw ExpectedTypeError(propertyMsg('postProcess'), 'function');
			}

			function propertyMsg(property) { return 'Property ' + property + actionMsg(); }

			function actionMsg() { return ' for action ' + name; }
		}

		function verifyConfig(config, defaults) {
			if (isUndefined(config)) return;
			if (!isObject(config)) {
				throw ExpectedTypeError('Argument config', 'Object');
			}
			if (config.hasOwnProperty('interceptorLimit')) {
				if (!angular.isNumber(config.interceptorLimit)) {
					throw ExpectedTypeError(propertyMsg('interceptorLimit'), 'number');
				}
				if (config.interceptorLimit > defaults.interceptorLimit) {
					throw new Error(propertyMsg('interceptorLimit') + 'must be less than interceptors.length');
				}
			}

			function propertyMsg(property) { return 'Property ' + property + ' for config'; }
		}

		function ExpectedTypeError(expected, type) {
			var pl = /[AEIOU]/i.test(type.charAt(0)) ? 'n ' : ' ';
			return new TypeError(expected + ' must be a' + pl + type);
		}

		// ERRORS
		function MissingBodyError(name, method) {
			return new Error('Action call ' + name + ' with method ' + method + ' is missing a body');
		}

		function ExpectedArrayError(name) {
			return new TypeError('Action ' + name + ' expected Array data');
		}

		function UnresolvedRequest(name) {
			return new Error('Instance action ' + name + ' called before previous action was resolved');
		}
	});


	function inherit(child, parent) {
		child.prototype = Object.create(parent.prototype, {
			constructor: {value: child}
		});
	}

})(window.angular);

/**
 * @module
 * @name api-resource
 * @requires $http
 */
