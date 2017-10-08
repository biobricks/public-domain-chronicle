/*
Copyright 2017 The BioBricks Foundation

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
 */

var http = require('http')
var initialize = require('./initialize-directory')
var makeHandler = require('./')
var pino = require('pino')
var replicatePeers = require('./replicate-peers')

var NAME = require('./package.json').name
var VERSION = require('./package.json').version

var ENV = process.env
var PORT = ENV.PORT || 8080
var TIMEOUT = ENV.TIMEOUT ? parseInt(ENV.TIMEOUT) : 5000

var RECAPTCHA_SECRET = ENV.RECAPTCHA_SECRET
if (!RECAPTCHA_SECRET) {
  throw new Error('Missing RECAPTCHA_SECRET env var.')
}

var RECAPTCHA_PUBLIC = ENV.RECAPTCHA_PUBLIC
if (!RECAPTCHA_PUBLIC) {
  throw new Error('Missing RECAPTCHA_PUBLIC env var.')
}

var STAMPERY_USER = ENV.STAMPERY_USER
var STAMPERY_PASSWORD = ENV.STAMPERY_PASSWORD

var HOSTNAME = ENV.HOSTNAME || require('os').hostname()
var DIRECTORY = ENV.DATA || NAME
var BASE_HREF = ENV.BASE_HREF || ('https://' + HOSTNAME + '/')

var REPLICATION_INTERVAL = ENV.REPLICATION_INTERVAL
  ? parseInt(ENV.REPLICATION_INTERVAL)
  : 3600000 // hourly

var SOLICIT_FEEDBACK = !!ENV.SOLICIT_FEEDBACK

var log = pino({name: NAME + '@' + VERSION})

initialize(DIRECTORY, function (error, keypair) {
  if (error) {
  } else {
    log.info({event: 'data', directory: DIRECTORY})
    var configuration = {
      version: VERSION,
      hostname: HOSTNAME,
      base: BASE_HREF.endsWith('/') ? BASE_HREF : (BASE_HREF + '/'),
      timeout: TIMEOUT,
      directory: DIRECTORY,
      keypair: keypair,
      recaptcha: {
        public: RECAPTCHA_PUBLIC,
        secret: RECAPTCHA_SECRET
      },
      stampery: (STAMPERY_USER && STAMPERY_PASSWORD)
        ? {
          user: STAMPERY_USER,
          password: STAMPERY_PASSWORD
        }
        : false,
      feedback: SOLICIT_FEEDBACK
    }
    var requestHandler = makeHandler(configuration, log)
    var server = http.createServer(requestHandler)
    if (module.parent) {
      module.exports = server
    } else {
      // Trap signals.
      process
        .on('SIGTERM', logSignalAndShutDown)
        .on('SIGQUIT', logSignalAndShutDown)
        .on('SIGINT', logSignalAndShutDown)
        .on('uncaughtException', function (exception) {
          log.error(exception)
          shutDown()
        })
      // Start server.
      server.listen(PORT, function () {
        var boundPort = this.address().port
        log.info({event: 'listening', port: boundPort})
      })
      // Start replicating peers.
      var replicationLog = log.child({subsystem: 'replication'})
      setInterval(
        replicatePeers.bind(null, configuration, replicationLog),
        REPLICATION_INTERVAL
      )
      replicatePeers(configuration, replicationLog)
    }
  }

  function logSignalAndShutDown () {
    log.info({event: 'signal'})
    shutDown()
  }

  function shutDown () {
    server.close(function () {
      log.info({event: 'closed server'})
      process.exit()
    })
  }
})
