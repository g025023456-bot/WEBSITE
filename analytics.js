/* ============================================================
   Google Analytics 4 — מעקב לכל דפי האתר
   ------------------------------------------------------------
   הקובץ נטען מכל דף (<script src="analytics.js" defer>).
   מזהה המדידה מוגדר פעם אחת — כאן בלבד.

   מה נמדד:
     · צפיות בדפים, מקורות תנועה, מדינה/עיר, מכשיר — אוטומטית ע"י GA4
     · click_phone / click_email / click_whatsapp — לחיצות יצירת קשר
     · click_outbound  — יציאה לאתר חיצוני (לאיזה אתר)
     · click_internal  — ניווט פנימי בין דפי האתר
     · click_download  — הורדת קבצים (PDF וכד')
     · button_click    — לחיצה על כל כפתור (כולל הטקסט שעליו)
     · form_submission — שליחת טפסים
     · scroll_depth    — עד לאן גללו בדף (25/50/75/90%)
     · js_error        — שגיאות בדף (בריאות האתר)
   ============================================================ */
(function () {
  'use strict';

  var GA_MEASUREMENT_ID = 'G-EV2G03P192';

  // לא מודדים בפתיחה מקומית של הקבצים (בזמן עריכה/פיתוח)
  if (location.protocol === 'file:' ||
      location.hostname === 'localhost' ||
      location.hostname === '127.0.0.1') return;

  /* ---------- טעינת gtag.js ---------- */
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = gtag;

  gtag('js', new Date());
  var cfg = {};
  // פתיחת דף עם ?ga_debug בסוף הכתובת מציגה את האירועים ב-DebugView של אנליטיקס
  if (/[?&]ga_debug/.test(location.search)) cfg.debug_mode = true;
  gtag('config', GA_MEASUREMENT_ID, cfg);

  var tag = document.createElement('script');
  tag.async = true;
  tag.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_MEASUREMENT_ID;
  document.head.appendChild(tag);

  /* ---------- עזרים ---------- */
  function txt(el) {
    var t = el.innerText || el.textContent || el.value ||
            el.getAttribute('aria-label') || el.title || '';
    return String(t).replace(/\s+/g, ' ').trim().slice(0, 100);
  }

  function send(name, params) {
    gtag('event', name, params || {});
  }

  // באיזה אזור בדף קרתה הלחיצה (תפריט? כותרת? טופס? חלונית?)
  function sectionOf(el) {
    var sec = el.closest && el.closest('section[id], form[id], dialog, nav, header, footer');
    return sec ? (sec.id || sec.tagName.toLowerCase()) : '';
  }

  var DOWNLOAD_RE = /\.(pdf|docx?|xlsx?|pptx?|zip|rar|7z|mp3|mp4|mov|ics|csv)([?#]|$)/i;

  /* ---------- לחיצות — על כל קישור וכפתור, כולל תוכן שנוצר דינמית ---------- */
  document.addEventListener('click', function (e) {
    var el = e.target && e.target.closest &&
      e.target.closest('a, button, [role="button"], input[type="submit"], input[type="button"], summary');
    if (!el) return;

    if (el.tagName === 'A') {
      var href = el.getAttribute('href') || '';
      var url = el.href || href;
      var label = txt(el);

      if (href.lastIndexOf('tel:', 0) === 0) {
        send('click_phone', { phone_number: href.slice(4), link_text: label });
      } else if (href.lastIndexOf('mailto:', 0) === 0) {
        send('click_email', { email_address: href.slice(7).split('?')[0], link_text: label });
      } else if (/wa\.me|api\.whatsapp\.com|^whatsapp:/i.test(href)) {
        send('click_whatsapp', { link_url: url, link_text: label });
      } else if (el.hasAttribute('download') || DOWNLOAD_RE.test(href)) {
        send('click_download', {
          file_name: (href.split('/').pop() || '').split('?')[0],
          link_url: url,
          link_text: label
        });
      } else if (el.hostname && el.hostname !== location.hostname) {
        send('click_outbound', { link_url: url, link_domain: el.hostname, link_text: label, outbound: true });
      } else {
        send('click_internal', { link_url: url, link_text: label, page_section: sectionOf(el) });
      }
      return;
    }

    send('button_click', {
      button_text: txt(el),
      button_id: el.id || el.name || '',
      page_section: sectionOf(el)
    });
  }, true);

  /* ---------- שליחת טפסים ---------- */
  document.addEventListener('submit', function (e) {
    var f = e.target;
    if (!f || f.tagName !== 'FORM') return;
    send('form_submission', {
      form_id: f.id || f.getAttribute('name') || '',
      form_action: f.getAttribute('action') || location.pathname
    });
  }, true);

  /* ---------- עומק גלילה ---------- */
  var marks = [25, 50, 75, 90];
  var fired = {};
  function checkScroll() {
    var doc = document.documentElement;
    var max = doc.scrollHeight - window.innerHeight;
    if (max <= 0) return;
    var pct = Math.round((window.pageYOffset || doc.scrollTop || 0) / max * 100);
    for (var i = 0; i < marks.length; i++) {
      if (pct >= marks[i] && !fired[marks[i]]) {
        fired[marks[i]] = true;
        send('scroll_depth', { percent_scrolled: marks[i] });
      }
    }
  }
  var scrollTimer = null;
  window.addEventListener('scroll', function () {
    if (scrollTimer) return;
    scrollTimer = setTimeout(function () { scrollTimer = null; checkScroll(); }, 300);
  }, { passive: true });

  /* ---------- שגיאות JavaScript (עד 5 לדף, כדי לא להציף) ---------- */
  var errCount = 0;
  window.addEventListener('error', function (e) {
    if (!e || !e.message || errCount >= 5) return;
    errCount++;
    send('js_error', {
      error_message: String(e.message).slice(0, 150),
      error_file: (e.filename || '').split('/').pop(),
      error_line: e.lineno || 0
    });
  });
})();
