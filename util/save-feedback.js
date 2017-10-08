var feedbackPath = require('./feedback-path')
var fs = require('fs')

module.exports = function (directory, feedback, callback) {
  var file = feedbackPath(directory)
  fs.appendFile(file, feedback, callback)
}
