#!/usr/bin/env node
// Fusion Studio CLI - a thin HTTP client of the local server: talks to the
// running Fusion Studio on http://127.0.0.1:3090.
//
//   node cli.js chat   "how do I X?"        # talk to the Main model
//   node cli.js fusion "compare X and Y"    # run all slots + final merge
//   node cli.js models                      # list available models
//   node cli.js config                      # show current settings
//   node cli.js login <provider> <api-key>  # save an API key (e.g. anthropic)
'use strict';

const BASE = process.env.FUSION_URL || 'http://127.0.0.1:3090';
const args = process.argv.slice(2);
const cmd = args[0];

async function streamChat(pathname, message) {
  const r = await fetch(BASE + pathname, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message, merge: pathname.endsWith('fusion') ? '1' : undefined, sessionId: 'cli-' + Date.now() }),
  });
  if (!r.ok || !r.body) { const t = await r.text().catch(() => ''); throw new Error(`${r.status} ${t}`); }
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let lastSlot = null;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      for (const line of block.split('\n')) {
        if (!line.startsWith('data: ')) continue;
        let ev;
        try { ev = JSON.parse(line.slice(6)); } catch { continue; }
        if (ev.type === 'delta') {
          if (ev.slot && ev.slot !== 'merge' && ev.slot !== lastSlot) { process.stdout.write(`\n[${ev.slot}] `); lastSlot = ev.slot; }
          process.stdout.write(ev.text);
        } else if (ev.type === 'error') { process.stderr.write('\nERROR: ' + ev.message + '\n'); }
      }
    }
  }
  console.log();
}

async function main() {
  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
    console.log('Fusion Studio CLI - talks to the local server on ' + BASE);
    console.log('  chat   "<msg>"          talk to the Main model');
    console.log('  fusion "<msg>"          run all slots in parallel + merge');
    console.log('  models                  list available models');
    console.log('  config                  show current settings');
    console.log('  login <provider> <key>  save an API key (e.g. anthropic, openai, google)');
    return;
  }
  try {
    if (cmd === 'chat') { if (!args[1]) throw new Error('usage: fusion chat "<message>"'); await streamChat('/api/chat', args.slice(1).join(' ')); }
    else if (cmd === 'fusion') { if (!args[1]) throw new Error('usage: fusion fusion "<message>"'); await streamChat('/api/fusion', args.slice(1).join(' ')); }
    else if (cmd === 'models') {
      const j = await (await fetch(BASE + '/api/models')).json();
      for (const m of j.models || []) console.log((m.provider + '\t' + m.name).padEnd(52) + (m.vision ? ' 👁' : ''));
    } else if (cmd === 'config') {
      const j = await (await fetch(BASE + '/api/settings')).json();
      console.log(JSON.stringify(j.settings, null, 2));
    } else if (cmd === 'login') {
      if (!args[1] || !args[2]) throw new Error('usage: fusion login <provider> <api-key>');
      const r = await fetch(BASE + '/api/settings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ apiKeys: { [args[1]]: args[2] } }) });
      const j = await r.json();
      console.log(j.ok ? `saved key for ${args[1]}` : 'error: ' + (j.error || ''));
    } else { throw new Error('unknown command: ' + cmd); }
  } catch (e) { console.error('error:', e.message); process.exit(1); }
}

main();
