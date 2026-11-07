// תבנית הגיליון: משכפלת אחד לאחד את מבנה הגיליונות שפורסמו באתר (גרסת אתר, כולל
// תגי OG וסרגל "כל הגיליונות"), ומחליפה רק את התוכן. כל טקסט שמגיע מה-AI עובר
// escape; **הדגשה** הופכת ל-<strong>. אין כאן שום דבר שמשנה מבנה, צבעים או כתובות.
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function inline(value) {
  return escapeHtml(value).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*/g, '');
}

function prettyDate(date) {
  const [year, month, day] = String(date).split('-');
  return `${day}.${month}.${year}`;
}

function attribute(value) {
  return escapeHtml(String(value ?? '').replace(/\s+/g, ' ').trim());
}

function renderLead(lead) {
  const parts = [];
  if (lead.opening) parts.push(`<p style="margin:0 0 10px 0;">${inline(lead.opening)}</p>`);
  for (const paragraph of lead.paragraphs || []) {
    const heading = paragraph.heading ? `<strong style="color:#562E8C;">${escapeHtml(paragraph.heading)}.</strong> ` : '';
    parts.push(`<p style="margin:0 0 10px 0;">${heading}${inline(paragraph.text)}</p>`);
  }
  if (lead.closing) parts.push(`<p style="margin:0;"><span style="color:#562E8C; font-weight:700;">${inline(lead.closing)}</span></p>`);
  return parts.map(part => `                ${part}`).join('\n');
}

function renderDontMiss(items) {
  return items.map(item => `• ${inline(item)}`).join('<br>\n                    ');
}

