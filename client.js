// builtin
var net = require('net');
var url = require('url');
var request = require('request');



var start = function(local_port, host, subdomain, callback){

  // optionally override the upstream server
  var upstream = url.parse(host);

  // query options
  var opt = {
    host: upstream.hostname,
    port: upstream.port || 80,
    path: '/',
    json: true
  };

  var base_uri = 'http://' + opt.host + ':' + opt.port + opt.path;
  var prev_id = subdomain || '';

  connect_proxy(opt, base_uri, prev_id, local_port, host, callback);
};

var connect_proxy = function (opt, base_uri, prev_id, local_port, host, callback) {
    opt.uri = base_uri + ((prev_id) ? prev_id : '?new');

    request(opt, function(err, res, body) {
        if (err) {
            callback(err);
            // retry interval for id request
            return setTimeout(function() {
                connect_proxy();
            }, 1000);
        }

        // our assigned hostname and tcp port
        var port = body.port;
        var host = opt.host;
        var max_conn = body.max_conn_count || 1;

        // store the id so we can try to get the same one
        prev_id = body.id;
        callback(null, body.url);

        var count = 0;

        // open 5 connections to the localtunnel server
        // allows for resources to be served faster
        for (var count = 0 ; count < max_conn ; ++count) {
            var upstream = duplex(port, host, local_port, 'localhost');
            upstream.once('end', function() {
                // all upstream connections have been closed
                if (--count <= 0) {
                    connect_proxy();
                }
            });
        }
    });
};

var duplex = function(port, host, local_port, local_host) {

    // connect to remote tcp server
    var upstream = net.createConnection(port, host);
    var internal = net.createConnection(local_port, local_host);

    // when upstream connection is closed, close other associated connections
    upstream.on('end', function() {
        console.log('> upstream connection terminated');

        // sever connection to internal server
        // on reconnect we will re-establish
        internal.end();
    });

    upstream.on('error', function(err) {
        console.error(err);
    });

    (function connect_internal() {

        //internal = net.createConnection(local_port);
        internal.on('error', function(err) {
            console.log('error connecting to local server. retrying in 1s');
            setTimeout(function() {
                connect_internal();
            }, 1000);
        });

        internal.on('end', function() {
            console.log('disconnected from local server. retrying in 1s');
            setTimeout(function() {
                connect_internal();
            }, 1000);
        });

        upstream.pipe(internal);
        internal.pipe(upstream);
    })();

    return upstream;
}


// Publish
exports.start = start;