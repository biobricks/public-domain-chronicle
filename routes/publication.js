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
var formatDate = require('../format-date')
var fs = require('fs')
var html = require('./html')
var methodNotAllowed = require('./method-not-allowed')
var notFound = require('./not-found')
var parse = require('json-parse-errback')
var path = require('path')
var readTimestamps = require('../util/read-timestamps')
var runParallel = require('run-parallel')
var send = require('send')
var url = require('url')
var xtend = require('xtend')

var footer = require('./partials/footer')
var head = require('./partials/head')
var header = require('./partials/header')
var nav = require('./partials/nav')

module.exports = function (request, response, configuration) {
  if (request.method === 'GET') {
    var digest = request.params.digest
    if (!encoding.isDigest(digest)) {
      notFound(request, response, configuration)
    } else {
      var type = new Negotiator(request).mediaType([
        'application/json', 'text/html'
      ])
      if (!type) {
        response.statusCode = 415
        response.end()
      } else {
        var directory = configuration.directory
        var pathPrefix = path.join(
          directory, 'publications', digest
        )
        var json = pathPrefix + '.json'
        /* istanbul ignore else */
        if (type === 'application/json') {
          send(request, json)
            .on('error', /* istanbul ignore next */ function (error) {
              request.log.error(error)
              response.statusCode = error.status || 500
              response.end()
            })
            .pipe(response)
        } else if (type === 'text/html') {
          var data
          var timestamps
          runParallel([
            function readPublication (done) {
              fs.readFile(json, 'utf8', function (error, read) {
                if (error) return done(error)
                parse(read, function (error, parsed) {
                  if (error) return done(error)
                  data = parsed
                  done()
                })
              })
            },
            function readAllTimestamps (done) {
              readTimestamps(
                directory, digest,
                function (error, read) {
                  if (error) return done(error)
                  timestamps = read
                    .map(function (record) {
                      var stamp = record.timestamp
                      return {
                        time: new Date(stamp.time),
                        hostname: url.parse(stamp.uri).hostname,
                        signature: encoding.format(record.signature)
                      }
                    })
                    .sort(function (a, b) {
                      return a.time - b.time
                    })
                    .map(function (record) {
                      return xtend(record, {
                        time: record.time.toLocaleString()
                      })
                    })
                  done()
                }
              )
            }
          ], function (error) {
            if (error) {
              request.log.error(error)
              response.statusCode = 500
              response.end()
            } else {
              data.date = formatDate(data.date)
              data.digest = digest
              data.formattedDigest = encoding.format(digest)
              data.timestamps = timestamps
              data.hostname = configuration.hostname
              if (data.finding) {
                data.findin = splitIntoParagraphs(data.finding)
              }
              if (data.safety) {
                data.safety = splitIntoParagraphs(data.safety)
              }
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
      <h1>${escape(data.title)}</h1>

      <p><code>${data.formattedDigest}</code></p>

      ${
  data.name
    ? html`
            <h2>Contributor</h2>
            <p class=name>${escape(data.name)}</p>
          `
    : html`<p>Published anonymously.</p>`
}

      ${data.affiliation && html`
        <h2>Affiliation</h2>
        <p class=affiliation>${escape(data.affiliation)}</p>
      `}

      <h2>Finding</h2>
      <p>${escape(data.finding)}</p>

      <h2>Safety Notes</h2>
      ${
  data.safety
    ? data.safety.map(function (paragraph) {
      return html`<p>${escape(paragraph)}</p>`
    })
    : html`<p>No safety notes.</p>`
}

      <h2>Attachments</h2>

      <ul>
      ${data.attachments.map(function (attachment) {
    return html`
        <li>
          <a href="publications/${data.digest}/attachments/${attachment}">
            ${escape(attachment)}
          </a>
        </li>
        `
  })}
      </ul>

      ${data.attachments.length === 0 && html`<p>No attachments.</p>`}

      <h2>Metadata</h2>

      <ul id=ussubjectmatter>
      ${
  data.metadata &&
        data.metadata.ussubjectmatter &&
        data.metadata.ussubjectmatter.map(function (category) {
          return html`<li>Subject Matter Category: ${escape(category)}</li>`
        })
}
      </ul>

      <ul id=journals>
      ${
  data.metadata &&
        data.metadata.journals &&
        data.metadata.journals.map(function (journal) {
          return html`<li>Related Journal: ${escape(journal)}</li>`
        })
}
      </ul>

      <ul id=naturesubjects>
      ${
  data.metadata &&
        data.metadata.naturesubjects &&
        data.metadata.naturesubjects.map(function (subject) {
          return html`<li>Subject Keyword: ${escape(subject)}</li>`
        })
}
      </ul>

      <ul id=aaasaffiliates>
      ${
  data.metadata &&
        data.metadata.aaasaffiliates &&
        data.metadata.aaasaffiliates.map(function (affiliate) {
          return html`<li>AAAS Affiliate: ${escape(affiliate)}</li>`
        })
}
      </ul>

      <ul id=gordonresearchconferences>
      ${
  data.metadata &&
        data.metadata.gordonresearchconferences &&
        data.metadata.gordonresearchconferences.map(function (topic) {
          return html`<li>GRC topic: ${escape(topic)}</li>`
        })
}
      </ul>

      <ul id=classifications>
      ${
  data.metadata &&
        data.metadata.classifications &&
        data.metadata.classifications.map(function (ipc) {
          return html`
            <li>
              International Patent Classification:
              ${escape(ipc)}
            </li>
          `
        })
}
      </ul>

      <ul id=links>
      ${data.links && data.links.map(function (link) {
    return html`<li>Related PDC Publication: ${escape(link)}</li>`
  })}
      </ul>

      <h2>Versions</h2>

      <table>
        <tr>
          <th>Schema</th><td>${escape(data.version)}</td>
        </tr>
        <tr>
          <th>Legal Tool</th><td>${escape(data.legal)}</td>
        </tr>
      </table>

      <h2>Timestamps</h2>

      <ul>
      ${timestamps.map(function (timestamp) {
    return html`
        <li>
          <dl>
            <dt>Published</dt>
            <dd>${escape(timestamp.time)}</dd>
            <dt>Host</dt>
            <dd><a href="${escape(timestamp.uri)}">${escape(timestamp.hostname)}</a></dd>
            <dt>Signature</dt>
            <dd><code>${timestamp.signature}</code></dd>
          </dl>
        </li>
        `
  })}
      </ul>
    </main>
    </div>
    ${footer()}
  </body>
</html>
              `)
            }
          })
        }
      }
    }
  } else {
    methodNotAllowed(response)
  }
}

function splitIntoParagraphs (string) {
  return string.split(/\n+/)
}
