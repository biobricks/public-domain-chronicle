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
var concat = require('concat-stream')
var encoding = require('./encoding')
var flushWriteStream = require('flush-write-stream')
var fs = require('fs')
var http = require('http-https')
var latest = require('./latest')
var mkdirp = require('mkdirp')
var parse = require('json-parse-errback')
var path = require('path')
var pump = require('pump')
var readRecord = require('./util/read-record')
var recordDirectoryPath = require('./util/record-directory-path')
var recordPath = require('./util/record-path')
var runParallel = require('run-parallel')
var runSeries = require('run-series')
var signaturePath = require('./util/timestamp-path')
var sodium = require('sodium-native')
var split2 = require('split2')
var stringify = require('json-stable-stringify')
var through2 = require('through2')
var timestampPath = require('./util/timestamp-path')
var url = require('url')
var xtend = require('xtend')

var timestampSchema = latest(require('pdc-timestamp-schema'))

var validatePublication = new AJV({ allErrors: true })
  .compile(latest(require('pdc-publication-schema')))

var validateTimestamp = new AJV({ allErrors: true })
  .compile(timestampSchema)

module.exports = function (configuration, log) {
  var directory = configuration.directory
  readPeers(directory, log, function (error, peers) {
    if (error) return logError(error)
    log.info({
      peers: peers.map(function (peer) {
        return url.format(peer.url)
      })
    }, 'read peers')
    runParallel(
      peers.map(function (peer) {
        return function (done) {
          var peerLog = log.child({ peer: peer.url.hostname })
          peerLog.info('replicating')
          replicatePeer(configuration, peerLog, peer, done)
        }
      }),
      function (error) {
        if (error) return logError(error)
        if (peers.length === 0) {
          log.info('done')
        } else {
          writePeers(directory, peers, function (error) {
            if (error) return logError(error)
            log.info('done')
          })
        }
      }
    )
  })

  function logError (error) {
    log.error(error)
  }
}

function replicatePeer (configuration, log, peer, done) {
  var request = xtend(peer.url, {
    path: peer.url.path + '/accessions?from=' + (peer.last + 1),
    headers: { accept: 'text/csv' }
  })
  http.request(request)
    .once('error', function (error) {
      done(error)
    })
    .once('response', function (response) {
      var counter = peer.last
      pump(
        response,
        split2(),
        through2.obj(function (line, _, done) {
          counter++
          done(null, {
            accessionNumber: counter,
            digest: line.toString().split(',')[1]
          })
        }),
        flushWriteStream.obj(function (publication, _, done) {
          var recordLog = log.child({ digest: publication.digest })
          republish(configuration, recordLog, peer, publication, done)
        }),
        function (error) {
          if (error) {
            done(error)
          } else {
            done()
          }
        }
      )
    })
    .end()
}

