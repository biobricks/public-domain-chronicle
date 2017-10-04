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

var Negotiator = require('negotiator')
var displayParagraphs = require('./display-paragraphs')
var escape = require('./escape')
var html = require('./html')
var latest = require('../latest')
var methodNotAllowed = require('./method-not-allowed')

var footer = require('./partials/footer')
var head = require('./partials/head')
var header = require('./partials/header')
var nav = require('./partials/nav')

var grant = require('public-science-grant')

module.exports = function (request, response, configuration) {
  if (request.method === 'GET') {
    var type = new Negotiator(request).mediaType([
      'application/json', 'text/plain', 'text/html'
    ])
    if (!type) {
      response.statusCode = 415
      response.end()
    } else {
      var requestedVersion = request.query.version
        ? grant[request.query.version]
        : latest(grant)
      if (!requestedVersion) {
        response.statusCode = 404
        response.end()
      /* istanbul ignore else */
      } else if (type === 'application/json') {
        response.setHeader(
          'Content-Type', 'application/json'
        )
        response.end(JSON.stringify(requestedVersion))
      } else if (type === 'text/html') {
        response.setHeader(
          'Content-Type',
          'text/html; charset=UTF-8'
        )
        response.end(html`
<!doctype html>
<html>
${head(configuration, requestedVersion.title)}
<body>
  ${header()}
  ${nav()}
  <main>
    <h1>${escape(requestedVersion.title)}</h1>
    <p>Version ${escape(requestedVersion.version)}</p>
    ${displayParagraphs(requestedVersion.paragraphs)}
    <p>${escape(requestedVersion.copyright)}</p>
    <p>${escape(requestedVersion.license)}</p>
  </main>
  ${footer()}
</body>
</html>
        `)
      }
    }
  } else {
    methodNotAllowed(response)
  }
}
