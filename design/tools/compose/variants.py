"""Compose batch 8 variants: laptop DSC workspace (1920×1080 at 150 %, CSS 1280×720) with the task panel
collapsed and as an overlay, and the Arabic RTL Directory."""
import re
from pathlib import Path

S = Path("design/screens")


def sub(s: str, pattern: str, repl: str, count: int = 1) -> str:
    out, n = re.subn(pattern, lambda m: repl, s, count=count, flags=re.S)
    assert n >= 1, pattern[:70]
    return out


# ── 24 Laptop DSC ─────────────────────────────────────────────────────────────
base = (S / "03-dsc-perfusion.html").read_text(encoding="utf-8")
base = re.sub(r"<!-- Icon sprite.*?</svg>\n", "<!-- gen:sprite -->\n<!-- /gen:sprite -->\n", base, count=1, flags=re.S)
base = re.sub(r"  <!-- =+ Context menu.*?\n  </div>\n(?=\n</div>\n</body>)", "", base, flags=re.S)
s = base.replace('<meta name="viewport" content="width=1920, height=1080">', '<meta name="viewport" content="width=1280, height=720">\n<meta name="nm-viewport" content="1280x720@1.5">')
s = s.replace('<div class="app">', '<div class="app app--laptop">', 1)
# banner keeps SAFE-001 fields (name, ID, sex, age, study date); modality and accession move to the tooltip
s = sub(s, r'\n      <span class="bf"><span class="bf__k">Modality</span>.*?</span></span>\n      <span class="bf"><span class="bf__k">Acc</span>.*?</span></span>', "")
s = s.replace('<span class="bf__k">(DOB 1970-01-01)</span>', "")
s = s.replace('<span class="bf"><span class="bf__k">Search studies', '<span class="bf"><span class="bf__k">Search studies')
# toolbar: panel toggle first, icon-only outputs, role pager for the four viewport roles
s = s.replace('<div class="toolbar" role="toolbar" aria-label="Viewer tools" data-od-id="toolbar">\n', '<div class="toolbar" role="toolbar" aria-label="Viewer tools" data-od-id="toolbar">\n    <button class="ibtn" aria-label="Task guidance (Ctrl+B)" data-od-id="tb-panel"><svg class="ic"><use href="#i-collapse"/></svg></button>\n    <span class="tb-sep"></span>\n', 1)
s = sub(s, r'    <button class="ibtn" aria-label="Draw ROI: spline \(C\)">.*?</button>\n', "")
s = sub(s, r'    <button class="ibtn" aria-label="Draw ROI: freehand \(F\)">.*?</button>\n', "")
s = sub(s, r'\n      <span class="tip tip--below" role="tooltip">Mirror line <span class="kbd">L</span></span>', "")
s = sub(s, r'    <button class="picker" aria-label="Layout 2×2 \(Ctrl\+L\)".*?</button>', '''    <div class="seg" role="radiogroup" aria-label="Viewport roles (F6)" style="width: calc(var(--nm-space-12) * 4.5)" data-od-id="role-pager">
      <button class="seg__item is-selected" role="radio" aria-checked="true">1·2 Source · Maps</button>
      <button class="seg__item" role="radio">3·4 Table · Graph</button>
    </div>
    <span class="kbd">F6</span>''')
