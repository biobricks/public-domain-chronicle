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
var server = require('./server')
var stringToStream = require('string-to-stream')
var tape = require('tape')

tape('GET /publish', function (test) {
  server(function (port, done) {
    var request = { path: '/publish', port: port }
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

tape('POST /publish with valid', function (test) {
  server(function (port, done) {
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
          done()
          test.end()
        })
    )
  })
})

tape('POST /publish with attachment', function (test) {
  server(function (port, done) {
    var form = makeValidPublication()
    var attachmentText = 'This is a test attachment.'
    form.append('attachments[]',
      stringToStream(attachmentText),
      {
        filename: 'attachment.txt',
        contentType: 'text/plain',
        knownLength: attachmentText.length
      }
    )
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
          done()
          test.end()
        })
    )
  })
})

tape('DELETE /publish', function (test) {
  server(function (port, done) {
    http.request({
      method: 'DELETE',
      path: '/publish',
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
