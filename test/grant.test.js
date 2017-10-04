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
var server = require('./server')
var tape = require('tape')

tape('GET /grant JSON', function (test) {
  server(function (port, done) {
    var request = {
      path: '/grant',
      port: port,
      headers: {
        accept: 'application/json'
      }
    }
    http.get(request, function (response) {
      test.equal(
        response.statusCode, 200,
        'responds 200'
      )
      test.equal(
        response.headers['content-type'], 'application/json',
        'Content-Type: application/json'
      )
      done()
      test.end()
    })
  })
})

tape('GET /grant?version={valid} JSON', function (test) {
  server(function (port, done) {
    var request = {
      path: '/grant?version=1.0.0',
      port: port,
      headers: {
        accept: 'application/json'
      }
    }
    http.get(request, function (response) {
      test.equal(
        response.statusCode, 200,
        'responds 200'
      )
      test.equal(
        response.headers['content-type'], 'application/json',
        'Content-Type: application/json'
      )
      done()
      test.end()
    })
  })
})

tape('GET /grant?version={invalid} JSON', function (test) {
  server(function (port, done) {
    var request = {
      path: '/grant?version=100.100.100',
      port: port,
      headers: {
        accept: 'application/json'
      }
    }
    http.get(request, function (response) {
      test.equal(
        response.statusCode, 404,
        'responds 404'
      )
      done()
      test.end()
    })
  })
})
tape('GET /grant HTML', function (test) {
  server(function (port, done) {
    var request = {
      path: '/grant',
      port: port,
      headers: {
        accept: 'text/html'
      }
    }
    http.get(request, function (response) {
      test.equal(
        response.statusCode, 200,
        'responds 200'
      )
      test.equal(
        response.headers['content-type'], 'text/html; charset=UTF-8',
        'Content-Type: text/html; charset=UTF-8'
      )
      done()
      test.end()
    })
  })
})

tape('GET /grant XML', function (test) {
  server(function (port, done) {
    var request = {
      path: '/grant',
      port: port,
      headers: {
        accept: 'application/xml'
      }
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

tape('DELETE /grant', function (test) {
  server(function (port, done) {
    var request = {
      method: 'DELETE',
      path: '/grant',
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
