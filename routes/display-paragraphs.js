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
var html = require('./html')
var escape = require('./escape')

module.exports = function (paragraphs) {
  return html`
    <ol>
      ${paragraphs.map(function (sentences) {
    return html`
          <li>
            ${sentences.map(function (sentence) {
    if (typeof sentence === 'string') {
      return escape(sentence) + ' '
    } else {
      return html`
                  <ol>
                    ${sentence.map(function (item) {
    return html`<li>${escape(item)}</li>`
  })}
                  </ol>
                `
    }
  })}
          </li>
        `
  })}
    </ol>
  `
}
