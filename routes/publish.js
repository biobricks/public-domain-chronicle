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

var Busboy = require('busboy')
var FormData = require('form-data')
var GRC_TOPICS = require('gordon-research-conference-topics')
var NETWORK = require('pdc-network')
var concat = require('concat-stream')
var displayParagraphs = require('./display-paragraphs')
var escape = require('./escape')
var html = require('./html')
var https = require('https')
var latest = require('../latest')
var methodNotAllowed = require('./method-not-allowed')
var parse = require('json-parse-errback')
var publish = require('../publish')
var pump = require('pump')
var saveFeedback = require('../util/save-feedback')
var through2 = require('through2')

var footer = require('./partials/footer')
var head = require('./partials/head')
var header = require('./partials/header')
var nav = require('./partials/nav')

var legalTool = latest(require('pdc-legal-tool'))

var JOURNALS = require('pct-minimum-documentation')
  .map(function (element) {
    return element.B
  })
  .sort()

var CATEGORY_ORDER = [
  'composition of matter', 'process', 'machine', 'manufacture'
]
var CATEGORIES = require('us-patent-categories')
  .sort(function (a, b) {
    return CATEGORY_ORDER.indexOf(a.term) - CATEGORY_ORDER.indexOf(b.term)
  })

var AAAS_AFFILIATES = require('aaas-affiliates')

var TOPICS = []
Object.keys(GRC_TOPICS).forEach(function (year) {
  GRC_TOPICS[year].forEach(function (topic) {
    if (!TOPICS.includes(topic)) TOPICS.push(topic)
  })
})

var SUBJECTS = require('nature-subjects').sort(function (a, b) {
  return a.toLowerCase().localeCompare(b.toLowerCase())
})

function get (request, response, configuration, errors) {
  response.setHeader('Content-Type', 'text/html; charset=UTF-8')
  response.end(
    template(configuration, {
      journals: JOURNALS,
      aaas: AAAS_AFFILIATES,
      subjects: SUBJECTS,
      grc: TOPICS,
      RECAPTCHA_PUBLIC: configuration.recaptcha.public,
      errors: errors
    })
  )
}

// TODO:  Refactor.
function post (request, response, configuration) {
  var parser
  /* istanbul ignore next */
  try {
    // TODO:  Give busboy file count and size limits.
    parser = new Busboy({headers: request.headers})
  } catch (error) {
    response.statusCode = 400
    response.end()
    return
  }
  var fields = {}
  var feedback
  var through = through2.obj()
  pump(
    through,
    publish(configuration, request.log, function (digest) {
      var location = configuration.base + 'publications/' + digest
      response.statusCode = 201
      response.setHeader('Content-Type', 'text/html; charset=UTF-8')
      response.setHeader('Location', location)
      response.end(redirectTo(location))
    }),
    function (error) {
      if (error) {
        request.log.error(error)
        response.statusCode = error.statusCode || 500
        response.end()
      }
    }
  )
  request.pipe(
    parser
      .on('field', function (field, value) {
        if (value.length === 0) return
        if (field.endsWith('[]')) {
          field = field.substring(0, field.length - 2)
          if (fields[field] && Array.isArray(fields[field])) {
            fields[field].push(value)
          } else {
            fields[field] = [value]
          }
        } else if (configuration.feedback && field === 'feedback') {
          feedback = value
        } else {
          fields[field] = value
        }
      })
      .on('file', function (field, file, filename, encoding, mimetype) {
        through.write({
          type: 'attachment',
          stream: file,
          filename: filename,
          encoding: encoding,
          mimetype: mimetype
        })
      })
      .once('finish', function () {
        var captchaResponse = fields['g-recaptcha-response']
        delete fields['g-recaptcha-response']
        verifyCatpcha(
          captchaResponse, configuration.recaptcha.secret,
          function (error, success) {
            /* istanbul ignore if */
            if (error) {
              response.statusCode = 500
              response.end()
              through.end()
            /* istanbul ignore next */
            } else if (success === false) {
              response.statusCode = 400
              response.end('invalid captcha')
              through.end()
            } else {
              normalize(fields)
              saveFeedback(configuration.directory, [
                'Name: ' + JSON.stringify(fields.name || 'none'),
                'Affiliation: ' + JSON.stringify(fields.affiliation || 'none'),
                'Title: ' + fields.title,
                'Feedback: ' + feedback,
                '---'
              ].join('\n') + '\n', function (error) {
                if (error) request.log.error(error)
              })
              through.write(fields)
              through.end()
            }
          }
        )
      })
  )
}

