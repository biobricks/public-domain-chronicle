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
var pump = require('pump')
var methodNotAllowed = require('./method-not-allowed')

module.exports = function (request, response, configuration) {
  if (request.method === 'GET') {
    var search = request.query.search
    if (search) {
      http.get({
        host: 'ipc.publicdomainchronicle.org',
        path: (
          '/classifications' +
          '?search=' + encodeURIComponent(search) +
          '&limit=10'
        )
      }, function (apiResponse) {
        response.setHeader('Content-Type', 'application/json')
        pump(apiResponse, response)
      })
    } else {
      response.statusCode = 400
      response.end()
    }
  } else {
    methodNotAllowed(response)
  }
}
