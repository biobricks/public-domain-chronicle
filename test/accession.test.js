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

var concat = require('concat-stream')
var http = require('http')
var makeValidPublication = require('./make-valid-publication')
var runSeries = require('run-series')
var server = require('./server')
var tape = require('tape')

tape('GET /accessions CSV', function (test) {
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
          path: '/accessions/',
          port: port,
          headers: { accept: 'text/csv' }
        }, function (response) {
          test.equal(
            response.statusCode, 200,
            'responds 200'
          )
          response.pipe(concat(function (body) {
            var digest = /\/publications\/([a-f0-9]{64})/.exec(location)[1]
            test.assert(
              body.toString().includes(digest),
              'body contains digest'
            )
            done()
          }))
        })
      }
    ], function () {
      done()
      test.end()
    })
  })
})

tape('GET /accessions?from CSV', function (test) {
  server(function (port, done) {
    var digests = []
    runSeries(
      ['a', 'b', 'c', 'd'].map(function (title) {
        return function (done) {
          var form = makeValidPublication(title)
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
                  response.headers
                    .location
                    .includes('/publications/'),
                  'sets Location'
                )
                var digest = /\/publications\/([a-f0-9]{64})/
                  .exec(response.headers.location)[1]
                digests.push(digest)
                done()
              })
          )
        }
      })
      , function () {
        http.get({
          path: '/accessions?from=3',
          port: port,
          headers: { accept: 'text/csv' }
        }, function (response) {
          test.equal(
            response.statusCode, 200,
            'responds 200'
          )
          response.pipe(concat(function (body) {
            body = body.toString()
            test.equal(
              body.match(/[^\n]\n/g).length, 2,
              'two lines'
            )
            digests
              .slice(2)
              .forEach(function (digest) {
                test.assert(
                  body.indexOf(digest) !== -1,
                  'contains digest'
                )
              })
            done()
            test.end()
          }))
        })
      })
  })
})

tape('GET /accessions HTML', function (test) {
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
          path: '/accessions',
          port: port,
          headers: { accept: 'text/html' }
        }, function (response) {
          test.equal(
            response.statusCode, 200,
            'responds 200'
          )
          response.pipe(concat(function (body) {
            test.assert(
              body.toString().indexOf('href=' + location) !== -1,
              'body contains link to publication'
            )
            done()
          }))
        })
      }
    ], function () {
      done()
      test.end()
    })
  })
})

tape('GET /accessions RSS', function (test) {
  server(function (port, done) {
    var location
    runSeries([
      function (done) {
        var form = makeValidPublication('Test Title')
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
          path: '/accessions',
          port: port,
          headers: { accept: 'application/rss+xml' }
        }, function (response) {
          test.equal(
            response.statusCode, 200,
            'responds 200'
          )
          response.pipe(concat(function (body) {
            test.assert(
              body.toString().indexOf('Test Title') !== -1,
              'body contains title'
            )
            test.assert(
              body.toString().indexOf(location) !== -1,
              'body contains location'
            )
            done()
          }))
        })
      }
    ], function () {
      done()
      test.end()
    })
  })
})

tape('GET /accessions XML', function (test) {
  server(function (port, done) {
    var request = {
      path: '/accessions',
      port: port,
      headers: { accept: 'application/xml' }
    }
    http.get(request, function (response) {
      test.equal(
        response.statusCode, 415,
        'responds 415'
      )
      done()
      test.end()
    })
  })
})

tape('NOT-GET /accessions', function (test) {
  server(function (port, done) {
    var request = {
      method: 'DELETE',
      path: '/accessions',
      port: port
    }
    http.get(request, function (response) {
      test.equal(
        response.statusCode, 405,
        'responds 405'
      )
      done()
      test.end()
    })
  })
})

tape('GET /accessions/{out-of-bounds}', function (test) {
  server(function (port, done) {
    http.get({
      path: '/accessions/100',
      port: port
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

tape('GET /accessions/{created}', function (test) {
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

tape('GET /accessions/{number}', function (test) {
  server(function (port, done) {
    var locations = []
    runSeries([
      publish.bind(this, 'First'),
      publish.bind(this, 'Second'),
      function (done) {
        http.get({
          path: '/accessions/2',
          port: port
        }, function (response) {
          test.equal(
            response.statusCode, 303,
            'responds 303'
          )
          test.equal(
            response.headers.location, locations[1],
            'sets Location'
          )
          done()
        })
      }
    ], function () {
      done()
      test.end()
    })
    function publish (title, done) {
      var form = makeValidPublication(title)
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
            locations.push(response.headers.location)
            done()
          })
      )
    }
  })
})

tape('GET /accessions/{too-high}', function (test) {
  server(function (port, done) {
    http.get({
      path: '/accessions/100',
      port: port
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

tape('NOT-GET /accessions/{number}', function (test) {
  server(function (port, done) {
    http.get({
      method: 'DELETE',
      path: '/accessions/1',
      port: port
    }, function (response) {
      test.equal(
        response.statusCode, 405,
        'responds 405'
      )
      done()
      test.end()
    })
  })
})
