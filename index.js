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

var pinoHTTP = require('pino-http')
var url = require('url')
var routes = require('./routes')
var notFound = require('./routes/not-found')

module.exports = function (configuration, log) {
  var pino = pinoHTTP({ logger: log })
  return function (request, response) {
    pino(request, response)
    response.setTimeout(
      configuration.timeout,
      /* istanbul ignore next */ function () {
        response.log.error({ event: 'timeout' })
        response.statusCode = 408
        response.removeAllListeners()
        response.end()
      }
    )
    var parsed = url.parse(request.url, true)
    request.query = parsed.query
    request.pathname = parsed.pathname
    var route = routes.get(parsed.pathname)
    if (route.handler) {
      request.params = route.params
      route.handler(request, response, configuration)
    } else {
      notFound(request, response, configuration)
    }
  }
}
