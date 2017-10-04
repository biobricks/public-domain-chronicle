/*
Copyright 2017 Kyle E. Mitchell

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
// Tag function for tag templates literals constructing HTML.
// Adds a few semantic niceties:
//
// 1.  Falsey values in expressions don't produce output.
//
// 2.  Array values in expressions get stringified and concatenated.
//
// These make it much more convenient do achieve conditional markup
// using boolean expressions, without control structures.
module.exports = function html (/* strings, values... */) {
  var strings = arguments[0]
  var values = Array.prototype.slice.call(arguments, 1)
  var result = ''
  strings.forEach(function (string, index) {
    result += string
    if (index < values.length) {
      result += toString(values[index])
    }
  })
  // Trim so that the newline after the opening backtick and first
  // expression loading the header with <!doctype html> ends up on the
  // first line.
  return result.trim()
}

function toString (value) {
  /* istanbul ignore else */
  if (value === false || value === undefined || value === null) {
    return ''
  } else if (Array.isArray(value)) {
    return value.join('')
  } else if (typeof value === 'string') {
    return value
  } else {
    throw new Error(
      'Invalid template value ' + typeof value + JSON.stringify(value)
    )
  }
}
