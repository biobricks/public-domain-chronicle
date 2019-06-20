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
var makeValidPublication = require('./make-valid-publication')
var runSeries = require('run-series')
var server = require('./server')
var tape = require('tape')

tape('GET /publications/{nonexistent}', function (test) {
  server(function (port, done) {
    http.get({
      path: '/publications/nonexistent',
      port: port,
      headers: {
        accept: 'application/json'
      }
    }, function (response) {
      test.equal(
        response.statusCode, 404,
        'responds 404'
      )
      done()
      test.end()
    })
  })
})

tape('GET /publications/{created} JSON', function (test) {
  server(function (port, done) {
    var location
    runSeries([
      function (done) {
        var form = makeValidPublication()
        form.pipe(
          http.request({
            method: 'POST',
            path: '/publish',
            port: port,
            headers: form.getHeaders()
          })
            .once('response', function (response) {
              test.equal(
                response.statusCode, 201,
                'responds 201'
              )
              test.assert(
                response.headers.location.includes('/publications/'),
                'sets Location'
              )
              location = response.headers.location
              done()
            })
        )
      },
      function (done) {
        http.get({
          path: location,
          port: port,
          headers: { accept: 'application/json' }
        }, function (response) {
          test.equal(
            response.statusCode, 200,
            'responds 200'
          )
          done()
        })
      }
    ], function () {
      done()
      test.end()
    })
  })
})

tape('GET /publications/{created} HTML', function (test) {
  server(function (port, done) {
    var location
    runSeries([
      function (done) {
        var form = makeValidPublication()
        form.pipe(
          http.request({
            method: 'POST',
            path: '/publish',
            port: port,
            headers: form.getHeaders()
          })
            .once('response', function (response) {
              test.equal(
                response.statusCode, 201,
                'responds 201'
              )
              test.assert(
                response.headers.location.includes('/publications/'),
                'sets Location'
              )
              location = response.headers.location
              done()
            })
        )
      },
      function (done) {
        http.get({
          path: location,
          port: port,
          headers: { accept: 'text/html' }
        }, function (response) {
          test.equal(
            response.statusCode, 200,
            'responds 200'
          )
          done()
        })
      }
    ], function () {
      done()
      test.end()
    })
  })
})

tape('GET /publications/{created} XML', function (test) {
  server(function (port, done) {
    var location
    runSeries([
      function (done) {
        var form = makeValidPublication()
        form.pipe(
          http.request({
            method: 'POST',
            path: '/publish',
            port: port,
            headers: form.getHeaders()
          })
            .once('response', function (response) {
              test.equal(
                response.statusCode, 201,
                'responds 201'
              )
              test.assert(
                response.headers.location.includes('/publications/'),
                'sets Location'
              )
              location = response.headers.location
              done()
            })
        )
      },
      function (done) {
        http.get({
          path: location,
          port: port,
          headers: { accept: 'application/xml' }
        }, function (response) {
          test.equal(
            response.statusCode, 415,
            'responds 415'
          )
          done()
        })
      }
    ], function () {
      done()
      test.end()
    })
  })
})

tape('DELETE /publications/{nonexistent}', function (test) {
  server(function (port, done) {
    http.request({
      method: 'DELETE',
      path: '/publications/nonexistent',
      port: port
    })
      .once('response', function (response) {
        test.equal(
          response.statusCode, 405,
          'responds 405'
        )
        done()
        test.end()
      })
      .end()
  })
})