// content: { title, sub, lead:{opening, paragraphs:[{heading,text}], closing}, right:{heading,text}, dontMiss:[...], tip }
function renderIssue({ n, date, content }) {
  const dateLabel = prettyDate(date);
  const description = attribute(content.sub);
  const title = attribute(content.title);
  return `<!DOCTYPE html>
<!--
  הורה ומיוחד · הניוזלטר השבועי · גיליון ${n} · ${dateLabel} (גרסת אתר)
-->
<html dir="rtl" lang="he">
<head>
  <meta charset="utf-8">
  <!-- Google Analytics 4 · מעקב צפיות, מקורות תנועה ולחיצות (המזהה מוגדר בקובץ analytics.js) -->
  <script src="../analytics.js" defer></script>
  <!-- תפריט נגישות (גרסת האתר בלבד; לקוחות מייל מתעלמים מסקריפטים) -->
  <script src="../a11y-widget.js" defer></script>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>הורה ומיוחד · הניוזלטר השבועי · גיליון ${n}</title>
  <meta name="description" content="${description}">
  <!-- Open Graph · כרטיס התצוגה כשמשתפים את הקישור בוואטסאפ -->
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="הורה ומיוחד">
  <meta property="og:locale" content="he_IL">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:url" content="https://ho-me.org.il/newsletter/${date}.html">
  <meta property="og:image" content="https://ho-me.org.il/logo-horeh-umeyuhad.webp">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="icon" href="https://ho-me.org.il/favicon.ico">
  <style>
    .backbar{ max-width:600px; margin:0 auto; padding:14px 16px 0 16px; box-sizing:border-box; }
    .backbar a{ display:inline-block; color:#562E8C; text-decoration:none; font-size:13px; font-weight:700; background:#fff; padding:8px 16px; border-radius:20px; border:1px solid #e3def0; }
    body{ margin:0; padding:0; background-color:#eceaf2; font-family:Arial,'Heebo','Segoe UI',Tahoma,sans-serif; }
    @media only screen and (max-width:640px){
      .email{ width:100% !important; }
      .px{ padding-left:14px !important; padding-right:14px !important; }
      .h-lead{ font-size:23px !important; }
    }
  </style>
</head>
<body style="margin:0; padding:0; background-color:#eceaf2; font-family:Arial, 'Heebo', 'Segoe UI', Tahoma, sans-serif;">

  <div class="backbar"><a href="/newsletter/">← כל הגיליונות</a></div>

  <div style="display:none; max-height:0; overflow:hidden; opacity:0;">${escapeHtml(content.sub)}</div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#eceaf2" style="background-color:#eceaf2;">
    <tr>
      <td align="center" style="padding:16px 10px;">
        <table role="presentation" width="100%" class="email" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="max-width:600px; width:100%; background-color:#ffffff; border-radius:12px; overflow:hidden;">

          <!-- מאסטהד -->
          <tr>
            <td class="px" align="center" style="padding:20px 18px 10px 18px;">
              <a href="https://ho-me.org.il/" target="_blank" rel="noopener" style="text-decoration:none;"><img src="https://ho-me.org.il/logo-horeh-umeyuhad.webp" width="170" alt="הורה ומיוחד · ביחד אנחנו חזקים" style="width:170px; max-width:80%; height:auto; display:block; margin:0 auto; border:0; outline:none;"></a>
              <div style="color:#562E8C; font-size:12px; font-weight:800; letter-spacing:0.3px; margin-top:10px;">הניוזלטר השבועי להורים לילדים מיוחדים</div>
              <div style="color:#6f5f96; font-size:12px; font-weight:700; margin-top:3px;">גיליון ${n} · ${dateLabel}</div>
            </td>
          </tr>
          <tr><td class="px" style="padding:0 18px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td height="3" bgcolor="#562E8C" style="height:3px; background-color:#562E8C; font-size:0; line-height:3px;">&nbsp;</td></tr></table></td></tr>
          <tr><td class="px" style="padding:2px 18px 0 18px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td height="1" bgcolor="#562E8C" style="height:1px; background-color:#562E8C; font-size:0; line-height:1px;">&nbsp;</td></tr></table></td></tr>

          <!-- כתבת השבוע -->
          <tr>
            <td class="px" style="padding:20px 18px 6px 18px;" align="right">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:12px;"><tr><td bgcolor="#562E8C" style="background-color:#562E8C; color:#ffffff; font-size:12px; font-weight:800; padding:4px 12px; border-radius:4px; letter-spacing:0.5px;">כתבת השבוע</td></tr></table>
              <div class="h-lead" style="color:#222222; font-size:25px; font-weight:800; line-height:1.3; margin-bottom:6px;">${escapeHtml(content.title)}</div>
              <div style="color:#6f5f96; font-size:13px; font-weight:600; margin-bottom:14px;">${escapeHtml(content.sub)}</div>
              <div style="color:#333333; font-size:15px; line-height:1.85;">
${renderLead(content.lead || {})}
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:14px 18px 8px 18px;" align="center">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td style="padding:0 3px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td width="9" height="9" bgcolor="#EA6A4C" style="width:9px; height:9px; background-color:#EA6A4C; border-radius:50%; font-size:0; line-height:9px;">&nbsp;</td></tr></table></td><td style="padding:0 3px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td width="13" height="13" bgcolor="#FFD455" style="width:13px; height:13px; background-color:#FFD455; border-radius:3px; font-size:0; line-height:13px;">&nbsp;</td></tr></table></td><td style="padding:0 3px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td width="11" height="11" bgcolor="#562E8C" style="width:11px; height:11px; background-color:#562E8C; border-radius:3px; font-size:0; line-height:11px;">&nbsp;</td></tr></table></td><td style="padding:0 3px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td width="15" height="15" bgcolor="#1CA6A6" style="width:15px; height:15px; background-color:#1CA6A6; border-radius:4px; font-size:0; line-height:15px;">&nbsp;</td></tr></table></td><td style="padding:0 3px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td width="11" height="11" bgcolor="#562E8C" style="width:11px; height:11px; background-color:#562E8C; border-radius:3px; font-size:0; line-height:11px;">&nbsp;</td></tr></table></td><td style="padding:0 3px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td width="13" height="13" bgcolor="#FFD455" style="width:13px; height:13px; background-color:#FFD455; border-radius:3px; font-size:0; line-height:13px;">&nbsp;</td></tr></table></td><td style="padding:0 3px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td width="9" height="9" bgcolor="#EA6A4C" style="width:9px; height:9px; background-color:#EA6A4C; border-radius:50%; font-size:0; line-height:9px;">&nbsp;</td></tr></table></td></tr></table>
            </td>
          </tr>
          <!-- זכות השבוע -->
          <tr>
            <td class="px" style="padding:6px 18px;">
              <div style="border:1px solid #ece8f4; border-radius:10px; overflow:hidden;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td bgcolor="#562E8C" style="background-color:#562E8C; color:#ffffff; font-size:12px; font-weight:800; padding:9px 15px; letter-spacing:0.3px;">זכות השבוע · ${escapeHtml(content.right?.heading || '')}</td></tr></table>
                <div style="padding:15px;" align="right"><div style="color:#444444; font-size:14px; line-height:1.75;">${inline(content.right?.text || '')}</div></div>
              </div>
            </td>
          </tr>
          <!-- לא לפספס -->
          <tr>
            <td class="px" style="padding:6px 18px;">
              <div style="border:1px solid #f3ead0; border-radius:10px; overflow:hidden;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td bgcolor="#FFD455" style="background-color:#FFD455; color:#3d2a06; font-size:12px; font-weight:800; padding:9px 15px; letter-spacing:0.3px;">&#128204; לא לפספס</td></tr></table>
                <div style="padding:15px;" align="right">
                  <div style="color:#5a4500; font-size:14px; line-height:1.85;">
                    ${renderDontMiss(content.dontMiss || [])}
                  </div>
                </div>
              </div>
            </td>
          </tr>
          <!-- טיפ מהשטח -->
          <tr>
            <td class="px" style="padding:6px 18px;">
              <div style="border:1px solid #f6e0d8; border-radius:10px; overflow:hidden;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td bgcolor="#EA6A4C" style="background-color:#EA6A4C; color:#3d1405; font-size:12px; font-weight:800; padding:9px 15px; letter-spacing:0.3px;">&#128161; טיפ מהשטח</td></tr></table>
                <div style="padding:15px;" align="right"><div style="color:#444444; font-size:14px; line-height:1.75;">${inline(content.tip || '')}</div></div>
              </div>
            </td>
          </tr>

          <!-- 3 משבצות פעולה · טבלה קבועה של 3 עמודות, שורה אחת גם בנייד -->
          <tr>
            <td class="px" align="center" style="padding:12px 15px 16px 15px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%; max-width:540px; margin:0 auto; table-layout:fixed;">
                <tr>
                  <td width="33%" valign="top" style="width:33%; padding:0 3px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#f4f1fa" style="background-color:#f4f1fa; border:1px solid #e3def0; border-radius:10px;">
                      <tr><td bgcolor="#f4f1fa" align="center" valign="top" style="background-color:#f4f1fa; padding:10px 4px 10px 4px;">
                        <div style="font-size:17px; line-height:1; margin-bottom:4px;">&#10067;</div>
                        <div style="color:#562E8C; font-size:13px; font-weight:800; line-height:1.25; margin-bottom:3px;">שאלו אותנו</div>
                        <div style="color:#6b6b6b; font-size:12px; line-height:1.35; margin-bottom:8px;">שאלה על זכות?</div>
                        <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;"><tr><td bgcolor="#562E8C" align="center" style="background-color:#562E8C; border-radius:14px;"><a href="mailto:a@ho-me.org.il?subject=%D7%A9%D7%90%D7%9C%D7%94%20%D7%9C%D7%9E%D7%93%D7%95%D7%A8%20%D7%A9%D7%90%D7%9C%D7%95%20%D7%90%D7%95%D7%AA%D7%A0%D7%95" target="_blank" rel="noopener" style="display:inline-block; color:#ffffff; text-decoration:none; font-size:12px; font-weight:800; padding:6px 10px; border-radius:14px; line-height:1.2;">לשאלה</a></td></tr></table>
                      </td></tr>
                    </table>
                  </td>
                  <td width="33%" valign="top" style="width:33%; padding:0 3px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#fff3ef" style="background-color:#fff3ef; border:1px solid #f6e0d8; border-radius:10px;">
                      <tr><td bgcolor="#fff3ef" align="center" valign="top" style="background-color:#fff3ef; padding:10px 4px 10px 4px;">
                        <div style="font-size:17px; line-height:1; margin-bottom:4px;">&#127760;</div>
                        <div style="color:#b03e22; font-size:13px; font-weight:800; line-height:1.25; margin-bottom:3px;">האתר שלנו</div>
                        <div style="color:#6b6b6b; font-size:12px; line-height:1.35; margin-bottom:8px;">בודקי זכאות ומדריכים</div>
                        <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;"><tr><td bgcolor="#EA6A4C" align="center" style="background-color:#EA6A4C; border-radius:14px;"><a href="https://ho-me.org.il/" target="_blank" rel="noopener" style="display:inline-block; color:#3d1405; text-decoration:none; font-size:12px; font-weight:800; padding:6px 10px; border-radius:14px; line-height:1.2;">לאתר</a></td></tr></table>
                      </td></tr>
                    </table>
                  </td>
                  <td width="33%" valign="top" style="width:33%; padding:0 3px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#f0fafa" style="background-color:#f0fafa; border:1px solid #d8eded; border-radius:10px;">
                      <tr><td bgcolor="#f0fafa" align="center" valign="top" style="background-color:#f0fafa; padding:10px 4px 10px 4px;">
                        <div style="font-size:17px; line-height:1; margin-bottom:4px;">&#9993;</div>
                        <div style="color:#0d6b6a; font-size:13px; font-weight:800; line-height:1.25; margin-bottom:3px;">קבוצת המייל</div>
                        <div style="color:#6b6b6b; font-size:12px; line-height:1.35; margin-bottom:8px;">עדכונים בין הגיליונות</div>
                        <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;"><tr><td bgcolor="#1CA6A6" align="center" style="background-color:#1CA6A6; border-radius:14px;"><a href="https://groups.google.com/a/ho-me.org.il/g/bs" target="_blank" rel="noopener" style="display:inline-block; color:#06302f; text-decoration:none; font-size:12px; font-weight:800; padding:6px 10px; border-radius:14px; line-height:1.2;">להצטרפות</a></td></tr></table>
                      </td></tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- פוטר -->
          <tr>
            <td class="px" bgcolor="#562E8C" style="background-color:#562E8C; padding:20px 18px 24px 18px;" align="center">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin-bottom:12px;"><tr>
                <td style="padding:0 2px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td width="11" height="11" bgcolor="#EA6A4C" style="width:11px; height:11px; background-color:#EA6A4C; border-radius:3px; font-size:0; line-height:11px;">&nbsp;</td></tr></table></td>
                <td style="padding:0 2px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td width="11" height="11" bgcolor="#FFD455" style="width:11px; height:11px; background-color:#FFD455; border-radius:3px; font-size:0; line-height:11px;">&nbsp;</td></tr></table></td>
                <td style="padding:0 2px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td width="11" height="11" bgcolor="#ffffff" style="width:11px; height:11px; background-color:#ffffff; border-radius:3px; font-size:0; line-height:11px;">&nbsp;</td></tr></table></td>
                <td style="padding:0 2px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td width="11" height="11" bgcolor="#1CA6A6" style="width:11px; height:11px; background-color:#1CA6A6; border-radius:3px; font-size:0; line-height:11px;">&nbsp;</td></tr></table></td>
              </tr></table>
              <div style="color:#ffffff; font-size:17px; font-weight:800; margin-bottom:2px;">הורה ומיוחד</div>
              <div style="color:#FFD455; font-size:12px; font-weight:700; margin-bottom:10px;">ביחד אנחנו חזקים</div>
              <div style="color:#cbbde8; font-size:12px; line-height:1.8;">
                עמותה רשומה ע״ר 580715282<br>
                בית שמש, פומבדיתא 1 · ירושלים, הצבי 15<br>
                02-5023456 · <a href="mailto:a@ho-me.org.il" style="color:#FFD455; text-decoration:none;">a@ho-me.org.il</a> · <a href="https://ho-me.org.il/" style="color:#FFD455; text-decoration:none;">ho-me.org.il</a>
              </div>
              <div style="margin-top:12px; color:#b8abd8; font-size:12px; line-height:1.6;">
                המידע כללי, אינו כולל סכומים, ואינו תחליף לייעוץ אישי. הסכומים והתנאים מתעדכנים בתחילת כל שנה.<br>
                הדף עוצב לפי תקן ישראלי 5568 (WCAG 2.1 AA). <a href="https://ho-me.org.il/" style="color:#FFD455; text-decoration:underline;">להצהרת הנגישות ולתפריט הנגישות באתר</a><br>
                <a href="https://ho-me.org.il/newsletter/" style="color:#cbbde8;">כל הגיליונות</a>
              </div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>
`;
}