/* istanbul ignore next */
function verifyCatpcha (response, secret, callback) {
  if (process.env.NODE_ENV === 'test') {
    process.nextTick(function () {
      callback(null, true)
    })
  } else if (typeof response === 'string') {
    var form = new FormData()
    form.append('response', response)
    form.append('secret', secret)
    form.pipe(
      https.request({
        method: 'POST',
        host: 'www.google.com',
        path: '/recaptcha/api/siteverify',
        headers: form.getHeaders()
      }, function (response) {
        response.pipe(concat(function (body) {
          parse(body, function (error, data) {
            if (error) return callback(error)
            callback(null, data.success)
          })
        }))
      })
    )
  } else {
    process.nextTick(function () {
      callback(null, false)
    })
  }
}

module.exports = function (request, response, configuration) {
  var method = request.method
  if (method === 'GET') {
    get(request, response, configuration)
  } else if (request.method === 'POST') {
    post(request, response, configuration)
  } else {
    methodNotAllowed(response)
  }
}

function redirectTo (location) {
  return `
    <!doctype html>
    <html>
      <head>
        <title>Redirecting&hellip;</title>
        <meta http-equiv=refresh content="0;URL='${location}'">
      </head>
      <body>
        <p>
          Redirecting to <a href=${location}>${location}</a>&hellip;
        </p>
      </body>
    </html>
  `
}

var DELETE_IF_EMPTY = ['name', 'affiliation', 'safety']

var ARRAYS = [
  'ussubjectmatter',
  'journals',
  'naturesubjects',
  'classifications',
  'gordonresearchconferences',
  'aaasaffiliates'
]

var NORMALIZE_LINES = ['finding', 'safety']

function normalize (record) {
  record.metadata = {}
  ARRAYS.forEach(function (key) {
    if (record.hasOwnProperty(key) && record[key].length !== 0) {
      var list = record[key]
      delete record[key]
      record.metadata[key] = list
    }
  })
  DELETE_IF_EMPTY.forEach(function (key) {
    if (Array.isArray(record[key])) {
      record[key] = record[key].filter(function (element) {
        return element !== ''
      })
    } else if (record[key] === '') {
      delete record[key]
    }
  })
  NORMALIZE_LINES.forEach(function (key) {
    if (typeof record[key] === 'string') {
      record[key] = record[key].replace(/\r/g, '')
    }
  })
}

// TODO: search interface to find related contributions by submitter name

