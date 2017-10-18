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

var html = require('./html')

var footer = require('./partials/footer')
var head = require('./partials/head')
var header = require('./partials/header')
var nav = require('./partials/nav')

module.exports = function (request, response, configuration) {
  response.statusCode = 404
  response.setHeader('Content-Type', 'text/html; charset=UTF-8')
  response.end(html`
<!doctype html>
<html lang=en>
  ${head(configuration, 'Not Found')}
  <body>
    <div class=wrapper>
    ${header()}
    ${nav()}
    <main>
      <p>Not Found</p>
    </main>
    </div>
    ${footer()}
  </body>
</html>
  `)
}
