'use strict';
(function () {
  const chat = document.getElementById('chat');
  const input = document.getElementById('input');
  const sendBtn = document.getElementById('sendBtn');
  const attachBtn = document.getElementById('attachBtn');
  const fileInput = document.getElementById('fileInput');
  const attachBox = document.getElementById('attachments');
  const fusionMode = document.getElementById('fusionMode');
  const mergeWrap = document.getElementById('mergeWrap');
  const mergeCheck = document.getElementById('mergeCheck');

  const sessionId = crypto.randomUUID();
  const pending = new Map(); // uiId -> {file, url}

  let busy = false;

  // fetch workspace info + build channel mixer
  const channelsBox = document.getElementById('channels');
  const chMap = new Map();

  function buildChannels(slots) {
    channelsBox.innerHTML = '';
    chMap.clear();
    for (const s of slots || []) {
      const el = document.createElement('div');
      el.className = 'channel role-' + s.role;
      el.style.setProperty('--ch', s.color || '#4d6bfe');
      const top = document.createElement('div');
      top.className = 'ch-top';
      const dot = document.createElement('span');
      dot.className = 'ch-dot';
      const name = document.createElement('span');
      name.className = 'ch-name'; name.textContent = s.name;
      const role = document.createElement('span');
      role.className = 'ch-role'; role.textContent = s.role;
      top.append(dot, name, role);
      const model = document.createElement('div');
      model.className = 'ch-model'; model.textContent = (s.model || '').replace(/^ollama\//, '');
      const meter = document.createElement('div');
      meter.className = 'ch-meter';
      el.append(top, model, meter);
      channelsBox.appendChild(el);
      chMap.set(s.name, el);
    }
  }

  function setChannel(slot, on) {
    const el = chMap.get(slot);
    if (el) el.classList.toggle('on', !!on);
  }
  function clearChannels() { for (const el of chMap.values()) el.classList.remove('on'); }
  function setBusyUI(b) { document.body.classList.toggle('busy', b); }

  fetch('/api/config').then(r => r.json()).then(cfg => {
    document.getElementById('workspaceInfo').textContent = cfg.workspace;
    buildChannels(cfg.slots);
  }).catch(() => {});

  attachBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    for (const f of fileInput.files) addFile(f);
    fileInput.value = '';
  });

  function addFile(file) {
    const id = 'f' + Math.random().toString(36).slice(2);
    const isImage = /^image\//.test(file.type);
    const item = { file, url: isImage ? URL.createObjectURL(file) : null };
    pending.set(id, item);
    renderChip(id, item);
  }

  function renderChip(id, item) {
    const chip = document.createElement('div');
    chip.className = 'chip' + (item.url ? ' thumb' : '');
    if (item.url) {
      const img = document.createElement('img');
      img.src = item.url;
      chip.appendChild(img);
    }
    const nm = document.createElement('span');
    nm.className = 'nm';
    nm.textContent = item.file.name;
    nm.title = item.file.name;
    chip.appendChild(nm);
    const x = document.createElement('span');
    x.className = 'x';
    x.textContent = '✕';
    x.addEventListener('click', () => { pending.delete(id); chip.remove(); });
    chip.appendChild(x);
    attachBox.appendChild(chip);
  }

  fusionMode.addEventListener('change', () => {
    mergeWrap.style.display = fusionMode.checked ? 'inline-flex' : 'none';
  });

  function addMessage(role, text, who) {
    const m = document.createElement('div');
    m.className = 'msg ' + role;
    if (who) {
      const w = document.createElement('div');
      w.className = 'who';
      w.textContent = who;
      m.appendChild(w);
    }
    const body = document.createElement('div');
    body.textContent = text;
    m.appendChild(body);
    chat.appendChild(m);
    scrollDown();
    return m;
  }

  function scrollDown() { chat.scrollTop = chat.scrollHeight; }

  function autoResize() {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 200) + 'px';
  }
  input.addEventListener('input', autoResize);

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  });

  sendBtn.addEventListener('click', send);

  function setBusy(b) {
    busy = b;
    sendBtn.disabled = b;
    if (b) sendBtn.textContent = '⏳'; else sendBtn.textContent = '➤';
    setBusyUI(b);
    if (!b) clearChannels();
  }

  async function send() {
    if (busy) return;
    const text = input.value.trim();
    const files = [...pending.values()].map(p => p.file);
    if (!text && files.length === 0) return;

    const fd = new FormData();
    fd.append('message', text);
    if (!fusionMode.checked) fd.append('sessionId', sessionId);
    if (fusionMode.checked && mergeCheck.checked) fd.append('merge', '1');
    for (const f of files) fd.append('files', f);

    // render user message
    addMessage('user', text || '(files attached)');

    setBusy(true);
    const endpoint = fusionMode.checked ? '/api/fusion' : '/api/chat';

    // scroll/panel state
    const state = { slots: new Map(), panel: null, mainBubble: null };

    try {
      const resp = await fetch(endpoint, { method: 'POST', body: fd });
      if (!resp.ok || !resp.body) {
        const t = await resp.text();
        addMessage('assistant error', 'Server error: ' + (t || resp.status));
        setBusy(false);
        return;
      }
      const reader = resp.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          for (const line of block.split('\n')) {
            if (line.startsWith('data: ')) {
              let ev;
              try { ev = JSON.parse(line.slice(6)); } catch { continue; }
              handleEvent(ev, state);
            }
          }
        }
      }
      if (state.mainBubble) state.mainBubble.querySelector('div').classList.remove('loading');
      for (const [k, v] of state.slots) v.classList.remove('loading');
    } catch (err) {
      addMessage('assistant error', 'Network error: ' + err.message);
    } finally {
      setBusy(false);
      pending.clear();
      attachBox.innerHTML = '';
      input.value = '';
      autoResize();
      scrollDown();
    }
  }

  function handleEvent(ev, state) {
    switch (ev.type) {
      case 'meta':
        if (ev.mode === 'fusion') {
          for (const s of ev.slots || []) setChannel(s, true);
          state.panel = document.createElement('div');
          state.panel.className = 'fusion-panel';
          const head = document.createElement('div');
          head.className = 'fp-head';
          head.textContent = '✦ Fusion - ' + (ev.slots || []).join(' + ');
          state.panel.appendChild(head);
          const body = document.createElement('div');
          body.className = 'fp-body';
          body.id = 'fpbody';
          state.panel.appendChild(body);
          chat.appendChild(state.panel);
          state.body = body;
        }
        break;
      case 'slot-start': {
        setChannel(ev.slot, true);
        if (!state.panel) {
          state.panel = document.createElement('div');
          state.panel.className = 'fusion-panel';
          const body = document.createElement('div'); body.className = 'fp-body'; body.id='fpbody';
          state.panel.appendChild(body);
          chat.appendChild(state.panel);
          state.body = body;
        }
        const block = document.createElement('div');
        block.className = 'slot-block';
        const t = document.createElement('div');
        t.className = 'slot-title';
        t.style.color = colorFor(ev.slot);
        t.textContent = ev.slot;
        const out = document.createElement('div');
        out.className = 'slot-out loading';
        block.appendChild(t); block.appendChild(out);
        state.body.appendChild(block);
        state.slots.set(ev.slot, out);
        break;
      }
      case 'delta':
        setChannel(ev.slot === 'merge' ? undefined : ev.slot, true);
        if (ev.slot === 'main') {
          if (!state.mainBubble) {
            const m = document.createElement('div');
            m.className = 'msg assistant';
            const w = document.createElement('div'); w.className = 'who'; w.textContent = 'main';
            const body = document.createElement('div');
            body.className = 'slot-out loading';
            m.appendChild(w); m.appendChild(body);
            chat.appendChild(m);
            state.mainBubble = body;
          }
          appendDelta(state.mainBubble, ev.text);
        } else {
          const out = state.slots.get(ev.slot);
          if (out) appendDelta(out, ev.text);
        }
        scrollDown();
        break;
      case 'slot-done':
        { const out = state.slots.get(ev.slot); if (out) out.classList.remove('loading'); setChannel(ev.slot, false); }
        break;
      case 'merge-start': {
        for (const el of chMap.values()) el.classList.add('on');
        if (!state.panel) break;
        const mb = document.createElement('div');
        mb.className = 'merge-block';
        const t = document.createElement('div');
        t.className = 'slot-title'; t.style.color = '#3fb950'; t.textContent = '★ Final merge (' + ev.slot + ')';
        const out = document.createElement('div');
        out.className = 'slot-out loading';
        mb.appendChild(t); mb.appendChild(out);
        state.panel.appendChild(mb);
        state.slots.set('merge', out);
        break;
      }
      case 'merge-done':
        { const out = state.slots.get('merge'); if (out) out.classList.remove('loading'); }
        break;
      case 'error':
        addMessage('assistant error', '⚠ ' + (ev.message || 'error'));
        break;
      default: break;
    }
  }

  function appendDelta(el, text) {
    el.textContent += text;
    if (el.textContent.length > 60000) el.textContent = el.textContent.slice(-30000);
  }

  const colors = { arch: '#A78BFA', main: '#F59E0B', kimi: '#22D3EE', merge: '#3fb950' };
  function colorFor(s) { return colors[s] || '#4f8cff'; }

  autoResize();

  /* ================= Settings ================= */
  const settingsBtn = document.getElementById('settingsBtn');
  const settingsModal = document.getElementById('settingsModal');
  const slotList = document.getElementById('slotList');
  const sHost = document.getElementById('sHost');
  const sBackend = document.getElementById('sBackend');
  const sImageModel = document.getElementById('sImageModel');
  const settingsMsg = document.getElementById('settingsMsg');
  let allModels = [];
  let currentSlots = [];
  let currentBackend = 'all';

  function fmtCtx(c) { if (!c) return ''; if (c >= 1e6) return (c / 1e6).toFixed(0) + 'M'; if (c >= 1000) return Math.round(c / 1000) + 'K'; return String(c); }

  function modelOption(m) {
    const o = document.createElement('option');
    const label = m.provider && m.provider !== 'ollama' ? `${m.provider}/${m.name}` : m.name;
    o.value = m.id;
    o.textContent = `${label}${m.vision ? ' 👁' : ''}${m.context ? ' · ' + fmtCtx(m.context) : ''}`;
    return o;
  }

  function fillModelSelect(sel, current, visionOnly) {
    sel.innerHTML = '';
    for (const m of allModels) {
      if (currentBackend !== 'all' && m.provider !== currentBackend) continue;
      if (visionOnly && !m.vision) continue;
      const o = modelOption(m);
      o.selected = m.id === current;
      sel.appendChild(o);
    }
    if (visionOnly && ![...sel.options].some((o) => o.selected)) {
      // ensure current is present even if not listed
      const o = document.createElement('option');
      o.value = current; o.textContent = current + ' 👁'; o.selected = true;
      sel.appendChild(o);
    }
  }

  function makeSlotRow(slot) {
    const row = document.createElement('div');
    row.className = 'slot-row';
    row.dataset.idx = '';

    const name = document.createElement('input');
    name.type = 'text'; name.className = 'sname'; name.value = slot.name; name.placeholder = 'name';

    const model = document.createElement('select');
    model.className = 'smodel';
    fillModelSelect(model, slot.model, false);

    const role = document.createElement('select');
    role.className = 'srole';
    for (const r of ['builder', 'architect', 'primary']) {
      const o = document.createElement('option');
      o.value = r; o.textContent = r; o.selected = r === slot.role;
      role.appendChild(o);
    }

    const del = document.createElement('button');
    del.className = 'sdel'; del.textContent = '✕';
    del.addEventListener('click', () => { if (slotList.children.length > 2) row.remove(); });

    row.append(name, model, role, del);
    return row;
  }

  function renderSlots() {
    slotList.innerHTML = '';
    for (const s of currentSlots) slotList.appendChild(makeSlotRow(s));
  }

  function populateBackend(providers) {
    sBackend.innerHTML = '';
    const add = (v, label) => { const o = document.createElement('option'); o.value = v; o.textContent = label; o.selected = v === currentBackend; sBackend.appendChild(o); };
    add('all', 'All providers');
    for (const p of (providers || [])) add(p, p + ' (pi)');
    const sep = document.createElement('option');
    sep.disabled = true; sep.textContent = '--- CLI hosts ---';
    sBackend.appendChild(sep);
    add('claude', 'claude CLI');
    add('codex', 'codex CLI');
    add('gemini', 'gemini CLI');
  }

  async function openSettings() {
    settingsMsg.textContent = ''; settingsMsg.className = 'settings-msg';
    try {
      const [m, s] = await Promise.all([
        (await fetch('/api/models')).json(),
        (await fetch('/api/settings')).json(),
      ]);
      allModels = m.models || [];
      currentSlots = s.settings.slots;
      sHost.value = s.settings.ollamaHost || 'http://localhost:11434';
      populateBackend(s.settings.providers);
      renderSlots();
      fillModelSelect(sImageModel, s.settings.imageModel, true);
      document.getElementById('sWorkspace').value = s.settings.workspace || '';
      document.getElementById('sPermission').value = s.settings.permissionMode || 'full';
      for (const id of ['pk_openai', 'pk_anthropic', 'pk_google', 'pk_groq', 'pk_mistral', 'pk_openrouter']) document.getElementById(id).value = '';
      settingsModal.classList.remove('hidden');
    } catch (err) {
      settingsMsg.textContent = 'Error loading: ' + err.message;
      settingsMsg.className = 'settings-msg err';
    }
  }
  function closeSettings() { settingsModal.classList.add('hidden'); }

  sBackend.addEventListener('change', async () => {
    currentBackend = sBackend.value;
    const cli = ['claude', 'codex', 'gemini'].includes(currentBackend) ? currentBackend : '';
    if (cli) {
      document.getElementById('loginMsg').textContent = 'Host: ' + cli + ' CLI - the chat uses this CLI (with its own login).';
      document.getElementById('loginMsg').className = 'hint';
    }
    await fetch('/api/settings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ cliHost: cli }) }).catch(() => {});
    for (const row of slotList.children) {
      const sel = row.querySelector('.smodel');
      if (sel) fillModelSelect(sel, sel.value, false);
    }
    fillModelSelect(sImageModel, sImageModel.value, true);
  });

  settingsBtn.addEventListener('click', openSettings);
  document.getElementById('settingsClose').addEventListener('click', closeSettings);
  document.getElementById('settingsCancel').addEventListener('click', closeSettings);
  document.getElementById('addSlotBtn').addEventListener('click', () => {
    if (slotList.children.length >= 5) { settingsMsg.textContent = 'Max 5 slots.'; settingsMsg.className = 'settings-msg err'; return; }
    slotList.appendChild(makeSlotRow({ name: 'slot' + (slotList.children.length + 1), model: (allModels[0] || {}).id, role: 'builder' }));
  });

  document.getElementById('settingsSave').addEventListener('click', async () => {
    const rows = [...slotList.children];
    const slots = rows.map((row) => ({
      name: row.querySelector('.sname').value.trim() || 'slot',
      model: row.querySelector('.smodel').value,
      role: row.querySelector('.srole').value,
      color: '#8b98a9',
      vision: !!allModels.find((m) => m.id === row.querySelector('.smodel').value)?.vision,
    }));
    const apiKeys = {};
    for (const [prov, id] of [['openai', 'pk_openai'], ['anthropic', 'pk_anthropic'], ['google', 'pk_google'], ['groq', 'pk_groq'], ['mistral', 'pk_mistral'], ['openrouter', 'pk_openrouter']]) {
      const v = document.getElementById(id).value.trim();
      if (v) apiKeys[prov] = v;
    }
    const body = { slots, imageModel: sImageModel.value, ollamaHost: sHost.value.trim() || 'http://localhost:11434' };
    body.workspace = document.getElementById('sWorkspace').value.trim();
    body.permissionMode = document.getElementById('sPermission').value;
    if (Object.keys(apiKeys).length) body.apiKeys = apiKeys;
    settingsMsg.textContent = 'Saving…'; settingsMsg.className = 'settings-msg';
    try {
      const r = await fetch('/api/settings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || 'error');
      settingsMsg.textContent = '✓ Saved. Slots: ' + j.settings.map((s) => s.name).join(', ');
      settingsMsg.className = 'settings-msg ok';
      currentSlots = j.settings;
      setTimeout(closeSettings, 900);
    } catch (err) {
      settingsMsg.textContent = 'Error saving: ' + err.message;
      settingsMsg.className = 'settings-msg err';
    }
  });

  settingsModal.addEventListener('click', (e) => { if (e.target === settingsModal) closeSettings(); });

  // Fetch / refresh the model catalog and repopulate the dropdowns.
  async function fetchModels() {
    const msg = document.getElementById('loginMsg');
    msg.textContent = 'Fetching models...';
    msg.className = 'hint';
    try {
      const j = await (await fetch('/api/models')).json();
      allModels = j.models || [];
      for (const row of slotList.children) {
        const sel = row.querySelector('.smodel');
        if (sel) fillModelSelect(sel, sel.value, false);
      }
      fillModelSelect(sImageModel, sImageModel.value, true);
      const provs = [...new Set(allModels.map((m) => m.provider))].sort().join(', ');
      msg.textContent = '✓ ' + allModels.length + ' models from: ' + (provs || '(none)');
      msg.className = 'settings-msg ok';
    } catch (e) { msg.textContent = 'Fetch error: ' + e.message; msg.className = 'settings-msg err'; }
  }
  document.getElementById('fetchModelsBtn').addEventListener('click', fetchModels);

  // Subscription login buttons (browser OAuth, no API key, no terminal)
  document.querySelectorAll('.login-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const provider = btn.dataset.login;
      const msg = document.getElementById('loginMsg');
      msg.textContent = 'Opening ' + provider + ' sign-in in your browser...';
      msg.className = 'hint';
      btn.disabled = true;
      try {
        const r = await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ provider }) });
        const j = await r.json();
        if (!j.ok) { msg.textContent = 'Error: ' + (j.error || ''); msg.className = 'settings-msg err'; return; }
        msg.textContent = 'Sign in in the browser, then wait - detecting your subscription...';
        for (let i = 0; i < 45; i++) {
          await new Promise((r2) => setTimeout(r2, 2000));
          try {
            const s = await (await fetch('/api/settings')).json();
            if (s.settings.configuredProviders && s.settings.configuredProviders[provider]) {
              msg.textContent = '✓ Connected to ' + provider + '! Models updated.';
              msg.className = 'settings-msg ok';
              await fetchModels();
              return;
            }
          } catch (e) {}
        }
        msg.textContent = 'Timed out waiting for ' + provider + '. Try again, or use an API key.';
        msg.className = 'hint';
      } catch (err) {
        msg.textContent = 'Error: ' + err.message;
        msg.className = 'settings-msg err';
      } finally { btn.disabled = false; }
    });
  });

})();
