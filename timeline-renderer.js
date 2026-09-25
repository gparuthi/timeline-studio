/* TimelineText: zero-dependency parser + standalone HTML renderer. */
(function (root) {
  "use strict";
  const art = {
    css: "\n  :root { --navy:#071d42; --blue:#165481; --sky:#d8effa; --sand:#fbecd0; --sage:#dce9df; --paper:#fcfbf7; }\n  * { box-sizing:border-box; }\n  body { margin:0; background:#eaf0f1; color:var(--navy); font-family:Arial,Helvetica,sans-serif; }\n  .sheet { position:relative; max-width:1120px; margin:24px auto; padding:30px 34px 0; overflow:hidden; background:var(--paper); box-shadow:0 12px 60px #16394a12; }\n  .masthead { position:relative; height:180px; text-align:center; isolation:isolate; }\n  h1 { position:relative; z-index:1; margin:0; padding-top:3px; font-family:Georgia,'Times New Roman',serif; font-size:clamp(32px,5.3vw,62px); line-height:1.15; letter-spacing:-2px; }\n  .date { margin:10px 0 0; font-size:23px; letter-spacing:5px; font-weight:600; }\n  .tagline { margin:12px 0 0; font-family:'Snell Roundhand','Brush Script MT',Georgia,serif; font-style:italic; font-size:29px; color:var(--blue); }\n  .flight-art { position:absolute; left:-35px; top:-5px; width:198px; height:155px; z-index:-1; opacity:.9; }\n  .la-art { position:absolute; right:-38px; top:25px; width:234px; height:157px; z-index:-1; }\n  .timeline { position:relative; height:1120px; --axis:180px; --cards:370px; --hour-height:132px; }\n  .axis { position:absolute; top:0; left:var(--axis); height:1056px; width:4px; border-radius:3px; background:var(--blue); transform:translateX(-50%); }\n  .hour { position:absolute; top:calc(var(--i) * var(--hour-height)); left:0; right:0; height:0; }\n  .hour::after { content:''; position:absolute; top:0; left:160px; right:0; border-top:1px dashed #c4dbe7; }\n  .hour-label { position:absolute; width:151px; padding:10px 6px; border-radius:17px; text-align:center; transform:translateY(-50%); background:var(--sky); font-size:29px; font-weight:800; line-height:1.1; letter-spacing:-1px; }\n  .hour:nth-of-type(even) .hour-label { background:var(--sand); }\n  .hour:last-child .hour-label { background:var(--sage); }\n  .hour-dot { position:absolute; left:var(--axis); height:15px; width:15px; border-radius:50%; transform:translate(-50%,-50%); background:var(--blue); z-index:2; }\n  .connectors { position:absolute; inset:0; width:100%; height:100%; overflow:visible; pointer-events:none; }\n  .connector { fill:none; stroke:#a5cde0; stroke-width:1.5; stroke-dasharray:4 4; }\n  .event-dot { fill:var(--blue); }\n  .events { margin:0; padding:0; list-style:none; }\n  .event { position:absolute; left:calc(var(--axis) + 48px); right:0; display:grid; grid-template-columns:126px 1fr; align-items:center; gap:0; transform:translateY(-50%); }\n  .event time { justify-self:stretch; padding:8px 4px; border-radius:22px; font-size:23px; line-height:1.1; letter-spacing:-.8px; font-weight:800; text-align:center; background:var(--tint); white-space:nowrap; }\n  .event.sky { --tint:#d8effa; --icon-bg:#bfe5f9; --border:#c4e9fa; --wash:#eff8fb; }\n  .event.sand { --tint:#fbecd0; --icon-bg:#ffe0a1; --border:#f7e7c8; --wash:#fcf5e8; }\n  .event.sage { --tint:#dce9df; --icon-bg:#b7d0bb; --border:#cfe2d9; --wash:#edf3ee; }\n  .event-body { position:relative; min-height:62px; padding:7px 14px 7px 76px; border:1px solid var(--border); border-radius:16px; background:linear-gradient(100deg,var(--wash),color-mix(in srgb,var(--tint) 36%,var(--paper))); }\n  .event-icon { position:absolute; left:-1px; top:50%; transform:translateY(-50%); display:grid; place-items:center; width:62px; height:62px; border-radius:50%; background:var(--icon-bg); }\n  .event-icon svg { width:34px; height:34px; fill:var(--navy); }\n  h2 { margin:0; font-size:25px; line-height:1.08; font-weight:750; letter-spacing:-.8px; }\n  .event p { margin:3px 0 0; font-size:18px; line-height:1.15; color:var(--blue); }\n  .notes { display:grid; grid-template-columns:34% 1fr 115px; align-items:center; min-height:137px; padding:21px 24px; border-radius:24px; background:#e3f1f3; gap:25px; }\n  .notes-heading { display:flex; align-items:center; gap:17px; height:100%; border-right:1px solid #91c6d8; }\n  .notes-heading svg { width:65px; height:76px; flex:none; color:var(--blue); transform:rotate(-8deg); }\n  .notes h2 { font-family:Georgia,serif; font-size:32px; letter-spacing:-1px; }\n  .notes ul { list-style:none; margin:0; padding:0; font-size:18px; line-height:1.4; }\n  .notes li { display:flex; gap:13px; align-items:center; margin:6px 0; }\n  .check { display:grid; place-items:center; flex:none; width:25px; height:25px; border-radius:50%; background:#47745f; color:white; font-size:19px; }\n  .good-travels { text-align:center; font-family:'Snell Roundhand','Brush Script MT',Georgia,serif; font-size:30px; line-height:1.1; font-style:italic; transform:rotate(-10deg); }\n  footer { position:relative; display:flex; align-items:center; justify-content:center; gap:20px; height:90px; color:var(--blue); font-size:12px; letter-spacing:3px; text-align:center; }\n  footer::before,footer::after { content:''; width:66px; height:1px; background:#719bb6; }\n  .footer-hills { position:absolute; left:-34px; bottom:0; width:280px; height:65px; opacity:.7; pointer-events:none; }\n  .symbols { position:absolute; width:0; height:0; overflow:hidden; }\n  @media(max-width:850px) { .sheet{margin:0;padding:25px 22px 0;} .masthead{height:175px;} h1{font-size:48px;} .date{font-size:18px;letter-spacing:3px;} .flight-art{width:140px;top:55px;} .la-art{width:165px;top:65px;} .timeline{--axis:130px;} .hour-label{width:108px;font-size:25px;} .hour::after{left:112px;} .event{left:calc(var(--axis) + 25px);grid-template-columns:105px 1fr;} .event time{font-size:19px;} h2{font-size:22px;} .event p{font-size:16px;} .event-body{padding-left:65px;} .event-icon{width:56px;height:56px;} .notes{grid-template-columns:29% 1fr;gap:18px;padding:20px;} .notes-heading{gap:9px;} .notes-heading svg{width:43px;} .notes h2{font-size:25px;} .notes ul{font-size:16px;} .good-travels{display:none;} }\n  @media(max-width:580px) { .sheet{padding:27px 14px 0;} .masthead{height:162px;} h1{max-width:350px;margin:auto;font-size:38px;letter-spacing:-1.6px;line-height:1;} .date{margin-top:13px;font-size:12px;letter-spacing:2.1px;} .tagline{font-size:21px;margin-top:10px;} .flight-art{width:93px;top:53px;left:-40px;opacity:.6;} .la-art{width:97px;top:62px;right:-32px;opacity:.75;} .timeline{--axis:61px;--hour-height:146px;height:1236px;} .axis{height:1168px;width:3px;} .hour-label{width:49px;font-size:16px;letter-spacing:-.7px;padding:9px 0;border-radius:11px;} .hour::after{left:51px;} .hour-dot{width:10px;height:10px;} .event{left:calc(var(--axis) + 17px);grid-template-columns:1fr;} .event time{position:absolute;z-index:1;left:42px;top:5px;padding:0;background:none;font-size:13px;letter-spacing:0;text-align:left;} .event-body{min-height:76px;padding:23px 7px 8px 42px;border-radius:13px;} .event-icon{left:4px;width:33px;height:40px;background:transparent;} .event-icon svg{width:26px;height:26px;} h2{font-size:18px;letter-spacing:-.55px;line-height:1.05;} .event p{font-size:13px;line-height:1.15;margin-top:3px;} .notes{display:block;padding:17px;border-radius:19px;} .notes-heading{border:0;gap:10px;margin-bottom:8px;} .notes-heading svg{width:27px;height:33px;} .notes h2{font-size:25px;} .notes ul{font-size:13px;} .notes li{gap:9px;margin:8px 0;} .check{width:20px;height:20px;font-size:14px;} footer{height:78px;font-size:9px;letter-spacing:1.4px;gap:9px;} footer::before,footer::after{width:19px;} .footer-hills{width:135px;height:36px;left:-14px;} }\n  @media print { @page{size:A4 portrait;margin:8mm;} body{background:white;} .sheet{margin:0;box-shadow:none;width:1052px;max-width:none;zoom:.68;padding-top:20px;} .masthead{height:165px;} .timeline{height:1100px;} footer{height:65px;} }\n",
    symbols:
      '<svg class="symbols" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs>\n <symbol id="home" viewBox="0 0 40 40"><path d="M3 19 20 4l17 15-4 4-3-3v16H23V25h-7v11H9V20l-3 3z"/></symbol>\n <symbol id="plane" viewBox="0 0 40 40"><path d="m36 5-2-1-3 1-9 9-14-3-4 4 12 6-7 8-6-1-2 3 8 4 4 4 3-2-1-6 8-8 6 13 4-4-3-14 8-9z"/></symbol>\n <symbol id="depart" viewBox="0 0 40 40"><path d="M3 33h34v3H3zM4 23l3 6 29-14c5-3 1-7-3-5l-10 5-12-6-5 3 11 7-8 4-5-4-4 2z"/></symbol>\n <symbol id="land" viewBox="0 0 40 40"><path d="M3 33h34v3H3zM4 10l2 13 28 6c5 1 6-5 1-7l-10-3-7-15-6-1 4 14-7-2-2-6z"/></symbol>\n <symbol id="coffee" viewBox="0 0 40 40"><path d="M6 15h25v5h2a6 6 0 0 1 0 12h-5a11 11 0 0 1-21-5zm25 8v6h2a3 3 0 0 0 0-6z"/><path d="M12 11c-5-4 4-4 0-9m8 9c-5-4 4-4 0-9m8 9c-5-4 4-4 0-9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></symbol>\n <symbol id="ticket" viewBox="0 0 40 40"><g transform="rotate(-20 20 20)"><path d="M3 8h34v10a4 4 0 0 0 0 8v7H3v-7a4 4 0 0 0 0-8z"/><path d="M26 9v23M8 15h13M8 21h10" stroke="#ffe0a1" stroke-width="2" stroke-dasharray="3 2"/></g></symbol>\n <symbol id="pin" viewBox="0 0 40 40"><path d="M20 1A14 14 0 0 0 6 15c0 10 14 24 14 24s14-14 14-24A14 14 0 0 0 20 1m0 8a6 6 0 1 1 0 12 6 6 0 0 1 0-12"/></symbol>\n <symbol id="car" viewBox="0 0 40 40"><path d="m9 6-5 13-3 4v11h4v4h6v-5h18v5h6v-4h4V23l-4-4-5-13zm2 4h17l4 11H7zm-3 15a3 3 0 1 1 0 6 3 3 0 0 1 0-6m24 0a3 3 0 1 1 0 6 3 3 0 0 1 0-6"/></symbol>\n <symbol id="road" viewBox="0 0 40 40"><path d="M13 2h14l12 36H1z"/><path d="M20 5v7m0 5v7m0 6v8" fill="none" stroke="#bfe5f9" stroke-width="4"/></symbol>\n <symbol id="meal" viewBox="0 0 40 40"><path d="M8 3h2.5v9h2V3H15v9h2V3h2.5v10a5 5 0 0 1-3.5 4.8V37h-3.5V17.8A5 5 0 0 1 8 13z"/><path d="M26 3c6 3 8 11 8 18 0 2-1 4-3 4h-2v12h-3z"/></symbol>\n <symbol id="tree" viewBox="0 0 40 40"><path d="M20 2 8 18h6L6 30h11v8h6v-8h11L26 18h6z"/></symbol>\n <symbol id="bed" viewBox="0 0 40 40"><path d="M3 31V11h4v11h13v-8h11a6 6 0 0 1 6 6v11h-4v-4H7v4z"/><circle cx="12" cy="17" r="3.5"/></symbol>\n <symbol id="shop" viewBox="0 0 40 40"><path d="M8 13h24l2 24H6zm8 0v-3a4 4 0 0 1 8 0v3h3v-3a7 7 0 0 0-14 0v3z"/></symbol>\n <symbol id="palm" viewBox="0 0 40 40"><path d="M18 38h6l-2-24c7-1 10 4 12 10 2-8-2-13-10-14 6-4 11 0 15 3-2-8-10-10-16-6 1-6-4-8-8-7 3 2 4 5 4 8C13 3 5 4 1 10c7-2 11-1 15 1C7 12 3 18 5 25c3-6 6-10 13-11z"/></symbol>\n</defs></svg>',
    flight:
      '<svg class="flight-art" viewBox="0 0 210 155" aria-hidden="true"><path d="M-9 109C41 145 93 119 137 68" fill="none" stroke="#175181" stroke-width="3" stroke-linecap="round" stroke-dasharray="7 10"/><path d="M29 78c-7-15 13-28 24-18 6-33 52-27 55 3 21-4 26 21 8 23H39zM113 143c-9-20 15-29 28-21 1-34 52-40 59-4 23-5 25 25 5 29z" fill="#e5f3f9"/><use href="#plane" x="132" y="5" width="68" height="68" fill="#113e62" transform="rotate(15 166 39)"/></svg>',
    city: '<svg class="la-art" viewBox="0 0 250 170" aria-hidden="true"><circle cx="92" cy="43" r="37" fill="#ffe0a4"/><path d="M7 153 32 137 49 144 60 125 75 137 86 115 104 135 124 124 141 142 155 136 172 150z" fill="#d4e8f0"/><path d="M68 149v-45h14v45m10 0V85h15v64m8 0V65h15v84m11 0V97h12v52m12 0V79h12v70m12 0v-41h13v41" fill="#8ebbd2"/><path d="M0 170q122-79 250-17v17z" fill="#fbedcf"/><g fill="#104567"><use href="#palm" x="196" y="14" width="52" height="137"/><use href="#palm" x="164" y="82" width="24" height="76"/><use href="#palm" x="17" y="65" width="28" height="96"/></g><text x="94" y="160" fill="#12375b" font-family="Georgia,serif" font-size="21" font-style="italic" transform="rotate(-7 94 160)">Los Angeles \u2661</text></svg>',
  };
  // Visual themes. Each is CSS layered over the base sheet; `travel` is the
  // base look (and the only one that draws the header artwork).
  const themes = {
    travel: "",
    minimal:
      ":root{--navy:#111;--blue:#666;--sky:#f1f1ef;--sand:#f1f1ef;--sage:#f1f1ef;--paper:#fff;} body{background:#f3f3f1;} .sheet{box-shadow:0 1px 3px #0000001a;} h1{font-family:-apple-system,'Helvetica Neue',Arial,sans-serif;letter-spacing:-2.5px;} .date{font-size:14px;letter-spacing:2px;color:#888;} .tagline{font-family:inherit;font-style:normal;font-size:18px;color:#888;} .axis{width:1px;background:#d4d4d2;} .hour-label{background:none!important;padding:0 14px 0 0;width:150px;text-align:right;font-size:15px;font-weight:600;letter-spacing:0;color:#999;} .hour::after{border-top-color:#ececea;} .hour-dot{width:9px;height:9px;background:#111;} .event.sky,.event.sand,.event.sage{--tint:#f1f1ef;--icon-bg:#111;--border:#e4e4e2;--wash:#fff;} .event time{background:none;padding-right:16px;text-align:right;font-size:16px;font-weight:600;letter-spacing:0;color:#999;} .event-body{background:#fff;border:1px solid #e6e6e4;border-radius:8px;} .event-icon{border-radius:8px;} .event-icon svg{fill:#fff;} h2{font-size:21px;letter-spacing:-.5px;} .event p{color:#777;} .connector{stroke:#ddd;stroke-dasharray:none;} .event-dot{fill:#111;} .notes{background:#f6f6f4;border-radius:12px;} .notes-heading{font-family:inherit;font-size:22px;border-right-color:#ddd;} .check{background:#111;} footer{color:#999;letter-spacing:2px;} footer::before,footer::after{background:#ddd;} .now{border-top-color:#111;} .now-dot{background:#111;box-shadow:0 0 0 4px #1111;} .until{color:#999;} @media(max-width:850px){.hour-label{width:108px;}} @media(max-width:580px){.hour-label{width:52px;padding:0;text-align:center;font-size:13px;} .event time{padding:0;text-align:left;font-size:13px;} .event-icon svg{fill:#111;}}",
    retro:
      ":root{--navy:#3b2416;--blue:#8a4b2a;--sky:#f5d59a;--sand:#e9a15a;--sage:#a9c3a0;--paper:#f7e9cf;} body{background:#e6cfa7;} .sheet{box-shadow:inset 0 0 0 6px #d9b071,0 12px 40px #3b241633;} .masthead::before{content:'';position:absolute;left:-40px;right:-40px;top:-40px;height:120%;z-index:-1;background:repeating-conic-gradient(from 0deg at 50% 100%,#f0b45a 0 5deg,transparent 5deg 10deg);opacity:.35;-webkit-mask:linear-gradient(#000 20%,transparent);mask:linear-gradient(#000 20%,transparent);} h1{font-family:'Cooper Black','Arial Black',Georgia,serif;letter-spacing:-1px;color:#c9512c;text-shadow:3px 3px 0 #f0b45a;} .date{letter-spacing:6px;} .tagline{font-family:Georgia,serif;color:#c9512c;} .axis{width:4px;background:repeating-linear-gradient(#8a4b2a 0 8px,transparent 8px 14px);} .hour-label{background:#f0b45a!important;border:2px solid #3b2416;border-radius:999px;box-shadow:3px 3px 0 #3b2416;font-family:'Arial Black',Arial,sans-serif;font-size:18px;letter-spacing:0;text-transform:uppercase;} .hour-dot{background:#3b2416;} .hour::after{border-top:2px dotted #c9a06d;} .event.sky{--tint:#f5d59a;--icon-bg:#f0b45a;--border:#3b2416;--wash:#fbf1de;} .event.sand{--tint:#e9a15a;--icon-bg:#c9512c;--border:#3b2416;--wash:#fbe6cf;} .event.sage{--tint:#a9c3a0;--icon-bg:#5f8a63;--border:#3b2416;--wash:#e9f0e0;} .event time{border:2px solid #3b2416;box-shadow:3px 3px 0 #3b2416;font-family:'Arial Black',Arial,sans-serif;font-size:19px;letter-spacing:0;} .event-body{background:var(--wash);border:2px solid #3b2416;border-radius:14px;box-shadow:4px 4px 0 #3b2416;} .event-icon{border:2px solid #3b2416;} .event.sand .event-icon svg,.event.sage .event-icon svg{fill:#fff;} h2{font-family:'Arial Black',Arial,sans-serif;font-weight:900;letter-spacing:0;} .connector{stroke:#8a4b2a;} .event-dot{fill:#c9512c;} .notes{background:#f0b45a;border:2px solid #3b2416;box-shadow:4px 4px 0 #3b2416;} .notes-heading{border-right:2px solid #3b2416;} .check{background:#c9512c;} footer::before,footer::after{background:#8a4b2a;} .now{border-top-color:#c9512c;} .now-dot{background:#c9512c;box-shadow:0 0 0 4px #c9512c33;} @media(max-width:580px){.event time{border:0;box-shadow:none;font-size:13px;} .event-icon{border:0;} .masthead::before{left:-14px;right:-14px;} .hour-label{font-size:12px;padding:7px 0;box-shadow:2px 2px 0 #3b2416;}}",
    future:
      ":root{--navy:#e8f4ff;--blue:#8fb8d8;--sky:#0f2a4a;--sand:#2a1846;--sage:#0d3336;--paper:#0a0f1c;} body{background:#05070f;} .sheet{background:radial-gradient(1200px 520px at 50% -120px,#12305a,#0a0f1c 60%);box-shadow:0 0 0 1px #2e4a6e,0 0 80px #1c6bff33;} h1{font-family:'Avenir Next','Helvetica Neue',Arial,sans-serif;font-weight:800;text-transform:uppercase;letter-spacing:4px;color:#fff;text-shadow:0 0 18px #29e2ff99;} .date{font-size:15px;letter-spacing:8px;color:#29e2ff;} .tagline{font-family:inherit;font-style:normal;font-size:14px;letter-spacing:3px;text-transform:uppercase;color:#ff4fd8;} .axis{width:2px;background:linear-gradient(#29e2ff,#ff4fd8);box-shadow:0 0 12px #29e2ff88;} .hour-label{background:transparent!important;border:1px solid #29e2ff66;border-radius:4px;padding:6px;font-family:Menlo,Consolas,monospace;font-size:14px;letter-spacing:2px;color:#29e2ff;} .hour::after{border-top:1px solid #29e2ff22;} .hour-dot{background:#29e2ff;box-shadow:0 0 10px #29e2ff;} .event.sky{--tint:#0f2a4a;--icon-bg:#0f2a4a;--border:#29e2ff88;--wash:#0f1a2e;} .event.sand{--tint:#2a1846;--icon-bg:#2a1846;--border:#ff4fd888;--wash:#1a1230;} .event.sage{--tint:#0d3336;--icon-bg:#0d3336;--border:#5dffb888;--wash:#0e2124;} .event time{border:1px solid var(--border);font-family:Menlo,Consolas,monospace;font-size:15px;letter-spacing:0;color:#fff;} .event-body{background:linear-gradient(120deg,#ffffff0d,#ffffff03);border:1px solid var(--border);border-radius:6px;box-shadow:0 0 18px -6px var(--border);} .event-icon{border:1px solid var(--border);} .event-icon svg{fill:#fff;} h2{color:#fff;letter-spacing:.5px;} .connector{stroke:#29e2ff55;} .event-dot{fill:#ff4fd8;} .notes{background:#0f1a2e;border:1px solid #29e2ff44;} .notes-heading{border-right-color:#29e2ff44;color:#fff;} .notes ul{color:#cfe6ff;} .check{background:#5dffb8;color:#05070f;} footer{letter-spacing:5px;} footer::before,footer::after{background:#29e2ff66;} .now{border-top-color:#5dffb8;box-shadow:0 0 12px #5dffb8;} .now-dot{background:#5dffb8;box-shadow:0 0 0 4px #5dffb833,0 0 16px #5dffb8;} .event.past{opacity:.3;} .until{color:#5dffb8;} @media(max-width:580px){.event time{border:0;} .event-icon{border:0;} .hour-label{padding:5px 0;font-size:12px;letter-spacing:0;}}",
    code:
      ":root{--navy:#e6edf3;--blue:#8b949e;--sky:#0d1117;--sand:#0d1117;--sage:#0d1117;--paper:#0d1117;} body{background:#010409;font-family:'SF Mono',Menlo,Consolas,'Liberation Mono',monospace;} .sheet{border:1px solid #30363d;border-radius:8px;box-shadow:none;} h1{font-family:inherit;font-size:clamp(22px,4vw,40px);font-weight:700;letter-spacing:-1px;} h1::before{content:'# ';color:#8b949e;} h1::after{content:'\\258D';margin-left:4px;color:#3fb950;animation:code-caret 1.1s steps(2) infinite;} @keyframes code-caret{50%{opacity:0;}} .date{font-size:14px;letter-spacing:0;color:#8b949e;} .date::before,.tagline::before{content:'// ';} .tagline{font-family:inherit;font-style:normal;font-size:14px;color:#8b949e;} .axis{width:1px;background:#30363d;} .hour-label{background:none!important;padding:0 10px 0 0;text-align:right;font-size:13px;font-weight:400;letter-spacing:0;color:#8b949e;} .hour-dot{width:7px;height:7px;background:#30363d;} .hour::after{border-top:1px solid #21262d;} .event.sky{--code:#79c0ff;} .event.sand{--code:#ffa657;} .event.sage{--code:#7ee787;} .event{--tint:transparent;--icon-bg:#0d1117;--border:#30363d;--wash:#161b22;} .event time{background:none;padding-right:12px;text-align:right;font-size:14px;font-weight:400;letter-spacing:0;color:#8b949e;} .event time::before{content:'@ ';color:#484f58;} .event-body{background:#161b22;border:1px solid #30363d;border-left:3px solid var(--code);border-radius:6px;} .event-icon{border:1px solid #30363d;border-radius:6px;} .event-icon svg{fill:var(--code);} h2{font-family:inherit;font-size:17px;font-weight:600;letter-spacing:0;color:var(--code);} h2::before{content:'> ';color:#484f58;} .event p{font-size:13px;color:#8b949e;} .connector{stroke:#30363d;stroke-dasharray:none;} .event-dot{fill:#58a6ff;} .notes{background:#161b22;border:1px solid #30363d;border-radius:6px;} .notes-heading{font-family:inherit;font-size:16px;color:#8b949e;border-right-color:#30363d;} .day-heading::before{content:'## ';color:#8b949e;} .day-heading{color:#e6edf3;text-transform:none;letter-spacing:0;font-size:16px;} .notes-heading::before{content:'/* ';} .notes-heading::after{content:' */';} .notes ul{font-size:13px;} .check{width:18px;height:18px;font-size:12px;background:#238636;} footer{font-size:12px;letter-spacing:0;color:#484f58;} footer::before,footer::after{background:#30363d;} .now{border-top:1px dashed #f85149;} .now-dot{background:#f85149;box-shadow:0 0 0 4px #f8514933;} .event.past{opacity:.4;} .until{color:#8b949e;} @media(max-width:580px){.event time{padding:0;text-align:left;} .hour-label{width:52px;padding:0;text-align:center;}}",
  };
  const themeNames = Object.keys(themes);
  // Night versions of the light themes. Applied under
  // prefers-color-scheme: dark (screen only, print stays light), so the
  // same text is a light sheet by day and a dark one at night; future and
  // code are dark already and retro keeps its sun.
  const darkThemes = {
    travel:
      ":root{color-scheme:dark;--navy:#e3ecf7;--blue:#8fc0e6;--sky:#16304a;--sand:#3a2f1c;--sage:#1d3126;--paper:#101827;} body{background:#070c16;} .sheet{box-shadow:0 12px 60px #00000066;} .hour::after{border-top-color:#24354a;} .event.sky{--tint:#16304a;--icon-bg:#244a6b;--border:#2a4d6e;--wash:#14213a;} .event.sand{--tint:#3a2f1c;--icon-bg:#5a4526;--border:#4d3d22;--wash:#251e14;} .event.sage{--tint:#1d3126;--icon-bg:#2f4d3a;--border:#2c4a38;--wash:#16231b;} .notes{background:#14222f;} .notes-heading{border-right-color:#2e4a60;} .connector{stroke:#3a5670;} footer::before,footer::after{background:#3a5670;} .event p a,.notes a{text-decoration-color:#4f7a99;} .map-link{color:#071d42!important;} .flight-art path[fill='none']{stroke:#5f93bd;} .flight-art path[fill]{fill:#1b2d44;} .flight-art use{fill:#9cc4e4;} .la-art circle{fill:#f2c464;} .la-art path[fill='#d4e8f0']{fill:#1b2d44;} .la-art path[fill='#8ebbd2']{fill:#2f4f6e;} .la-art path[fill='#fbedcf']{fill:#1a2436;} .la-art g{fill:#9cc4e4;} .la-art text{fill:#9cc4e4;} .event.live .event-body{box-shadow:0 0 0 2px #ff8a70aa;}",
    minimal:
      ":root{color-scheme:dark;--navy:#ededea;--blue:#9a9a96;--sky:#1c1c1a;--sand:#1c1c1a;--sage:#1c1c1a;--paper:#141413;} body{background:#0c0c0b;} .sheet{box-shadow:0 1px 3px #00000080;} .date,.tagline{color:#8a8a86;} .axis{background:#2a2a28;} .hour-label{color:#7a7a76;} .hour::after{border-top-color:#222220;} .hour-dot{background:#ededea;} .event.sky,.event.sand,.event.sage{--tint:#1c1c1a;--icon-bg:#ededea;--border:#2a2a28;--wash:#161615;} .event time{color:#8a8a86;} .event-body{background:#161615;border-color:#262624;} .event-icon svg{fill:#111;} .event p{color:#a0a09c;} .connector{stroke:#2e2e2c;} .event-dot{fill:#ededea;} .notes{background:#161615;} .notes-heading{border-right-color:#2a2a28;} .check{background:#ededea;color:#111;} footer{color:#7a7a76;} footer::before,footer::after{background:#2a2a28;} .now{border-top-color:#ededea;} .now-dot{background:#ededea;box-shadow:0 0 0 4px #ededea22;} .until{color:#8a8a86;} .map-link{background:#ededea;color:#111!important;} .event p a,.notes a{text-decoration-color:#555553;} .show-past{border-color:#3a3a38;color:#a0a09c;} @media(max-width:580px){.event-icon svg{fill:#ededea;}}",
  };

  const icons = [
    "home",
    "plane",
    "depart",
    "land",
    "coffee",
    "meal",
    "tree",
    "bed",
    "shop",
    "ticket",
    "pin",
    "car",
    "road",
    "palm",
    "dumbbell",
    "run",
    "stretch",
    "timer",
    "pot",
  ];
  // Icons added for routines (workouts, recipes). A page carries only the
  // ones it uses, so a day timeline's markup is unchanged by them.
  const moreSymbols = {
    dumbbell:
      '<symbol id="dumbbell" viewBox="0 0 40 40"><g transform="rotate(-30 20 20)"><path d="M11 18h18v4H11z"/><rect x="7" y="9" width="6" height="22" rx="2"/><rect x="27" y="9" width="6" height="22" rx="2"/><rect x="2" y="13" width="6" height="14" rx="2"/><rect x="32" y="13" width="6" height="14" rx="2"/></g></symbol>',
    run:
      '<symbol id="run" viewBox="0 0 40 40"><circle cx="26" cy="5.5" r="4"/><path d="M20.8 10.8L15.8 21.8A3 3 0 0 0 21.2 24.2L26.2 13.2A3 3 0 0 0 20.8 10.8Z"/><path d="M20.7 16.2L26.7 20.7A2.1 2.1 0 0 0 29.3 17.3L23.3 12.8A2.1 2.1 0 0 0 20.7 16.2ZM29.2 20.7L34.2 17.2A2.1 2.1 0 0 0 31.8 13.8L26.8 17.3A2.1 2.1 0 0 0 29.2 20.7Z"/><path d="M21.7 12.4L15.2 13.4A2.1 2.1 0 0 0 15.8 17.6L22.3 16.6A2.1 2.1 0 0 0 21.7 12.4ZM14 14L9.5 18.5A2.1 2.1 0 0 0 12.5 21.5L17 17A2.1 2.1 0 0 0 14 14Z"/><path d="M17.5 25.1L25 28.6A2.3 2.3 0 0 0 27 24.4L19.5 20.9A2.3 2.3 0 0 0 17.5 25.1ZM23.7 26.3L22.7 35.8A2.3 2.3 0 0 0 27.3 36.2L28.3 26.7A2.3 2.3 0 0 0 23.7 26.3Z"/><path d="M16.5 21.8L12 29.3A2.3 2.3 0 0 0 16 31.7L20.5 24.2A2.3 2.3 0 0 0 16.5 21.8ZM13.6 28.2L5.6 29.7A2.3 2.3 0 0 0 6.4 34.3L14.4 32.8A2.3 2.3 0 0 0 13.6 28.2Z"/></symbol>',
    stretch:
      '<symbol id="stretch" viewBox="0 0 40 40"><circle cx="20" cy="8.5" r="4.2"/><path d="M16.8 15L16.8 25A3.2 3.2 0 0 0 23.2 25L23.2 15A3.2 3.2 0 0 0 16.8 15Z"/><path d="M18.7 14.8L10.7 2.8A2.1 2.1 0 0 0 7.3 5.2L15.3 17.2A2.1 2.1 0 0 0 18.7 14.8Z"/><path d="M24.7 17.2L32.7 5.2A2.1 2.1 0 0 0 29.3 2.8L21.3 14.8A2.1 2.1 0 0 0 24.7 17.2Z"/><path d="M17.9 22.9L10.9 35.9A2.4 2.4 0 0 0 15.1 38.1L22.1 25.1A2.4 2.4 0 0 0 17.9 22.9Z"/><path d="M17.9 25.1L24.9 38.1A2.4 2.4 0 0 0 29.1 35.9L22.1 22.9A2.4 2.4 0 0 0 17.9 25.1Z"/></symbol>',
    timer:
      '<symbol id="timer" viewBox="0 0 40 40"><path fill-rule="evenodd" d="M20 7a15 15 0 1 1 0 30 15 15 0 0 1 0-30m0 4a11 11 0 1 0 0 22 11 11 0 0 0 0-22"/><path d="M20 22V13.5A8.5 8.5 0 0 1 28.5 22z"/><rect x="16" y="1" width="8" height="4" rx="1.5"/><path d="m31 9 2.5-2.5 3 3L34 12z"/></symbol>',
    pot:
      '<symbol id="pot" viewBox="0 0 40 40"><path d="M5 17h30v12a7 7 0 0 1-7 7H12a7 7 0 0 1-7-7z"/><rect x="1" y="18" width="6" height="4" rx="2"/><rect x="33" y="18" width="6" height="4" rx="2"/><path d="M4 15a16 7 0 0 1 32 0z"/><rect x="17" y="5" width="6" height="4" rx="2"/></symbol>',
  };
  const escape = (value) =>
    String(value).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  function time(value, line) {
    const match = value.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
    if (!match)
      throw new Error(`Line ${line}: use a time like 08:30 or 8:30 AM.`);
    let hour = Number(match[1]),
      minute = Number(match[2] || 0);
    if (minute > 59 || (match[3] ? hour < 1 || hour > 12 : hour > 23))
      throw new Error(`Line ${line}: invalid time “${value}”.`);
    if (match[3]) hour = (hour % 12) + (/pm/i.test(match[3]) ? 12 : 0);
    return hour * 60 + minute;
  }
  // "15:00", "15:00 - 17:00", "3:00 - 5:00 PM" (start borrows the end's
  // meridiem), or "15:00 +2h" / "+90m" / "+1h30". `end` is undefined when
  // the event is a moment rather than a span.
  function timeSpan(value, line) {
    const v = value.trim();
    let m = v.match(/^(.+?)\s*\+\s*(.+)$/);
    if (m) {
      const start = time(m[1], line),
        d = m[2].trim().match(/^(?:(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours))?\s*(?:(\d+)\s*(?:m|min|mins|minutes)?)?$/i),
        bare = m[2].trim().match(/^(\d+(?:\.\d+)?)$/);
      const minutes = bare
        ? Math.round(Number(bare[1]) * 60)
        : d && (d[1] || d[2])
          ? Math.round(Number(d[1] || 0) * 60) + Number(d[2] || 0)
          : NaN;
      if (!minutes || minutes < 0)
        throw new Error(`Line ${line}: use a duration like +2h, +90m or +1h30.`);
      if (start + minutes > 24 * 60)
        throw new Error(`Line ${line}: the event runs past midnight.`);
      return { start, end: start + minutes };
    }
    m = v.match(/^(.+?)\s*[-–]\s*(.+)$/);
    if (m) {
      const endText = m[2].trim(),
        meridiem = endText.match(/(AM|PM)$/i),
        startText = m[1].trim() + (meridiem && !/(AM|PM)$/i.test(m[1].trim()) ? " " + meridiem[1] : "");
      const start = time(startText, line),
        end = time(endText, line);
      if (end <= start)
        throw new Error(`Line ${line}: the end time must be after the start.`);
      return { start, end };
    }
    return { start: time(v, line), end: undefined };
  }
  // Relative clock ("clock: relative"): times are seconds from Start.
  // "5:30" is M:SS, "1:02:03" is H:MM:SS.
  function relOffset(value, line) {
    const m = value.trim().match(/^(\d{1,3}):(\d{2})(?::(\d{2}))?$/);
    if (!m) throw new Error(`Line ${line}: use an elapsed time like 5:30 (M:SS) or 1:02:03 (H:MM:SS).`);
    const [a, b, c] = [Number(m[1]), Number(m[2]), m[3] === undefined ? null : Number(m[3])];
    if (b > 59 || (c !== null && c > 59)) throw new Error(`Line ${line}: invalid elapsed time “${value.trim()}”.`);
    return c === null ? a * 60 + b : a * 3600 + b * 60 + c;
  }
  // "45s", "2m", "1m30s", "1m30", "1h30", "90m", "1.5h" -> seconds. A number
  // without a unit continues the one before it (h -> minutes, m -> seconds).
  function relDuration(text, line) {
    const units = { h: 3600, hr: 3600, hrs: 3600, hour: 3600, hours: 3600, m: 60, min: 60, mins: 60, minute: 60, minutes: 60, s: 1, sec: 1, secs: 1, second: 1, seconds: 1 },
      t = text.trim().toLowerCase(),
      parts = [...t.matchAll(/(\d+(?:\.\d+)?)\s*([a-z]*)/g)],
      fail = () => {
        throw new Error(`Line ${line}: use a duration like +45s, +2m or +1m30s.`);
      };
    if (!parts.length || parts.map((p) => p[0]).join("").replace(/\s+/g, "") !== t.replace(/\s+/g, "")) fail();
    let total = 0,
      last = Infinity;
    for (const [, number, unit] of parts) {
      const size = unit ? units[unit] : last === 3600 ? 60 : last === 60 ? 1 : 0;
      if (!size || size >= last) fail();
      total += Number(number) * size;
      last = size;
    }
    total = Math.round(total);
    if (!(total > 0)) fail();
    return total;
  }
  // "+45s" (a step after the previous line), "0:15 +25m", "0:00 - 15:00",
  // or "5:30" (a moment). `prev` is where a "+duration" step starts.
  function relSpan(value, line, prev) {
    const v = value.trim();
    let m = v.match(/^([^+]*?)\s*\+\s*(.+)$/);
    if (m) {
      const start = m[1] ? relOffset(m[1], line) : prev;
      return { start, end: start + relDuration(m[2], line) };
    }
    m = v.match(/^(.+?)\s*[-–]\s*(.+)$/);
    if (m) {
      const start = relOffset(m[1], line),
        end = relOffset(m[2], line);
      if (end <= start) throw new Error(`Line ${line}: the end time must be after the start.`);
      return { start, end };
    }
    return { start: relOffset(v, line), end: undefined };
  }
  function spanLabel2(start, end) {
    const a = label(start),
      b = label(end);
    return a.slice(-2) === b.slice(-2) ? `${a.slice(0, -3)}–${b}` : `${a}–${b}`;
  }
  function label(minutes, short = false) {
    const h = Math.floor(minutes / 60) % 24,
      m = minutes % 60;
    return `${h % 12 || 12}${short && m === 0 ? "" : ":" + String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
  }
  function safeImage(url, line) {
    if (
      !/^(https?:\/\/\S+|data:image\/(?:png|jpeg|webp|gif|svg\+xml);base64,[a-zA-Z0-9+/=\s]+)$/i.test(
        url,
      )
    )
      throw new Error(
        `Line ${line}: assets need an http(s) image URL or an embedded image.`,
      );
    return url;
  }
  // When an event names no icon, guess one from its words. Explicit icons
  // always win; the order here resolves overlaps ("coffee and pastries" is
  // coffee, "flight lands" is land, "sunset drive" is car).
  const iconRules = [
    ["land", /\b(lands?|landing|arrives?|arrival)\b/],
    ["depart", /\b(departs?|departure|take[- ]?off|boarding|boards?)\b/],
    ["plane", /\b(flights?|fly|flying|airport|airline)\b/],
    ["coffee", /\b(coffee|cafe|café|latte|espresso|cappuccino|tea|bakery|pastr(?:y|ies)|boba|matcha|donuts?)\b/],
    ["meal", /\b(breakfast|brunch|lunch|dinner|supper|meal|food|eat|eating|restaurant|tacos?|pizza|burgers?|sushi|ramen|bbq|barbecue|snacks?|dessert|ice cream|brewery|drinks)\b/],
    ["bed", /\b(hotel|motel|hostel|airbnb|check[- ]?in|check[- ]?out|sleep|nap|bed|bedtime)\b/],
    ["home", /\b(home|house)\b/],
    ["shop", /\b(shop|shopping|market|mall|store|grocer(?:y|ies)|costco|ikea|errands?)\b/],
    ["ticket", /\b(museum|observatory|planetarium|galler(?:y|ies)|concert|show|movie|cinema|theat(?:er|re)|tour|exhibits?|exhibition|zoo|aquarium|game|match|tickets?)\b/],
    ["tree", /\b(park|playground|gardens?|hike|hiking|trail|picnic|botanical|reservoir|lake|forest|woods|camp(?:ing|site)?)\b/],
    ["palm", /\b(beach|boardwalk|pier|surf(?:ing)?|pool|swim(?:ming)?|ocean|coast)\b/],
    ["road", /\b(road ?trip|highway|freeway|scenic|mulholland)\b/],
    ["car", /\b(drive|driving|car|rental|uber|lyft|taxi|parking|gas|pick ?up|drop ?off)\b/],
    // Workout and kitchen steps, after the day words so those still win.
    ["dumbbell", /\b(workout|exercises?|planks?|squats?|lunges?|push[- ]?ups?|pull[- ]?ups?|sit[- ]?ups?|crunch(?:es)?|burpees?|deadlifts?|bench press|curls?|kettlebells?|dumbbells?|weights|strength|hiit|circuit|glute bridges?|dead ?bugs?|hollow (?:holds?|rocks?)|mountain climbers?|reps|core|abs)\b/],
    ["run", /\b(jog|jogs|jogging|running|sprints?|sprinting|jumping jacks?|high knees|butt kicks|skipping|jump rope|warm[- ]?ups?|treadmill|cardio|laps?)\b/],
    ["stretch", /\b(stretch(?:es|ing)?|yoga|cool[- ]?downs?|mobility|poses?|cobra|downward dog|pilates|foam roll(?:er|ing)?|breathe|breathing|meditat(?:e|ion))\b/],
    ["timer", /\b(rest|resting|recover|recovery|break|pause|wait|hold|timer)\b/],
    ["pot", /\b(boil|boiling|simmer|simmering|stew|soup|stir|stirring|saut[eé]e?|fry|frying|pan|pot|cook|cooking|pasta|rice|sauce|reduce)\b/],
    ["meal", /\b(chop|chopping|dice|dicing|slice|slicing|mince|peel|grate|prep|season|seasoning|marinate|mix|whisk|knead|roast|roasting|bake|baking|grill|grilling|broil|preheat|oven|plate|plating|serve|toss|garnish)\b/],
  ];
  // "Gear run @ REI Baldwin Hills": what follows " @ " in a description (or
  // a description that starts with "@") is a place. The sheet shows it as a
  // pin chip that searches the map for it, and the calendar feed makes it
  // the event's location. A URL after the place stays a plain link. An
  // email address ("a@b.com") has no space before the @ and is left alone.
  // A bare "@" at the end ("Manhattan Beach | @") means the title is the
  // place.
  function splitPlace(detail, title) {
    const bare = detail.match(/(?:^|\s)@\s*$/);
    if (bare && title) return { detail: detail.slice(0, bare.index).trim(), place: title.trim() };
    const m = detail.match(/(?:^|\s)@\s*(\S.*)$/);
    if (!m) return { detail, place: "" };
    const rest = m[1],
      at = rest.search(/https?:\/\//),
      place = (at < 0 ? rest : rest.slice(0, at)).trim(),
      tail = at < 0 ? "" : rest.slice(at);
    if (!place) return { detail, place: "" };
    return { detail: [detail.slice(0, m.index).trim(), tail].filter(Boolean).join(" "), place };
  }
  // A map search link needs no API key: Google resolves the text when the
  // link is opened, so "REI Baldwin Hills, Los Angeles" lands on the store.
  function mapSearchUrl(place, city) {
    const query = city && !place.toLowerCase().includes(city.toLowerCase()) ? `${place}, ${city}` : place;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  }
  // Where an event is, for calendars: an explicit link in the description
  // wins, and the address-looking text before it is the place (the studio
  // writes "REI · 1900 Empire Ave · https://maps.app.goo.gl/…"); otherwise
  // an "@ place" is the place and its map search is the link.
  function location(event, day, model) {
    const url = (event.detail.match(/https?:\/\/\S+/) || [])[0] || "";
    let place = event.place || "";
    if (!place && url) {
      const parts = event.detail
          .slice(0, event.detail.indexOf(url))
          .split(/\s+[·|]\s+/)
          .map((p) => p.trim())
          .filter(Boolean),
        addressed = parts.filter((p) => /\d/.test(p));
      place = (addressed.length ? addressed : parts).join(", ");
    }
    return { place, url: url || (place ? mapSearchUrl(place, (day && day.city) || model.city) : "") };
  }
  // An event's description for calendars (feed, CalDAV): the description,
  // then its step notes as "- " lines.
  function describe(event) {
    return [event.detail, ...(event.notes || []).map((note) => "- " + note)].filter(Boolean).join("\n");
  }
  // A picture (an event's 6th field, or `cover:`) is "@asset" or an
  // https:// image URL; this is the URL to show, or "".
  function pictureUrl(model, value) {
    if (!value) return "";
    return value.startsWith("@") ? model.assets[value.slice(1)] || "" : value;
  }
  function checkPicture(value, line) {
    if (value && !value.startsWith("@") && !/^https:\/\/\S+$/i.test(value))
      throw new Error(`Line ${line}: a picture (the 6th field) is @asset-name or an https:// image URL.`);
    return value;
  }
  function guessIcon(title, detail) {
    for (const text of [title, detail]) {
      const words = String(text || "").toLowerCase();
      if (!words) continue;
      for (const [icon, pattern] of iconRules) if (pattern.test(words)) return icon;
    }
    return "pin";
  }

  function parse(text) {
    const model = {
      title: "My Timeline",
      date: "",
      subtitle: "",
      theme: "minimal",
      footer: "",
      link: "",
      linkKey: "",
      timezone: "",
      city: "",
      clock: "day",
      notes: [],
      events: [],
      days: [],
      assets: Object.create(null),
    };
    const singleton = new Set();
    // "clock: relative" changes how every event line reads, wherever it is
    // written, so it is found before the lines are parsed. It is never
    // guessed from the times: "0:30" could be either clock.
    const relative = /^[ \t]*clock:[ \t]*relative[ \t]*$/m.test(text);
    // Where the next "+duration" step starts: the end of the event line
    // before it in the source (its start if it has no end), or 0:00.
    let prevEnd = 0;
    // The event that "- " step notes on the following lines belong to;
    // any other line (blank lines and comments included) ends the run.
    let noteOwner = null;
    // Days: a `day:` line starts a new one. Anything before the first `day:`
    // lands in an implicit day, so a one-day timeline needs no `day:` at all.
    const newDay = (label, line) => {
      const day = { label, line, range: null, events: [], notes: [] };
      model.days.push(day);
      return day;
    };
    const currentDay = (line) => model.days.at(-1) || newDay("", line);
    text.split(/\r?\n/).forEach((raw, index) => {
      const line = index + 1,
        s = raw.trim();
      // Step notes: "- Hips level" lines right under an event line.
      const stepNote = s.match(/^-(?:\s+(.*))?$/);
      if (stepNote) {
        if (!noteOwner) throw new Error(`Line ${line}: step notes go right under a step (a “- ” line directly below an event line).`);
        if (stepNote[1]) noteOwner.notes.push(stepNote[1].trim());
        return;
      }
      noteOwner = null;
      if (!s || s.startsWith("#")) return;
      // Event lines begin with a clock time followed by a pipe. On a
      // relative clock that is an elapsed time or a "+duration".
      if (
        relative
          ? /^(?:\+[^|]*|\d{1,3}:\d{2}(?::\d{2})?\s*(?:[-–]\s*\d{1,3}:\d{2}(?::\d{2})?|\+[^|]*)?)\s*\|/.test(s)
          : /^\d{1,2}(?::\d{2})?\s*(?:AM|PM)?\s*(?:[-–]\s*\d{1,2}(?::\d{2})?\s*(?:AM|PM)?|\+[^|]*)?\s*\|/i.test(s)
      ) {
        const fields = s
          .split(/(?<!\\)\|/)
          .map((v) => v.trim().replace(/\\\|/g, "|"));
        if (fields.length > 6)
          throw new Error(
            `Line ${line}: at most six fields; write \\| for a literal pipe.`,
          );
        const [clock, title, written = "", icon = "", color = "sky", picture = ""] = fields;
        const { detail, place } = splitPlace(written, title);
        if (!title) throw new Error(`Line ${line}: add an event title.`);
        if (!["sky", "sand", "sage"].includes(color || "sky"))
          throw new Error(`Line ${line}: color must be sky, sand, or sage.`);
        let event;
        if (relative) {
          const { start, end } = relSpan(clock, line, prevEnd);
          prevEnd = end ?? start;
          event = { minutes: start / 60, end: end === undefined ? undefined : end / 60, at: start, until: end };
        } else {
          const { start, end } = timeSpan(clock, line);
          event = { minutes: start, end };
        }
        Object.assign(event, {
          title,
          detail,
          place,
          icon: icon || guessIcon(title, written),
          color: color || "sky",
          picture: checkPicture(picture, line),
          line,
          notes: [],
        });
        currentDay(line).events.push(event);
        noteOwner = event;
        return;
      }
      const asset = s.match(/^asset\s+([a-zA-Z][\w-]*):\s*(.+)$/);
      if (asset) {
        if (Object.hasOwn(model.assets, asset[1]))
          throw new Error(`Line ${line}: duplicate asset “${asset[1]}”.`);
        model.assets[asset[1]] = safeImage(asset[2], line);
        return;
      }
      const directive = s.match(/^([a-z-]+):\s*(.*)$/);
      if (!directive)
        throw new Error(
          relative && s.includes("|")
            ? `Line ${line}: on a relative clock a step starts with an elapsed time like 5:30 or a duration like +45s.`
            : `Line ${line}: expected “time | title” or a directive such as “title: My Trip”.`,
        );
      const [, key, value] = directive;
      if (
        ![
          "title",
          "date",
          "subtitle",
          "range",
          "theme",
          "footer",
          "note",
          "day",
          "header-art",
          "link",
          "timezone",
          "city",
          "places",
          "clock",
          "cover",
        ].includes(key)
      )
        throw new Error(`Line ${line}: unknown setting “${key}”.`);
      if (key === "clock") {
        if (!["relative", "day"].includes(value))
          throw new Error(`Line ${line}: use “clock: relative” for a routine timed from Start.`);
        if (singleton.has(key)) throw new Error(`Line ${line}: duplicate setting “${key}”.`);
        singleton.add(key);
        model.clock = value;
        return;
      }
      // A relative clock has no dates, zones or hours of the day: these
      // settings mean nothing there and are ignored without an error.
      if (relative && ["timezone", "city", "range"].includes(key)) return;
      if (key === "link") {
        // "link: la-week" or "link: la-week <key>"; the key is the proof of
        // ownership the link server hands out on the first publish.
        const parts = value.match(/^([a-z0-9][a-z0-9-]{1,30}[a-z0-9])(?:\s+([A-Za-z0-9_-]{16,40}))?$/);
        if (!parts)
          throw new Error(
            `Line ${line}: a link name is 3–32 lowercase letters, digits or hyphens, for example “link: la-week”.`,
          );
        if (singleton.has(key)) throw new Error(`Line ${line}: duplicate setting “${key}”.`);
        singleton.add(key);
        model.link = parts[1];
        model.linkKey = parts[2] || "";
        return;
      }
      if (key === "timezone") {
        // "timezone: America/Los_Angeles" or a short form such as "PT".
        // Before any day it applies to the whole timeline; under a day it
        // applies to that day, for trips that cross zones. Only the
        // calendar feed uses it; the sheet shows the times as written.
        const zone = timezone(value);
        if (!zone)
          throw new Error(
            `Line ${line}: unknown time zone “${value}”. Use a name like America/Los_Angeles, or PT, ET, CET, IST.`,
          );
        const last = model.days.at(-1);
        if (last && last.label) last.timezone = zone;
        else model.timezone = zone;
        return;
      }
      if (key === "city") {
        // "city: Los Angeles" is added to place searches, so "@ REI Baldwin
        // Hills" looks up "REI Baldwin Hills, Los Angeles". Before any day
        // it covers the whole timeline; under a day, that day.
        const last = model.days.at(-1);
        if (last && last.label) last.city = value;
        else model.city = value;
        return;
      }
      if (key === "day") {
        if (!value) throw new Error(`Line ${line}: give the day a date, for example “day: Sun, Sep 20”.`);
        const last = model.days.at(-1);
        // A `range:` or `note:` written just above the first `day:` belongs to it.
        if (last && !last.label && !last.events.length) last.label = value;
        else newDay(value, line);
        return;
      }
      if (key === "note") {
        if (!value) return;
        (model.days.length ? model.days.at(-1).notes : model.notes).push(value);
        return;
      }
      if (key === "range") {
        const day = currentDay(line);
        if (day.range) throw new Error(`Line ${line}: this day already has a range.`);
        const parts = value.split(/\s*[-–]\s*/);
        if (parts.length !== 2)
          throw new Error(`Line ${line}: use “range: 08:00 - 16:00”.`);
        day.range = parts.map((v) => time(v, line));
        if (day.range.some((v) => v % 60))
          throw new Error(
            `Line ${line}: range boundaries must be whole hours.`,
          );
        if (day.range[1] <= day.range[0])
          throw new Error(
            `Line ${line}: end must be later than start. Use a single calendar day.`,
          );
        return;
      }
      if (singleton.has(key))
        throw new Error(`Line ${line}: duplicate setting “${key}”.`);
      singleton.add(key);
      model[key] = value;
    });
    if (!model.days.length)
      throw new Error(relative ? "Add a step, for example: +45s | Plank" : "Add an event, for example: 08:30 | Leave home");
    if (!themeNames.includes(model.theme))
      throw new Error(`Theme must be one of ${themeNames.join(", ")}.`);
    model.days.forEach((day, index) => {
      if (!day.events.length)
        throw new Error(
          day.label
            ? `Line ${day.line}: “day: ${day.label}” has no ${relative ? "steps. Add one, for example: +45s | Plank" : "events. Add one, for example: 09:00 | Breakfast"}`
            : relative
              ? "Add a step, for example: +45s | Plank"
              : "Add an event, for example: 08:30 | Leave home",
        );
      if (relative) {
        // Sections share one clock that starts at 0:00 and never resets: the
        // first section's axis starts at 0:00, a later one at its first step.
        day.events.sort((a, b) => a.at - b.at);
        day.startSec = index ? day.events[0].at : 0;
        day.endSec = Math.max(...day.events.map((e) => e.until ?? e.at));
        if (day.endSec === day.startSec) day.endSec = day.startSec + 60;
        day.start = day.startSec / 60;
        day.end = day.endSec / 60;
        day.iso = "";
      } else {
        day.events.sort((a, b) => a.minutes - b.minutes);
        day.start = day.range?.[0] ?? Math.floor(day.events[0].minutes / 60) * 60;
        day.end =
          day.range?.[1] ??
          Math.ceil(Math.max(...day.events.map((e) => e.end ?? e.minutes)) / 60) * 60;
        if (day.end === day.start) day.end = day.start + 60;
        day.iso = isoDate(day.label || model.date);
      }
      for (const event of day.events) {
        if (!relative && (event.minutes < day.start || (event.end ?? event.minutes) > day.end))
          throw new Error(
            `Line ${event.line}: event is outside the timeline range.`,
          );
        if (event.icon.startsWith("@")) {
          if (!Object.hasOwn(model.assets, event.icon.slice(1)))
            throw new Error(
              `Line ${event.line}: define “asset ${event.icon.slice(1)}: …” first.`,
            );
        } else if (!icons.includes(event.icon))
          throw new Error(
            `Line ${event.line}: unknown icon “${event.icon}”. Use a built-in icon or @asset-name.`,
          );
        if (event.picture.startsWith("@") && !Object.hasOwn(model.assets, event.picture.slice(1)))
          throw new Error(`Line ${event.line}: define “asset ${event.picture.slice(1)}: …” first.`);
      }
    });
    model.events = model.days.flatMap((day) => day.events);
    model.start = model.days[0].start;
    model.end = model.days[0].end;
    // A routine's length in seconds: the end of its last step.
    if (relative) model.total = Math.max(...model.events.map((e) => e.until ?? e.at));
    if (
      model["header-art"] &&
      !Object.hasOwn(model.assets, model["header-art"].replace(/^@/, ""))
    )
      throw new Error(
        "Header art must name an existing asset, for example “header-art: @beach”.",
      );
    // "cover: @asset" or an https URL: a photo above the title.
    if (model.cover && !model.cover.startsWith("@") && !/^https:\/\/\S+$/i.test(model.cover))
      throw new Error("The cover is @asset-name or an https:// image URL, for example “cover: @kitchen”.");
    if (model.cover && model.cover.startsWith("@") && !Object.hasOwn(model.assets, model.cover.slice(1)))
      throw new Error(`The cover names no asset: add “asset ${model.cover.slice(1)}: …”.`);
    return model;
  }
  function layoutRuntime() {
    const timelines = [...document.querySelectorAll(".timeline")];
    let lastWidth = -1;
    let active = true;
    const topPad = 26;
    // Days already over collapse behind one button so the sheet opens at
    // today; "Show earlier days" brings them back and lays them out again
    // (a hidden timeline measures as empty). Nothing collapses when every
    // day is over, or when the days carry no dates. The choice sticks for
    // the page, including across the studio's re-renders.
    function collapsePast(ymd) {
      const days = timelines
        .map((t) => ({ section: t.closest(".day"), date: t.dataset.date }))
        .filter((d) => d.section && d.date);
      const past = days.filter((d) => d.date < ymd),
        future = days.some((d) => d.date >= ymd);
      let button = document.querySelector(".show-past");
      if (!past.length || !future) {
        days.forEach((d) => d.section.classList.remove("past-day"));
        document.body.classList.remove("hide-past");
        button?.remove();
        return;
      }
      days.forEach((d) => d.section.classList.toggle("past-day", d.date < ymd));
      const hide = window.__showPast !== true;
      document.body.classList.toggle("hide-past", hide);
      if (!button) {
        button = document.createElement("button");
        button.type = "button";
        button.className = "show-past";
        button.addEventListener("click", () => {
          window.__showPast = !window.__showPast;
          document.body.classList.toggle("hide-past", !window.__showPast);
          layout();
        });
        days[0].section.before(button);
      }
      button.textContent = hide ? `Show ${past.length} earlier day${past.length === 1 ? "" : "s"}` : "Hide earlier days";
    }
    function layoutOne(timeline) {
      const cards = [...timeline.querySelectorAll(".event")],
        hours = [...timeline.querySelectorAll(".hour")],
        style = getComputedStyle(timeline),
        unit = parseFloat(style.getPropertyValue("--hour-height")),
        axis = parseFloat(style.getPropertyValue("--axis"));
      const heights = cards.map((card) => card.getBoundingClientRect().height);
      const anchors = cards.map(
          (card) => (Number(card.dataset.minute) / 60) * unit,
        ),
        offsets = [0],
        pools = [];
      for (let i = 1; i < cards.length; i++)
        offsets[i] = offsets[i - 1] + (heights[i - 1] + heights[i]) / 2 + 12;
      anchors.forEach((y, i) => {
        pools.push({ sum: y - offsets[i], n: 1, start: i, end: i });
        while (pools.length > 1) {
          const b = pools.at(-1),
            a = pools.at(-2);
          if (a.sum / a.n <= b.sum / b.n) break;
          pools.splice(-2, 2, {
            sum: a.sum + b.sum,
            n: a.n + b.n,
            start: a.start,
            end: b.end,
          });
        }
      });
      const centers = [];
      for (const p of pools)
        for (let i = p.start; i <= p.end; i++)
          centers[i] = p.sum / p.n + offsets[i];
      const shift = Math.max(0, heights[0] / 2 + 12 - centers[0]);
      for (let i = 0; i < centers.length; i++) centers[i] += shift;
      const axisHeight = (Number(timeline.dataset.duration) / 60) * unit;
      hours.forEach(
        (hour) =>
          (hour.style.top = `${topPad + (Number(hour.dataset.minute) / 60) * unit}px`),
      );
      const axisLine = timeline.querySelector(".axis");
      axisLine.style.top = topPad + "px";
      axisLine.style.height = axisHeight + "px";
      // A relative clock labels where each step starts; a label that would
      // sit on a tick or on the label above it is hidden.
      const labels = [...timeline.querySelectorAll(".offset")];
      if (labels.length) {
        const taken = hours.map((hour) => {
          const box = hour.querySelector(".hour-label").getBoundingClientRect();
          return [parseFloat(hour.style.top) - box.height / 2, parseFloat(hour.style.top) + box.height / 2];
        });
        labels.forEach((offset) => {
          const y = topPad + (Number(offset.dataset.minute) / 60) * unit,
            half = offset.getBoundingClientRect().height / 2 + 2,
            covered = taken.some(([a, b]) => y + half > a && y - half < b);
          offset.style.top = y + "px";
          offset.style.visibility = covered ? "hidden" : "";
          if (!covered) taken.push([y - half, y + half]);
        });
      }
      let spans = "",
        connectors = "";
      const barWidth = axis < 100 ? 8 : 12;
      cards.forEach((card, i) => {
        const y = centers[i] + topPad,
          anchor = anchors[i] + topPad,
          x = card.offsetLeft;
        card.style.top = y + "px";
        if (card.dataset.end) {
          const endY = (Number(card.dataset.end) / 60) * unit + topPad;
          spans += `<rect class="span ${[...card.classList].find((c) => ["sky", "sand", "sage"].includes(c)) || ""}" data-i="${i}" x="${axis - barWidth / 2}" y="${anchor}" width="${barWidth}" height="${endY - anchor}" rx="${barWidth / 2}"/>`;
        }
        connectors += `<path class="connector" data-i="${i}" d="M${axis},${anchor} C${axis + 12},${anchor} ${x - 12},${y} ${x},${y}"/><circle class="event-dot" data-i="${i}" cx="${axis}" cy="${anchor}" r="${axis < 100 ? 4 : 6}"/>`;
      });
      connectors = spans + connectors;
      timeline.querySelector(".connectors").innerHTML = connectors;
      timeline.style.height =
        Math.max(
          topPad + axisHeight + 40,
          topPad + centers.at(-1) + heights.at(-1) / 2 + 36,
        ) + "px";
    }
    function layout() {
      if (!active) return;
      timelines.forEach(layoutOne);
      tick();
    }
    // Live "now" state. A day before today is entirely past; on today's own
    // day, past cards fade, a slowly blinking marker sits at the current
    // minute, and the next card says how long until it. Later days and
    // undated timelines are left alone.
    // A relative clock (a routine) has no date: it is live while a run is,
    // with "now" at the run's elapsed time (window.__timelineRun, set by the
    // run runtime or, in the studio's preview, sent in by the studio).
    function tickOne(timeline, ymd, minutesNow) {
      const cards = [...timeline.querySelectorAll(".event")],
        relative = timeline.dataset.clock === "relative",
        run = relative && window.__timelineRun && window.__timelineRun.active ? window.__timelineRun : null,
        date = timeline.dataset.date,
        isToday = relative ? !!run : !!date && date === ymd,
        isOver = !relative && !!date && date < ymd,
        now = (relative ? (run ? run.elapsed / 60 : 0) : minutesNow) - Number(timeline.dataset.start),
        duration = Number(timeline.dataset.duration),
        connectors = timeline.querySelector(".connectors");
      let next = -1;
      cards.forEach((card, i) => {
        const minute = Number(card.dataset.minute),
          finish = card.dataset.end ? Number(card.dataset.end) : minute,
          past = isOver || (isToday && (relative && card.dataset.end ? finish <= now : finish < now)),
          live = isToday && !past && minute <= now && card.dataset.end && now < finish;
        card.classList.toggle("past", past);
        card.classList.toggle("live", !!live);
        // The live step's notes open while it runs and fold when it ends.
        const notes = relative && card.querySelector(".step-notes");
        if (notes && live && !notes.open && !notes.dataset.auto) {
          notes.dataset.auto = "1";
          notes.open = true;
        } else if (notes && !live && notes.dataset.auto) {
          delete notes.dataset.auto;
          notes.open = false;
        }
        connectors
          .querySelectorAll(`[data-i="${i}"]`)
          .forEach((shape) => shape.classList.toggle("past", past));
        if (isToday && next < 0 && minute >= now) next = i;
      });
      cards.forEach((card, i) => {
        let until = card.querySelector(".until");
        if (i !== next) return until?.remove();
        const wait = Number(card.dataset.minute) - now,
          secs = Math.ceil(wait * 60 - 1e-6),
          text =
            wait <= 0
              ? "now"
              : relative
                ? `in ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`
                : wait < 60
                  ? `in ${wait} min`
                  : `in ${Math.floor(wait / 60)} h${wait % 60 ? ` ${wait % 60} min` : ""}`;
        if (!until) {
          until = document.createElement("span");
          until.className = "until";
          card.querySelector(".event-body").append(until);
        }
        until.textContent = text;
      });
      let marker = timeline.querySelector(".now");
      if (!isToday || now < 0 || now > duration) return marker?.remove();
      if (!marker) {
        marker = document.createElement("div");
        marker.className = "now";
        marker.setAttribute("aria-hidden", "true");
        marker.innerHTML = '<span class="now-dot"></span>';
        timeline.append(marker);
      }
      const unit = parseFloat(getComputedStyle(timeline).getPropertyValue("--hour-height"));
      marker.style.top = `${topPad + (now / 60) * unit}px`;
    }
    // Where a dated timeline opens, once per page: on the "now" marker when
    // today is on the sheet and the current minute is inside its hours;
    // otherwise on the next scheduled event (later today, or the first of
    // the next day); and when everything is already over, at the bottom.
    // Undated timelines open at the top.
    // Until the page has fully loaded, every layout settles again: fonts and
    // images shift the cards, and a position taken from the first layout is
    // wrong on a reload.
    function settle(ymd, minutesNow) {
      if (window.__timelineScrolled) return;
      const dated = timelines.filter((t) => t.dataset.date).sort((a, b) => (a.dataset.date < b.dataset.date ? -1 : 1));
      if (!dated.length) return;
      if (document.readyState === "complete") window.__timelineScrolled = true;
      // The marker (or the next card) sits one hour of the scale below the
      // top of the screen, so the last hour stays in view as context.
      let target = null,
        timeline = null;
      for (const t of dated) {
        const marker = t.querySelector(".now");
        if (marker) {
          target = marker;
          timeline = t;
          break;
        }
      }
      if (!target)
        for (const t of dated) {
          const date = t.dataset.date,
            now = minutesNow - Number(t.dataset.start);
          if (date < ymd) continue;
          target = [...t.querySelectorAll(".event")].find(
            (card) => date > ymd || Number(card.dataset.minute) >= now,
          );
          if (target) {
            timeline = t;
            break;
          }
        }
      if (!target) return window.scrollTo(0, document.documentElement.scrollHeight);
      const hour = parseFloat(getComputedStyle(timeline).getPropertyValue("--hour-height")) || 120;
      const y = target.getBoundingClientRect().top + window.scrollY - hour - 12;
      if (y > 0) window.scrollTo(0, y);
    }
    function tick() {
      if (!active) return;
      const today = new Date(),
        pad = (n) => String(n).padStart(2, "0"),
        ymd = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`,
        minutesNow = today.getHours() * 60 + today.getMinutes();
      collapsePast(ymd);
      timelines.forEach((timeline) => tickOne(timeline, ymd, minutesNow));
      settle(ymd, minutesNow);
      followRun();
    }
    // During a run, keep the current step in view: scroll once each time
    // it changes, so the page can still be scrolled by hand in between.
    // `inset` is the height of a panel pinned over the top of the page.
    function followRun() {
      const run = window.__timelineRun;
      if (!run || !run.active) {
        window.__timelineRunShown = null;
        return;
      }
      const cards = [...document.querySelectorAll(".timeline.relative .event")],
        card = cards.find((c) => c.classList.contains("live")) || cards.find((c) => !c.classList.contains("past"));
      if (!card || window.__timelineRunShown === card.dataset.line) return;
      window.__timelineRunShown = card.dataset.line;
      const y = card.getBoundingClientRect().top + window.scrollY - (run.inset || 0) - 16;
      window.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
    }
    window.__timelineSetRun = (run) => {
      window.__timelineRun = run;
      tick();
    };
    const timer = setInterval(tick, 30000);
    document.addEventListener("visibilitychange", tick);
    // Opening or folding a card's notes changes its height.
    document.addEventListener("toggle", layout, true);

    const observer = new ResizeObserver((entries) => {
      const width = entries[0].contentRect.width;
      if (width !== lastWidth) {
        lastWidth = width;
        layout();
      }
    });
    // Watch the sheet, not the first timeline: that one may be a collapsed
    // day, and a hidden element reports no width.
    const sheet = timelines[0]?.closest(".sheet") || document.body;
    if (timelines[0]) observer.observe(sheet);
    window.addEventListener("beforeprint", layout);
    window.addEventListener("afterprint", layout);
    window.addEventListener("load", layout);
    document.fonts?.ready.then(layout);
    layout();
    return () => {
      active = false;
      observer.disconnect();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
      document.removeEventListener("toggle", layout, true);
      window.removeEventListener("beforeprint", layout);
      window.removeEventListener("afterprint", layout);
      window.removeEventListener("load", layout);
    };
  }
  function previewRuntime(layout) {
    // In the studio's live preview a tap on a card (or a day heading) asks
    // the editor to open on that source line.
    // A card's "3 notes" hint folds and unfolds its notes instead. A
    // picture opens full screen in the studio (a fixed overlay in here
    // would sit at the top of the frame, which iOS sizes to its content);
    // the title opens the editor on the title line (for a cover photo).
    document.addEventListener("click", (event) => {
      const picture = event.target.closest(".pic");
      if (picture) {
        event.preventDefault();
        parent.postMessage({ type: "timeline:picture", src: picture.getAttribute("href") }, "*");
        return;
      }
      if (event.target.closest("a, summary")) return;
      const target = event.target.closest("[data-line]");
      if (!target) {
        if (event.target.closest(".masthead h1")) parent.postMessage({ type: "timeline:edit", title: true }, "*");
        return;
      }
      event.preventDefault();
      parent.postMessage({ type: "timeline:edit", line: Number(target.dataset.line) }, "*");
    });
    // iOS Safari sizes an iframe to its content, so scrolling inside the
    // preview does nothing there; tell the studio where "now" is instead.
    const scrollTo = window.scrollTo.bind(window);
    // A smooth scroll here is made instant: the studio may replace this
    // page's content (and restore its position) before one would finish.
    // The studio's own panel still scrolls smoothly.
    window.scrollTo = (...args) => {
      const [x, y] = args,
        options = x && typeof x === "object" ? x : null;
      scrollTo(...(options ? [{ ...options, behavior: "instant" }] : args));
      parent.postMessage(
        { type: "timeline:scroll", y: options ? Number(options.top) || 0 : typeof y === "number" ? y : 0, smooth: !!options && options.behavior === "smooth" },
        "*",
      );
    };
    let cleanup = layout();
    window.addEventListener("message", (event) => {
      // A run in the studio: where it is, so the sheet can follow.
      if (event.source === parent && event.data?.type === "timeline:run") {
        window.__timelineSetRun?.(event.data.run || null);
        return;
      }
      if (
        event.source !== parent ||
        event.data?.type !== "timeline:update" ||
        typeof event.data.html !== "string"
      )
        return;
      const next = new DOMParser().parseFromString(
        event.data.html,
        "text/html",
      );
      // Only the fixed layout function runs; incoming rendered scripts stay inert.
      next.querySelectorAll("script").forEach((script) => script.remove());
      // A different document (the studio opened a link): start it afresh,
      // at the top or, for a dated day, at "now", instead of keeping the
      // previous one's scroll position.
      const fresh = event.data.doc !== undefined && event.data.doc !== window.__timelineDoc;
      window.__timelineDoc = event.data.doc;
      const top = fresh ? 0 : window.scrollY;
      cleanup();
      document.head.replaceChildren(...next.head.childNodes);
      document.body.replaceChildren(...next.body.childNodes);
      if (fresh) {
        window.__timelineScrolled = false;
        window.__timelineRunShown = null;
        window.scrollTo(0, 0);
      }
      cleanup = layout();
      // Restore this frame's own position only. On iOS the frame is sized
      // to its content and never scrolls, so top is 0 there; relaying it
      // through the patched scrollTo would send the studio's panel back to
      // the top after every keystroke.
      if (!fresh) scrollTo(0, top);
    });
  }
  // Pictures on a page of its own (view.html, an exported file): a tap on
  // a thumbnail or the cover shows it full screen; a tap anywhere or Escape
  // closes it. Without scripts the picture is a plain link to the image.
  function pictureRuntime() {
    if (window.__timelineStatic) return;
    const close = () => document.querySelector(".pic-view")?.remove();
    document.addEventListener("click", (event) => {
      const picture = event.target.closest(".pic");
      if (!picture) return;
      event.preventDefault();
      close();
      const view = document.createElement("div");
      view.className = "pic-view";
      view.setAttribute("role", "dialog");
      view.setAttribute("aria-label", "Picture");
      view.setAttribute("data-html2canvas-ignore", "");
      const image = document.createElement("img");
      image.src = picture.getAttribute("href");
      image.alt = "";
      view.append(image);
      view.addEventListener("click", (e) => {
        e.stopPropagation();
        close();
      });
      document.body.append(view);
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") close();
    });
  }
  // A time zone as written in the text -> IANA name, or "" if unknown.
  const zoneAliases = {
    pt: "America/Los_Angeles", pst: "America/Los_Angeles", pdt: "America/Los_Angeles", pacific: "America/Los_Angeles",
    mt: "America/Denver", mst: "America/Denver", mdt: "America/Denver", mountain: "America/Denver",
    ct: "America/Chicago", cst: "America/Chicago", cdt: "America/Chicago", central: "America/Chicago",
    et: "America/New_York", est: "America/New_York", edt: "America/New_York", eastern: "America/New_York",
    hst: "Pacific/Honolulu", akst: "America/Anchorage", akdt: "America/Anchorage",
    utc: "UTC", gmt: "Europe/London", bst: "Europe/London", uk: "Europe/London",
    cet: "Europe/Berlin", cest: "Europe/Berlin", eet: "Europe/Athens",
    ist: "Asia/Kolkata", india: "Asia/Kolkata", sgt: "Asia/Singapore", hkt: "Asia/Hong_Kong",
    jst: "Asia/Tokyo", kst: "Asia/Seoul", aest: "Australia/Sydney", aedt: "Australia/Sydney", nzst: "Pacific/Auckland",
  };
  function timezone(text) {
    const value = String(text).trim();
    if (!value) return "";
    const zone = zoneAliases[value.toLowerCase()] || value;
    try {
      return new Intl.DateTimeFormat("en", { timeZone: zone }).resolvedOptions().timeZone;
    } catch (error) {
      return "";
    }
  }
  // Best-effort calendar date from the free-text `date:` line, so the runtime
  // can tell whether the timeline is happening today. "" when unparseable.
  function isoDate(text) {
    const months = "jan feb mar apr may jun jul aug sep oct nov dec".split(" "),
      month = (name) => months.indexOf(name.slice(0, 3).toLowerCase()) + 1,
      pad = (n) => String(n).padStart(2, "0");
    let y, mo, d, m;
    if ((m = text.match(/(\d{4})-(\d{1,2})-(\d{1,2})/))) [y, mo, d] = [m[1], m[2], m[3]];
    else if ((m = text.match(/\b([a-z]{3,})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?/i)) && month(m[1]))
      [mo, d, y] = [month(m[1]), m[2], m[3]];
    else if ((m = text.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3,})\.?(?:,?\s+(\d{4}))?/i)) && month(m[2]))
      [d, mo, y] = [m[1], month(m[2]), m[3]];
    else if ((m = text.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/))) [mo, d, y] = [m[1], m[2], m[3]];
    else return "";
    return `${y || new Date().getFullYear()}-${pad(mo)}-${pad(d)}`;
  }

  // Masthead date for a multi-day timeline without a `date:` line.
  function spanLabel(days) {
    const isos = days.map((day) => day.iso);
    if (isos.some((iso) => !iso)) return "";
    const fmt = (iso, withYear) => {
      const [y, mo, d] = iso.split("-").map(Number),
        month = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ")[mo - 1];
      return `${month} ${d}${withYear ? `, ${y}` : ""}`;
    };
    const first = isos[0],
      last = isos.at(-1);
    return first === last ? fmt(first, true) : `${fmt(first, first.slice(0, 4) !== last.slice(0, 4))} – ${fmt(last, true)}`;
  }
  // Run mode's arithmetic: labels, the run state and where a run is. Self-
  // contained (no outside references) because exported pages carry it as
  // source; the studio and the tests call it directly.
  //
  // Run state: { runId, startedAt, pausedAt (ms or null), pausedMs, shiftMs,
  // updatedAt }. Elapsed is always computed from it, never accumulated, so a
  // suspended tab, a locked phone or a reload resumes at the right second.
  // Skip and Back change only shiftMs; ops are the ones a server applies
  // ({op: "start"|"pause"|"resume"|"seek"|"stop", shiftMs}).
  function runCore() {
    const pad = (n) => String(n).padStart(2, "0");
    // 45 -> "0:45", 330 -> "5:30", 3723 -> "1:02:03"
    const clock = (sec) => {
      const t = Math.max(0, Math.round(sec)),
        h = Math.floor(t / 3600),
        m = Math.floor(t / 60) % 60,
        s = t % 60;
      return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
    };
    // A step's length on its badge: "45s", "2m", "1:30", "1h", "1h 30m".
    const length = (sec) => {
      if (sec < 60) return `${sec}s`;
      if (sec % 60) return clock(sec);
      const min = sec / 60;
      return min < 60 ? `${min}m` : `${Math.floor(min / 60)}h${min % 60 ? ` ${min % 60}m` : ""}`;
    };
    // A routine's length in the masthead: "45 sec", "20 min", "1 h 5 min".
    const total = (sec) => {
      if (sec < 60) return `${sec} sec`;
      const min = Math.floor(sec / 60),
        rest = sec % 60;
      if (min >= 60) return `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ""}`;
      return `${min} min${rest ? ` ${rest} sec` : ""}`;
    };
    // Said aloud: "45 seconds", "2 minutes", "1 minute 30 seconds".
    const spoken = (sec) => {
      const unit = (n, word) => (n ? `${n} ${word}${n === 1 ? "" : "s"}` : "");
      const h = Math.floor(sec / 3600),
        m = Math.floor(sec / 60) % 60,
        s = sec % 60;
      return [unit(h, "hour"), unit(m, "minute"), unit(s, "second")].filter(Boolean).join(" ");
    };
    const elapsedMs = (state, now) =>
      state ? (state.pausedAt ?? now) - state.startedAt - state.pausedMs + state.shiftMs : 0;
    function apply(state, op, now) {
      const at = { updatedAt: now };
      if (op.op === "start")
        return { runId: Math.random().toString(36).slice(2, 10), startedAt: now, pausedAt: null, pausedMs: 0, shiftMs: 0, ...at };
      if (!state || op.op === "stop") return null;
      if (op.op === "pause") return state.pausedAt == null ? { ...state, pausedAt: now, ...at } : state;
      if (op.op === "resume")
        return state.pausedAt == null ? state : { ...state, pausedMs: state.pausedMs + now - state.pausedAt, pausedAt: null, ...at };
      if (op.op === "seek") return { ...state, shiftMs: Math.round(Number(op.shiftMs) || 0), ...at };
      return state;
    }
    // The end of the last step, in seconds.
    const end = (steps) => Math.max(0, ...steps.map((s) => s.until ?? s.at));
    // Where a run is at `e` seconds (steps sorted by start): the steps active
    // now, most recently started first (of two started together, the one
    // ending sooner); the one ending soonest (the countdown
    // follows it); the next step to start; and whether it is over.
    function position(steps, e) {
      const active = steps
          .filter((s) => s.until !== undefined && s.at <= e && e < s.until)
          .sort((a, b) => b.at - a.at || a.until - b.until || a.line - b.line),
        ending = active.reduce((a, b) => (!a || b.until < a.until ? b : a), null),
        next = steps.find((s) => s.at > e) || null,
        started = steps.filter((s) => s.at <= e),
        current = active[0] || started.at(-1) || null;
      return { active, ending, next, current, index: current ? steps.indexOf(current) : -1, done: e >= end(steps) };
    }
    // Skip jumps to the next step's start (or the end); Back to the start of
    // the current step, or the previous step's within 3 s of that start.
    function skipTo(steps, e) {
      const next = steps.find((s) => s.at > e);
      return next ? next.at : end(steps);
    }
    function backTo(steps, e) {
      const { current } = position(steps, e);
      if (!current) return 0;
      if (e - current.at >= 3) return current.at;
      const before = steps.filter((s) => s.at < current.at).at(-1);
      return before ? before.at : 0;
    }
    // The seek op that puts the run at `target` seconds right now.
    const seek = (state, now, target) => ({
      op: "seek",
      shiftMs: state.shiftMs + Math.round(target * 1000 - elapsedMs(state, now)),
    });
    return { clock, length, total, spoken, elapsedMs, apply, end, position, skipTo, backTo, seek };
  }
  // What the run runtime needs from a model: its steps in time order and a
  // key for the run state in localStorage (a hash of the steps, so the same
  // routine resumes in the studio, view.html and an exported copy alike).
  function runConfig(model) {
    const steps = model.events
      .slice()
      .sort((a, b) => a.at - b.at || a.line - b.line)
      .map((e) => ({ line: e.line, at: e.at, until: e.until, title: e.title, detail: e.detail, place: e.place, notes: e.notes, picture: pictureUrl(model, e.picture) }));
    const source = JSON.stringify([model.title, steps.map((s) => [s.at, s.until ?? null, s.title])]);
    let h1 = 0xdeadbeef,
      h2 = 0x41c6ce57;
    for (let i = 0; i < source.length; i++) {
      const c = source.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 2654435761);
      h2 = Math.imul(h2 ^ c, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    const key = (h2 >>> 0).toString(36) + (h1 >>> 0).toString(36);
    return { title: model.title, steps, key };
  }
  // Run mode: the Start button, the focus panel pinned over the sheet, the
  // control bar and the cues. Self-contained like the layout runtime:
  // exported pages carry it as source and call it with their steps; the
  // studio calls it with `host` (its own containers, and a `sheet` callback
  // that forwards the run's position into the preview frame).
  //
  // The run state lives behind a transport: { now(), get(), send(op),
  // subscribe(fn), rekey(from, to) }. The local one keeps it in
  // localStorage under the routine's key, so a reload resumes; a synced
  // transport can take its place (config.transport) without touching the
  // UI.
  function runRuntime(config, makeCore) {
    if (window.__timelineStatic) return null;
    const core = makeCore(),
      doc = document,
      host = config.host || null;
    let steps = config.steps,
      title = config.title,
      key = config.key,
      alive = true;
    const css = `.run-top[hidden],.run-bottom[hidden],.run-start-slot[hidden],.run-panel [hidden],.run-bar [hidden]{display:none!important}
.run-doc.run-top{position:sticky;top:0;z-index:26}
.run-doc.run-bottom{position:fixed;left:0;right:0;bottom:0;z-index:27}
.run-doc.run-start-slot{position:fixed;left:50%;bottom:max(14px,env(safe-area-inset-bottom));transform:translateX(-50%);z-index:27}
body.run-doc-host.run-active{padding-bottom:var(--run-bar-h,0px)}
body.run-active .edit-pill{bottom:calc(var(--run-bar-h,0px) + 10px)!important}
.run-panel,.run-bar,.run-start{font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#e9f1f5;-webkit-font-smoothing:antialiased;letter-spacing:0;text-align:left}
.run-panel{max-height:62vh;max-height:62dvh;overflow:auto;padding:calc(10px + env(safe-area-inset-top)) 16px 12px;background:#11181df5;border-bottom:1px solid #2b3740;box-shadow:0 8px 28px #0005}
.run-inner{max-width:720px;margin:0 auto}
.run-head{display:flex;justify-content:space-between;gap:12px;font-size:13px;font-weight:600;color:#9fb3bf}
.run-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.run-count{flex:none;font-variant-numeric:tabular-nums}
.run-photo{margin:8px 0 0;border-radius:12px;overflow:hidden;background:#0b1013}
.run-photo img{display:block;width:100%;height:min(30vh,280px);height:min(30dvh,280px);object-fit:contain}
.run-next-thumb{flex:none;margin-left:auto;width:44px;height:44px;border-radius:8px;overflow:hidden;background:#0b1013}
.run-next-thumb img{display:block;width:100%;height:100%;object-fit:cover}
.run-step{margin:6px 0 8px;font-size:26px;font-weight:800;line-height:1.1;letter-spacing:-.3px;text-transform:uppercase;overflow-wrap:anywhere}
.run-meter{height:10px;border-radius:999px;background:#26323a;overflow:hidden}
.run-fill{display:block;height:100%;width:0;border-radius:inherit;background:linear-gradient(90deg,#3ecf8e,#8fe3b9);transition:width .25s linear}
.run-paused .run-fill{background:#6f8390}
.run-time{display:flex;align-items:baseline;gap:8px;margin-top:6px}
.run-secs{font-size:44px;font-weight:800;line-height:1;letter-spacing:-1px;font-variant-numeric:tabular-nums}
.run-secs-label{min-width:0;font-size:14px;font-weight:600;color:#9fb3bf;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.run-detail{margin:8px 0 0;font-size:15px;line-height:1.3;color:#cfdde5;overflow-wrap:anywhere}
.run-notes{margin:6px 0 0;padding-left:20px;font-size:15px;line-height:1.35}
.run-notes li{margin:2px 0}
.run-also{list-style:none;margin:8px 0 0;padding:0;font-size:14px;color:#cfdde5}
.run-also li{display:flex;justify-content:space-between;gap:10px;padding:3px 0;border-top:1px dashed #2b3740}
.run-also b{font-variant-numeric:tabular-nums;color:#e9f1f5}
.run-next{display:flex;align-items:center;gap:10px;margin-top:10px;padding-top:8px;border-top:1px solid #2b3740;font-size:14px;color:#9fb3bf}
.run-next-text{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.run-next b{color:#e9f1f5}
.run-done{padding:10px 0 4px;text-align:center}
.run-done-title{font-size:30px;font-weight:800;font-variant-numeric:tabular-nums}
.run-done-actions{display:flex;justify-content:center;gap:10px;margin-top:12px}
.run-bar{padding:8px 12px max(10px,env(safe-area-inset-bottom));background:#11181df5;border-top:1px solid #2b3740;box-shadow:0 -8px 28px #0004}
.run-status{display:flex;align-items:center;justify-content:center;gap:10px;min-height:28px;font-size:13px;color:#9fb3bf;font-variant-numeric:tabular-nums}
.run-controls,.run-confirm{display:flex;align-items:center;justify-content:center;gap:8px;margin-top:6px}
.run-confirm{font-size:15px;font-weight:600}
.run-btn,.run-start,.run-done button,.run-confirm button,.run-chip{appearance:none;-webkit-appearance:none;border:0;margin:0;cursor:pointer;font:inherit;font-weight:700;color:#e9f1f5;background:#24313a;touch-action:manipulation}
.run-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-width:44px;height:44px;padding:0 10px;border-radius:999px;font-size:15px}
.run-btn svg,.run-start svg{width:22px;height:22px;flex:none;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.run-pause,.run-start{background:#3ecf8e;color:#08241a}
.run-pause{min-width:112px}
.run-start{display:inline-flex;align-items:center;gap:8px;height:46px;padding:0 20px;border-radius:999px;font-size:16px;white-space:nowrap;box-shadow:0 6px 22px #0005}
.run-chip{height:28px;padding:0 12px;border-radius:999px;background:#f0b45a;color:#2b1d05;font-size:12px}
.run-done button,.run-confirm button{height:44px;padding:0 18px;border-radius:999px}
.run-restart,.run-stop-yes{background:#3ecf8e!important;color:#08241a!important}
.run-stop-yes{background:#e0674f!important;color:#fff!important}
@media(max-width:420px){.run-step{font-size:22px}.run-secs{font-size:38px}.run-controls{gap:6px}.run-pause{min-width:100px}}`;
    if (!doc.getElementById("run-css")) {
      const style = doc.createElement("style");
      style.id = "run-css";
      style.textContent = css;
      doc.head.append(style);
    }
    const make = (tag, className, parent) => {
      const el = doc.createElement(tag);
      el.className = className;
      el.setAttribute("data-html2canvas-ignore", "");
      if (parent) parent.append(el);
      return el;
    };
    const top = host ? host.top : make("div", "run-top run-doc"),
      bottom = host ? host.bottom : make("div", "run-bottom run-doc"),
      startSlot = host ? host.start : make("div", "run-start-slot run-doc");
    if (!host) {
      doc.body.prepend(top);
      doc.body.append(bottom, startSlot);
      doc.body.classList.add("run-doc-host");
    }
    const icon = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`,
      speaker = '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/>',
      icons = {
        back: icon('<path d="M6 5v14"/><path d="M19 5 9 12l10 7z"/>'),
        skip: icon('<path d="M18 5v14"/><path d="M5 5l10 7-10 7z"/>'),
        pause: icon('<path d="M8 5v14M16 5v14"/>'),
        play: icon('<path d="M7 4.5v15L19.5 12z"/>'),
        stop: icon('<rect x="6" y="6" width="12" height="12" rx="1.5"/>'),
        beep: icon(speaker + '<path d="M15.5 9a4 4 0 0 1 0 6"/>'),
        voice: icon(speaker + '<path d="M15.5 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/>'),
        mute: icon(speaker + '<path d="m16 9.5 5 5M21 9.5l-5 5"/>'),
      };
    top.innerHTML =
      '<section class="run-panel" aria-label="Current step"><div class="run-inner"><div class="run-live"><div class="run-head"><span class="run-name"></span><span class="run-count"></span></div><div class="run-photo" hidden></div><div class="run-step" role="status"></div><div class="run-meter"><span class="run-fill"></span></div><div class="run-time"><b class="run-secs"></b><span class="run-secs-label"></span></div><p class="run-detail" hidden></p><ul class="run-notes" hidden></ul><ul class="run-also" hidden></ul><div class="run-next"><span class="run-next-text"></span><span class="run-next-thumb" hidden></span></div></div><div class="run-done" hidden><div class="run-done-title"></div><div class="run-done-actions"><button type="button" class="run-restart">Restart</button><button type="button" class="run-close">Close</button></div></div></div></section>';
    bottom.innerHTML = `<div class="run-bar"><div class="run-inner"><div class="run-status"><span class="run-elapsed"></span><button type="button" class="run-chip" hidden>Tap for sound</button></div><div class="run-controls"><button type="button" class="run-btn run-back" aria-label="Back" title="Back to the start of this step (or the previous one)">${icons.back}</button><button type="button" class="run-btn run-pause"></button><button type="button" class="run-btn run-skip" aria-label="Skip" title="Skip to the next step">${icons.skip}</button><button type="button" class="run-btn run-sound"></button><button type="button" class="run-btn run-stop" aria-label="Stop" title="Stop the run">${icons.stop}</button></div><div class="run-confirm" hidden><span>End this run?</span><button type="button" class="run-stop-yes">Stop</button><button type="button" class="run-stop-no">Keep going</button></div></div></div>`;
    startSlot.innerHTML = `<button type="button" class="run-start">${icons.play}<span></span></button>`;
    [top, bottom, startSlot].forEach((el) => el.setAttribute("data-html2canvas-ignore", ""));
    const $ = (root, selector) => root.querySelector(selector),
      ui = {
        live: $(top, ".run-live"),
        name: $(top, ".run-name"),
        count: $(top, ".run-count"),
        step: $(top, ".run-step"),
        fill: $(top, ".run-fill"),
        secs: $(top, ".run-secs"),
        secsLabel: $(top, ".run-secs-label"),
        detail: $(top, ".run-detail"),
        notes: $(top, ".run-notes"),
        also: $(top, ".run-also"),
        next: $(top, ".run-next-text"),
        photo: $(top, ".run-photo"),
        nextThumb: $(top, ".run-next-thumb"),
        done: $(top, ".run-done"),
        doneTitle: $(top, ".run-done-title"),
        elapsed: $(bottom, ".run-elapsed"),
        chip: $(bottom, ".run-chip"),
        controls: $(bottom, ".run-controls"),
        confirm: $(bottom, ".run-confirm"),
        pause: $(bottom, ".run-pause"),
        sound: $(bottom, ".run-sound"),
        start: $(startSlot, ".run-start"),
      };

    // The run state, locally: localStorage under the routine's key.
    const storeKey = (k) => "timeline-run:" + k,
      read = (k) => {
        try {
          const value = JSON.parse(localStorage.getItem(storeKey(k)) || "null");
          return value && typeof value.startedAt === "number" ? value : null;
        } catch (error) {
          return null;
        }
      },
      write = (k, value) => {
        try {
          if (value) localStorage.setItem(storeKey(k), JSON.stringify(value));
          else localStorage.removeItem(storeKey(k));
        } catch (error) {
          /* private mode or a sandboxed frame: the run still works, unsaved */
        }
      };
    function localTransport() {
      let state = read(key),
        listener = null;
      const onStorage = (event) => {
        if (event.key !== storeKey(key)) return;
        state = read(key);
        listener && listener(state);
      };
      window.addEventListener("storage", onStorage);
      return {
        now: () => Date.now(),
        get: () => state,
        send(op) {
          state = core.apply(state, op, Date.now());
          write(key, state);
          listener && listener(state);
        },
        subscribe(fn) {
          listener = fn;
        },
        // The steps changed (an edit during a run): the run keeps going
        // under the new text's key.
        rekey(from, to) {
          if (from === to) return;
          write(from, null);
          if (state) write(to, state);
          else state = read(to);
        },
        close() {
          window.removeEventListener("storage", onStorage);
        },
      };
    }
    const transport = config.transport || localTransport();

    // Sound: beeps, beeps + voice, or off; remembered per device.
    const sounds = ["beep", "voice", "mute"],
      soundNames = { beep: "beeps", voice: "beeps + voice", mute: "off" };
    let sound = "beep";
    try {
      const saved = localStorage.getItem("timeline:sound");
      if (sounds.includes(saved)) sound = saved;
    } catch (error) {}
    let audio = null;
    // Audio has to be unlocked by a tap (iOS): Start, Resume, Restart, the
    // sound button and the "Tap for sound" chip all do it.
    function unlock() {
      try {
        const Context = window.AudioContext || window.webkitAudioContext;
        if (Context && !audio) {
          audio = new Context();
          audio.onstatechange = () => render();
        }
        if (audio) {
          if (audio.state !== "running") audio.resume().catch(() => {});
          const buffer = audio.createBuffer(1, 1, 22050),
            source = audio.createBufferSource();
          source.buffer = buffer;
          source.connect(audio.destination);
          source.start(0);
        }
      } catch (error) {}
      if (sound === "voice" && window.speechSynthesis)
        try {
          window.speechSynthesis.speak(new SpeechSynthesisUtterance(""));
        } catch (error) {}
    }
    function tone(frequency, seconds) {
      if (sound === "mute" || !audio || audio.state !== "running") return;
      try {
        const t = audio.currentTime,
          osc = audio.createOscillator(),
          gain = audio.createGain();
        osc.type = "sine";
        osc.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.35, t + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
        osc.connect(gain);
        gain.connect(audio.destination);
        osc.start(t);
        osc.stop(t + seconds + 0.05);
      } catch (error) {}
    }
    function say(text) {
      if (sound !== "voice" || !window.speechSynthesis || !text) return;
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.05;
        window.speechSynthesis.speak(utterance);
      } catch (error) {}
    }
    function buzz(pattern) {
      try {
        if (navigator.vibrate) navigator.vibrate(pattern);
      } catch (error) {}
    }
    // "Side plank L" is said "Side plank left, 45 seconds".
    const spokenStep = (step) =>
      step.title.replace(/\s+L$/, " left").replace(/\s+R$/, " right") +
      (step.until !== undefined ? ", " + core.spoken(step.until - step.at) : "");

    // Keep the screen on while running; the browser drops the lock when
    // the page is hidden, so it is asked for again on the way back.
    let lock = null,
      locking = false,
      wanted = false;
    function wake(on) {
      wanted = on;
      if (on && !lock && !locking && !doc.hidden && navigator.wakeLock) {
        locking = true;
        navigator.wakeLock
          .request("screen")
          .then((sentinel) => {
            locking = false;
            lock = sentinel;
            sentinel.addEventListener("release", () => {
              if (lock === sentinel) lock = null;
            });
            if (!wanted) wake(false);
          })
          .catch(() => {
            locking = false;
          });
      } else if (!on && lock) {
        const held = lock;
        lock = null;
        held.release().catch(() => {});
      }
    }

    let sheetOn = false;
    const sheet = (info) => {
      if (!info.active && !sheetOn) return;
      sheetOn = info.active;
      if (host) host.sheet(info);
      else if (window.__timelineSetRun) window.__timelineSetRun(info);
    };
    let done = null, // { wall } from the end of the last step until Restart or Close
      lastKey = null,
      lastCount = null,
      announce = false,
      confirming = false,
      note = "",
      noteUntil = 0;
    const setText = (el, text) => {
      if (el.textContent !== text) el.textContent = text;
    };
    const setList = (el, items) => {
      const html = items.join("");
      if (el.innerHTML !== html) el.innerHTML = html;
      el.hidden = !items.length;
    };
    const setPicture = (el, url) => {
      url = url || "";
      if (el.dataset.src !== url) {
        el.dataset.src = url;
        el.textContent = "";
        if (url) {
          const image = doc.createElement("img");
          image.alt = "";
          image.src = url;
          el.append(image);
        }
      }
      el.hidden = !url;
    };
    const esc = (text) =>
      String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
    function show(mode) {
      top.hidden = mode === "idle";
      bottom.hidden = mode !== "run";
      startSlot.hidden = mode !== "idle";
      ui.live.hidden = mode !== "run";
      ui.done.hidden = mode !== "done";
      doc.body.classList.toggle("run-active", mode === "run");
      if (mode === "run") doc.documentElement.style.setProperty("--run-bar-h", bottom.offsetHeight + "px");
    }
    function render() {
      if (!alive) return;
      const state = transport.get(),
        now = transport.now(),
        total = core.end(steps);
      setText(ui.start.lastChild, `Start · ${core.total(total)}`);
      if (state) {
        const e = core.elapsedMs(state, now) / 1000;
        if (e >= total) {
          // Finished. Heard live when this page saw the run going.
          if (lastKey !== null && state.pausedAt == null && !doc.hidden) {
            tone(660, 0.8);
            buzz([200, 100, 200]);
            say("Done");
          }
          done = { wall: Math.max(0, total * 1000 + state.pausedMs - state.shiftMs) };
          lastKey = lastCount = null;
          transport.send({ op: "stop" });
          return;
        }
        return running(state, e, total);
      }
      lastKey = lastCount = null;
      confirming = false;
      wake(false);
      sheet({ active: false });
      if (done) {
        setText(ui.doneTitle, `Done · ${core.clock(done.wall / 1000)}`);
        return show("done");
      }
      show("idle");
    }
    function running(state, e, total) {
      const paused = state.pausedAt != null,
        pos = core.position(steps, e),
        primary = pos.active[0] || null,
        ending = pos.ending,
        next = pos.next;
      show("run");
      top.classList.toggle("run-paused", paused);
      setText(ui.name, title);
      setText(ui.count, pos.index >= 0 ? `step ${pos.index + 1} of ${steps.length}` : `${steps.length} steps`);
      // The countdown follows the active step that ends soonest; between
      // steps it counts down to the next one.
      const target = ending ? ending.until : next ? next.at : total,
        from = ending
          ? ending.at
          : Math.max(0, ...steps.filter((s) => (s.until ?? s.at) <= e).map((s) => s.until ?? s.at)),
        left = Math.max(0, target - e);
      setText(ui.step, primary ? primary.title : next ? "Get ready" : "");
      ui.fill.style.width = `${Math.min(100, Math.max(0, ((e - from) / Math.max(0.001, target - from)) * 100)).toFixed(2)}%`;
      setText(ui.secs, core.clock(Math.ceil(left - 1e-6)));
      setText(
        ui.secsLabel,
        paused ? "paused" : ending ? (ending === primary ? "left" : `left · ${ending.title}`) : next ? `until ${next.title}` : "left",
      );
      const detail = primary ? [primary.detail, primary.place && `@ ${primary.place}`].filter(Boolean).join(" ") : "";
      setText(ui.detail, detail);
      ui.detail.hidden = !detail;
      // The live step's picture, large; the next step's as a thumbnail.
      setPicture(ui.photo, primary && primary.picture);
      setPicture(ui.nextThumb, next && next.picture);
      setList(ui.notes, primary ? primary.notes.map((n) => `<li>${esc(n)}</li>`) : []);
      setList(
        ui.also,
        pos.active.slice(1).map((s) => `<li><span>${esc(s.title)}</span><b>${core.clock(Math.ceil(s.until - e - 1e-6))} left</b></li>`),
      );
      const nextLength = next ? (next.until !== undefined ? core.clock(next.until - next.at) : `at ${core.clock(next.at)}`) : "";
      if (ui.next.dataset.value !== (next ? next.title + nextLength : "")) {
        ui.next.dataset.value = next ? next.title + nextLength : "";
        ui.next.innerHTML = next ? `next ▸ <b>${esc(next.title)}</b> · ${nextLength}` : "last step";
      }
      setText(
        ui.elapsed,
        Date.now() < noteUntil ? note : `elapsed ${core.clock(Math.floor(e))} · left ${core.clock(Math.ceil(total - e - 1e-6))}${paused ? " · paused" : ""}`,
      );
      const pauseHtml = paused ? `${icons.play}<span>Resume</span>` : `${icons.pause}<span>Pause</span>`;
      if (ui.pause.dataset.paused !== String(paused)) {
        ui.pause.dataset.paused = String(paused);
        ui.pause.innerHTML = pauseHtml;
        ui.pause.setAttribute("aria-label", paused ? "Resume" : "Pause");
      }
      if (ui.sound.dataset.sound !== sound) {
        ui.sound.dataset.sound = sound;
        ui.sound.innerHTML = icons[sound];
        ui.sound.setAttribute("aria-label", `Sound: ${soundNames[sound]}`);
        ui.sound.title = `Sound: ${soundNames[sound]} (tap to change)`;
      }
      ui.controls.hidden = confirming;
      ui.confirm.hidden = !confirming;
      ui.chip.hidden = paused || sound === "mute" || !!(audio && audio.state === "running");
      // Cues, only while running and in view: a long beep (and the step's
      // name, with voice on) whenever a step starts, short beeps at 3, 2, 1.
      const latest = steps.filter((s) => s.at <= e).at(-1),
        cueKey = latest ? steps.indexOf(latest) : -1,
        count = Math.ceil(left - 1e-6),
        cue = !paused && !doc.hidden;
      if (cue && cueKey >= 0 && (announce || (lastKey !== null && cueKey !== lastKey))) {
        tone(660, 0.45);
        buzz(200);
        say(spokenStep(latest));
      } else if (cue && lastCount === count + 1 && count >= 1 && count <= 3) {
        tone(880, 0.14);
        buzz(60);
      }
      announce = false;
      lastKey = cueKey;
      lastCount = count;
      wake(!paused);
      sheet({ active: true, elapsed: e, running: !paused, inset: host ? 0 : top.getBoundingClientRect().height });
    }
    const act = (op) => {
      const state = transport.get();
      if (op === "start") {
        done = null;
        announce = true;
        return transport.send({ op: "start" });
      }
      if (!state) return;
      const e = core.elapsedMs(state, transport.now()) / 1000;
      if (op === "toggle") transport.send({ op: state.pausedAt == null ? "pause" : "resume" });
      else if (op === "skip") transport.send(core.seek(state, transport.now(), core.skipTo(steps, e)));
      else if (op === "back") transport.send(core.seek(state, transport.now(), core.backTo(steps, e)));
      else if (op === "stop") {
        confirming = false;
        transport.send({ op: "stop" });
      }
    };
    const on = (el, fn) =>
      el.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        fn();
      });
    on(ui.start, () => {
      unlock();
      act("start");
    });
    on(ui.pause, () => {
      unlock();
      act("toggle");
    });
    on($(bottom, ".run-skip"), () => act("skip"));
    on($(bottom, ".run-back"), () => act("back"));
    on($(bottom, ".run-stop"), () => {
      confirming = true;
      render();
    });
    on($(bottom, ".run-stop-yes"), () => act("stop"));
    on($(bottom, ".run-stop-no"), () => {
      confirming = false;
      render();
    });
    on(ui.sound, () => {
      sound = sounds[(sounds.indexOf(sound) + 1) % sounds.length];
      try {
        localStorage.setItem("timeline:sound", sound);
      } catch (error) {}
      unlock();
      note = `sound: ${soundNames[sound]}`;
      noteUntil = Date.now() + 1800;
      if (sound === "voice") say("Voice on");
      render();
    });
    on(ui.chip, () => {
      unlock();
      render();
    });
    on($(top, ".run-restart"), () => {
      unlock();
      act("start");
    });
    on($(top, ".run-close"), () => {
      done = null;
      render();
    });
    transport.subscribe(() => render());
    const timer = setInterval(render, 250);
    doc.addEventListener("visibilitychange", render);
    render();
    return {
      // New text: the steps come from it at once, elapsed time is kept.
      update(next) {
        steps = next.steps;
        title = next.title;
        if (next.key !== key) {
          if (transport.rekey) transport.rekey(key, next.key);
          key = next.key;
        }
        render();
      },
      state: () => transport.get(),
      destroy() {
        alive = false;
        clearInterval(timer);
        doc.removeEventListener("visibilitychange", render);
        if (transport.close) transport.close();
        wake(false);
        sheet({ active: false });
        doc.body.classList.remove("run-active");
        if (host) [top, bottom, startSlot].forEach((el) => ((el.innerHTML = ""), (el.hidden = true)));
        else [top, bottom, startSlot].forEach((el) => el.remove());
      },
    };
  }
  function render(text, { live = false } = {}) {
    const m = typeof text === "string" ? parse(text) : text;
    const rel = m.clock === "relative",
      core = runCore();
    // A relative timeline carries run mode, except in the studio's preview,
    // where the studio itself runs it (audio, wake lock and vibration need
    // the top-level page) and sends the sheet its position.
    // Pictures: a step's 6th field and the cover, resolved to URLs.
    const cover = pictureUrl(m, m.cover),
      pictured = !!cover || m.events.some((e) => e.picture);
    const runtime = live
      ? `(${previewRuntime.toString()})(${layoutRuntime.toString()});`
      : `(${layoutRuntime.toString()})();` +
        (pictured ? `\n(${pictureRuntime.toString()})();` : "") +
        (rel ? `\n(${runRuntime.toString()})(${JSON.stringify(runConfig(m)).replace(/</g, "\\u003c")}, ${runCore.toString()});` : "");
    // URLs in a description or note become links. Map links (Google or
    // Apple Maps, including the short goo.gl form) render as a small pin
    // chip so the address text stays readable; other links show their host.
    const isMapUrl = (url) =>
      /^https?:\/\/(?:maps\.app\.goo\.gl|goo\.gl\/maps|maps\.google\.[a-z.]+|(?:www\.)?google\.[a-z.]+\/maps|maps\.apple\.com)/i.test(url);
    const linkify = (text) =>
      String(text)
        .split(/(https?:\/\/[^\s<>|]+)/)
        .map((part, i) => {
          if (i % 2 === 0) return escape(part);
          const url = part.replace(/[.,;:!?)]+$/, ""),
            trail = part.slice(url.length);
          if (isMapUrl(url))
            return `<a class="map-link" href="${escape(url)}" target="_blank" rel="noopener"><svg viewBox="0 0 40 40" aria-hidden="true"><use href="#pin"/></svg>Map</a>${escape(trail)}`;
          let host = url;
          try {
            host = new URL(url).hostname.replace(/^www\./, "");
          } catch (error) {
            /* keep the raw text */
          }
          return `<a href="${escape(url)}" target="_blank" rel="noopener">${escape(host)}</a>${escape(trail)}`;
        })
        .join("");
    const notesHtml = (notes) =>
      notes.length
        ? `<aside class="notes"><div class="notes-heading">Helpful Notes</div><ul>${notes.map((note) => `<li><span class="check" aria-hidden="true">✓</span><span>${linkify(note)}</span></li>`).join("")}</ul></aside>`
        : "";
    // Step notes fold under their card as "3 notes ▾"; run mode opens the
    // live step's. A <details> needs no script, so exports keep it.
    const stepNotes = (e) =>
      e.notes && e.notes.length
        ? `<details class="step-notes"><summary>${e.notes.length} note${e.notes.length === 1 ? "" : "s"}</summary><ul>${e.notes.map((note) => `<li>${linkify(note)}</li>`).join("")}</ul></details>`
        : "";
    // A picture is a link to the image (so it opens without scripts too);
    // the page's script shows it full screen instead.
    const picture = (url, className, label) =>
      `<a class="pic ${className}" href="${escape(url)}" target="_blank" rel="noopener" aria-label="${escape(label)}"><img src="${escape(url)}" alt=""></a>`;
    const cardBody = (e, day) =>
      `<div class="event-body${e.picture ? " has-pic" : ""}"><span class="event-icon" aria-hidden="true">${e.icon.startsWith("@") ? `<img src="${escape(m.assets[e.icon.slice(1)])}" alt="">` : `<svg viewBox="0 0 40 40"><use href="#${e.icon}"/></svg>`}</span><h2>${escape(e.title)}</h2>${e.detail || e.place ? `<p>${[e.detail ? linkify(e.detail) : "", e.place ? `<a class="map-link" href="${escape(mapSearchUrl(e.place, day.city || m.city))}" target="_blank" rel="noopener" title="${escape(e.place)}"><svg viewBox="0 0 40 40" aria-hidden="true"><use href="#pin"/></svg><span class="map-name">${escape(e.place)}</span></a>` : ""].filter(Boolean).join(" ")}</p>` : ""}${stepNotes(e)}${e.picture ? picture(pictureUrl(m, e.picture), "thumb", `Photo: ${e.title}`) : ""}</div></li>`;
    // A relative clock is scaled so the whole routine has a readable height
    // (about one card per step); ticks every 1, 5, 10 or 30 min by length.
    const totalMin = rel ? Math.max(m.total, 1) / 60 : 0,
      tickMin = totalMin <= 12 ? 1 : totalMin <= 50 ? 5 : totalMin <= 120 ? 10 : 30,
      perMinute = rel ? Math.max(60 / tickMin, Math.min(200, (m.events.length * 90) / totalMin)) : 0;
    const relativeDay = (day, heading) => {
      const s0 = day.startSec,
        s1 = day.endSec,
        step = tickMin * 60,
        marks = [s0];
      for (let t = Math.ceil(s0 / step) * step; t < s1; t += step)
        if (t - s0 >= step / 2 && s1 - t >= step / 2) marks.push(t);
      marks.push(s1);
      const min = (sec) => (sec - s0) / 60;
      const hours = marks
        .map(
          (t) =>
            `<div class="hour" data-minute="${min(t)}" style="--i:${min(t) / 60}"><span class="hour-label">${core.clock(t)}</span><span class="hour-dot"></span></div>`,
        )
        .join("");
      // Where each step starts, as a small label on the axis.
      const offsets = [...new Set(day.events.map((e) => e.at))]
        .map((t) => `<span class="offset" data-minute="${min(t)}" style="--m:${min(t)}">${core.clock(t)}</span>`)
        .join("");
      const events = day.events
        .map(
          (e) =>
            `<li class="event ${e.color}" data-line="${e.line}" data-minute="${min(e.at)}"${e.until !== undefined ? ` data-end="${min(e.until)}"` : ""} style="--m:${min(e.at)}"><time>${e.until !== undefined ? core.length(e.until - e.at) : core.clock(e.at)}</time>${cardBody(e, day)}`,
        )
        .join("");
      return `<section class="day">${heading}<section class="timeline relative" data-clock="relative" data-duration="${min(s1)}" data-start="${s0 / 60}" data-date="" style="--hour-height:${perMinute * 60}px" aria-label="Timeline. Dots show when each step starts; cards are spaced for readability."><div class="axis" aria-hidden="true"></div><div class="hours" aria-hidden="true">${hours}</div><div class="offsets" aria-hidden="true">${offsets}</div><svg class="connectors" aria-hidden="true"></svg><ol class="events">${events}</ol></section>${notesHtml(day.notes)}</section>`;
    };
    const days = m.days
      .map((day, index) => {
        const heading =
          m.days.length > 1
            ? `<div class="day-heading" role="heading" aria-level="2"${day.label ? ` data-line="${day.line}"` : ""}>${escape(day.label || day.iso || `${rel ? "Part" : "Day"} ${index + 1}`)}</div>`
            : "";
        if (rel) return relativeDay(day, heading);
        const hours = Array.from(
          { length: (day.end - day.start) / 60 + 1 },
          (_, i) =>
            `<div class="hour" data-minute="${i * 60}" style="--i:${i}"><span class="hour-label">${label(day.start + i * 60, true)}</span><span class="hour-dot"></span></div>`,
        ).join("");
        const events = day.events
          .map(
            (e) =>
              `<li class="event ${e.color}" data-line="${e.line}" data-minute="${e.minutes - day.start}"${e.end ? ` data-end="${e.end - day.start}"` : ""} style="--m:${e.minutes - day.start}"><time${e.end ? ' class="span"' : ""}>${e.end ? spanLabel2(e.minutes, e.end) : label(e.minutes)}</time>${cardBody(e, day)}`,
          )
          .join("");
        return `<section class="day">${heading}<section class="timeline" data-duration="${day.end - day.start}" data-start="${day.start}" data-date="${day.iso}" aria-label="Timeline. Dots show exact times; cards are spaced for readability."><div class="axis" aria-hidden="true"></div><div class="hours" aria-hidden="true">${hours}</div><svg class="connectors" aria-hidden="true"></svg><ol class="events">${events}</ol></section>${notesHtml(day.notes)}</section>`;
      })
      .join("");
    // A routine's masthead gives its length and step count, not a date.
    const date = rel
      ? `${core.total(m.total)} · ${m.events.length} step${m.events.length === 1 ? "" : "s"}`
      : m.date || (m.days.length > 1 ? spanLabel(m.days) : m.days[0].label);
    const decorations = m["header-art"]
      ? `<img class="la-art custom-art" alt="" src="${escape(m.assets[m["header-art"].replace(/^@/, "")])}">`
      : m.theme === "travel"
        ? art.flight + art.city
        : "";
    const extraCss = `html,body{touch-action:manipulation;} body.hide-past .day.past-day{display:none;} .show-past{display:block;margin:6px auto 4px;padding:8px 18px;border:1px solid var(--blue);border-radius:999px;background:transparent;color:var(--blue);font:inherit;font-size:13px;font-weight:700;letter-spacing:.3px;cursor:pointer;} @media print{.show-past{display:none;} body.hide-past .day.past-day{display:block;}} .event p a,.notes a{color:inherit;text-decoration:underline;text-decoration-color:#8fb4c8;text-underline-offset:2px;} .map-link{display:inline-flex;align-items:center;gap:4px;vertical-align:middle;margin:0 2px;padding:2px 9px 2px 6px;border-radius:999px;background:var(--blue);color:#fff!important;font-size:.72em;font-weight:700;letter-spacing:.3px;text-decoration:none!important;line-height:1.5;} .map-link svg{width:.95em;height:.95em;flex:none;fill:currentColor;} .map-link{max-width:100%;} .map-name{display:block;max-width:22ch;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;} @media(max-width:580px){.map-name{max-width:18ch;}} .event{z-index:1;} .span{opacity:.45;} .span.sky{fill:#8fd0f0;} .span.sand{fill:#f2c37a;} .span.sage{fill:#9ec9a8;} .span.past{opacity:.2;} .event time.span{font-size:.72em;line-height:1.15;letter-spacing:0;white-space:normal;} @media(max-width:580px){.event time.span{font-size:12px;white-space:nowrap;}} .event.live .event-body{box-shadow:0 0 0 2px #e2573f66;} body.live .event,body.live .day-heading{cursor:pointer;} body.live .event:hover .event-body{outline:2px solid #8fc7dd88;outline-offset:2px;} .now{position:absolute;left:var(--axis);right:0;height:0;border-top:2px solid #e2573f;z-index:0;pointer-events:none;animation:now-blink 2.6s ease-in-out infinite;} .now-dot{position:absolute;left:0;top:-1px;width:14px;height:14px;border-radius:50%;background:#e2573f;transform:translate(-50%,-50%);box-shadow:0 0 0 4px #e2573f33;} @keyframes now-blink{0%,100%{opacity:1}50%{opacity:.3}} .event.past{opacity:.42;} .connector.past,.event-dot.past{opacity:.35;} .until{position:absolute;right:10px;top:6px;font-size:12px;font-weight:600;letter-spacing:.3px;color:var(--blue);opacity:.75;white-space:nowrap;} @media(max-width:580px){.until{right:8px;top:5px;font-size:11px;}} @media print{.now{display:none;}.event.past,.connector.past,.event-dot.past{opacity:1;}} .event{top:calc(var(--m) / 60 * var(--hour-height));} .masthead{height:auto;min-height:180px;padding-bottom:38px;}h1{overflow-wrap:anywhere;} .event-icon img{width:100%;height:100%;object-fit:cover;border-radius:50%;} .custom-art{object-fit:contain;} .event-body{overflow-wrap:anywhere;} .notes{grid-template-columns:230px 1fr;} .notes-heading{font-family:Georgia,serif;font-size:30px;font-weight:bold;} .notes:empty{display:none;} footer{height:auto;min-height:85px;padding:20px 0;overflow-wrap:anywhere;} footer:empty{display:none;}@media(max-width:850px){.notes{grid-template-columns:165px 1fr;}.notes-heading{font-size:25px;}} @media(max-width:580px){.masthead{min-height:160px;padding-bottom:28px;}.notes{display:block;}} .day-heading{display:flex;align-items:center;gap:14px;margin:36px 0 0;font-size:14px;font-weight:800;letter-spacing:3px;text-transform:uppercase;color:var(--blue);} .day-heading::after{content:'';flex:1;height:1px;background:currentColor;opacity:.35;} .day:first-of-type .day-heading{margin-top:8px;} @media(max-width:580px){.day-heading{font-size:12px;letter-spacing:2px;margin-top:26px;}}`;
    // Only timelines that use them carry these, so a day timeline's page is
    // unchanged.
    const relativeCss = rel
      ? ` .offsets{position:absolute;inset:0;pointer-events:none;} .offset{position:absolute;left:0;width:calc(var(--axis) - 14px);top:calc(var(--m) / 60 * var(--hour-height));transform:translateY(-50%);text-align:right;font-size:12px;font-weight:700;line-height:1;letter-spacing:0;color:var(--blue);opacity:.85;font-variant-numeric:tabular-nums;white-space:nowrap;} .timeline.relative .hour-label,.timeline.relative .event time{font-variant-numeric:tabular-nums;} @media(max-width:580px){.timeline.relative .hour-label{font-size:13px;letter-spacing:-.3px;} .offset{width:calc(var(--axis) - 9px);font-size:10px;}}`
      : "";
    const pictureCss = pictured
      ? ` .pic{display:block;overflow:hidden;background:var(--sky);-webkit-tap-highlight-color:transparent;} .pic img{display:block;width:100%;height:100%;object-fit:cover;} .pic.cover{margin:-30px -34px 22px;aspect-ratio:16/7;max-height:380px;} .event-body.has-pic{min-height:80px;padding-right:86px;} .pic.thumb{position:absolute;right:7px;top:50%;width:64px;height:64px;transform:translateY(-50%);border-radius:12px;box-shadow:0 1px 4px #0002;} .event-body.has-pic .until{right:84px;} .pic-view{position:fixed;inset:0;z-index:40;display:grid;place-items:center;padding:env(safe-area-inset-top) 0 env(safe-area-inset-bottom);background:#000000eb;cursor:zoom-out;} .pic-view img{max-width:100vw;max-height:100vh;max-height:100dvh;object-fit:contain;} @media(max-width:850px){.pic.cover{margin:-25px -22px 18px;}} @media(max-width:580px){.pic.cover{margin:-27px -14px 16px;aspect-ratio:16/10;} .event-body.has-pic{min-height:76px;padding-right:64px;} .pic.thumb{right:6px;width:52px;height:52px;border-radius:10px;} .event-body.has-pic .until{right:62px;}} @media print{.pic.cover{margin-top:0;}}`
      : "";
    // The icons a page uses beyond the original set.
    const symbols = (() => {
      const extra = [...new Set(m.events.map((e) => e.icon))].filter((icon) => moreSymbols[icon]);
      return extra.length ? art.symbols.replace("\n</defs>", `\n ${extra.map((icon) => moreSymbols[icon]).join("\n ")}\n</defs>`) : art.symbols;
    })();
    const notesCss = m.events.some((e) => e.notes && e.notes.length)
      ? ` .step-notes{margin:5px 0 0;color:var(--blue);} .step-notes summary{display:inline-block;list-style:none;cursor:pointer;padding:3px 10px;border:1px solid currentColor;border-radius:999px;font-size:12px;font-weight:700;line-height:1.4;letter-spacing:.2px;opacity:.85;} .step-notes summary::-webkit-details-marker{display:none;} .step-notes summary::after{content:' ▾';} .step-notes[open] summary::after{content:' ▴';} .step-notes ul{margin:6px 0 2px;padding-left:18px;font-size:15px;line-height:1.3;color:var(--navy);} .step-notes li{margin:2px 0;} @media(max-width:580px){.step-notes ul{padding-left:16px;font-size:13px;}}`
      : "";
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="${darkThemes[m.theme] ? "light dark" : m.theme === "future" || m.theme === "code" ? "dark" : "light"}"><title>${escape(m.title)}</title><style>${art.css}
${extraCss}${relativeCss}${notesCss}${pictureCss}
${themes[m.theme]}${darkThemes[m.theme] ? `\n@media screen and (prefers-color-scheme:dark){${darkThemes[m.theme]}}` : ""}</style></head><body class="theme-${m.theme}${live ? " live" : ""}">${symbols}<main class="sheet">${cover ? picture(cover, "cover", "Cover photo") : ""}<header class="masthead">${decorations}<h1>${escape(m.title)}</h1>${date ? `<p class="date">${escape(date)}</p>` : ""}${m.subtitle ? `<p class="tagline">${escape(m.subtitle)}</p>` : ""}</header>${days}${notesHtml(m.notes)}${m.footer ? `<footer><span>${escape(m.footer)}</span></footer>` : ""}</main><script>${runtime}<\/script></body></html>`;
  }
  // Shareable links: the whole timeline text travels in the URL fragment,
  // deflate-compressed when the browser can ("z="), plain otherwise ("t=").
  const b64 = {
    enc(bytes) {
      let s = "";
      for (let i = 0; i < bytes.length; i += 0x8000)
        s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    },
    dec: (s) =>
      Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)),
  };
  async function pipe(bytes, Stream) {
    const stream = new Blob([bytes]).stream().pipeThrough(new Stream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  async function encodeLink(text) {
    const bytes = new TextEncoder().encode(text);
    if (typeof CompressionStream === "function")
      return "z=" + b64.enc(await pipe(bytes, CompressionStream));
    return "t=" + b64.enc(bytes);
  }
  async function decodeLink(hash) {
    // "text=" carries the timeline as plain percent-encoded text, so a link can
    // be written by hand or by an AI chat (see llms.txt); z=/t= are ours.
    const plain = String(hash).replace(/^#/, "").match(/^text=([\s\S]*)$/);
    if (plain) {
      try {
        return decodeURIComponent(plain[1]);
      } catch {
        return plain[1];
      }
    }
    const m = String(hash).replace(/^#/, "").match(/^(z|t)=([A-Za-z0-9_-]+)$/);
    if (!m) return "";
    const bytes = b64.dec(m[2]);
    if (m[1] === "t") return new TextDecoder().decode(bytes);
    if (typeof DecompressionStream !== "function")
      throw new Error("This browser cannot open compressed timeline links.");
    return new TextDecoder().decode(await pipe(bytes, DecompressionStream));
  }

  // Text edits for the studio's Photo button: name an asset after its
  // step, write or replace "asset <name>: <url>", set a line's picture (the
  // 6th field) or the cover. Plain string work, kept here so node tests
  // cover it.
  function pictureEdits() {
    const assetLine = (name) => new RegExp(`^[ \\t]*asset[ \\t]+${name}[ \\t]*:.*$`, "m");
    // "Side plank L" -> "side-plank-l", then "-2", "-3" while taken.
    function assetName(base, text) {
      let slug =
        String(base)
          .toLowerCase()
          .normalize("NFKD")
          .replace(/[̀-ͯ]/g, "")
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 24)
          .replace(/-+$/, "") || "photo";
      if (!/^[a-z]/.test(slug)) slug = "photo-" + slug;
      let name = slug;
      for (let n = 2; assetLine(name).test(text); n++) name = `${slug}-${n}`;
      return name;
    }
    // In place when the asset exists, else after the last asset line, else
    // at the end after a blank line.
    function withAsset(text, name, url) {
      const line = `asset ${name}: ${url}`;
      if (assetLine(name).test(text)) return text.replace(assetLine(name), () => line);
      const rows = text.split("\n"),
        last = rows.map((row, i) => (/^\s*asset\s+/.test(row) ? i : -1)).filter((i) => i >= 0).pop();
      if (last !== undefined) {
        rows.splice(last + 1, 0, line);
        return rows.join("\n");
      }
      return text.trimEnd() + "\n\n" + line + "\n";
    }
    // An asset only this picture uses is reused (its URL replaced) rather
    // than left behind when the picture changes.
    function reusable(text, value) {
      if (!value || !value.startsWith("@")) return "";
      const name = value.slice(1),
        uses = text.match(new RegExp(`@${name}(?![\\w-])`, "g")) || [];
      return uses.length === 1 && assetLine(name).test(text) ? name : "";
    }
    // Line `lineNo` (1-based) with its 6th field set to `value`; empty
    // fields are filled in as " | " and the rest of the line is kept.
    function withPicture(text, lineNo, value) {
      const rows = text.split("\n"),
        raw = rows[lineNo - 1].split(/(?<!\\)\|/);
      raw[raw.length - 1] = raw[raw.length - 1].replace(/\s*$/, " ");
      while (raw.length < 5) raw.push(" ");
      raw[4] = raw[4].replace(/\s*$/, " ");
      raw[5] = ` ${value}`;
      rows[lineNo - 1] = raw.slice(0, 6).join("|").replace(/\s+$/, "");
      return rows.join("\n");
    }
    // "cover: <value>", replacing the cover line or added under the title.
    function withCover(text, value) {
      const cover = /^[ \t]*cover[ \t]*:.*$/m;
      if (cover.test(text)) return text.replace(cover, () => `cover: ${value}`);
      const rows = text.split("\n"),
        at = rows.findIndex((row) => /^\s*title\s*:/.test(row));
      rows.splice(at + 1, 0, `cover: ${value}`);
      return rows.join("\n");
    }
    return { assetName, withAsset, withPicture, withCover, reusable };
  }

  const api = { parse, render, pictureEdits: pictureEdits(), icons, themes: themeNames, encodeLink, decodeLink, location, mapSearchUrl, describe, runCore, runConfig, runRuntime };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.TimelineText = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
