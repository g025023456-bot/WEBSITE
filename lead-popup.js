/* ============================================================
   lead-popup.js — חלון "השארת פרטים" אחיד לכל האתר + שליחת ליד
   ------------------------------------------------------------
   כל לחיצה על קישור href="#lead" פותחת חלון קופץ. הפרטים נשלחים
   לארגונית (public-lead) שפותחת תיק ומשימה ורושמת שורה בקובץ
   הלידים. אם הארגונית לא ענתה — השורה נרשמת בקובץ הלידים ישירות
   עם "לא נקלט בארגונית", כדי שאף ליד לא יאבד.

   window.sendRightsLead(data)  — זמין גם לטופס contact.html.
   window.LEAD_CONTEXT          — סיכום מהמחשבון (נכנס ל-source_details).
   window.LEAD_BENEFICIARY      — 'child' במחשבון ילד נכה.
   ============================================================ */
(function(){
  'use strict';

  var LEAD_API='https://htbgubnpdkozjdwoppvj.supabase.co/functions/v1/public-lead';

  /* קובץ "לידים מהאתר" — גיבוי כשהארגונית לא ענתה */
  var FORM_URL='https://docs.google.com/forms/d/e/1FAIpQLSfXUUxTrI0LP4Xj-hQbam80T3LFz-Up_cMBJ6Ei9601Lnijgg/formResponse';
  var FORM_FIELDS={source:'entry.627494332',name:'entry.307897224',phone:'entry.191359326',email:'entry.615506464',message:'entry.362018758',consent:'entry.2077493836',crm:'entry.920771468'};
  var SOURCE_LABELS={site_calculator:'מחשבון באתר',site_contact_form:'טופס יצירת קשר'};

  var PHONE_RE=/^0\d{8,9}$/;
  var BOT_NAME_RE=/^[A-Za-z]{12,}$/;

  /* אותה נורמליזציה כמו בשרת: ספרות בלבד, 972 הופך ל-0. מחזיר '' כשלא תקין */
  function normalizePhone(raw){
    var d=String(raw||'').replace(/\D/g,'').replace(/^972/,'0');
    return PHONE_RE.test(d)?d:'';
  }
  window.normalizeLeadPhone=normalizePhone;
  window.isBotLeadName=function(name){ return BOT_NAME_RE.test(String(name||'').trim()); };

  function isCalculatorPage(){
    var seg=(location.pathname.split('/').pop()||'').toLowerCase();
    return /^(app|bogrim-app|siud-app)(\.html)?$/.test(seg);
  }

  function sheetFallback(payload){
    try{
      var b=new URLSearchParams();
      b.append(FORM_FIELDS.source, SOURCE_LABELS[payload.source]||SOURCE_LABELS.site_contact_form);
      b.append(FORM_FIELDS.name, payload.full_name);
      b.append(FORM_FIELDS.phone, payload.phone);
      if(payload.email) b.append(FORM_FIELDS.email, payload.email);
      var msg=[payload.message,payload.source_details].filter(Boolean).join('\n');
      if(msg) b.append(FORM_FIELDS.message, msg);
      if(payload.consent) b.append(FORM_FIELDS.consent, 'כן');
      b.append(FORM_FIELDS.crm, 'לא נקלט בארגונית');
      fetch(FORM_URL,{method:'POST',mode:'no-cors',body:b,keepalive:true});
    }catch(e){}
  }

  /* data: {name, phone, email, message, consent}. הטלפון חייב להיות תקין (ראה normalizePhone). */
  function sendRightsLead(data){
    data=data||{};
    var details=[document.title||''];
    if(window.LEAD_CONTEXT) details.push(String(window.LEAD_CONTEXT));
    var payload={
      full_name:String(data.name||'').trim(),
      phone:normalizePhone(data.phone)||String(data.phone||'').trim(),
      email:String(data.email||'').trim(),
      message:String(data.message||'').trim(),
      source:isCalculatorPage()?'site_calculator':'site_contact_form',
      source_details:details.filter(Boolean).join('\n'),
      consent:!!data.consent
    };
    if(window.LEAD_BENEFICIARY) payload.beneficiary_type=String(window.LEAD_BENEFICIARY);
    try{
      return fetch(LEAD_API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),keepalive:true})
        .then(function(r){ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
        .then(function(j){ if(!j||j.success!==true) throw new Error('not accepted'); return j; })
        .catch(function(){ sheetFallback(payload); return null; });
    }catch(e){ sheetFallback(payload); return Promise.resolve(null); }
  }
  window.sendRightsLead=sendRightsLead;

  var CSS='.lead-ov{position:fixed;inset:0;background:rgba(26,18,48,.62);backdrop-filter:blur(3px);z-index:10001;display:none;align-items:center;justify-content:center;padding:20px}'
   +'.lead-ov.show{display:flex}'
   +'.lead-box{background:#fff;border-radius:22px;max-width:430px;width:100%;padding:30px 26px;position:relative;box-shadow:0 24px 60px rgba(0,0,0,.35);max-height:92vh;overflow-y:auto}'
   +'.lead-x{position:absolute;top:12px;left:14px;width:32px;height:32px;border-radius:50%;background:#F4F0F8;color:#4A3D5C;border:none;cursor:pointer;font-size:1rem}'
   +'.lead-box h3{font-family:Rubik,Heebo,sans-serif;font-weight:800;font-size:1.35rem;color:#562E8C;margin:0 0 6px;text-align:center}'
   +'.lead-box .lp-sub{color:#4A3D5C;font-size:.9rem;text-align:center;margin:0 0 18px;line-height:1.5}'
   +'.lead-box input,.lead-box textarea{width:100%;padding:13px 15px;border:1.5px solid rgba(86,46,140,.18);border-radius:12px;background:#FAFAFA;font-family:inherit;font-size:.95rem;margin-bottom:10px;color:#1A1230}'
   +'.lead-box input:focus,.lead-box textarea:focus{outline:none;border-color:#562E8C;background:#fff}'
   +'.lead-box input.lp-invalid{border-color:#C62828;background:#FFF5F5;margin-bottom:4px}'
   +'.lp-err{display:none;color:#C62828;font-size:.82rem;margin:0 2px 10px;text-align:right}'
   +'.lp-err.show{display:block}'
   +'.lead-box textarea{min-height:70px;resize:vertical}'
   +'.lp-hp{position:absolute;width:1px;height:1px;margin:-1px;padding:0;border:0;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap}'
   +'.lp-consent{display:flex;align-items:flex-start;gap:8px;font-size:.8rem;color:#4A3D5C;line-height:1.5;margin:2px 0 14px;cursor:pointer;text-align:right}'
   +'.lp-consent input{width:16px;height:16px;margin-top:2px;flex-shrink:0;accent-color:#562E8C}'
   +'.lp-btn{display:block;width:100%;background:#FFD455;color:#3F1F66;border:none;border-radius:999px;padding:14px;font-family:inherit;font-weight:800;font-size:1rem;cursor:pointer;transition:transform .2s}'
   +'.lp-btn:hover{transform:translateY(-2px)}'
   +'.lp-ok{display:none;text-align:center;padding:16px 0}'
   +'.lp-ok .big{font-size:2.6rem;margin-bottom:8px}'
   +'.lp-ok h4{color:#562E8C;font-family:Rubik,sans-serif;margin:0 0 6px;font-size:1.15rem}'
   +'.lp-ok p{color:#4A3D5C;font-size:.9rem;margin:0}';

  var HTML='<div class="lead-box" role="dialog" aria-modal="true" aria-label="השארת פרטים">'
   +'<button class="lead-x" type="button" aria-label="סגור">✕</button>'
   +'<form id="lpForm" novalidate>'
   +'<h3>📋 השאירו פרטים</h3>'
   +'<p class="lp-sub">נציג מימושים יחזור אליכם בהקדם עם תכנית פעולה מותאמת — ללא עלות וללא התחייבות.</p>'
   +'<input type="text" name="lp-name" placeholder="שם מלא *" required autocomplete="name">'
   +'<input type="tel" name="lp-phone" placeholder="טלפון *" required autocomplete="tel" inputmode="tel" aria-describedby="lpPhoneErr">'
   +'<div class="lp-err" id="lpPhoneErr" role="alert">מספר טלפון לא תקין</div>'
   +'<textarea name="lp-msg" placeholder="על מה תרצו לדבר? (לא חובה)"></textarea>'
   +'<input class="lp-hp" type="text" name="hp_check" tabindex="-1" aria-hidden="true" autocomplete="off">'
   +'<label class="lp-consent"><input type="checkbox" name="lp-consent" required>'
   +'<span>אני מאשר/ת יצירת קשר וקבלת עדכונים מ"הורה ומיוחד" ו"מימושים", וניתן להסיר את עצמי בכל עת. *</span></label>'
   +'<button type="submit" class="lp-btn">שלחו לי פרטים ←</button>'
   +'</form>'
   +'<div class="lp-ok" id="lpOk"><div class="big">✅</div><h4>הפרטים התקבלו!</h4><p>נחזור אליכם בהקדם. תודה 💜</p></div>'
   +'</div>';

  function init(){
    var st=document.createElement('style'); st.id='lead-popup-css'; st.textContent=CSS; document.head.appendChild(st);
    var ov=document.createElement('div'); ov.className='lead-ov'; ov.id='leadPop'; ov.innerHTML=HTML; document.body.appendChild(ov);
    var form=ov.querySelector('#lpForm'), ok=ov.querySelector('#lpOk');
    var phoneEl=form['lp-phone'], phoneErr=ov.querySelector('#lpPhoneErr');

    function open(){ ov.classList.add('show'); var f=ov.querySelector('input[name="lp-name"]'); if(f)setTimeout(function(){f.focus();},60); }
    function shut(){ ov.classList.remove('show'); }
    ov.querySelector('.lead-x').addEventListener('click',shut);
    ov.addEventListener('click',function(e){ if(e.target===ov) shut(); });
    document.addEventListener('keydown',function(e){ if(e.key==='Escape') shut(); });

    function showPhoneError(on){ phoneErr.classList.toggle('show',on); phoneEl.classList.toggle('lp-invalid',on); }
    phoneEl.addEventListener('input',function(){ showPhoneError(false); });

    function showSuccess(){
      form.style.display='none'; ok.style.display='block';
      setTimeout(shut,2600);
      setTimeout(function(){form.reset();showPhoneError(false);form.style.display='';ok.style.display='';},3000);
    }

    form.addEventListener('submit',function(e){
      e.preventDefault();
      var name=form['lp-name'].value.trim();
      if(!name){ form['lp-name'].focus(); return; }
      if(!form['lp-consent'].checked){ form['lp-consent'].focus(); return; }

      /* בוט: שדה המלכודת מולא, או "שם" שהוא מחרוזת לטינית ארוכה — הצלחה ובלי שליחה */
      if(form['hp_check'].value || BOT_NAME_RE.test(name)){ showSuccess(); return; }

      var phone=normalizePhone(phoneEl.value);
      if(!phone){ showPhoneError(true); phoneEl.focus(); return; }

      /* ההודעה מופיעה מיד — לא מחכים לתשובת השרת */
      sendRightsLead({name:name,phone:phone,message:form['lp-msg'].value.trim(),consent:true});
      showSuccess();
    });

    /* תופסים כל קישור השארת-פרטים — גם כאלה שנוצרים דינמית
       (כמו במסך התוצאות של המחשבונים) — האזנה ברמת המסמך */
    document.addEventListener('click',function(e){
      var a = e.target.closest ? e.target.closest('a[href="#lead"]') : null;
      if(!a) return;
      e.preventDefault(); e.stopImmediatePropagation();
      open();
    },true);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else init();
})();