// בדיקות התוכן של CLAUDE.md סעיף 6.8 על גיליון מוכן.
function contentProblems(html) {
  const text = html.replace(/<(style|script)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ');
  const count = pattern => (html.match(pattern) || []).length;
  const problems = [];
  if (/o@ho-me/i.test(html)) problems.push('מופיעה הכתובת o@ho-me.org.il');
  if (/[—–]/.test(text)) problems.push('יש בטקסט קו מפריד ארוך');
  if (/₪|ש["״]ח|\d\s*%|\d[\d,.]*\s*שקל|אחוז/.test(text)) problems.push('נראה שיש בטקסט סכום או אחוז');
  if (/\b(השבוע|עכשיו|לאחרונה|החודש|השנה הזו|לפני החגים)\b/.test(text.replace(/כתבת השבוע|זכות השבוע/g, ''))) problems.push('יש ניסוח תלוי זמן ("השבוע", "עכשיו" וכדומה)');
  if (count(/<tr[\s>]/gi) !== count(/<\/tr>/gi)) problems.push('מספר תגי <tr> ו-</tr> לא שווה');
  if (count(/<td[\s>]/gi) !== count(/<\/td>/gi)) problems.push('מספר תגי <td> ו-</td> לא שווה');
  return problems;
}

module.exports = { renderIssue, contentProblems, escapeHtml, prettyDate };
