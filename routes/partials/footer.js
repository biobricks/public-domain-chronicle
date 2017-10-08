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
    <footer role=contentinfo>
      <section>
        <p>
          The <a href=https://biobricks.org>BioBricks Foundation</a>
          hosts this PDC network server.
        </p>
      </section>
      <section>
        <p><a href=https://biobricks.org/dmca-takedown/>DMCA Policy</a></p>
      </section>
    </footer>
  `
}
