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
var encoding = require('../encoding')
var escape = require('./escape')
var flushWriteStream = require('flush-write-stream')
var formatDate = require('../format-date')
var fs = require('fs')
var html = require('./html')
var methodNotAllowed = require('./method-not-allowed')
var parse = require('json-parse-errback')
var path = require('path')
var pump = require('pump')
var rfc822 = require('rfc822-date')
var split2 = require('split2')
var through2 = require('through2')

var footer = require('./partials/footer')
var head = require('./partials/head')
var header = require('./partials/header')
var nav = require('./partials/nav')

var BYTES_PER_LINE = require('../bytes-per-accession')

module.exports = function (request, response, configuration) {
  if (request.method === 'GET') {
    var type = new Negotiator(request).mediaType([
      'text/csv', 'text/html', 'application/rss+xml'
    ])
    if (!type) {
      response.statusCode = 415
      response.end()
    } else {
      var accessions = path.join(configuration.directory, 'accessions')
      /* istanbul ignore else */
      if (request.pathname === '/rss.xml' || type === 'application/rss+xml') {
        response.setHeader(
          'Content-Type', 'application/rss+xml; charset=UTF-8'
        )
        var through = through2.obj(
          function (line, _, done) {
            var self = this
            var split = line.split(',')
            var date = rfc822(new Date(split[0]))
            var digest = split[1]
            var link = configuration.base + 'publications/' + digest
            var file = path.join(
              configuration.directory, 'publications', digest + '.json'
            )
            fs.readFile(file, 'utf8', function (error, data) {
              if (error) {
                request.log.error(error)
                done()
              } else {
                parse(data, function (error, publication) {
                  if (error) {
                    request.log.error(error)
                    done()
                  } else {
                    self.push(`
                      <item>
                        <title>${escapeXML(publication.title)}</title>
                        <link>${link}</link>
                        <guid>${link}</guid>
                        <pubDate>${date}</pubDate>
                      </item>
                    `)
                    done()
                  }
                })
              }
            })
          },
          function (done) {
            this.push('</channel></rss>')
            done()
          }
        )
        through.push(`
          <?xml version="1.0"?>
          <rss version="2.0">
            <channel>
              <title>Public Domain Chronicle</title>
              <link>${configuration.hostname}</link>
              <description>
                Public Domain Chronicle publications
                from ${configuration.hostname}
              </description>
        `)
        pump(
          fs.createReadStream(accessions),
          split2(),
          through,
          response
        )
      } else if (type === 'text/csv') {
        response.setHeader('Content-Type', 'text/csv; charset=ASCII')
        var options = request.query.from
          ? { start: BYTES_PER_LINE * (parseInt(request.query.from) - 1) }
          : {}
        fs.createReadStream(accessions, options)
          .once('error', /* istanbul ignore next */ function (error) {
            request.log.error(error)
            response.statusCode = 500
            response.end()
          })
          .pipe(response)
      } else if (type === 'text/html') {
        var data = { accessions: [] }
        var counter = 0
        pump(
          fs.createReadStream(accessions),
          split2(),
          flushWriteStream.obj(function (line, _, done) {
            var split = line.split(',')
            var timestamp = formatDate(new Date(split[0]))
            data.accessions.push({
              number: ++counter,
              timestamp: timestamp,
              digest: encoding.encode(split[1]),
              formattedDigest: encoding.format(split[1])
            })
            done()
          }),
          function (error) {
            if (error) {
              response.statusCode = 500
              response.end()
            } else {
              response.setHeader(
                'Content-Type', 'text/html; charset=UTF-8'
              )
              response.end(html`
<!doctype html>
<html lang=en>
  ${head(configuration, data.title)}
  <body>
    <div class=wrapper>
    ${header()}
    ${nav()}
    <main>
      <table>
        <thead>
          <tr>
            <th>№</th>
            <th>Published</th>
            <th>Cryptographic Digest</th>
          </tr>
        </thead>
        <tbody>
          ${data.accessions.map(function (accession) {
    return html`
            <tr>
              <td>${escape(accession.number)}</td>
              <td>${escape(accession.timestamp)}</td>
              <td>
                <a href=${configuration.base}publications/${escape(accession.digest)}>
                  <code>${accession.formattedDigest}</code>
                </a>
              </td>
            </tr>
            `
  })}
        </tbody>
      </table>
    </main>
    </div>
    ${footer()}
  </body>
</html>

              `)
            }
          }
        )
      }
    }
  } else {
    methodNotAllowed(response)
  }
}

function escapeXML (string) {
  return string
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/&/g, '&amp;')
}
