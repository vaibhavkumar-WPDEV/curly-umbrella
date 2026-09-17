# Northbeam Solar — live AI chat demo

A single-page marketing site for a **fictional** Austin solar installer, built as a portfolio
sample. The point of the demo is the assistant in the bottom-right corner: a chat widget that works
with no backend and no API key, and upgrades to a live streaming LLM when one is supplied.

**Live site:** https://vaibhavkumar-wpdev.github.io/curly-umbrella/

---

## What the assistant does

| | |
|---|---|
| **Local engine (default)** | Intent scoring over a curated knowledge base — keyword + phrase weighting, light stemming, and a context boost so short follow-ups ("and how much?") stay on the previous topic. Runs entirely in the browser: no key, no backend, no per-message cost. |
| **Live LLM mode** | Open the gear icon, pick Anthropic or OpenAI, paste a key. Replies then stream token-by-token from the real API, grounded in the same knowledge base through a generated system prompt. Any failure (bad key, rate limit, network) drops back to the local engine with a visible notice instead of dead-ending. |
| **Voice** | Microphone input via the browser `SpeechRecognition` API, and read-aloud replies via `speechSynthesis`. Both feature-detect and disable themselves where unsupported. |
| **Lead capture** | Booking-style messages trigger a guided slot-filling flow (name → email → zip/bill) with per-field validation, ending in a structured lead card. |
| **Session handling** | Conversation, engine choice and theme persist in `localStorage`; transcript downloads as a text file; chat resets cleanly. |

## Stack

Plain HTML, CSS and JavaScript — no framework, no build step, no dependencies. The whole site is
five static files, which is what makes it deployable to GitHub Pages as-is and trivial to drop into
any existing site as a widget.

```
index.html              markup for the page and the chat widget
assets/css/styles.css   design system (tokens, dark/light themes, components)
assets/js/kb.js         knowledge base — one source of truth for both engines
assets/js/chat.js       chat widget: NLU, lead flow, streaming, speech, persistence
assets/js/site.js       theme toggle, mobile nav, scroll-spy, email capture
```

## Run it locally

```bash
git clone https://github.com/vaibhavkumar-WPDEV/curly-umbrella.git
cd curly-umbrella
python3 -m http.server 8000     # any static server works
# open http://localhost:8000
```

## Deployment

GitHub Pages serves the site from the `gh-pages` branch. `.github/workflows/pages.yml` mirrors the
site files onto that branch on every push to the working branch, and the Pages builder publishes the
result — so a push is the whole deploy step.

## Adapting it to a real client

The knowledge base is the only file that carries business content. Replacing the entries in
`assets/js/kb.js` — keywords, answers, suggested follow-ups, lead questions — retargets the
assistant to a different company without touching the widget code.

## A note on API keys

In this demo a visitor-supplied key is kept in their own browser's `localStorage` and sent directly
to the provider; nothing is proxied through this site, because there is no server. **That is a demo
affordance, not a production pattern.** A real deployment puts the key in a small server-side proxy
that also handles rate limiting, abuse controls, conversation logging and retrieval over the
client's real content.

---

Design, front-end and assistant by **Vaibhav Kumar**. Northbeam Solar, its prices, staff and
certifications are invented for this demo.
