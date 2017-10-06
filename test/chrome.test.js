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

var server = require('./server')
var tape = require('tape')
var webdriver = require('./webdriver')

tape('chrome', function (suite) {
  suite.test('publish', function (test) {
    test.plan(1)
    server(function (webServerPort, done) {
      webdriver
        .url('http://localhost:' + webServerPort + '/publish')
        .setValue('input[name=title]', 'Test Invention')
        .setValue('textarea[name=finding]', 'Test finding')
        .scroll('input[name=legal]')
        .click('input[name=legal]')
        .scroll('button.safety')
        .click('button.safety')
        .scroll('input[type=submit]')
        .click('input[type=submit]')
        .waitForExist('h1')
        .isExisting('//*[contains(text(), "Test Invention")]')
        .then(function (existing) {
          test.assert(existing)
          done()
        })
        .catch(function (error) {
          test.error(error)
          done()
        })
    })
  })
})
