'use strict';
// File extraction helpers: images -> pass-through (vision), pdf/docx/xlsx/txt -> text.

const path = require('path');

const mammoth = require('mammoth');
const XLSX = require('xlsx');

const MAX_TEXT_BYTES = 300000;

// Extract text from a PDF using pdfjs-dist (ESM, loaded dynamically).
async function extractPdf(buf) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(buf);
  const doc = await pdfjs.getDocument({ data }).promise;
  try {
    const out = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const tc = await page.getTextContent();
      out.push(tc.items.map((it) => it.str).join(' '));
    }
    return out.join('\n');
  } finally {
    try { await doc.destroy(); } catch (e) {}
  }
}

// Return { kind, text?, imagePath? }
async function extractUpload(file, uploadDir, baseName) {
  const ext = (path.extname(file.originalname) || '').toLowerCase();
  const buf = file.buffer;

  switch (ext) {
    case '.png': case '.jpg': case '.jpeg': case '.gif': case '.webp': case '.bmp': {
      const imagePath = path.join(uploadDir, baseName + ext);
      const fs = require('fs');
      fs.writeFileSync(imagePath, buf);
      return { kind: 'image', path: imagePath, ext };
    }
    case '.pdf': {
      const text = await extractPdf(buf);
      return { kind: 'text', ext: 'pdf', text: cap(text), sourceName: file.originalname };
    }
    case '.docx': {
      const r = await mammoth.extractRawText({ buffer: buf });
      return { kind: 'text', ext: 'docx', text: cap(r.value), sourceName: file.originalname };
    }
    case '.xlsx': case '.xls': {
      const wb = XLSX.read(buf, { type: 'buffer' });
      const out = [];
      for (const sh of wb.SheetNames) {
        out.push('== Sheet: ' + sh + ' ==');
        const csv = XLSX.utils.sheet_to_csv(wb.Sheets[sh]);
        if (csv) out.push(csv);
      }
      return { kind: 'text', ext: 'xlsx', text: cap(out.join('\n')), sourceName: file.originalname };
    }
    case '.txt': case '.md': case '.csv': case '.log': case '.json': case '.py': case '.js': case '.ts': {
      return { kind: 'text', ext: 'text', text: cap(buf.toString('utf8')), sourceName: file.originalname };
    }
    default: {
      // unknown: store raw and mention it (agent can open it)
      const rawPath = path.join(uploadDir, baseName + ext);
      require('fs').writeFileSync(rawPath, buf);
      return { kind: 'raw', path: rawPath, ext, sourceName: file.originalname };
    }
  }
}

function cap(s) {
  if (!s) return s;
  const b = Buffer.byteLength(s, 'utf8');
  if (b <= MAX_TEXT_BYTES) return s;
  return s.slice(0, Math.floor(MAX_TEXT_BYTES / 2)) + '\n...[truncated]...';
}

module.exports = { extractUpload, MAX_TEXT_BYTES };