function republish (configuration, log, peer, publication, done) {
  var time = new Date().toISOString()
  var files = []
  var haveRecord
  var havePeerTimestamp
  var record
  var peerTimestamp
  runSeries([
    runParallel.bind(null, [
      checkHaveRecord,
      checkHavePeerTimestamp
    ]),
    runParallel.bind(null, [
      getRecord,
      unless(havePeerTimestamp, getPeerTimestamp)
    ]),
    unless(haveRecord, validateRecord),
    unless(havePeerTimestamp, validatePeerTimestamp),
    unless(haveRecord, makeDirectory),
    runParallel.bind(null, [
      unless(haveRecord, saveOwnTimestamp),
      unless(havePeerTimestamp, savePeerTimestamp),
      unless(haveRecord, saveRecord),
      unless(haveRecord, getAndSaveAttachments)
    ]),
    unless(haveRecord, appendToAccessions),
    bumpAccessionNumber
  ], function (error) {
    if (error) {
      log.error(error)
      unlinkFiles(done)
    } else {
      log.info('done')
      done()
    }
  })

  function unless (flag, step) {
    return function (done) {
      if (flag) {
        done()
      } else {
        step(done)
      }
    }
  }

  function checkHaveRecord (done) {
    var file = recordPath(configuration.directory, publication.digest)
    fileExists(file, function (error, exists) {
      if (error) return done(error)
      haveRecord = exists
      log.info({ haveRecord: exists })
      done()
    })
  }

  function checkHavePeerTimestamp (done) {
    var file = timestampPath(
      configuration.directory,
      publication.digest,
      peer.publicKey
    )
    fileExists(file, function (error, exists) {
      if (error) return done(error)
      havePeerTimestamp = exists
      log.info({ havePeerTimestamp: exists })
      done()
    })
  }

  function getRecord (done) {
    if (haveRecord) {
      readRecord(
        configuration.directory, publication.digest,
        function (error, parsed) {
          if (error) return done(error)
          record = parsed
          done()
        }
      )
    } else {
      http.request(xtend(peer.url, {
        path: peer.url.path + '/publications/' + publication.digest,
        headers: { accept: 'application/json' }
      }))
        .once('error', function (error) {
          done(error)
        })
        .once('response', function (response) {
          pump(
            response,
            concat(function (buffer) {
              parse(buffer, function (error, parsed) {
                if (error) return done(error)
                record = parsed
                log.info('got record')
                done()
              })
            }),
            function (error) {
              if (error) {
                done(error)
              }
            }
          )
        })
        .end()
    }
  }

  function getPeerTimestamp (done) {
    var request = xtend(peer.url, {
      path: (
        peer.url.path +
        'publications/' + publication.digest +
        '/timestamps/' + encoding.encode(peer.publicKey)
      )
    })
    http.request(request)
      .once('error', function (error) {
        done(error)
      })
      .once('response', function (response) {
        if (response.statusCode !== 200) {
          var error = new Error('Could not get timestamp')
          error.statusCode = response.statusCode
          log.error({
            statusCode: response.statusCode
          }, 'failed to get timestamp')
          done(error)
        } else {
          pump(
            response,
            concat(function (buffer) {
              parse(buffer, function (error, parsed) {
                if (error) return done(error)
                peerTimestamp = parsed
                log.info('got timestamp')
                done()
              })
            }),
            function (error) {
              if (error) {
                done(error)
              }
            }
          )
        }
      })
      .end()
  }

  function validateRecord (done) {
    validatePublication(record)
    var errors = validatePublication.errors
    if (errors) {
      log.info({ errors: errors }, 'invalid publication')
      var error = new Error('invalid record')
      error.validationErrors = errors
      return done(error)
    }
    var computedDigest = Buffer.alloc(sodium.crypto_hash_sha256_BYTES)
    sodium.crypto_hash_sha256(
      computedDigest,
      Buffer.from(stringify(record), 'utf8')
    )
    computedDigest = encoding.encode(computedDigest)
    if (computedDigest !== publication.digest) {
      done(new Error(
        'reported and computed digests do not match'
      ))
    }
    log.info('validated record')
    done()
  }

  function validatePeerTimestamp (done) {
    validateTimestamp(peerTimestamp)
    var errors = validateTimestamp.errors
    if (errors) {
      log.info({ errors: errors }, 'invalid timestamp')
      var error = new Error('invalid timestamp')
      error.validationErrors = errors
      return done(error)
    }
    var otherDigest = Buffer.alloc(sodium.crypto_hash_sha256_BYTES)
    sodium.crypto_hash_sha256(otherDigest, Buffer.from(stringify(record), 'utf8'))
    var digestsMatch = peerTimestamp.timestamp.digest === encoding.encode(otherDigest)
    if (!digestsMatch) {
      log.error('timestamp digest mismatch')
      return done(new Error(
        'peer timestamp digest does not match record'
      ))
    }
    var validSignature = sodium.crypto_sign_verify_detached(
      encoding.decode(peerTimestamp.signature),
      Buffer.from(stringify(peerTimestamp.timestamp)),
      peer.publicKey
    )
    if (!validSignature) {
      log.error('invalid peer signature')
      return done(new Error('invalid peer signature'))
    }
    log.info('validated timestamp')
    done()
  }

  function makeDirectory (done) {
    mkdirp(
      recordDirectoryPath(configuration.directory, publication.digest),
      done
    )
  }

  function saveOwnTimestamp (done) {
    var timestamp = {
      digest: publication,
      uri: (
        'https://' + configuration.hostname +
        '/publications/' + publication.digest
      ),
      time: time
    }
    var signature = Buffer.alloc(sodium.crypto_sign_BYTES)
    sodium.crypto_sign_detached(
      signature,
      Buffer.from(stringify(timestamp)),
      configuration.keypair.secret
    )
    signature = encoding.encode(signature)
    var file = signaturePath(
      configuration.directory,
      publication.digest,
      encoding.encode(configuration.keypair.public)
    )
    files.push(file)
    var data = stringify({
      timestamp: timestamp,
      signature: signature,
      version: timestampSchema.properties.version.constant
    })
    fs.writeFile(file, data, 'utf8', function (error) {
      if (error) return done(error)
      log.info('saved own timestamp')
      done()
    })
  }

  function savePeerTimestamp (done) {
    var file = timestampPath(
      configuration.directory,
      publication.digest,
      peer.publicKey
    )
    files.push(file)
    var data = stringify(peerTimestamp)
    fs.writeFile(file, data, 'utf8', function (error) {
      if (error) return done(error)
      log.info('saved peer timestamp')
      done()
    })
  }

  function saveRecord (done) {
    var file = recordPath(configuration.directory, publication.digest)
    files.push(file)
    var data = stringify(record)
    writeIfMissing(file, data, function (error) {
      if (error) return done(error)
      log.info('saved record')
      done()
    })
  }

  function getAndSaveAttachments (done) {
    runParallel(
      record.attachments.map(function (attachmentDigest) {
        return function (done) {
          var attachmentLog = log.child({
            attachment: attachmentDigest
          })
          var request = xtend(peer.url, {
            path: (
              peer.url.path +
              '/publications/' + publication.digest +
              '/attachments/' + attachmentDigest
            )
          })
          var file = attachmentPath(
            configuration.directory,
            publication.digest,
            attachmentDigest
          )
          download(request, file, function (error, contentType) {
            if (error) return done(error)
            attachmentLog.info('downloaded')
            writeIfMissing(
              file + '.type', contentType,
              function (error) {
                if (error) return done(error)
                attachmentLog.info('wrote type file')
                done()
              }
            )
          })
        }
      }),
      done
    )
  }

  function appendToAccessions (done) {
    fs.appendFile(
      path.join(configuration.directory, 'accessions'),
      (time || new Date().toISOString()) + ',' +
      publication.digest + '\n',
      done
    )
  }

  function bumpAccessionNumber (done) {
    peer.last = publication.accessionNumber
    log.info('bumped')
    done()
  }

  function unlinkFiles (done) {
    runParallel(files.map(function (file) {
      return function (done) {
        var fileLog = log.child({ file: file })
        fs.unlink(file, function (error) {
          if (error) {
            fileLog.error(error)
            done()
          } else {
            fileLog.info('unlinked')
            done()
          }
        })
      }
    }), done)
  }
}