function template (configuration, data) {
  return html`
<!doctype html>
<html lang=en>
  ${head(configuration, 'Publish')}
  <body>
    ${header()}
    ${nav()}

    <main>
      <p>
        Use this form to contribute scientific work to the public domain
        by publishing to the
        <a
            href=https://publicdomainchronicle.org
            target=_blank
          >Public Domain Chronicle</a>.
      </p>

      <p>
        This is a generic form for contributions in all fields of science.
        If the specific field of your contribution appears below,
        use the linked form instead.
        That form will be faster and easier for you to fill out.
      </p>

      <table>
        <thead>
          <th>Fields</th>
          <th>Form</th>
          <th>Host</th>
        </thead>
        <tbody>
          ${NETWORK
              .filter(function (member) {
                return member.server.fields
              })
              .map(function (member) {
                return html`
                  <tr>
                    <td>${member.server.fields.map(escape).join(' ')}</td>
                    <td>
                      <a
                          href="${escape(member.server.publish)}"
                          target=_blank
                        >${escape(member.server.publish.replace(/^https?:\/\//, ''))}</a>
                    </td>
                    <td>
                      <a
                          href="${escape(member.host.website)}"
                          target=_blank
                        >${escape(member.host.name)}</a>
                    </td>
                  </tr>
                `
              })
          }
        </tbody>
      </table>

      <aside class=legal>
        Do not break the law, any institutional policy, or any contract
        by publishing in PDC.
        See
        <a
            target=_blank
            href=https://publicdomainchronicle.org/contribute
          >PDC&rsquo;s contributor guide</a>
        for more information.
      </aside>

      ${data.errors && html`
        <p class=bad>The submitted publication had invalid input.</p>
      `}

      <form method=post action=publish enctype=multipart/form-data>
        <input type=hidden name=version value=1.0.0>

        <section id=contributor>
          <h1>Contributor</h1>

          <aside class=legal>
            To publish in PDC, you must grant a public copyright
            license for your submission.  Usually, the one who writes
            the materials is the one who has to give the license.
            The answers to this form, especially the title, finding,
            and any attachments, should be your own work.
          </aside>

          <section id=name class=optional>
            <h2>Name</h2>

            <p>Please provide your full name.</p>

            <p>
              If you want to publish to PDC anonymously, leave this
              field blank.
            </p>

            <input name=name type=text autocomplete=name>
          </section>

          <section id=affiliation class=optional>
            <h2>Affiliation</h2>

            <p>
              Please provide the legal name of your commercial, academic,
              nonprofit, governmental, or other organization, if any.
            </p>

            <p>
              If you want to publish to PDC anonymously, leave this
              field blank.
            </p>

            <input name=affiliation type=text autocomplete=organization>
          </section>
        </section>

        <section class=required id=title>
          <h2>Title</h2>

          <p>
            Provide a title for your submission, describing what you've
            found and how it is useful, in the terms most natural for
            you and colleagues in your field.
          </p>

          <input name=title type=text maxlength=256 spellcheck required>
        </section>

        <section id=finding class=required>
          <h2>Finding</h2>

          <p>
            Describe what you&rsquo;ve found. Feel free to put it just
            as you would to a colleague in your field, to make clear to
            them what&rsquo;s new, and how it&rsquo;s useful.
            Feel free to use multiple paragraphs if necessary.
          </p>

          <aside class=legal>
            This is the most important part.  If your description
            enables others in your field to make and use what you've
            found, publishing it helps secure it for the public domain.
            If at all possible, have a colleague review your description
            and tell you if it&rsquo;s missing anything that isn&rsquo;t
            obvious.
          </aside>

          <textarea
              name=finding
              rows=30
              maxlength=28000
              spellcheck
              required></textarea>
        </section>

        <section id=safety class=optional>
          <h2>Safety Notes</h2>

          <p>
            Optionally describe any special safety precautions others
            might like to take when trying and using your contribution,
            to protect themselves, other people, and the environment.
          </p>

          <textarea name=safety rows=10 spellcheck></textarea>
        </section>

        <section id=attachments class=optional>
          <h1>Attachments</h1>

          <p>
            If images or other data files help describe your
            finding or how to use it, attach them here.
            Please <em>don&rsquo;t</em> attach a preprint PDF or article.
            Those best belong on a preprint server, like
            <a href=http://biorxiv.org target=_blank>bioR&chi;iv</a>,
            under a <a href=https://creativecommons.org>Creative Commons</a>
            license.
          </p>

          <aside class=legal>
            Consider publishing computer code, data files,
            and other technical work to a public repository
            like <a href=https://github.com>GitHub</a> under an <a
            href=https://opensource.org/licenses>open source software</a>,
            <a href=https://opendatacommons.org/licenses>open data</a>,
            or similar license.
          </aside>

          <ul class=inputs>
            ${html`
              <li><input name=attachments[] type=file></li>
            `.repeat(3)}
          </ul>
        </section>

        <section id=metadata>
          <h1>Metadata</h1>

          <p>
            &ldquo;Metadata&rdquo;, or data about data, help researchers
            and computer programs catalog, index, and search digital
            records like your publication.  Taking a few seconds to add
            metadata to your publication transforms it from a needle in
            a haystack into a useful record for reseachers.
          </p>

          <section id=ussubjectmatter class=recommended>
            <h2>Subject Matter Category</h2>

            <p>
              Which of the follow best describes your contribution?
              Usually, only one should match.  Choose the closest.
            </p>

            <ul class=shortListOfCheckBoxes>
              ${CATEGORIES.map(function (category) {
                return html`
                <li>
                  <label>
                    <input
                        name=ussubjectmatter[]
                        type=checkbox
                        value="${escape(category.term)}">
                    ${escape(category.term)}
                    ${category.aka && (
                      '(or ' +
                      category.aka
                        .map(function (term) {
                          return escape('"' + term + '"')
                        })
                        .join(', ') +
                      ')'
                    )}
                    &mdash;
                    ${escape(category.definition)}
                  </label>
                </li>
                `
              })}
            </ul>
          </section>

          <section id=journals class=recommended>
            <h2>Journals</h2>

            <p>
              Which journals do others interested in the area of your
              contribution publish in and read?  Tick the boxes next to
              the journals most relevant to the field of your contribution.
              Usually, two or three journals are enough.
            </p>

            <ul class=listOfCheckBoxes>
              ${data.journals.map(function (journal) {
                return html`
                <li>
                  <label>
                    <input
                        name=journals[]
                        type=checkbox
                        value="${escape(journal)}">
                    ${escape(journal)}
                  </label>
                </li>
                `
              })}
            </ul>
          </section>

          <section id=naturesubjects class=recommended>
            <h2>Subject Keywords</h2>

            <p>
              Which of the following subject keywords describe the area of your
              contribution? Usually, three or four are enough.
            </p>

            <ul class=listOfCheckBoxes>
              ${data.subjects.map(function (subject) {
                return html`
                <li>
                  <label>
                    <input
                        name=naturesubjects[]
                        type=checkbox
                        value="${escape(subject.toLowerCase())}">
                    ${escape(subject)}
                  </label>
                </li>
                `
              })}
            </ul>
          </section>

          <section id=aaasaffiliates class=recommended>
            <h2>AAAS Affiliates</h2>

            <p>
              Which American Association for the Advancement of
              Science affiliate organizations are most relevant
              to the field of your contribution?
              Usually, one or two are enough.
            </p>

            <ul class=listOfCheckBoxes>
              ${data.aaas.map(function (affiliate) {
                return html`
                <li>
                  <label>
                    <input
                        name=aaasaffiliates[]
                        type=checkbox
                        value="${escape(affiliate)}">
                    ${escape(affiliate)}
                  </label>
                </li>
                `
              })}
            </ul>
          </section>

          <section id=gordonresearchconferences class=recommended>
            <h2>Gordon Research Conferences</h2>

            <p>
              Which Gordon Research Conferences topics
              are most relevant to the field of your contribution?
              Usually, two or three are enough.
            </p>

            <ul class=listOfCheckBoxes>
              ${data.grc.map(function (topic) {
                return html`
                <li>
                  <label>
                    <input
                        name=gordonresearchconferences[]
                        type=checkbox
                        value="${escape(topic)}">
                    ${escape(topic)}
                  </label>
                </li>
                `
              })}
            </ul>
          </section>

          <section id=classifications class=optional>
            <h2>Patent Classifications</h2>

            <p>
              The
              <a href=http://web2.wipo.int/classifications/ipc/ipcpub
                >International Patent Classification</a>
              is a standardized taxonomy of technologies, referred to by codes.
              For example,
              <a href=http://web2.wipo.int/classifications/ipc/ipcpub?notion=scheme&version=20170101&symbol=C12N0009000000&menulang=en&lang=en&viewmode=m&fipcpc=no&showdeleted=yes&indexes=no&headings=yes&notes=yes&direction=o2n&initial=A&cwid=none&tree=no&searchmode=smart
                ><code>C12N 0/900</code></a>
              denotes
              <a href=https://en.wikipedia.org/wiki/Oxidoreductase>oxidoreductases</a>.
            </p>

            <p>
              If you happen to know patent classifications in the
              area of your finding, search for them below
              Otherwise, feel free to skip this section.
              There are many, many classifications, and it can be
              difficult to find relevant ones from scratch.
            </p>

            <div id=ipcSearch>
              <p>Search for patent classifications:</p>
              <input type=search id=ipcSearchBox>
              <button id=ipcSearchButton>Search</button>
              <ul class=inputs id=ipcs></ul>
            </div>
          </section>

          <section id=links class=optional>
            <h2>Other PDC Publications</h2>

            <p>
              If your contribution builds from or refers to previous PDC
              publications, copy their cryptographic digests into the
              boxes below.
            </p>

            <ul class=inputs>
              ${html`
                <li>
                  <input
                      name=links[]
                      type=text
                      pattern="^[abcdef0-9]{64}$"
                      placeholder="SHA-256 digest">
                </li>
              `.repeat(3)}
            </ul>
          </section>
        </section>

        <section id=legal class=required>
          <h2>${escape(legalTool.title)}</h2>
          <p class=version>Version ${escape(legalTool.version)}</p>
          ${displayParagraphs(legalTool.paragraphs)}
          <label>
            <input
                name=legal
                type=checkbox
                value="${escape(legalTool.version)}"
                required>
            Check this box to apply the legal tool to your submission.
          </label>
        </section>

        ${configuration.feedback && html`
        <section id=feedback class=optional>
          <h2>Feedback</h2>
          <p>
            How could we make this form easier to use?
          </p>
          <textarea name=feedback rows=5></textarea>
        </section>
        `}

        <section id=submit>
          <h2>Publish</h2>

          <p>
            Submittions to PDC are published instantly, publicly, and
            permanently.  Please take a moment to review your responses.
          </p>

          <div class=g-recaptcha data-sitekey="${data.RECAPTCHA_PUBLIC}"></div>
          <noscript>
            <div>
              <div style="width: 302px; height: 422px; position: relative;">
                <div style="width: 302px; height: 422px; position: absolute;">
                  <iframe
                      src="https://www.google.com/recaptcha/api/fallback?k=${data.RECAPTCHA_PUBLIC}"
                      frameborder=0
                      scrolling=no
                      style="width: 302px; height:422px; border-style: none;">
                  </iframe>
                </div>
              </div>
              <div
                style="width: 300px; height: 60px; border-style: none; bottom: 12px; left: 25px; margin: 0px; padding: 0px; right: 25px; background: #f9f9f9; border: 1px solid #c1c1c1; border-radius: 3px;">
                <textarea
                    id=g-recaptcha-response
                    name=g-recaptcha-response
                    class=g-recaptcha-response
                    style="width: 250px; height: 40px; border: 1px solid #c1c1c1; margin: 10px 25px; padding: 0px; resize: none;"
                ></textarea>
              </div>
            </div>
          </noscript>

          <input type=submit value="Publish to PDC">
        </section>
      </form>
    </main>

    ${footer()}

    <script src=publish.js></script>
    <script src=https://www.google.com/recaptcha/api.js></script>
  </body>
</html>
  `
}
