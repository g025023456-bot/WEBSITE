/* ============================================================
   תפריט נגישות לדפי הניוזלטר (גרסת האתר)
   ------------------------------------------------------------
   דפי הגיליונות הם HTML של מייל ולכן אי אפשר להטמיע בהם את
   הווידג'ט ישירות. הסקריפט הזה מזריק את אותו לחצן ♿ ותפריט
   הנגישות שקיימים בשאר האתר, עם אותו מפתח localStorage ('a11y')
   כך שההעדפות נשמרות בין כל דפי האתר.
   נטען רק בדפדפן; לקוחות מייל מתעלמים מסקריפטים.
   ============================================================ */
(function () {
  if (document.getElementById('a11yFab')) return;

  var css = [
    '.a11y-fab{position:fixed;bottom:20px;right:20px;z-index:9998;width:58px;height:58px;border-radius:50%;background:#1559a8;color:#fff;display:grid;place-items:center;box-shadow:0 8px 24px -6px rgba(0,0,0,.4);font-size:1.8rem;cursor:pointer;border:3px solid #fff;transition:transform .25s}',
    '.a11y-fab:hover{transform:scale(1.08)}',
    '.a11y-fab:focus-visible{outline:3px solid #FFD455;outline-offset:3px}',
    '.a11y-panel{position:fixed;top:0;right:-380px;width:360px;max-width:92vw;height:100vh;background:#fff;z-index:9999;box-shadow:-10px 0 40px -10px rgba(0,0,0,.3);transition:right .35s ease;overflow-y:auto;font-family:Arial,"Heebo",sans-serif;direction:rtl;text-align:right}',
    '.a11y-panel.open{right:0}',
    '.a11y-panel-head{background:#1559a8;color:#fff;padding:18px 20px;display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;z-index:2}',
    '.a11y-panel-head h3{font-size:1.1rem;font-weight:800;margin:0}',
    '.a11y-close{background:rgba(255,255,255,.2);border:none;color:#fff;width:36px;height:36px;border-radius:50%;font-size:1.2rem;cursor:pointer}',
    '.a11y-body{padding:18px 16px}',
    '.a11y-group{margin-bottom:18px}',
    '.a11y-group-title{font-size:.78rem;font-weight:800;color:#555;margin-bottom:8px;text-transform:uppercase;letter-spacing:.05em}',
    '.a11y-btns{display:grid;grid-template-columns:1fr 1fr;gap:6px}',
    '.a11y-btn{padding:10px 8px;border:2px solid #ddd;background:#f8f8f8;border-radius:10px;cursor:pointer;font-family:inherit;font-size:.82rem;font-weight:600;color:#222;transition:all .2s;display:flex;flex-direction:column;align-items:center;gap:4px;line-height:1.2}',
    '.a11y-btn:hover{border-color:#1559a8;background:#fff}',
    '.a11y-btn.active{border-color:#1559a8;background:#e6efff;color:#1559a8}',
    '.a11y-btn .ico{font-size:1.2rem}',
    '.a11y-reset{width:100%;padding:12px;background:#dc3545;color:#fff;border:none;border-radius:10px;font-weight:700;cursor:pointer;font-family:inherit;margin-top:10px}',
    '.a11y-statement{background:#f0f4f9;border-radius:10px;padding:12px 14px;font-size:.78rem;line-height:1.6;color:#444;margin-top:12px}',
    '.a11y-statement a{color:#1559a8;font-weight:700}',
    /* בדפי הגיליונות הטקסט בפיקסלים קבועים (חובה במייל), לכן ההגדלה נעשית ב-zoom */
    'html.a11y-font-lg body{zoom:1.15}',
    'html.a11y-font-xl body{zoom:1.3}',
    'body.a11y-contrast > :not(.a11y-fab):not(.a11y-panel){filter:contrast(1.4)!important}',
    'body.a11y-dark > :not(.a11y-fab):not(.a11y-panel){filter:invert(1) hue-rotate(180deg)!important}',
    'body.a11y-dark > :not(.a11y-fab):not(.a11y-panel) img{filter:invert(1) hue-rotate(180deg)}',
    'body.a11y-mono > :not(.a11y-fab):not(.a11y-panel){filter:grayscale(1)!important}',
    'body.a11y-links a{text-decoration:underline!important;outline:1px dashed currentColor;outline-offset:2px}',
    'body.a11y-readable,body.a11y-readable p,body.a11y-readable div,body.a11y-readable a{font-family:Arial,sans-serif!important;letter-spacing:.02em}',
    /* ריווח שורות רק על טקסט רץ, כדי לא לשבור את קוביות העיצוב של תבנית המייל */
    'body.a11y-spacing p{line-height:2!important;word-spacing:.15em}',
    'body.a11y-noanim,body.a11y-noanim *{animation:none!important;transition:none!important;scroll-behavior:auto!important}',
    'body.a11y-bigcursor,body.a11y-bigcursor *{cursor:url(\'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><path d="M2 2l14 36 6-16 16-6z" fill="black" stroke="white" stroke-width="3"/></svg>\') 4 4,auto!important}'
  ].join('\n');

  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  var html =
    '<button class="a11y-fab" id="a11yFab" aria-label="פתח תפריט נגישות" title="תפריט נגישות">♿</button>' +
    '<aside class="a11y-panel" id="a11yPanel" role="dialog" aria-label="הגדרות נגישות" aria-hidden="true">' +
      '<div class="a11y-panel-head">' +
        '<h3>♿ הגדרות נגישות</h3>' +
        '<button class="a11y-close" id="a11yClose" aria-label="סגור">✕</button>' +
      '</div>' +
      '<div class="a11y-body">' +
        '<div class="a11y-group">' +
          '<div class="a11y-group-title">🔍 גודל טקסט</div>' +
          '<div class="a11y-btns" style="grid-template-columns:1fr 1fr 1fr">' +
            '<button class="a11y-btn" data-toggle="font" data-val="normal"><span class="ico">A</span><span>רגיל</span></button>' +
            '<button class="a11y-btn" data-toggle="font" data-val="lg"><span class="ico">A+</span><span>גדול</span></button>' +
            '<button class="a11y-btn" data-toggle="font" data-val="xl"><span class="ico">A++</span><span>ענק</span></button>' +
          '</div>' +
        '</div>' +
        '<div class="a11y-group">' +
          '<div class="a11y-group-title">🎨 ניגודיות וצבע</div>' +
          '<div class="a11y-btns">' +
            '<button class="a11y-btn" data-toggle="contrast"><span class="ico">⚡</span><span>ניגודיות גבוהה</span></button>' +
            '<button class="a11y-btn" data-toggle="dark"><span class="ico">🌙</span><span>מצב כהה</span></button>' +
            '<button class="a11y-btn" data-toggle="mono"><span class="ico">⚫</span><span>שחור-לבן</span></button>' +
            '<button class="a11y-btn" data-toggle="links"><span class="ico">🔗</span><span>הדגשת קישורים</span></button>' +
          '</div>' +
        '</div>' +
        '<div class="a11y-group">' +
          '<div class="a11y-group-title">📖 קריאות</div>' +
          '<div class="a11y-btns">' +
            '<button class="a11y-btn" data-toggle="readable"><span class="ico">🔤</span><span>גופן קריא</span></button>' +
            '<button class="a11y-btn" data-toggle="spacing"><span class="ico">📐</span><span>ריווח שורות</span></button>' +
            '<button class="a11y-btn" data-toggle="noanim"><span class="ico">🛑</span><span>עצירת אנימציות</span></button>' +
            '<button class="a11y-btn" data-toggle="bigcursor"><span class="ico">🖱️</span><span>סמן גדול</span></button>' +
          '</div>' +
        '</div>' +
        '<button class="a11y-reset" id="a11yReset">🔙 איפוס כל ההגדרות</button>' +
        '<div class="a11y-statement">' +
          '<strong>הצהרת נגישות:</strong> אתר זה הונגש לפי תקן ישראלי 5568 (WCAG 2.1 AA). ' +
          'רכז נגישות: יהודה איינהורן · <a href="tel:02-5023456">02-5023456</a> / <a href="mailto:a@ho-me.org.il">a@ho-me.org.il</a>. ' +
          'להצהרה המלאה: <a href="https://ho-me.org.il/contact" target="_blank" rel="noopener">דף צור קשר באתר</a>.' +
        '</div>' +
      '</div>' +
    '</aside>';

  document.body.insertAdjacentHTML('beforeend', html);

  var fab = document.getElementById('a11yFab');
  var panel = document.getElementById('a11yPanel');
  var close = document.getElementById('a11yClose');
  var reset = document.getElementById('a11yReset');
  var TOGGLES = ['contrast', 'dark', 'mono', 'links', 'readable', 'spacing', 'noanim', 'bigcursor'];
  var FONT_SIZES = ['normal', 'lg', 'xl'];

  function getState() {
    try { return JSON.parse(localStorage.getItem('a11y') || '{}'); } catch (e) { return {}; }
  }

  function applyState() {
    var s = getState();
    TOGGLES.forEach(function (t) { document.body.classList.toggle('a11y-' + t, !!s[t]); });
    FONT_SIZES.forEach(function (f) { document.documentElement.classList.toggle('a11y-font-' + f, s.font === f); });
    document.querySelectorAll('.a11y-btn').forEach(function (btn) {
      var t = btn.dataset.toggle, v = btn.dataset.val;
      if (t === 'font') { btn.classList.toggle('active', s.font === v || (!s.font && v === 'normal')); }
      else { btn.classList.toggle('active', !!s[t]); }
    });
  }

  fab.addEventListener('click', function () { panel.classList.add('open'); panel.setAttribute('aria-hidden', 'false'); });
  close.addEventListener('click', function () { panel.classList.remove('open'); panel.setAttribute('aria-hidden', 'true'); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && panel.classList.contains('open')) { panel.classList.remove('open'); panel.setAttribute('aria-hidden', 'true'); }
  });

  document.querySelectorAll('.a11y-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var s = getState();
      var t = btn.dataset.toggle, v = btn.dataset.val;
      if (t === 'font') { s.font = v; } else { s[t] = !s[t]; }
      try { localStorage.setItem('a11y', JSON.stringify(s)); } catch (e) {}
      applyState();
    });
  });
  reset.addEventListener('click', function () {
    try { localStorage.removeItem('a11y'); } catch (e) {}
    applyState();
  });
  applyState();
})();