s = sub(s, r'    <button class="ibtn" aria-label="Bookmarks \(B\)">.*?</button>\n', "")
s = sub(s, r'    <button class="btn btn--secondary btn--dense" data-od-id="tb-generate-series">.*?</button>', '    <button class="ibtn" aria-label="Generate series (Ctrl+G)"><svg class="ic"><use href="#i-series"/></svg></button>')
s = sub(s, r'    <button class="btn btn--secondary btn--dense" data-od-id="tb-save-tables">.*?</button>', '    <button class="ibtn" aria-label="Save tables (Ctrl+S)"><svg class="ic"><use href="#i-table-save"/></svg></button>')
s = sub(s, r'    <button class="btn btn--ghost btn--dense" data-od-id="tb-report">.*?</button>', '    <button class="ibtn" aria-label="Report (Ctrl+P)"><svg class="ic"><use href="#i-reports"/></svg></button>')
# 1×2: keep viewports 1 and 2, drop 3 and 4 (reachable with F6)
s = sub(s, r'\n    <!-- VP3 · Table ↔ Anatomical -->.*?(?=\n  </main>)', "")
s = s.replace('<main class="vgrid" aria-label="Viewports" data-od-id="viewport-grid">', '<main class="vgrid vgrid--1x2" aria-label="Viewports" data-od-id="viewport-grid">')
s = s.replace('<div class="vp__body">\n        <div class="vp__stage">', '<div class="vp__body vp__body--fit">\n        <div class="vp__stage">')
# no inspector column on the laptop tier
s = sub(s, r'\n  <!-- =+ Inspector \(280, open\) =+ -->.*?</aside>\n', "\n")
# battery notice in the status bar (brief §12.2)
s = sub(s, r'<span class="sb-item">Licence <b>active</b></span>', '<span class="sb-item"><span class="dot dot--warning"></span>On battery — long computations run slower</span>')
s = sub(s, r'    <span class="sb-item"><svg class="ic"><use href="#i-display"/></svg><b>Diagnostic display</b></span>\n    <span class="sb-sep"></span>\n', "")
collapsed = s.replace("<title>NeuroMR-PRO · DSC Neuro Perfusion</title>", "<title>NeuroMR-PRO · DSC Neuro Perfusion (laptop)</title>")
(S / "24-laptop-dsc.html").write_text(collapsed, encoding="utf-8", newline="\n")
overlay = s.replace("<title>NeuroMR-PRO · DSC Neuro Perfusion</title>", "<title>NeuroMR-PRO · DSC Neuro Perfusion (laptop, task panel open)</title>")
overlay = overlay.replace('<aside class="panel" aria-label="Task guidance" data-od-id="task-panel">', '<aside class="panel panel--overlay" aria-label="Task guidance" data-od-id="task-panel">')
overlay = overlay.replace('<button class="ibtn" aria-label="Task guidance (Ctrl+B)" data-od-id="tb-panel">', '<button class="ibtn is-active" aria-pressed="true" aria-label="Task guidance (Ctrl+B)" data-od-id="tb-panel">')
(S / "24-laptop-dsc-panel.html").write_text(overlay, encoding="utf-8", newline="\n")

