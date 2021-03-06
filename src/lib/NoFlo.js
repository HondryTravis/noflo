//     NoFlo - Flow-Based Programming for JavaScript
//     (c) 2013-2018 Flowhub UG
//     (c) 2011-2012 Henri Bergius, Nemein
//     NoFlo may be freely distributed under the MIT license
//
// NoFlo is a Flow-Based Programming environment for JavaScript. This file provides the
// main entry point to the NoFlo network.
//
// Find out more about using NoFlo from <http://noflojs.org/documentation/>

/* eslint-disable
    no-param-reassign,
*/

// ## Main APIs
//
// ### Graph interface
//
// [fbp-graph](https://github.com/flowbased/fbp-graph) is used for instantiating FBP graph definitions.
const fbpGraph = require('fbp-graph');

exports.graph = fbpGraph.graph;
exports.Graph = fbpGraph.Graph;

// ### Graph journal
//
// Journal is used for keeping track of graph changes
exports.journal = fbpGraph.journal;
exports.Journal = fbpGraph.Journal;

// ## Network interface
//
// [Network](../Network/) is used for running NoFlo graphs. The direct Network inteface is only
// provided for backwards compatibility purposes. Use `createNetwork` instead.
const {
  Network,
} = require('./Network');
exports.Network = require('./LegacyNetwork').Network;
const { deprecated } = require('./Platform');

// ### Platform detection
//
// NoFlo works on both Node.js and the browser. Because some dependencies are different,
// we need a way to detect which we're on.
exports.isBrowser = require('./Platform').isBrowser;

// ### Component Loader
//
// The [ComponentLoader](../ComponentLoader/) is responsible for finding and loading
// NoFlo components. Component Loader uses [fbp-manifest](https://github.com/flowbased/fbp-manifest)
// to find components and graphs by traversing the NPM dependency tree from a given root
// directory on the file system.
exports.ComponentLoader = require('./ComponentLoader').ComponentLoader;

// ### Component baseclasses
//
// These baseclasses can be used for defining NoFlo components.
exports.Component = require('./Component').Component;

// ### NoFlo ports
//
// These classes are used for instantiating ports on NoFlo components.
const ports = require('./Ports');

exports.InPorts = ports.InPorts;
exports.OutPorts = ports.OutPorts;
exports.InPort = require('./InPort');
exports.OutPort = require('./OutPort');

// ### NoFlo sockets
//
// The NoFlo [internalSocket](InternalSocket.html) is used for connecting ports of
// different components together in a network.
exports.internalSocket = require('./InternalSocket');

// ### Information Packets
//
// NoFlo Information Packets are defined as "IP" objects.
exports.IP = require('./IP');

// ## Network instantiation
//
// This function handles instantiation of NoFlo networks from a Graph object. It creates
// the network, and then starts execution by sending the Initial Information Packets.
//
//     noflo.createNetwork(someGraph, function (err, network) {
//       console.log('Network is now running!');
//     });
//
// It is also possible to instantiate a Network but delay its execution by giving the
// third `delay` parameter. In this case you will have to handle connecting the graph and
// sending of IIPs manually.
//
//     noflo.createNetwork(someGraph, function (err, network) {
//       if (err) {
//         throw err;
//       }
//       network.connect(function (err) {
//         network.start();
//         console.log('Network is now running!');
//       })
//     }, true);
//
// ### Network options
//
// It is possible to pass some options to control the behavior of network creation:
//
// * `delay`: (default: FALSE) Whether the network should be started later. Defaults to
//   immediate execution
// * `subscribeGraph`: (default: TRUE) Whether the network should monitor the underlying
//   graph for changes
//
// Options can be passed as a second argument before the callback:
//
//     noflo.createNetwork(someGraph, options, callback);
//
// The options object can also be used for setting ComponentLoader options in this
// network.
exports.createNetwork = function createNetwork(graph, options, callback) {
  if (typeof options === 'function') {
    const opts = callback;
    callback = options;
    options = opts;
  }
  if (typeof options === 'boolean') {
    options = { delay: options };
  }
  if (typeof options !== 'object') {
    options = {};
  }
  if (typeof options.subscribeGraph === 'undefined') {
    // Default to legacy network for backwards compatibility.
    options.subscribeGraph = true;
  }
  if (typeof callback !== 'function') {
    deprecated('Calling noflo.createNetwork without a callback is deprecated');
    callback = (err) => {
      if (err) { throw err; }
    };
  }

  // Choose legacy or modern network based on whether graph
  // subscription is needed
  const NetworkType = options.subscribeGraph ? exports.Network : Network;
  const network = new NetworkType(graph, options);

  const networkReady = (net) => { // Send IIPs
    net.start((err) => {
      if (err) {
        callback(err);
        return;
      }
      callback(null, net);
    });
  };

  // Ensure components are loaded before continuing
  network.loader.listComponents((err) => {
    if (err) {
      callback(err);
      return;
    }

    // In case of delayed execution we don't wire it up
    if (options.delay) {
      callback(null, network);
      return;
    }

    // Empty network, no need to connect it up
    if (graph.nodes.length === 0) {
      networkReady(network);
      return;
    }

    // Wire the network up and start execution
    network.connect((err2) => {
      if (err2) {
        callback(err2);
        return;
      }
      networkReady(network);
    });
  });
  return network;
};

// ### Starting a network from a file
//
// It is also possible to start a NoFlo network by giving it a path to a `.json` or `.fbp` network
// definition file.
//
//     noflo.loadFile('somefile.json', function (err, network) {
//       if (err) {
//         throw err;
//       }
//       console.log('Network is now running!');
//     })
exports.loadFile = function loadFile(file, options, callback) {
  if (!callback) {
    callback = options;
    options = null;
  }

  if (callback && (typeof options !== 'object')) {
    options = { baseDir: options };
  }
  if (typeof options !== 'object') {
    options = {};
  }
  if (!options.subscribeGraph) {
    options.subscribeGraph = false;
  }

  exports.graph.loadFile(file, (err, net) => {
    if (err) {
      callback(err);
      return;
    }
    if (options.baseDir) {
      net.properties.baseDir = options.baseDir;
    }
    exports.createNetwork(net, options, callback);
  });
};

// ### Saving a network definition
//
// NoFlo graph files can be saved back into the filesystem with this method.
exports.saveFile = function saveFile(graph, file, callback) {
  graph.save(file, callback);
};

// ## Embedding NoFlo in existing JavaScript code
//
// The `asCallback` helper provides an interface to wrap NoFlo components
// or graphs into existing JavaScript code.
//
//     // Produce an asynchronous function wrapping a NoFlo graph
//     var wrapped = noflo.asCallback('myproject/MyGraph');
//
//     // Call the function, providing input data and a callback for output data
//     wrapped({
//       in: 'data'
//     }, function (err, results) {
//       // Do something with results
//     });
//
exports.asCallback = require('./AsCallback').asCallback;

// ## Generating components from JavaScript functions
//
// The `asComponent` helper makes it easy to expose a JavaScript function as a
// NoFlo component. All input arguments become input ports, and the function's
// result will be sent to either `out` or `error` port.
//
//     exports.getComponent = function () {
//       return noflo.asComponent(Math.random, {
//         description: 'Generate a random number',
//       });
//     };
//
exports.asComponent = require('./AsComponent').asComponent;
