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
var html = require('../html')

module.exports = function () {
  return html`
    <nav>
      <ul>
        <li><a href=publish>Publish</a></li>
        <li><a href=accessions>Accessions</a></li>
        <li><a href=rss.xml>RSS Feed</a></li>
        <li><a href=grant>Public Science Grant</a></li>
      </ul>
    </nav>
  `
}
