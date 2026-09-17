/* =============================================================================
   kb.js — knowledge base for the "Sunny" assistant.
   Plain data: the local retrieval engine scores against `intents`, and the
   live-LLM mode flattens the same entries into a grounding system prompt, so
   both engines answer from one source of truth.
   ========================================================================== */
(function (global) {
  'use strict';

  var KB = {
    brand: {
      name: 'Northbeam Solar',
      assistant: 'Sunny',
      city: 'Austin, TX',
      phone: '(512) 555-0184',
      email: 'hello@northbeam.example',
      hours: 'Mon–Fri 8am–6pm CT, Saturdays 9am–1pm',
      persona:
        'You are Sunny, the assistant on the Northbeam Solar website. Northbeam is a residential ' +
        'solar and battery installer in Austin, Texas. You are warm, concise and concrete. Two to ' +
        'four sentences per answer unless asked for detail. Use the facts below and never invent ' +
        'prices, warranty terms or timelines that are not listed. If a question needs a real site ' +
        'survey, say so and offer to book one or take the visitor’s email.'
    },

    /* Shown when the log is empty. */
    greeting:
      'Hi, I’m **Sunny**, the Northbeam assistant ☀️ Ask me about pricing, batteries, ' +
      'timelines or the tax credit — or I can book you a site survey.',

    openingChips: [
      'What would a system cost?',
      'How do batteries work in an outage?',
      'What about the 30% tax credit?',
      'Book a site survey'
    ],

    intents: [
      {
        id: 'pricing',
        tags: ['pricing'],
        keywords: ['price', 'pricing', 'cost', 'costs', 'quote', 'estimate', 'expensive', 'how much', 'budget', 'afford', '$'],
        phrases: ['how much does it cost', 'what does it cost', 'give me a price'],
        answer:
          'Cash prices before incentives, sized to your last 12 months of usage:\n' +
          '- **Essentials** — 6 kW solar, no battery, from **$17,400**\n' +
          '- **Resilient** — 8.4 kW solar + 13.5 kWh battery, from **$31,900**\n' +
          '- **Off-peak Pro** — 12 kW solar + 27 kWh battery, from **$46,200**\n' +
          'The 30% federal credit comes off that, and financing starts at 6.49% APR over 25 years. ' +
          'A real number needs your roof and one recent bill — want me to set that up?',
        chips: ['What is included in Resilient?', 'How does financing work?', 'Get an exact quote'],
        sources: [{ label: 'Pricing', href: '#pricing' }]
      },
      {
        id: 'packages',
        tags: ['pricing'],
        keywords: ['package', 'packages', 'plan', 'plans', 'essentials', 'resilient', 'off-peak', 'offpeak', 'tier', 'included', 'include'],
        phrases: ['what is included', 'tell me about the package', 'what is included in resilient'],
        answer:
          '**Essentials** is solar only — about 14 panels, roughly 70% of a typical bill, no backup. ' +
          '**Resilient** is our most chosen build: ~20 panels plus a Powerwall 3, whole-home backup for ' +
          'one to two days, and automatic time-of-use optimization. **Off-peak Pro** doubles the storage ' +
          'and leaves headroom for EV charging and multi-day outages.',
        chips: ['How much is Resilient?', 'Can I add a battery later?', 'Book a site survey'],
        sources: [{ label: 'Pricing', href: '#pricing' }]
      },
      {
        id: 'battery',
        tags: ['product'],
        keywords: ['battery', 'batteries', 'powerwall', 'storage', 'backup', 'outage', 'blackout', 'grid down', 'ercot', 'generator'],
        phrases: ['what happens during an outage', 'do i need a battery', 'how long does a battery last',
          'what does a battery cost', 'how do batteries work in an outage'],
        answer:
          'With a battery the home islands automatically in under a second — most customers only notice ' +
          'a single flicker. We install **Powerwall 3** and **Enphase 5P**; 13.5 kWh covers a typical ' +
          'home’s essentials for one to two days, and Storm Watch pre-charges the pack when severe ' +
          'weather is forecast. Without a battery the system shuts down in an outage for line-worker safety.',
        chips: ['How long does a battery last?', 'Can I add a battery later?', 'What does a battery cost?'],
        sources: [{ label: 'Services', href: '#services' }]
      },
      {
        id: 'battery_later',
        tags: ['product'],
        keywords: ['add later', 'add a battery later', 'retrofit', 'upgrade later', 'future'],
        phrases: ['can i add a battery later', 'add storage later'],
        answer:
          'Yes — as long as we install an AC-coupled system now. We size the main panel and run the ' +
          'conduit for storage on day one, so adding a battery later is a one-day job instead of a rewire. ' +
          'About a third of our solar-only customers come back for storage within three years.',
        chips: ['What does a battery cost?', 'Book a site survey'],
        sources: [{ label: 'FAQ', href: '#faq' }]
      },
      {
        id: 'savings',
        tags: ['value'],
        keywords: ['save', 'savings', 'bill', 'payback', 'roi', 'return', 'break even', 'worth it', 'value of solar', 'net metering', 'buyback'],
        phrases: ['how much will i save', 'is solar worth it', 'when does it pay off'],
        answer:
          'A typical 3-bed Austin home goes from about **$214/month** to around **$31/month** — roughly 85% ' +
          'lower — with an 8.4 kW system plus battery. Austin Energy currently credits exported power at ' +
          '**9.91¢/kWh** through its Value of Solar program, and the battery adds savings by shifting ' +
          'usage off peak rates. Typical payback lands between 7 and 10 years depending on financing.',
        chips: ['What about the 30% tax credit?', 'How much does it cost?', 'Get an exact quote'],
        sources: [{ label: 'Savings snapshot', href: '#top' }]
      },
      {
        id: 'incentives',
        tags: ['value'],
        keywords: ['tax', 'credit', 'incentive', 'incentives', 'rebate', 'itc', '30%', 'federal', 'deduction'],
        phrases: ['tax credit', 'are there rebates'],
        answer:
          'The **30% federal residential clean energy credit** applies to the full installed cost, battery ' +
          'included, and rolls forward if it exceeds what you owe in a year. Austin Energy also runs a ' +
          'solar rebate and the Value of Solar credit for exported power. We hand you the documentation ' +
          'package at commissioning — but your tax situation is a question for your CPA, not for me.',
        chips: ['How much will I save?', 'How does financing work?'],
        sources: [{ label: 'Pricing', href: '#pricing' }]
      },
      {
        id: 'financing',
        tags: ['value'],
        keywords: ['finance', 'financing', 'loan', 'apr', 'monthly payment', 'lease', 'ppa', 'payment plan', 'zero down'],
        phrases: ['can i finance it', 'do you do payment plans', 'how does financing work'],
        answer:
          'Financing starts at **6.49% APR over 25 years** with no money down, through two credit unions we ' +
          'work with. We do not sell leases or PPAs — you own the system, which is what makes the 30% ' +
          'credit yours and keeps the warranty transferable when you sell the house.',
        chips: ['What about the 30% tax credit?', 'How much does it cost?'],
        sources: [{ label: 'Pricing', href: '#pricing' }]
      },
      {
        id: 'timeline',
        tags: ['process'],
        keywords: ['how long', 'timeline', 'time', 'fast', 'when', 'schedule', 'lead time', 'wait', 'install date', 'duration'],
        phrases: ['how long does it take', 'how soon can you install', 'how long does permitting take'],
        answer:
          'Design proposal in **two business days** from your bill, survey the week after, then permitting. ' +
          'Median from permit approval to power-on with Austin Energy is **18 days**. The install itself is ' +
          'one to two days on your roof, done by the same crew that ran your survey.',
        chips: ['What happens on install day?', 'Do you handle permits?', 'Book a site survey'],
        sources: [{ label: 'Process', href: '#process' }]
      },
      {
        id: 'process',
        tags: ['process'],
        keywords: ['process', 'steps', 'how it works', 'how does it work', 'survey', 'install day', 'installation', 'inspection'],
        phrases: ['what is the process', 'what are the steps', 'what happens on install day'],
        answer:
          'Four steps: **remote design** from your bill and satellite imagery, **site survey** by a licensed ' +
          'electrician, **permits and install** (one to two days on site), then **inspection and switch-on** ' +
          'with a walkthrough of the monitoring app. If anything found at the survey changes the price, you ' +
          'hear it before you sign.',
        chips: ['How long does the whole thing take?', 'Do you handle permits?'],
        sources: [{ label: 'Process', href: '#process' }]
      },
      {
        id: 'permits',
        tags: ['process'],
        keywords: ['permit', 'permits', 'paperwork', 'hoa', 'interconnection', 'utility', 'city', 'approval', 'inspection'],
        phrases: ['do you handle the permits', 'who files the paperwork'],
        answer:
          'We do all of it: City of Austin permit, Austin Energy or Pedernales interconnection, HOA ' +
          'submissions where a neighbourhood requires them, and the final inspection. You sign, we file.',
        chips: ['How long does permitting take?', 'Book a site survey'],
        sources: [{ label: 'FAQ', href: '#faq' }]
      },
      {
        id: 'warranty',
        tags: ['product'],
        keywords: ['warranty', 'guarantee', 'guaranteed', 'leak', 'roof damage', 'workmanship', 'transferable', 'coverage'],
        phrases: ['what is the warranty', 'what if my roof leaks'],
        answer:
          'Panels: **25-year** product and production warranty. Microinverters: **25 years**. Our workmanship ' +
          'and roof-penetration warranty is **10 years** and transfers to the next owner if you sell. If a ' +
          'penetration we made leaks in that window, we fix the roof, not just the array.',
        chips: ['What equipment do you use?', 'Do you service what you install?'],
        sources: [{ label: 'FAQ', href: '#faq' }]
      },
      {
        id: 'equipment',
        tags: ['product'],
        keywords: ['panel', 'panels', 'equipment', 'brand', 'brands', 'inverter', 'microinverter', 'enphase', 'rec', 'qcells', 'tesla', 'hardware', 'efficiency'],
        phrases: ['what panels do you use', 'which brands'],
        answer:
          'Tier-1 modules — **REC Alpha** or **Qcells** — with **Enphase IQ8 microinverters** so one shaded ' +
          'panel never drags the string down. Storage is Powerwall 3 or Enphase 5P. Mounting is rail-less, ' +
          'and every penetration is flashed and sealed, not just caulked.',
        chips: ['What is the warranty?', 'How do you handle shade?'],
        sources: [{ label: 'Services', href: '#services' }]
      },
      {
        id: 'roof',
        tags: ['product'],
        keywords: ['roof', 'shingle', 'tile', 'metal', 'shade', 'shaded', 'trees', 'old roof', 'replace roof', 'orientation', 'north facing', 'age'],
        phrases: ['my roof is old', 'do i have too much shade'],
        answer:
          'Composition shingle, standing-seam metal and most tile roofs are all fine. If your shingles have ' +
          'fewer than five years left we will tell you to re-roof first rather than pay us twice to pull the ' +
          'array. Shade is handled with microinverters and modelled panel-by-panel in the proposal — north-facing ' +
          'planes usually get skipped.',
        chips: ['Book a site survey', 'What equipment do you use?'],
        sources: [{ label: 'Services', href: '#services' }]
      },
      {
        id: 'monitoring',
        tags: ['service'],
        keywords: ['monitor', 'monitoring', 'app', 'service', 'maintenance', 'clean', 'cleaning', 'repair', 'support', 'broken', 'not producing', 'producing', 'production', 'stopped', 'underperforming', 'offline', 'fault'],
        phrases: ['do you monitor the system', 'what if something breaks', 'my system stopped producing'],
        answer:
          'We watch per-panel production for you. If a panel underperforms three days running we call you — ' +
          'you do not have to notice. Service visits are same-week, there is an annual inverter health check, ' +
          'and panels here really only need rinsing after heavy pollen or a dust storm.',
        chips: ['What is the warranty?', 'Talk to a human'],
        sources: [{ label: 'Services', href: '#services' }]
      },
      {
        id: 'area',
        tags: ['company'],
        keywords: ['area', 'location', 'where', 'serve', 'service area', 'zip', 'city', 'austin', 'round rock', 'san antonio', 'dallas', 'houston', 'texas'],
        phrases: ['do you serve my area', 'where are you located', 'where do you install'],
        answer:
          'We cover the Austin metro and most of Central Texas — Round Rock, Cedar Park, Georgetown, Kyle, ' +
          'Buda, Dripping Springs, Bastrop and San Marcos. Outside that radius we will refer you to an ' +
          'installer we trust rather than take the job. Our office is at 4120 Freidrich Ln, Austin.',
        chips: ['Book a site survey', 'Talk to a human'],
        sources: [{ label: 'Contact', href: '#contact' }]
      },
      {
        id: 'company',
        tags: ['company'],
        keywords: ['who are you', 'about', 'company', 'licensed', 'license', 'insured', 'certified', 'nabcep', 'reviews', 'experience', 'years', 'subcontract'],
        phrases: ['tell me about northbeam', 'are you licensed'],
        answer:
          'Northbeam has installed **2,100+ systems** around Austin since 2014, holds Texas electrical licence ' +
          '**TECL-31882**, and our leads are NABCEP-certified. Crews are in-house — we do not subcontract the ' +
          'install to whoever is cheapest that month. Average review score is 4.9/5.',
        chips: ['Where do you install?', 'Talk to a human'],
        sources: [{ label: 'About', href: '#top' }]
      },
      {
        id: 'contact',
        tags: ['handoff'],
        keywords: ['human', 'person', 'call', 'phone', 'email', 'talk to someone', 'representative', 'agent', 'sales', 'contact', 'reach'],
        phrases: ['talk to a human', 'can i speak to someone'],
        answer:
          'Of course. Call **(512) 555-0184** or email **hello@northbeam.example** — we answer Mon–Fri 8am–6pm CT ' +
          'and Saturday mornings. If you would rather they came to you, I can take your details and have a ' +
          'designer call you back.',
        chips: ['Book a site survey', 'What are your hours?']
      },
      {
        id: 'hours',
        tags: ['company'],
        keywords: ['hours', 'open', 'closed', 'weekend', 'saturday', 'sunday', 'when are you open'],
        answer:
          'Phones and email are covered **Mon–Fri 8am–6pm CT** and **Saturday 9am–1pm**. Surveys run weekdays; ' +
          'installs occasionally run Saturdays when a permit window is tight. I am here any time.',
        chips: ['Book a site survey', 'Talk to a human']
      },
      {
        id: 'ev',
        tags: ['product'],
        keywords: ['ev', 'car charger', 'electric vehicle', 'charger', 'tesla charger', 'heat pump', 'pool pump'],
        phrases: ['can i charge my ev'],
        answer:
          'Yes — we size for it. An EV adds roughly 300–400 kWh a month, which usually means 4–6 extra panels, ' +
          'and we will install a Level 2 charger on the same permit for about **$1,150** including the circuit. ' +
          'Heat pumps and pool pumps get modelled the same way.',
        chips: ['How much does it cost?', 'Book a site survey'],
        sources: [{ label: 'Pricing', href: '#pricing' }]
      },
      {
        id: 'demo',
        tags: ['meta'],
        keywords: ['demo', 'real company', 'fake', 'portfolio', 'who built', 'built this', 'developer', 'vaibhav', 'sample', 'chatbot', 'how does this chat work', 'api key', 'llm', 'ai'],
        phrases: ['is this a real company', 'how was this built'],
        answer:
          'Straight answer: Northbeam is **fictional** — this page is a portfolio demo built by Vaibhav Kumar. ' +
          'I run entirely in your browser on a local intent-matching engine over a curated knowledge base, with ' +
          'conversational context and guided lead capture. Open the gear icon and paste an Anthropic or OpenAI ' +
          'key and I will stream answers from a live model instead, grounded in this same knowledge base.',
        chips: ['How does the voice input work?', 'What would a system cost?'],
        sources: [{ label: 'About the demo', href: '#chat-info' }]
      },
      {
        id: 'voice',
        tags: ['meta'],
        keywords: ['voice', 'speak', 'microphone', 'mic', 'talk', 'speech', 'listen', 'read aloud', 'audio'],
        phrases: ['how does voice work', 'can you talk'],
        answer:
          'The mic button uses the browser’s SpeechRecognition API to transcribe what you say into the ' +
          'composer, and the speaker icon in my header has me read replies aloud with speech synthesis. Both ' +
          'work best in Chrome or Edge; where the browser lacks support the buttons disable themselves instead ' +
          'of failing silently.',
        chips: ['Is this a real company?', 'What would a system cost?'],
        sources: [{ label: 'About the demo', href: '#chat-info' }]
      }
    ],

    /* Guided lead capture. Triggered by booking-style messages. */
    lead: {
      keywords: ['book', 'booking', 'schedule', 'appointment', 'site survey', 'consultation', 'sign up', 'get started', 'callback', 'call me', 'contact me', 'exact quote', 'like a quote', 'quote for my', 'come out', 'send someone'],
      intro: 'Happy to get that moving — three quick questions and a designer picks it up from there.',
      steps: [
        { key: 'name', question: 'First, what name should I put on it?', validate: 'name', error: 'A first name is enough — what should I call you?' },
        { key: 'email', question: 'Thanks, {name}. What email should the proposal go to?', validate: 'email', error: 'That does not look like an email address — mind trying again?' },
        { key: 'details', question: 'Last one: your zip code, and roughly what you pay for power in an average month?', validate: 'any', error: 'Even a rough number helps — what is your zip and typical bill?' }
      ],
      done:
        'Got it — a designer will reach out within one business day with a fixed-price proposal. ' +
        'If it is urgent, call **(512) 555-0184** and mention you spoke to Sunny.'
    },

    fallback: {
      answer:
        'I do not have a solid answer for that one — I would rather say so than guess. I am good on pricing, ' +
        'batteries and outages, the tax credit, timelines, permits, warranties and equipment. Or I can hand you ' +
        'to a person at **(512) 555-0184**.',
      chips: ['What would a system cost?', 'How do batteries work in an outage?', 'Talk to a human']
    },

    smalltalk: [
      { keywords: ['hi', 'hello', 'hey', 'howdy', 'good morning', 'good afternoon', 'good evening', 'yo'], answer: 'Hey! What can I help you figure out — pricing, batteries, or timelines?' },
      { keywords: ['thanks', 'thank you', 'thx', 'appreciate', 'cheers'], answer: 'Any time. Anything else you want to dig into?' },
      { keywords: ['bye', 'goodbye', 'see you', 'later', 'that is all', "that's all"], answer: 'Take care — the estimate button up top is here whenever you want a real number.' },
      { keywords: ['how are you', 'who are you', 'your name'], answer: 'I am Sunny, the Northbeam assistant. Running well and fully caffeinated on photons. What do you need?' },
      { keywords: ['joke', 'funny'], answer: 'Why did the solar panel refuse the night shift? No good reason to stay up. Now — pricing, batteries, or timelines?' }
    ]
  };

  /* Compact grounding text for the live-LLM mode. */
  KB.toPromptContext = function () {
    var lines = KB.intents.map(function (i) {
      return '### ' + i.id + '\n' + i.answer.replace(/\*\*/g, '');
    });
    return [
      KB.brand.persona,
      '',
      'Company: ' + KB.brand.name + ', ' + KB.brand.city + '. Phone ' + KB.brand.phone +
        '. Email ' + KB.brand.email + '. Hours ' + KB.brand.hours + '.',
      'Note: Northbeam Solar is a fictional company used for a portfolio demo. If a visitor asks ' +
        'whether it is real, say so plainly.',
      '',
      '## Knowledge base',
      lines.join('\n\n'),
      '',
      'Formatting: short paragraphs, markdown bold and hyphen bullets only. Never invent figures ' +
        'beyond the knowledge base; offer a site survey when a real answer needs one.'
    ].join('\n');
  };

  global.NORTHBEAM_KB = KB;
})(window);