function writeIfMissing (path, data, done) {
  fs.writeFile(path, data, { flag: 'wx' }, function (error) {
    if (error && error.code !== 'EEXIST') {
      done(error)
    } else {
      done()
    }
  })
}

function download (from, to, done) {
  var contentType
  http.request(from)
    .once('error', function (error) {
      done(error)
    })
    .once('response', function (response) {
      contentType = response.headers['Content-Type']
      pump(
        response,
        fs.createWriteStream(to, { flags: 'wx' }),
        function (error) {
          if (error) {
            if (error.code === 'EEXIST') {
              done()
            } else {
              done(error)
            }
          } else {
            done(null, contentType)
          }
        }
      )
    })
    .end()
}

function readPeers (directory, log, callback) {
  var file = path.join(directory, 'peers')
  fs.readFile(file, 'utf8', function (error, string) {
    if (error) {
      if (error.code === 'ENOENT') {
        callback(null, [])
      } else {
        callback(error)
      }
    } else {
      var peers = string
        .split('\n')
        .reduce(function (peers, line, index) {
          var split = line.split(',')
          if (split.length === 3) {
            try {
              var peer = {
                url: url.parse(split[0]),
                publicKey: encoding.decode(split[1]),
                last: parseInt(split[2])
              }
              peers.push(peer)
            } catch (error) {
              log.error('peers parse error', {
                line: line,
                number: index + 1
              })
            }
          }
          return peers
        }, [])
      callback(null, peers)
    }
  })
}

function writePeers (directory, peers, callback) {
  var file = path.join(directory, 'peers')
  var data = peers
    .map(function (peer) {
      return (
        url.format(peer.url) + ',' +
        encoding.encode(peer.publicKey) + ',' +
        peer.last.toString()
      )
    })
    .join('\n')
  fs.writeFile(file, data, callback)
}

function fileExists (path, callback) {
  fs.access(path, fs.constants.R_OK, function (error) {
    if (error) {
      if (error.code === 'ENOENT') {
        callback(null, false)
      } else {
        callback(error)
      }
    } else {
      callback(null, true)
    }
  })
}
