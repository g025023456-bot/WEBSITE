/* ============================================================
   i18n.js — מנוע עברית/English לאתר הורה ומיוחד
   ------------------------------------------------------------
   איך זה עובד:
   · כל טקסט קיים פעמיים ב-HTML:  <span class="lang-he">…</span><span class="lang-en">…</span>
   · ההחלפה היא CSS טהור (html[data-lang]) — אפס הבהוב.
   · הקובץ הזה מטפל ב: כיוון (rtl/ltr), placeholders, aria-labels,
     כפתור המתג, שמירת ההעדפה, והטקסטים המשפטיים באנגלית.
   · המחשבונים (router/app/bogrim/siud) בעברית בלבד — בכוונה.
   ============================================================ */
(function(){
  'use strict';

  function lang(){ return document.documentElement.getAttribute('data-lang')==='en' ? 'en' : 'he'; }

  function applyLang(l){
    var d=document.documentElement;
    d.setAttribute('data-lang',l);
    d.setAttribute('lang',l);
    d.setAttribute('dir', l==='en' ? 'ltr' : 'rtl');
    /* placeholders דו-לשוניים */
    document.querySelectorAll('[data-ph-he]').forEach(function(el){
      var v=el.getAttribute(l==='en'?'data-ph-en':'data-ph-he');
      if(v!=null) el.setAttribute('placeholder',v);
    });
    /* aria-labels דו-לשוניים */
    document.querySelectorAll('[data-aria-he]').forEach(function(el){
      var v=el.getAttribute(l==='en'?'data-aria-en':'data-aria-he');
      if(v!=null) el.setAttribute('aria-label',v);
    });
    /* תווית המתג מציגה את השפה שאליה עוברים */
    document.querySelectorAll('.lang-switch').forEach(function(b){
      b.setAttribute('aria-label', l==='en' ? 'עבור לעברית / Switch to Hebrew' : 'Switch to English / עבור לאנגלית');
      var t=b.querySelector('.ls-label'); if(t) t.textContent = l==='en' ? 'עברית' : 'EN';
    });
    try{ localStorage.setItem('site-lang',l); }catch(e){}
  }

  window.toggleLang=function(){ if(window.I18N_DISABLED) return; applyLang(lang()==='en'?'he':'en'); };

  /* ---- הזרקת כפתור המתג לניווט ולתפריט הנייד ---- */
  function makeBtn(cls){
    var b=document.createElement('button');
    b.type='button'; b.className='lang-switch'+(cls?' '+cls:'');
    b.innerHTML='<span class="ls-globe" aria-hidden="true">🌐</span> <span class="ls-label">EN</span>';
    b.addEventListener('click',function(e){ e.preventDefault(); window.toggleLang(); });
    return b;
  }
  function inject(){
    /* עמוד שהוגדר עברית-בלבד (מימושים): בלי כפתור מתג, נעול על he —
       בלי לגעת ב-localStorage, כדי לא לדרוס את הבחירה של המשתמש בעמותה */
    if(window.I18N_DISABLED){
      var d=document.documentElement;
      d.setAttribute('data-lang','he'); d.setAttribute('lang','he'); d.setAttribute('dir','rtl');
      return;
    }
    var cta=document.querySelector('.nav-cta');
    if(cta && !cta.querySelector('.lang-switch')) cta.insertBefore(makeBtn(''), cta.firstChild);
    var mm=document.getElementById('mobileMenu');
    if(mm && !mm.querySelector('.lang-switch')) mm.appendChild(makeBtn('ls-mobile'));
    applyLang(lang());
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',inject);
  else inject();

  /* ---- מודאל משפטי דו-לשוני ----
     העברית יושבת ב-window.LEGAL_TEXTS (קיים בכל עמוד).
     האנגלית כאן. openLegal בוחר לפי השפה הפעילה. */
  var TITLES={takanon:{he:'תקנון ותנאי שימוש',en:'Terms of Use'},
              privacy:{he:'מדיניות פרטיות',en:'Privacy Policy'},
              a11y:{he:'הצהרת נגישות',en:'Accessibility Statement'}};

  window.LEGAL_TEXTS_EN={
    takanon:'<h3>1. General</h3><p>Use of the "Horeh uMeyuhad" / "Mimushim" website (the "Site") is subject to these Terms. Using the Site constitutes full acceptance. If you do not agree — please refrain from using it.</p><h3>2. Nature of the Information</h3><p>All information, calculators, amounts and tools on the Site are presented <strong>for general guidance only</strong> and do not constitute legal, medical, financial, social or professional advice of any kind, nor a substitute for personal consultation with a qualified professional.</p><h3>3. Accuracy</h3><p>Site owners make reasonable efforts to keep information current but do not warrant it is accurate, complete or suited to your specific case. Benefit amounts may change at any time by the competent authorities. <strong>E&amp;OE.</strong></p><h3>4. Limitation of Liability</h3><p>The nonprofit, the company, their owners, managers, employees and suppliers bear no liability for any damage, direct or indirect, resulting from use of or reliance on the information — including denied eligibility, missed deadlines, decisions of competent authorities, technical faults or inaccuracies.</p><h3>5. Intellectual Property</h3><p>All rights in the Site, its design, content, code and calculators are reserved. No copying, distribution or commercial use without written permission.</p><h3>6. Changes</h3><p>These Terms may be amended at any time; changes take effect upon publication.</p><h3>7. Law &amp; Jurisdiction</h3><p>Israeli law applies exclusively; exclusive jurisdiction — the competent courts of the Jerusalem District.</p><h3>8. Contact</h3><p>Horeh uMeyuhad / Mimushim · HaTzvi 15, Jerusalem · Pumbedita 1, Beit Shemesh · 02-5023456 · a@ho-me.org.il</p>',
    privacy:'<h3>1. What We Collect</h3><p>Only data you actively submit (full name, phone, email, message) via the contact or newsletter forms. Calculator answers are not stored on our servers and are not sent to us unless you choose to share them.</p><h3>2. Use</h3><p>Your details are used solely for personal contact by our team, responding to your inquiry, and updates you consented to receive.</p><h3>3. Storage &amp; Security</h3><p>Data is stored in secured systems using accepted standards. We take reasonable protective measures; no protection is absolute.</p><h3>4. No Third-Party Transfer</h3><p>We will not transfer your data to any third party, except as required by law or court order.</p><h3>5. Mailings</h3><p>Per the Israeli Communications Law (Amendment 40), mailings are sent only after explicit consent. Unsubscribe any time via a@ho-me.org.il.</p><h3>6. Cookies</h3><p>Functional cookies only (accessibility and language preferences). No marketing or tracking cookies.</p><h3>7. Your Rights</h3><p>Under the Protection of Privacy Law 5741-1981 you may review, correct or delete your data — contact a@ho-me.org.il.</p><h3>8. Questions</h3><p>a@ho-me.org.il · 02-5023456</p>',
    a11y:'<h3>Our Commitment</h3><p>This Site conforms to <strong>Israeli Standard 5568</strong> (based on WCAG 2.1) at level AA, and to the Equal Rights for Persons with Disabilities Law 5758-1998.</p><h3>Accessibility Features</h3><ul><li>Built-in accessibility menu (♿ button)</li><li>Text size in 3 levels; high-contrast, dark and grayscale modes</li><li>Link highlighting, readable font, increased spacing</li><li>Animation stop, enlarged cursor</li><li>Screen-reader compatibility and full keyboard navigation</li><li>Alt text, semantic headings, ARIA labels</li><li>Bilingual site (Hebrew / English)</li></ul><h3>Accessibility Coordinator</h3><p><strong>Yehuda Einhorn</strong> · <a href="tel:02-5023456">02-5023456</a> · <a href="mailto:a@ho-me.org.il">a@ho-me.org.il</a></p><h3>Complaints</h3><p>If you encounter an accessibility issue, contact us and we will address it promptly. If unanswered within 45 days you may contact the Commission for Equal Rights of Persons with Disabilities, Ministry of Justice.</p>'
  };

  window.openLegal=function(key){
    var l=lang();
    var m=document.getElementById('legalModal'),
        t=document.getElementById('legalTitle'),
        b=document.getElementById('legalBody');
    if(!m||!t||!b) return false;
    t.textContent=(TITLES[key]||{})[l]||'';
    b.innerHTML = l==='en'
      ? (window.LEGAL_TEXTS_EN[key]||'')
      : ((window.LEGAL_TEXTS||{})[key]||'');
    m.style.display='flex';
    return false;
  };
})();
