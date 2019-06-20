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

var mkdirp = require('mkdirp')
var path = require('path')
var readKeypair = require('./keypair/read')
var runParallel = require('run-parallel')
var runSeries = require('run-series')
var touch = require('touch')
var writeKeypair = require('./keypair/write')

module.exports = function (directory, callback) {
  var publications = path.join(directory, 'publications')
  var tmp = path.join(directory, 'tmp')
  var accessions = path.join(directory, 'accessions')
  var keypair
  runSeries([
    runParallel.bind(null, [
      mkdirp.bind(null, publications),
      mkdirp.bind(null, tmp)
    ]),
    runParallel.bind(null, [
      touch.bind(null, accessions, { force: true }),
      function (done) {
        readKeypair(directory, function (error, read) {
          if (error) {
            writeKeypair(directory, function (error, written) {
              if (error) {
                done(error)
              } else {
                keypair = written
                done()
              }
            })
          } else {
            keypair = read
            done()
          }
        })
      }
    ])
  ], function (error) {
    if (error) {
      callback(error)
    } else {
      callback(null, keypair)
    }
  })
}
