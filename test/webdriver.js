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

var spawn = require('child_process').spawn
var path = require('path')

var CHROMEDRIVER = path.join(
  __dirname, '..', 'node_modules', '.bin', 'chromedriver'
)

var chromedriver = spawn(CHROMEDRIVER, ['--url-base=/wd/hub'])

var webdriver = module.exports = require('webdriverio')
  .remote({
    host: 'localhost',
    port: 9515,
    desiredCapabilities: {
      browserName: 'chrome',
      chromeOptions: process.env.DISABLE_HEADLESS
        ? undefined
        : { args: ['headless', '--disable-gpu'] }
    }
  })
  .init()
  .timeouts('script', 1000)
  .timeouts('implicit', 1000)

require('tape').onFinish(cleanup)
process
  .on('SIGTERM', cleanup)
  .on('SIGQUIT', cleanup)
  .on('SIGINT', cleanup)
  .on('uncaughtException', cleanup)

function cleanup () {
  webdriver.end()
  chromedriver.kill('SIGKILL')
}
