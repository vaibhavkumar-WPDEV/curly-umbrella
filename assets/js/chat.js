/* =============================================================================
   chat.js — the "Sunny" chat widget.

   Two engines behind one UI:
     local  — intent scoring over NORTHBEAM_KB, runs offline, zero cost
     live   — streamed completions from Anthropic or OpenAI using a key the
              visitor supplies; falls back to the local engine on any failure

   Plus: conversational context, guided lead capture, speech input/output,
   transcript export and localStorage persistence. No build step, no deps.
   ========================================================================== */
(function () {
  'use strict';

  var KB = window.NORTHBEAM_KB;
  var STORE_KEY = 'nb.chat.v1';
  var CFG_KEY = 'nb.chat.cfg.v1';
  var LEAD_KEY = 'nb.chat.leads.v1';

  var DEFAULT_MODELS = {
    anthropic: 'claude-sonnet-5',
    openai: 'gpt-4o-mini'
  };

  /* ------------------------------------------------------------------ dom */
  var el = {
    root: document.getElementById('chat'),
    launcher: document.getElementById('chatLauncher'),
    panel: document.getElementById('chatPanel'),
    badge: document.getElementById('chatBadge'),
    close: document.getElementById('chatClose'),
    log: document.getElementById('chatLog'),
    chips: document.getElementById('chatChips'),
    form: document.getElementById('chatForm'),
    input: document.getElementById('chatInput'),
    send: document.getElementById('chatSend'),
    mic: document.getElementById('micBtn'),
    status: document.getElementById('chatStatus'),
    voiceToggle: document.getElementById('voiceToggle'),
    settingsToggle: document.getElementById('settingsToggle'),
    settings: document.getElementById('chatSettings'),
    provider: document.getElementById('providerSelect'),
    apiKey: document.getElementById('apiKeyInput'),
    model: document.getElementById('modelInput'),
    save: document.getElementById('settingsSave'),
    clear: document.getElementById('settingsClear'),
    transcript: document.getElementById('transcriptBtn'),
    reset: document.getElementById('resetBtn'),
    note: document.getElementById('settingsNote')
  };
  if (!el.root || !KB) { return; }

  /* ---------------------------------------------------------------- state */
  var state = {
    open: false,
    busy: false,
    messages: [],        // { role: 'user'|'bot'|'system', text, at, sources }
    lastIntent: null,
    lead: null,          // { step, data }
    speak: false,
    listening: false
  };

  var cfg = load(CFG_KEY, { provider: 'local', key: '', model: '' });

  /* -------------------------------------------------------------- storage */
  function load(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (err) { return fallback; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (err) { /* private mode */ }
  }
  function persist() {
    save(STORE_KEY, { messages: state.messages.slice(-40), lastIntent: state.lastIntent });
  }

  /* ------------------------------------------------------------ rendering */
  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* Deliberately tiny markdown subset: bold, code, links, hyphen bullets. */
  function renderMarkdown(text) {
    var blocks = escapeHtml(text).split(/\n{2,}/);
    return blocks.map(function (block) {
      var lines = block.split('\n');
      var isList = lines.every(function (l) { return /^\s*-\s+/.test(l) || !l.trim(); });
      var body;
      if (isList && lines.some(function (l) { return l.trim(); })) {
        body = '<ul>' + lines.filter(function (l) { return l.trim(); }).map(function (l) {
          return '<li>' + inline(l.replace(/^\s*-\s+/, '')) + '</li>';
        }).join('') + '</ul>';
      } else {
        body = '<p>' + lines.map(inline).join('<br />') + '</p>';
      }
      return body;
    }).join('');
  }
  function inline(text) {
    return text
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>');
  }

  function timeLabel(ts) {
    try {
      return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    } catch (err) { return ''; }
  }

  function addMessage(role, text, opts) {
    opts = opts || {};
    var msg = { role: role, text: text, at: Date.now(), sources: opts.sources || null };
    state.messages.push(msg);
    var node = renderMessage(msg);
    persist();
    if (!state.open && role === 'bot') { showBadge(); }
    return node;
  }

  function renderMessage(msg) {
    var wrap = document.createElement('div');
    wrap.className = 'msg msg--' + msg.role;

    var bubble = document.createElement('div');
    bubble.className = 'msg__bubble';
    bubble.innerHTML = renderMarkdown(msg.text);
    wrap.appendChild(bubble);

    if (msg.sources && msg.sources.length) {
      var srcs = document.createElement('div');
      srcs.className = 'msg__sources';
      msg.sources.forEach(function (s) {
        var a = document.createElement('a');
        a.className = 'msg__source';
        a.href = s.href;
        a.textContent = 'Read: ' + s.label;
        srcs.appendChild(a);
      });
      wrap.appendChild(srcs);
    }

    if (msg.role !== 'system') {
      var meta = document.createElement('div');
      meta.className = 'msg__meta';
      meta.textContent = (msg.role === 'user' ? 'You' : KB.brand.assistant) + ' · ' + timeLabel(msg.at);
      wrap.appendChild(meta);
    }

    el.log.appendChild(wrap);
    scrollToEnd();
    return { wrap: wrap, bubble: bubble };
  }

  function scrollToEnd() {
    requestAnimationFrame(function () { el.log.scrollTop = el.log.scrollHeight; });
  }

  function showTyping() {
    var wrap = document.createElement('div');
    wrap.className = 'msg msg--bot';
    wrap.dataset.typing = 'true';
    wrap.innerHTML = '<div class="msg__bubble"><span class="typing"><span></span><span></span><span></span></span></div>';
    el.log.appendChild(wrap);
    scrollToEnd();
    return wrap;
  }

  function setChips(list) {
    el.chips.innerHTML = '';
    (list || []).forEach(function (label) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.textContent = label;
      b.addEventListener('click', function () { submit(label); });
      el.chips.appendChild(b);
    });
  }

  function showBadge() {
    el.badge.hidden = false;
    el.badge.textContent = '1';
  }

  function setStatus(html) { el.status.innerHTML = html; }

  function engineLabel() {
    if (cfg.provider === 'anthropic' && cfg.key) { return '<span class="dot dot--live"></span> Live model · Claude'; }
    if (cfg.provider === 'openai' && cfg.key) { return '<span class="dot dot--live"></span> Live model · OpenAI'; }
    return '<span class="dot dot--live"></span> Local knowledge base';
  }

  /* --------------------------------------------------- local nlu / matching */
  function normalize(text) {
    return String(text).toLowerCase().replace(/[^\w\s$%]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function stem(word) {
    return word.length > 4 && /s$/.test(word) ? word.slice(0, -1) : word;
  }
  function tokens(text) {
    return normalize(text).split(' ').filter(Boolean).map(stem);
  }

  var STOPWORDS = ('a an the is are am was were be been do does did i me my we you your it its that this ' +
    'these those to of in on at for from with and or but if so as about there here what which who whom ' +
    'how when where why can could will would should shall may might must have has had get got just ' +
    'really very please tell give show like need want').split(' ');

  function contentWords(text) {
    return tokens(text).filter(function (t) { return STOPWORDS.indexOf(t) === -1; });
  }

  /* Multi-word terms match as substrings; single words match stemmed tokens. */
  function hasTerm(raw, toks, term) {
    var nt = normalize(term);
    if (!nt) { return false; }
    if (nt.indexOf(' ') !== -1) { return raw.indexOf(nt) !== -1; }
    return toks.indexOf(stem(nt)) !== -1;
  }

  function scoreIntent(intent, raw, toks) {
    var score = 0;

    // Phrases match on content words rather than exact substrings, so
    // "what happens in an outage" still finds "what happens during an outage".
    // Phrases that reduce to a single content word are too generic to trust.
    (intent.phrases || []).forEach(function (p) {
      var words = contentWords(p);
      if (words.length < 2) { return; }
      var hits = words.filter(function (w) { return toks.indexOf(w) !== -1; }).length;
      if (hits === words.length) { score += 6; }
      else if (words.length > 2 && hits / words.length >= 0.67) { score += 3; }
    });

    (intent.keywords || []).forEach(function (k) {
      if (!hasTerm(raw, toks, k)) { return; }
      score += normalize(k).indexOf(' ') !== -1 ? 4 : 2;
    });

    // Follow-ups ("and how much?") lean toward whatever we were just discussing.
    if (state.lastIntent && intent.id === state.lastIntent && toks.length <= 4) { score += 1.5; }
    if (state.lastIntentTags && intent.tags) {
      var shared = intent.tags.filter(function (t) { return state.lastIntentTags.indexOf(t) !== -1; });
      if (shared.length && toks.length <= 5) { score += 0.75; }
    }
    return score;
  }

  function matchSmalltalk(raw, toks) {
    if (toks.length > 6) { return null; }
    for (var i = 0; i < KB.smalltalk.length; i++) {
      for (var j = 0; j < KB.smalltalk[i].keywords.length; j++) {
        if (hasTerm(raw, toks, KB.smalltalk[i].keywords[j])) { return KB.smalltalk[i]; }
      }
    }
    return null;
  }

  function looksLikeLead(raw, toks) {
    return KB.lead.keywords.some(function (k) { return hasTerm(raw, toks, k); });
  }

  function answerLocally(text) {
    var raw = normalize(text);
    var toks = tokens(text);

    var best = null;
    var bestScore = 0;
    KB.intents.forEach(function (intent) {
      var s = scoreIntent(intent, raw, toks);
      if (s > bestScore) { bestScore = s; best = intent; }
    });

    var small = matchSmalltalk(raw, toks);
    if (small && bestScore < 4) {
      return { text: small.answer, chips: KB.openingChips.slice(0, 3), intent: null };
    }

    if (bestScore >= 2 && best) {
      state.lastIntent = best.id;
      state.lastIntentTags = best.tags || [];
      return { text: best.answer, chips: best.chips, sources: best.sources, intent: best.id };
    }

    return { text: KB.fallback.answer, chips: KB.fallback.chips, intent: null };
  }

  /* ------------------------------------------------------- lead capture flow */
  function validateField(kind, value) {
    var v = String(value).trim();
    if (kind === 'email') { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? v : null; }
    if (kind === 'name') {
      var cleaned = v.replace(/^(my name is|i am|i'm|it's|its|this is)\s+/i, '').replace(/[^\w\s'-]/g, '').trim();
      return cleaned.length >= 2 ? cleaned.split(/\s+/)[0] : null;
    }
    return v.length >= 2 ? v : null;
  }

  function startLead() {
    state.lead = { step: 0, data: {} };
    var step = KB.lead.steps[0];
    return { text: KB.lead.intro + '\n\n' + step.question, chips: [] };
  }

  function advanceLead(text) {
    var step = KB.lead.steps[state.lead.step];
    var value = validateField(step.validate, text);
    if (!value) { return { text: step.error, chips: [] }; }

    state.lead.data[step.key] = value;
    state.lead.step += 1;

    if (state.lead.step < KB.lead.steps.length) {
      var next = KB.lead.steps[state.lead.step];
      return { text: next.question.replace('{name}', state.lead.data.name || 'there'), chips: [] };
    }

    var lead = Object.assign({ at: new Date().toISOString() }, state.lead.data);
    var leads = load(LEAD_KEY, []);
    leads.push(lead);
    save(LEAD_KEY, leads);
    state.lead = null;

    return {
      text: KB.lead.done,
      chips: ['How much does it cost?', 'What about the 30% tax credit?'],
      leadCard: lead
    };
  }

  function renderLeadCard(lead) {
    var wrap = document.createElement('div');
    wrap.className = 'msg msg--bot';
    wrap.innerHTML =
      '<div class="lead-card"><h4>Survey request captured</h4><dl>' +
      '<dt>Name</dt><dd>' + escapeHtml(lead.name) + '</dd>' +
      '<dt>Email</dt><dd>' + escapeHtml(lead.email) + '</dd>' +
      '<dt>Details</dt><dd>' + escapeHtml(lead.details) + '</dd>' +
      '</dl></div>';
    el.log.appendChild(wrap);
    scrollToEnd();
  }

  /* ------------------------------------------------------------- live model */
  function historyForModel() {
    return state.messages
      .filter(function (m) { return m.role === 'user' || m.role === 'bot'; })
      .slice(-10)
      .map(function (m) { return { role: m.role === 'user' ? 'user' : 'assistant', content: m.text }; });
  }

  function requestFor(provider, key, model, messages, system) {
    if (provider === 'anthropic') {
      return {
        url: 'https://api.anthropic.com/v1/messages',
        headers: {
          'content-type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: model || DEFAULT_MODELS.anthropic,
          max_tokens: 700,
          system: system,
          stream: true,
          messages: messages
        })
      };
    }
    return {
      url: 'https://api.openai.com/v1/chat/completions',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key },
      body: JSON.stringify({
        model: model || DEFAULT_MODELS.openai,
        stream: true,
        messages: [{ role: 'system', content: system }].concat(messages)
      })
    };
  }

  function deltaFrom(provider, payload) {
    if (provider === 'anthropic') {
      if (payload.type === 'content_block_delta' && payload.delta && payload.delta.text) {
        return payload.delta.text;
      }
      return '';
    }
    var choice = payload.choices && payload.choices[0];
    return (choice && choice.delta && choice.delta.content) || '';
  }

  /* Streams tokens into `onDelta`; rejects so the caller can fall back local. */
  function streamCompletion(userText, onDelta) {
    var provider = cfg.provider;
    var messages = historyForModel();
    messages.push({ role: 'user', content: userText });
    var req = requestFor(provider, cfg.key, cfg.model, messages, KB.toPromptContext());

    return fetch(req.url, { method: 'POST', headers: req.headers, body: req.body })
      .then(function (res) {
        if (!res.ok) {
          return res.text().then(function (body) {
            var detail = '';
            try { detail = (JSON.parse(body).error || {}).message || ''; } catch (e) { detail = ''; }
            throw new Error(res.status + (detail ? ' — ' + detail : ''));
          });
        }
        var reader = res.body.getReader();
        var decoder = new TextDecoder();
        var buffer = '';
        var full = '';

        function pump() {
          return reader.read().then(function (chunk) {
            if (chunk.done) { return full; }
            buffer += decoder.decode(chunk.value, { stream: true });
            var lines = buffer.split('\n');
            buffer = lines.pop();
            lines.forEach(function (line) {
              line = line.trim();
              if (line.indexOf('data:') !== 0) { return; }
              var data = line.slice(5).trim();
              if (!data || data === '[DONE]') { return; }
              try {
                var text = deltaFrom(provider, JSON.parse(data));
                if (text) { full += text; onDelta(full); }
              } catch (err) { /* keep-alive or partial frame */ }
            });
            return pump();
          });
        }
        return pump();
      });
  }

  /* ------------------------------------------------------------ speech i/o */
  var Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  var recognizer = null;

  function initSpeech() {
    if (!Recognition) {
      el.mic.disabled = true;
      el.mic.title = 'Voice input needs Chrome, Edge or Safari';
      return;
    }
    recognizer = new Recognition();
    recognizer.lang = 'en-US';
    recognizer.interimResults = true;
    recognizer.continuous = false;

    recognizer.addEventListener('result', function (event) {
      var text = '';
      for (var i = event.resultIndex; i < event.results.length; i++) {
        text += event.results[i][0].transcript;
      }
      el.input.value = text.trim();
      autoGrow();
      if (event.results[event.results.length - 1].isFinal) {
        stopListening();
        if (el.input.value) { submit(el.input.value); }
      }
    });
    recognizer.addEventListener('error', function () { stopListening(); });
    recognizer.addEventListener('end', function () { stopListening(); });
  }

  function startListening() {
    if (!recognizer || state.listening) { return; }
    try { recognizer.start(); } catch (err) { return; }
    state.listening = true;
    el.mic.setAttribute('aria-pressed', 'true');
    el.input.placeholder = 'Listening…';
  }
  function stopListening() {
    if (!state.listening) { return; }
    state.listening = false;
    try { recognizer.stop(); } catch (err) { /* already stopped */ }
    el.mic.setAttribute('aria-pressed', 'false');
    el.input.placeholder = 'Ask about pricing, batteries, timelines…';
  }

  function speak(text) {
    if (!state.speak || !window.speechSynthesis) { return; }
    var plain = text.replace(/\*\*/g, '').replace(/`/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
    window.speechSynthesis.cancel();
    var utter = new SpeechSynthesisUtterance(plain);
    utter.rate = 1.03;
    utter.pitch = 1;
    window.speechSynthesis.speak(utter);
  }

  /* ----------------------------------------------------------- conversation */
  function submit(text) {
    text = String(text || '').trim();
    if (!text || state.busy) { return; }

    addMessage('user', text);
    el.input.value = '';
    autoGrow();
    setChips([]);
    respond(text);
  }

  function respond(text) {
    state.busy = true;
    el.send.disabled = true;
    var typing = showTyping();

    function finish(reply) {
      if (typing.parentNode) { typing.parentNode.removeChild(typing); }
      addMessage('bot', reply.text, { sources: reply.sources });
      if (reply.leadCard) { renderLeadCard(reply.leadCard); }
      setChips(reply.chips && reply.chips.length ? reply.chips : KB.openingChips.slice(0, 3));
      speak(reply.text);
      state.busy = false;
      el.send.disabled = false;
      el.input.focus();
    }

    // An in-progress lead capture owns the turn, whichever engine is active.
    if (state.lead) {
      window.setTimeout(function () { finish(advanceLead(text)); }, 420);
      return;
    }

    var raw = normalize(text);
    var toks = tokens(text);
    if (looksLikeLead(raw, toks)) {
      window.setTimeout(function () { finish(startLead()); }, 420);
      return;
    }

    if (cfg.provider !== 'local' && cfg.key) {
      streamLive(text, typing, finish);
      return;
    }

    var reply = answerLocally(text);
    var delay = Math.min(1100, 320 + reply.text.length * 3);
    window.setTimeout(function () { finish(reply); }, delay);
  }

  function streamLive(text, typing, finish) {
    var node = null;
    var caret = '<span class="cursor"></span>';

    streamCompletion(text, function (soFar) {
      if (!node) {
        if (typing.parentNode) { typing.parentNode.removeChild(typing); }
        node = renderMessage({ role: 'bot', text: '', at: Date.now() });
      }
      node.bubble.innerHTML = renderMarkdown(soFar) + caret;
      scrollToEnd();
    }).then(function (full) {
      if (!full) { throw new Error('empty response'); }
      if (node) {
        node.bubble.innerHTML = renderMarkdown(full);
        state.messages.push({ role: 'bot', text: full, at: Date.now(), sources: null });
        persist();
        var meta = document.createElement('div');
        meta.className = 'msg__meta';
        meta.textContent = KB.brand.assistant + ' · live model · ' + timeLabel(Date.now());
        node.wrap.appendChild(meta);
      }
      setChips(KB.openingChips.slice(0, 3));
      speak(full);
      state.busy = false;
      el.send.disabled = false;
    }).catch(function (err) {
      if (node && node.wrap.parentNode) { node.wrap.parentNode.removeChild(node.wrap); }
      addMessage('system', 'Live model unavailable (' + err.message + ') — answering from the local knowledge base.');
      var reply = answerLocally(text);
      finish(reply);
    });
  }

  /* ------------------------------------------------------------- transcript */
  function downloadTranscript() {
    var lines = state.messages.map(function (m) {
      var who = m.role === 'user' ? 'Visitor' : m.role === 'bot' ? KB.brand.assistant : 'System';
      return '[' + timeLabel(m.at) + '] ' + who + ': ' + m.text.replace(/\*\*/g, '');
    });
    var header = KB.brand.name + ' — chat transcript\n' + new Date().toLocaleString() + '\n\n';
    var blob = new Blob([header + lines.join('\n\n') + '\n'], { type: 'text/plain' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'northbeam-chat-transcript.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /* ------------------------------------------------------------------ open */
  function openChat(seed) {
    state.open = true;
    el.root.classList.add('is-open');
    el.panel.hidden = false;
    el.launcher.setAttribute('aria-expanded', 'true');
    el.launcher.setAttribute('aria-label', 'Close chat with Sunny');
    el.badge.hidden = true;
    scrollToEnd();
    if (seed) {
      window.setTimeout(function () { submit(seed); }, 260);
    } else {
      window.setTimeout(function () { el.input.focus(); }, 120);
    }
  }

  function closeChat() {
    state.open = false;
    el.root.classList.remove('is-open');
    el.panel.hidden = true;
    el.launcher.setAttribute('aria-expanded', 'false');
    el.launcher.setAttribute('aria-label', 'Open chat with Sunny');
    stopListening();
    if (window.speechSynthesis) { window.speechSynthesis.cancel(); }
  }

  function resetChat() {
    state.messages = [];
    state.lastIntent = null;
    state.lead = null;
    el.log.innerHTML = '';
    save(STORE_KEY, { messages: [], lastIntent: null });
    addMessage('bot', KB.greeting);
    setChips(KB.openingChips);
  }

  /* --------------------------------------------------------------- settings */
  function syncSettingsUi() {
    el.provider.value = cfg.provider || 'local';
    el.apiKey.value = cfg.key || '';
    el.model.value = cfg.model || DEFAULT_MODELS[cfg.provider] || '';
    var needsKey = el.provider.value !== 'local';
    Array.prototype.forEach.call(el.settings.querySelectorAll('[data-key-field]'), function (f) {
      f.hidden = !needsKey;
    });
    if (needsKey && !el.model.value) { el.model.value = DEFAULT_MODELS[el.provider.value]; }
    setStatus(engineLabel());
  }

  function note(text, kind) {
    el.note.textContent = text;
    el.note.className = 'chat__settings-note' + (kind ? ' is-' + kind : '');
    window.setTimeout(function () {
      if (el.note.textContent === text) { el.note.textContent = ''; el.note.className = 'chat__settings-note'; }
    }, 4000);
  }

  /* ------------------------------------------------------------------ wire */
  function autoGrow() {
    el.input.style.height = 'auto';
    el.input.style.height = Math.min(120, el.input.scrollHeight) + 'px';
  }

  el.launcher.addEventListener('click', function () {
    if (state.open) { closeChat(); } else { openChat(); }
  });
  el.close.addEventListener('click', closeChat);

  el.form.addEventListener('submit', function (event) {
    event.preventDefault();
    submit(el.input.value);
  });

  el.input.addEventListener('input', autoGrow);
  el.input.addEventListener('keydown', function (event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit(el.input.value);
    }
  });

  el.mic.addEventListener('click', function () {
    if (state.listening) { stopListening(); } else { startListening(); }
  });

  el.voiceToggle.addEventListener('click', function () {
    if (!window.speechSynthesis) { note('This browser has no speech synthesis.', 'err'); return; }
    state.speak = !state.speak;
    el.voiceToggle.setAttribute('aria-pressed', String(state.speak));
    if (!state.speak) { window.speechSynthesis.cancel(); }
  });

  el.settingsToggle.addEventListener('click', function () {
    var willOpen = el.settings.hidden;
    el.settings.hidden = !willOpen;
    el.settingsToggle.setAttribute('aria-expanded', String(willOpen));
  });

  el.provider.addEventListener('change', function () {
    var needsKey = el.provider.value !== 'local';
    Array.prototype.forEach.call(el.settings.querySelectorAll('[data-key-field]'), function (f) {
      f.hidden = !needsKey;
    });
    el.model.value = DEFAULT_MODELS[el.provider.value] || '';
  });

  el.save.addEventListener('click', function () {
    var provider = el.provider.value;
    if (provider !== 'local' && !el.apiKey.value.trim()) {
      note('Add a key, or switch back to the local engine.', 'err');
      return;
    }
    cfg = {
      provider: provider,
      key: el.apiKey.value.trim(),
      model: el.model.value.trim() || DEFAULT_MODELS[provider] || ''
    };
    save(CFG_KEY, cfg);
    setStatus(engineLabel());
    note(provider === 'local' ? 'Using the local knowledge base.' : 'Live model connected — try a question.', 'ok');
    addMessage('system', provider === 'local'
      ? 'Engine switched to the local knowledge base.'
      : 'Engine switched to a live ' + (provider === 'anthropic' ? 'Anthropic' : 'OpenAI') + ' model (' + cfg.model + ').');
  });

  el.clear.addEventListener('click', function () {
    cfg = { provider: 'local', key: '', model: '' };
    save(CFG_KEY, cfg);
    syncSettingsUi();
    note('Key cleared from this browser.', 'ok');
  });

  el.transcript.addEventListener('click', downloadTranscript);
  el.reset.addEventListener('click', function () {
    resetChat();
    note('Conversation reset.', 'ok');
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && state.open) { closeChat(); el.launcher.focus(); }
  });

  document.addEventListener('click', function (event) {
    var trigger = event.target.closest('[data-open-chat]');
    if (!trigger) { return; }
    event.preventDefault();
    openChat(trigger.getAttribute('data-chat-seed'));
  });

  /* ------------------------------------------------------------------ boot */
  function boot() {
    var saved = load(STORE_KEY, null);
    if (saved && saved.messages && saved.messages.length) {
      state.messages = saved.messages;
      state.lastIntent = saved.lastIntent || null;
      state.messages.forEach(renderMessage);
      setChips(KB.openingChips.slice(0, 3));
    } else {
      addMessage('bot', KB.greeting);
      setChips(KB.openingChips);
    }
    syncSettingsUi();
    initSpeech();

    // First-time visitors get a nudge rather than an auto-opened panel.
    if (!saved) {
      window.setTimeout(function () { if (!state.open) { showBadge(); } }, 6000);
    }
  }

  boot();
  window.NorthbeamChat = { open: openChat, close: closeChat, ask: submit, reset: resetChat };
})();
