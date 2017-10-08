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

var AJV = require('ajv')
var attachmentPath = require('./util/attachment-path')
var concat = require('simple-concat')
var crypto = require('crypto')
var encoding = require('./encoding')
var flushWriteStream = require('flush-write-stream')
var fs = require('fs')
var https = require('https')
var mkdirp = require('mkdirp')
var once = require('once')
var parse = require('json-parse-errback')
var path = require('path')
var pump = require('pump')
var recordDirectoryPath = require('./util/record-directory-path')
var recordPath = require('./util/record-path')
var runParallel = require('run-parallel')
var runSeries = require('run-series')
var semver = require('semver')
var sodium = require('sodium-native')
var stringify = require('json-stable-stringify')
var through2 = require('through2')
var timestampPath = require('./util/timestamp-path')
var uuid = require('uuid/v4')

var ajv = new AJV({allErrors: true})

var publicationValidators = validatorsFor(require('pdc-publication-schema'))
var timestampValidators = validatorsFor(require('pdc-timestamp-schema'))

function validatorsFor (schema) {
  return Object.keys(schema)
    .sort(semver.rcompare)
    .map(function (version) {
      return {
        version: version,
        validate: ajv.compile(schema[version])
      }
    })
}

function validatePublication (publication) {
  var validator = publicationValidators.find(function (validator) {
    return validator.version === publication.version
  })
  if (!validator) {
    return ['Unknown schema version: ' + publication.version]
  }
  validator.validate(publication)
  return validator.validate.errors || []
}

// TODO: Delete attachment files in /tmp for invalid publications.

// Create a writable stream that accepts one or more attachment chunks,
// followed by a publication chunk, and writes files and a signed
// timestamp to the data directory.
//
// Attachment chunks look like:
//
//     {
//       type: 'attachment',
//       stream: Readable,
//       filename: String,
//       encoding: String,
//       mimetype: String
//     }
//
// Publication fields contain JSON data.
module.exports = function (configuration, log, callback) {
  var directory = configuration.directory
  var attachments = []
  var validPublication = false
  return flushWriteStream.obj(
    function (object, _, done) {
      if (object.type === 'attachment') {
        writeAttachment(object, done)
      } else {
        writePublication(object, function (error, digest) {
          if (error) return done(error)
          validPublication = digest
          done()
        })
      }
    },
    function (done) {
      if (validPublication) {
        callback(validPublication)
      } else {
        runParallel(
          attachments.map(function (attachment) {
            return function unlinkTemporaryFile (done) {
              fs.unlink(attachment.temporaryFile, function (error) {
                log.error(error)
                done()
              })
            }
          }),
          function () {
            done()
          }
        )
      }
    }
  )

  function writeAttachment (object, callback) {
    // Save to ./tmp/{UUID}.
    var id = uuid()
    var temporaryFile = path.join(directory, 'tmp', id)
    var attachment = {
      stream: object.stream,
      temporaryFile: temporaryFile,
      type: object.mimetype + '; charset=' + object.encoding
    }
    log.info('attachment', {
      uuid: id,
      filename: object.filename,
      encoding: object.encoding,
      mimetype: object.mimetype
    })
    attachments.push(attachment)
    var hash = crypto.createHash('sha256')
    var size = 0
    pump(
      object.stream,
      // Compute SHA256 as we write to disk.
      through2(function (chunk, chunkEncoding, done) {
        size += chunk.length
        hash.update(chunk, chunkEncoding)
        this.push(chunk, chunkEncoding)
        done()
      }),
      fs.createWriteStream(temporaryFile),
      function (error) {
        /* istanbul ignore next */
        if (error) {
          callback(error)
        } else {
          if (size === 0) {
            var index = attachments.indexOf(attachment)
            attachments.splice(index, 1)
          } else {
            attachment.digest = encoding.encode(hash.digest())
          }
          callback()
        }
      }
    )
  }

  function writePublication (publication, callback) {
    var secretKey = configuration.keypair.secret
    var publicKey = configuration.keypair.public
    var time = new Date().toISOString()
    publication.attachments = attachments
      .map(function (attachment) {
        return attachment.digest
      })
      .sort()
    log.info('publication', publication)
    if (!publication.version) {
      publication.version = publicationValidators[0].version
    }
    var validationErrors = validatePublication(publication)
    if (validationErrors.length) {
      log.info('validationErrors', validationErrors)
      var validationError = new Error('Invalid input')
      validationError.validationErrors = validationErrors
      callback(validationError)
    } else {
      var record = Buffer.from(stringify(publication), 'utf8')
      var digest = Buffer.alloc(sodium.crypto_hash_sha256_BYTES)
      sodium.crypto_hash_sha256(digest, record)
      digest = encoding.encode(digest)
      var uri = (
        'https://' + configuration.hostname +
        '/publications/' + digest
      )
      var timestamp = {
        digest: digest,
        uri: uri,
        time: time
      }
      var signature = Buffer.alloc(sodium.crypto_sign_BYTES)
      sodium.crypto_sign_detached(
        signature,
        Buffer.from(stringify(timestamp)),
        secretKey
      )
      runSeries([
        function writeJSONFile (done) {
          fs.writeFile(recordPath(directory, digest), record, done)
        },
        function createDirectory (done) {
          mkdirp(recordDirectoryPath(directory, digest), done)
        },
        function writeTimestampFile (done) {
          fs.writeFile(
            timestampPath(directory, digest, publicKey),
            stringify({
              timestamp: timestamp,
              signature: encoding.encode(signature),
              version: timestampValidators[0].version
            }),
            done
          )
        },
        function writeAttachments (done) {
          if (attachments.length > 0) {
            runParallel(
              attachments.reduce(
                function (tasks, attachment) {
                  var file = attachmentPath(
                    directory, digest, attachment.digest
                  )
                  return tasks.concat([
                    function writeTypeFile (done) {
                      fs.writeFile(
                        file + '.type',
                        attachment.type,
                        'utf8',
                        done
                      )
                    },
                    function moveFile (done) {
                      fs.rename(
                        attachment.temporaryFile, file,
                        done
                      )
                    }
                  ])
                },
                []
              ),
              done
            )
          } else {
            done()
          }
        },
        function appendToAccessions (done) {
          fs.appendFile(
            path.join(directory, 'accessions'),
            time + ',' + digest + '\n',
            done
          )
        },
        function stampWithStampery (done) {
          if (configuration.stampery) {
            stamp(configuration, log, digest, done)
          } else {
            done()
          }
        }
      ], function (error) {
        /* istanbul ignore if */
        if (error) {
          error.statusCode = 500
          callback(error)
        } else {
          callback(null, digest)
        }
      })
    }
  }
}

