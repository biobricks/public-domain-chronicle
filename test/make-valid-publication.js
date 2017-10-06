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

var FormData = require('form-data')

module.exports = function (title) {
  var form = new FormData()
  form.append('name', 'Kyle E. Mitchell')
  form.append('affiliation', 'BioBricks Foundation')
  form.append('title', title || 'Made-Up Discovery')
  form.append('finding', 'Pat head. Rub stomach. Eureka!')
  form.append('journals[]', 'Nature')
  form.append('safety', 'Watch your elbows.')
  form.append('legal', '1.0.0')
  form.append('g-recaptcha-response', 'test')
  return form
}