# ── 24 Arabic RTL Directory ───────────────────────────────────────────────────
d = (S / "01-study-directory.html").read_text(encoding="utf-8")
d = re.sub(r"<!-- (/?)gen:(?!sprite)[\w-]+ -->\n", "", d)  # freeze generated chrome so it can be translated
d = d.replace('<html lang="en">', '<html lang="ar" dir="rtl">').replace("<title>NeuroMR-PRO · Study Directory</title>", "<title>NeuroMR-PRO · دليل الدراسات</title>")
AR = [
    ('aria-label="Directory (Ctrl+1)"><svg class="ic"><use href="#i-directory"/></svg>Directory', 'aria-label="الدليل (Ctrl+1)"><svg class="ic"><use href="#i-directory"/></svg>الدليل'),
    ('aria-label="Viewer (Ctrl+2)"><svg class="ic"><use href="#i-viewer"/></svg>Viewer', 'aria-label="العارض (Ctrl+2)"><svg class="ic"><use href="#i-viewer"/></svg>العارض'),
    ('aria-label="Analysis (Ctrl+3)"><svg class="ic"><use href="#i-analysis"/></svg>Analysis', 'aria-label="التحليل (Ctrl+3)"><svg class="ic"><use href="#i-analysis"/></svg>التحليل'),
    ('aria-label="Reports (Ctrl+4)"><svg class="ic"><use href="#i-reports"/></svg>Reports', 'aria-label="التقارير (Ctrl+4)"><svg class="ic"><use href="#i-reports"/></svg>التقارير'),
    ('aria-label="Settings (Ctrl+,)"><svg class="ic"><use href="#i-settings"/></svg>Settings', 'aria-label="الإعدادات (Ctrl+,)"><svg class="ic"><use href="#i-settings"/></svg>الإعدادات'),
    ('<span class="bf__k">ID</span>', '<span class="bf__k">المعرّف</span>'), ('<span class="bf__k">Sex</span>', '<span class="bf__k">الجنس</span>'),
    ('<span class="bf__k">Age</span><span class="bf__v">56 y</span><span class="bf__k">(DOB 1970-01-01)</span>', '<span class="bf__k">العمر</span><span class="bf__v">56 سنة</span><span class="bf__k">(الميلاد <span class="ltr">1970-01-01</span>)</span>'),
    ('<span class="bf__k">Study</span>', '<span class="bf__k">الدراسة</span>'), ('<span class="bf__k">Modality</span>', '<span class="bf__k">الطريقة</span>'), ('<span class="bf__k">Acc</span>', '<span class="bf__k">رقم الطلب</span>'),
    ('<h1 class="panel__title">Sources</h1>', '<h1 class="panel__title">المصادر</h1>'),
    ('<span class="eyebrow">This workstation</span>', '<span class="eyebrow">محطة العمل هذه</span>'),
    ('<b>Local store</b><span class="t2">2 studies</span><span class="src__sub">Encrypted cache · 1 patient</span>', '<b>المخزن المحلي</b><span class="t2">الدراسات: 2</span><span class="src__sub">ذاكرة مؤقتة مشفّرة · مريض واحد</span>'),
    ('<span>DICOM receiver</span>', '<span>مستقبِل DICOM</span>'), ('AE NEUROMR · port 11112 · listening', 'AE NEUROMR · المنفذ 11112 · قيد الاستماع'),
    ('<span class="eyebrow">Import</span>', '<span class="eyebrow">الاستيراد</span>'), ('Folder… <span class="kbd">Ctrl+O</span>', 'مجلد… <span class="kbd">Ctrl+O</span>'),
    ('Imported files are classified and pre-processed in the background.', 'تُصنَّف الملفات المستوردة وتُعالَج مسبقًا في الخلفية.'),
    ('<span class="eyebrow">PACS nodes</span>', '<span class="eyebrow">عُقد PACS</span>'), ('<button class="link dense">Configure</button>', '<button class="link dense">تهيئة</button>'),
    ('<span>Site PACS</span>', '<span>PACS الموقع</span>'), ('<span>Research archive</span>', '<span>أرشيف البحث</span>'), ('AE RES_ARCH · not checked', 'AE RES_ARCH · لم يُفحص'),
    ('1 file from the last import was quarantined because it has no pixel data — <button class="link dense">review quarantine</button>.', 'عُزل ملف واحد من آخر استيراد لأنه بلا بيانات بكسل — <button class="link dense">مراجعة العزل</button>.'),
    ('<span>Patient name, ID or accession</span>', '<span>اسم المريض أو المعرّف أو رقم الطلب</span>'),
    ('Date: any<', 'التاريخ: أي<'), ('Modality: MR<', 'الطريقة: MR<'), ('Series type: all<', 'نوع السلسلة: الكل<'),
    ('Query PACS… <span class="kbd">Ctrl+Q</span>', 'استعلام PACS… <span class="kbd">Ctrl+Q</span>'), ('>Add to running session<', '>إضافة إلى الجلسة الجارية<'),
    ('<h2>Studies</h2><span class="dense t3">2 of 2 · local store</span>', '<h2>الدراسات</h2><span class="dense t3">2 من 2 · المخزن المحلي</span>'),
    ('<th>Patient</th><th>Patient ID</th><th>Birth date</th><th>Sex</th><th>Study date</th><th>Description</th><th class="num">Series</th><th class="num">Images</th><th>Modality</th><th>Accession</th>',
     '<th>المريض</th><th>معرّف المريض</th><th>تاريخ الميلاد</th><th>الجنس</th><th>تاريخ الدراسة</th><th>الوصف</th><th class="num">السلاسل</th><th class="num">الصور</th><th>الطريقة</th><th>رقم الطلب</th>'),
    ('<h2>Series</h2><span class="dense t3">2026-01-01 · 15 series · 1 selected</span><span class="spacer"></span><span class="dense t3">Ctrl+click or Shift+click to select several</span>',
     '<h2>السلاسل</h2><span class="dense t3"><span class="ltr">2026-01-01</span> · 15 سلسلة · واحدة محددة</span><span class="spacer"></span><span class="dense t3">انقر مع Ctrl أو Shift لتحديد عدة سلاسل</span>'),
    ('<th class="num">#</th><th>Series description</th><th>Type</th><th class="num">Images</th><th>Dimensions</th><th>Status</th>', '<th class="num">#</th><th>وصف السلسلة</th><th>النوع</th><th class="num">الصور</th><th>الأبعاد</th><th>الحالة</th>'),
    ('</span> Ready</td>', '</span> جاهزة</td>'), ('<span class="t2">Pre-processing</span><button class="link dense">Cancel</button>', '<span class="t2">معالجة مسبقة</span><button class="link dense">إلغاء</button>'),
    ('<h2 class="panel__title">Open with</h2>', '<h2 class="panel__title">فتح باستخدام</h2>'),
    ('<span class="lx__name">DSC Neuro Perfusion</span>', '<span class="lx__name">تروية DSC العصبية</span>'), ('Mismatch available: DTI 32dir has 2 b-values', 'عدم التطابق متاح: لدى <span class="ltr">DTI 32dir</span> قيمتا b'),
    ('<span class="lx__name">DCE / T1 Perfusion</span>', '<span class="lx__name">تروية DCE / T1</span>'), ('<span class="lx__name">Brain Function</span>', '<span class="lx__name">وظائف الدماغ</span>'),
    ('<span class="lx__name">Longitudinal Brain Analysis</span>', '<span class="lx__name">تحليل الدماغ الطولي</span>'), ('<span class="lx__name">Subtraction</span>', '<span class="lx__name">الطرح</span>'),
    ('<span class="lx__name">Permeability</span>', '<span class="lx__name">النفاذية</span>'), ('<span class="lx__name">Diffusion</span>', '<span class="lx__name">الانتشار</span>'),
    ('<span class="lx__name">Tractography</span>', '<span class="lx__name">تتبّع الألياف</span>'), ('<span class="lx__name">Advanced Diffusion</span>', '<span class="lx__name">الانتشار المتقدّم</span>'),
    ('<span class="lx__name">Spectroscopy</span>', '<span class="lx__name">التحليل الطيفي</span>'), ('<span class="lx__name">Echo Accumulation</span>', '<span class="lx__name">تجميع الأصداء</span>'),
    ('Needs a non-dynamic T1 reference series for the baseline T1 map.', 'تحتاج إلى سلسلة مرجعية T1 غير ديناميكية لخريطة T1 الأساسية.'),
    ('Needs at least 2 b-values.', 'تحتاج إلى قيمتَي b على الأقل.'), ('Needs a spectroscopy series.', 'تحتاج إلى سلسلة تحليل طيفي.'),
    ('Needs a series with at least 2 echoes.', 'تحتاج إلى سلسلة بصدَيين على الأقل.'),
    ('Open DSC Neuro Perfusion <span class="kbd">Enter</span>', 'فتح تروية DSC العصبية <span class="kbd">Enter</span>'),
    ('Jobs <b>0 running</b>', 'المهام <b>0 قيد التشغيل</b>'), ('<b>Pre-processing 1 series</b> · DTI multishell 64 %', '<b>معالجة مسبقة لسلسلة واحدة</b> · <span class="ltr">DTI multishell 64 %</span>'),
    ('Engine <span class="dot dot--success"></span><b>connected</b> · local', 'المحرّك <span class="dot dot--success"></span><b>متصل</b> · محلي'),
    ('Licence <b>active</b>', 'الترخيص <b>نشط</b>'), ('<b>Diagnostic display</b>', '<b>شاشة تشخيصية</b>'), ('<span class="kbd">?</span> shortcuts', '<span class="kbd">?</span> الاختصارات'),
]
for en, ar in AR:
    assert en in d, en[:60]
    d = d.replace(en, ar)
d = d.replace("<!-- Study Directory and launcher (DIR-001…006).", "<!-- Arabic RTL variant of the Study Directory (brief §12.8): chrome mirrors; patient names, IDs, DICOM text,\n     dates and numbers stay left-to-right with Western digits; thumbnails never mirror.\n     Study Directory and launcher (DIR-001…006).")
(S / "24-rtl-directory.html").write_text(d, encoding="utf-8", newline="\n")
print("ok")