function stamp (configuration, log, digest, callback) {
  callback = once(callback)
  var auth = (
    configuration.stampery.user + ':' +
    configuration.stampery.password
  )
  https.request({
    host: 'api-prod.stampery.com',
    path: '/stamps/' + digest,
    auth: auth
  })
    .once('error', function (error) {
      log.error(error)
      callback()
    })
    .once('response', function (response) {
      concat(response, function (error, buffer) {
        if (error) {
          log.error(error)
          callback()
        } else {
          parse(buffer, function (error, data) {
            if (error) {
              log.error(error)
              callback()
            } else if (data.error) {
              log.error(data)
              callback()
            } else if (!Array.isArray(data.results)) {
              log.error('no stampery results')
              callback()
            } else {
              if (data.results.length !== 0) {
                log.info('already stamped')
                callback()
              } else {
                https.request({
                  method: 'POST',
                  host: 'api-prod.stampery.com',
                  path: '/stamps',
                  auth: auth,
                  headers: {
                    'Content-Type': 'application/json'
                  }
                })
                  .once('error', function (error) {
                    log.error(error)
                    callback()
                  })
                  .once('response', function (response) {
                    concat(response, function (error, buffer) {
                      if (error) {
                        log.error(error)
                        callback()
                      } else {
                        parse(buffer, function (error, data) {
                          if (error) {
                            log.error(error)
                          } else if (data.error) {
                            log.error(data.error)
                          } else if (!data.result) {
                            log.error('no stampery result')
                          } else {
                            log.info(data.result, 'stamp')
                          }
                          callback()
                        })
                      }
                    })
                  })
                  .end(JSON.stringify({hash: digest}))
              }
            }
          })
        }
      })
    })
    .end()
}
