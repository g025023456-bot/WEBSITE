/* ============================================================
   lead-popup.js — חלון "השארת פרטים" אחיד לכל האתר
   ------------------------------------------------------------
   כל לחיצה על קישור השארת-פרטים (href="#lead", וגם קישורי
   הכוורת הישנים) פותחת חלון קופץ, והפרטים נשלחים לאותו
   גיליון Google ("איסוף נתונים — אתר הורה ומיוחד") שאליו
   מגיעים טופס צור-קשר וההרשמה לניוזלטר.
   סוג הפנייה בגיליון: "השארת פרטים — מימוש זכויות".
   ============================================================ */
(function(){
  'use strict';

  /* אותו טופס גוגל כמו בשאר האתר */
  var ACTION='https://docs.google.com/forms/d/e/1FAIpQLSe5AwpEtnqMhNBiXautOXTIb-e6URbwYtbZNq361QEqqAWhdQ/formResponse';
  var MAP={type:'entry.1477666269',name:'entry.1196494233',phone:'entry.1480221884',email:'entry.545485552',message:'entry.1010706641',consent:'entry.615742920'};
  function send(data){
    try{
      var b=new URLSearchParams();
      Object.keys(data).forEach(function(k){ if(MAP[k]&&data[k]) b.append(MAP[k],data[k]); });
      fetch(ACTION,{method:'POST',mode:'no-cors',body:b,keepalive:true});
    }catch(e){}
  }
  window.sendLeadToSheet=send;

  var CSS='.lead-ov{position:fixed;inset:0;background:rgba(26,18,48,.62);backdrop-filter:blur(3px);z-index:10001;display:none;align-items:center;justify-content:center;padding:20px}'
   +'.lead-ov.show{display:flex}'
   +'.lead-box{background:#fff;border-radius:22px;max-width:430px;width:100%;padding:30px 26px;position:relative;box-shadow:0 24px 60px rgba(0,0,0,.35);max-height:92vh;overflow-y:auto}'
   +'.lead-x{position:absolute;top:12px;left:14px;width:32px;height:32px;border-radius:50%;background:#F4F0F8;color:#4A3D5C;border:none;cursor:pointer;font-size:1rem}'
   +'.lead-box h3{font-family:Rubik,Heebo,sans-serif;font-weight:800;font-size:1.35rem;color:#562E8C;margin:0 0 6px;text-align:center}'
   +'.lead-box .lp-sub{color:#4A3D5C;font-size:.9rem;text-align:center;margin:0 0 18px;line-height:1.5}'
   +'.lead-box input,.lead-box textarea{width:100%;padding:13px 15px;border:1.5px solid rgba(86,46,140,.18);border-radius:12px;background:#FAFAFA;font-family:inherit;font-size:.95rem;margin-bottom:10px;color:#1A1230}'
   +'.lead-box input:focus,.lead-box textarea:focus{outline:none;border-color:#562E8C;background:#fff}'
   +'.lead-box textarea{min-height:70px;resize:vertical}'
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
   +'<form id="lpForm">'
   +'<h3>📋 השאירו פרטים</h3>'
   +'<p class="lp-sub">נציג מימושים יחזור אליכם בהקדם עם תכנית פעולה מותאמת — ללא עלות וללא התחייבות.</p>'
   +'<input type="text" name="lp-name" placeholder="שם מלא *" required autocomplete="name">'
   +'<input type="tel" name="lp-phone" placeholder="טלפון *" required autocomplete="tel" inputmode="tel">'
   +'<textarea name="lp-msg" placeholder="על מה תרצו לדבר? (לא חובה)"></textarea>'
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

    function open(){ ov.classList.add('show'); var f=ov.querySelector('input[name="lp-name"]'); if(f)setTimeout(function(){f.focus();},60); }
    function shut(){ ov.classList.remove('show'); }
    ov.querySelector('.lead-x').addEventListener('click',shut);
    ov.addEventListener('click',function(e){ if(e.target===ov) shut(); });
    document.addEventListener('keydown',function(e){ if(e.key==='Escape') shut(); });

    form.addEventListener('submit',function(e){
      e.preventDefault();
      send({type:'השארת פרטים — מימוש זכויות',
            name:form['lp-name'].value.trim(),
            phone:form['lp-phone'].value.trim(),
            message:form['lp-msg'].value.trim(),
            consent:'כן'});
      form.style.display='none'; ok.style.display='block';
      setTimeout(shut,2600);
      setTimeout(function(){form.reset();form.style.display='';ok.style.display='';},3000);
    });

    /* תופסים כל קישור השארת-פרטים — גם כאלה שנוצרים דינמית
       (כמו במסך התוצאות של המחשבונים) — האזנה ברמת המסמך */
    document.querySelectorAll('a[href*="kaveret"]').forEach(function(a){ a.setAttribute('href','#lead'); });
    document.addEventListener('click',function(e){
      var a = e.target.closest ? e.target.closest('a[href="#lead"], a[href*="kaveret"]') : null;
      if(!a) return;
      e.preventDefault(); e.stopImmediatePropagation();
      open();
    },true);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else init();
})();
