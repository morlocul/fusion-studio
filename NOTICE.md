# Third-Party Notices

This project builds on ideas and visual direction from several open-source
projects. We are grateful to their authors and preserve their copyright
notices below. **Fusion Studio is an original implementation** - we did not copy
substantial code from these projects - but we borrow the **concept** (multi-model
fusion) and the **visual identity / layout** from them, so they are credited here.

---

## fusion-harness

- Project: <https://github.com/disler/fusion-harness>
- License: **MIT**
- Used for: the multi-model **fusion** concept (AND, not OR - running several
  models in parallel and merging their answers).
- Author's copyright notice (as required by the MIT license):

```
MIT License

Copyright (c) 2026 IndyDevDan

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## DeepSeek Harness - **Project**: <https://github.com/deepseek-ai/deepseek-harness>
- License: MIT
- Used in: the **visual identity and layout** (dark warm-neutral palette,
  `#4D6BFE` accent, sidebar + chat structure) of the web/desktop UI.
- DeepSeek's copyright notice:

```
MIT License

Copyright (c) 2026 DeepSeek

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## Runtime / engine dependencies

Fusion Studio runs and orchestrates the following third-party tools (each has
its own license - see the respective project):

- **pi** - the coding-agent engine (<https://pi.dev/>), from
  `@earendil-works/pi-coding-agent`, spawned as a sub-process.
- **Ollama** - the model backend (<https://ollama.com/>).
- npm packages: `express`, `multer`, `mammoth`, `pdfjs-dist`, `xlsx`,
  `electron`, `electron-packager` (see `package.json` and each package's
  license).

---

*Fusion Studio's own code is licensed under the MIT License (see `LICENSE`).*
