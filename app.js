/**
 * AI İşletme Asistanı — Tek Dosya Render Uygulaması
 * -------------------------------------------------
 * Çalıştırma:
 *   node ai_isletme_asistani_app.js
 *
 * Render:
 *   Runtime: Node
 *   Start Command: node ai_isletme_asistani_app.js
 *
 * Opsiyonel gerçek AI:
 *   OPENAI_API_KEY=...
 *   OPENAI_MODEL=gpt-5.2
 *
 * Not:
 * - Harici npm paketi yoktur.
 * - Demo verileri tarayıcı localStorage'ında saklanır.
 * - OPENAI_API_KEY yoksa AI asistanı yerel demo cevapları üretir.
 */

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT || 3000);
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5.2";

const source = fs.readFileSync(__filename, "utf8");
const startMarker = "/*__HTML_START__";
const endMarker = "__HTML_END__*/";
const htmlStart = source.indexOf(startMarker) + startMarker.length;
const htmlEnd = source.lastIndexOf(endMarker);
const HTML = source.slice(htmlStart, htmlEnd);

function send(res, status, body, type = "text/plain; charset=utf-8") {
  res.writeHead(status, {
    "Content-Type": type,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
  });
  res.end(body);
}

function sendJSON(res, status, data) {
  send(res, status, JSON.stringify(data), "application/json; charset=utf-8");
}

function readJSON(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("İstek çok büyük."));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Geçersiz JSON."));
      }
    });
    req.on("error", reject);
  });
}

function extractOpenAIText(data) {
  if (!data) return "";
  if (typeof data.output_text === "string") return data.output_text;

  const parts = [];
  for (const item of Array.isArray(data.output) ? data.output : []) {
    for (const content of Array.isArray(item.content) ? item.content : []) {
      if (content && typeof content.text === "string") parts.push(content.text);
      if (content && content.type === "output_text" && typeof content.text === "string") {
        parts.push(content.text);
      }
    }
  }
  return parts.join("\n").trim();
}

function localAI(question, snapshot) {
  const q = String(question || "").toLocaleLowerCase("tr-TR");
  const s = snapshot || {};

  const money = n =>
    new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency: "TRY",
      maximumFractionDigits: 0,
    }).format(Number(n || 0));

  if (q.includes("kâr") || q.includes("kar")) {
    const revenue = Number(s.revenue || 0);
    const expense = Number(s.expense || 0);
    const profit = revenue - expense;
    return `Mevcut verilere göre gelir ${money(revenue)}, gider ${money(expense)} ve tahmini kâr ${money(profit)}. En hızlı kontrol edilmesi gereken alanlar yüksek gider kalemleri, bekleyen tahsilatlar ve personel maliyetindeki değişimler.`;
  }

  if (q.includes("gider")) {
    return `Gider tarafında toplam ${money(s.expense || 0)} görünüyor. Tedarik, personel ve operasyon giderlerini ayrı ayrı karşılaştırıp en çok artan kalemi belirlemeni öneririm.`;
  }

  if (q.includes("personel") || q.includes("çalışan")) {
    return `Bugün ${Number(s.activeStaff || 0)} aktif çalışan görünüyor. ${Number(s.missingDocs || 0)} eksik evrak kaydı var. Yoğun vardiyalarda personel dağılımını dengelemek verimliliği artırabilir.`;
  }

  if (q.includes("fatura") || q.includes("ödeme") || q.includes("tahsil")) {
    return `Bekleyen ödeme toplamı ${money(s.pendingPayments || 0)}. ${Number(s.invoiceCount || 0)} fatura kaydı bulunuyor. Önceliği vadesi yaklaşan ve tutarı yüksek olan kalemlere verebilirsin.`;
  }

  return `İşletme özetine göre bugün ${Number(s.activeStaff || 0)} çalışan aktif, bekleyen ödemeler ${money(s.pendingPayments || 0)} ve ${Number(s.missingDocs || 0)} eksik evrak bulunuyor. Sorunu biraz daha özel yazarsan finans, vardiya, personel veya fatura tarafında daha net analiz yapabilirim.`;
}

async function callOpenAI(question, snapshot) {
  const instructions = [
    "Sen küçük ve orta ölçekli işletmeler için Türkçe konuşan bir AI işletme asistanısın.",
    "Kısa, uygulanabilir ve veriye dayalı cevap ver.",
    "Kullanıcının verdiği işletme özetini temel al.",
    "Olmayan verileri uydurma.",
    "Para değerlerinde Türk Lirası kullan.",
  ].join(" ");

  const input =
    `Kullanıcı sorusu: ${question}\n\n` +
    `İşletme özeti JSON: ${JSON.stringify(snapshot || {})}`;

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      instructions,
      input,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    const msg = data?.error?.message || `OpenAI API hatası (${response.status})`;
    throw new Error(msg);
  }

  return extractOpenAIText(data) || "Yanıt oluşturulamadı.";
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (req.method === "GET" && url.pathname === "/api/health") {
    return sendJSON(res, 200, {
      ok: true,
      app: "AI İşletme Asistanı",
      aiConfigured: Boolean(OPENAI_API_KEY),
      model: OPENAI_API_KEY ? OPENAI_MODEL : "local-demo",
    });
  }

  if (req.method === "POST" && url.pathname === "/api/ai") {
    try {
      const body = await readJSON(req);
      const question = String(body.question || "").trim();
      const snapshot = body.snapshot || {};

      if (!question) {
        return sendJSON(res, 400, { error: "Soru boş olamaz." });
      }

      const answer = OPENAI_API_KEY
        ? await callOpenAI(question, snapshot)
        : localAI(question, snapshot);

      return sendJSON(res, 200, {
        answer,
        mode: OPENAI_API_KEY ? "openai" : "local-demo",
      });
    } catch (err) {
      return sendJSON(res, 500, { error: err.message || "Sunucu hatası." });
    }
  }

 if (req.method === "GET" && url.pathname === "/favicon.ico") {
  return send(res, 204, "");
}

if (req.method === "GET") {
  return send(res, 200, HTML, "text/html; charset=utf-8");
}

return sendJSON(res, 404, { error: "Bulunamadı." });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`AI İşletme Asistanı çalışıyor: http://localhost:${PORT}`);
  console.log(`AI modu: ${OPENAI_API_KEY ? `OpenAI / ${OPENAI_MODEL}` : "Yerel demo"}`);
});

/*__HTML_START__
<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
  <meta name="theme-color" content="#f6f8fc" />
  <title>AI İşletme Asistanı</title>
  <style>
    :root{
      --bg:#f5f7fb;
      --surface:#ffffff;
      --surface-2:#f9fbff;
      --surface-3:#eef4ff;
      --text:#17213a;
      --muted:#73809a;
      --line:#e7ebf2;
      --blue:#3978ff;
      --blue2:#6ea0ff;
      --green:#20b985;
      --orange:#f2a63b;
      --red:#ef5b67;
      --violet:#7d6df2;
      --shadow:0 14px 36px rgba(20,36,74,.08);
      --radius:18px;
      --sidebar:250px;
    }

    body.dark{
      --bg:#0f1522;
      --surface:#151d2c;
      --surface-2:#192335;
      --surface-3:#1b2a47;
      --text:#edf3ff;
      --muted:#98a6bf;
      --line:#273248;
      --shadow:0 16px 36px rgba(0,0,0,.24);
    }

    *{box-sizing:border-box}
    html{scroll-behavior:smooth}
    body{
      margin:0;
      font-family:Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;
      color:var(--text);
      background:
        radial-gradient(circle at 80% 0%, rgba(57,120,255,.08), transparent 28%),
        var(--bg);
      min-height:100vh;
    }

    button,input,select,textarea{font:inherit}
    button{cursor:pointer}
    a{color:inherit}
    .app{display:grid;grid-template-columns:var(--sidebar) 1fr;min-height:100vh}
    .sidebar{
      position:sticky;top:0;height:100vh;padding:22px 16px;
      background:color-mix(in srgb,var(--surface) 96%, transparent);
      border-right:1px solid var(--line);
      backdrop-filter:blur(18px);z-index:20;
    }
    .brand{display:flex;align-items:center;gap:11px;padding:8px 10px 26px}
    .logo{
      width:38px;height:38px;border-radius:12px;display:grid;place-items:center;
      background:linear-gradient(145deg,var(--blue),#74a8ff);color:white;font-weight:900;
      box-shadow:0 10px 25px rgba(57,120,255,.25);
    }
    .brand strong{font-size:16px;letter-spacing:-.2px}
    .brand small{display:block;color:var(--muted);margin-top:3px}
    .nav{display:flex;flex-direction:column;gap:7px}
    .nav button{
      border:0;background:transparent;color:var(--muted);display:flex;align-items:center;
      width:100%;gap:12px;padding:12px 13px;border-radius:13px;text-align:left;font-weight:650;
    }
    .nav button:hover,.nav button.active{background:var(--surface-3);color:var(--blue)}
    .nav .ico{width:28px;height:28px;display:grid;place-items:center;border-radius:9px;background:var(--surface-2)}
    .sidebar-bottom{position:absolute;bottom:20px;left:16px;right:16px}
    .mini-card{border:1px solid var(--line);background:var(--surface-2);border-radius:16px;padding:14px}
    .mini-card b{display:block;margin-bottom:5px}
    .mini-card p{font-size:12px;color:var(--muted);margin:0 0 12px;line-height:1.5}

    .main{min-width:0}
    .topbar{
      position:sticky;top:0;z-index:15;display:flex;align-items:center;justify-content:space-between;
      gap:16px;padding:16px 28px;background:color-mix(in srgb,var(--bg) 84%, transparent);
      backdrop-filter:blur(20px);border-bottom:1px solid color-mix(in srgb,var(--line) 75%, transparent);
    }
    .search{
      flex:1;max-width:520px;display:flex;align-items:center;gap:10px;
      background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:10px 13px;
    }
    .search input{border:0;outline:0;background:transparent;color:var(--text);width:100%}
    .top-actions{display:flex;align-items:center;gap:9px}
    .icon-btn{
      width:42px;height:42px;border:1px solid var(--line);background:var(--surface);
      border-radius:13px;color:var(--text);display:grid;place-items:center;
    }
    .profile{
      display:flex;align-items:center;gap:10px;padding:6px 8px 6px 6px;border:1px solid var(--line);
      border-radius:14px;background:var(--surface)
    }
    .avatar{width:34px;height:34px;border-radius:11px;display:grid;place-items:center;background:#13203c;color:white;font-weight:800}
    .profile div div{font-size:13px;font-weight:800}.profile small{font-size:11px;color:var(--muted)}

    .content{padding:26px 28px 90px;max-width:1600px;margin:auto}
    .page{display:none}.page.active{display:block}
    .hero{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:22px}
    .hero h1{font-size:28px;letter-spacing:-.8px;margin:0 0 7px}
    .hero p{margin:0;color:var(--muted)}
    .date-pill{border:1px solid var(--line);border-radius:14px;padding:10px 13px;background:var(--surface);color:var(--muted);font-size:13px}

    .stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-bottom:16px}
    .stat{
      border:1px solid var(--line);background:var(--surface);border-radius:var(--radius);
      padding:17px;box-shadow:var(--shadow);position:relative;overflow:hidden;
    }
    .stat:after{content:"";position:absolute;width:80px;height:80px;border-radius:50%;right:-28px;top:-28px;background:var(--tint)}
    .stat-top{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}
    .stat-icon{width:42px;height:42px;border-radius:13px;display:grid;place-items:center;background:var(--tint);font-size:20px}
    .stat-label{font-size:12px;color:var(--muted);font-weight:750;margin-top:12px}
    .stat-value{font-size:26px;font-weight:900;letter-spacing:-.8px;margin:4px 0}
    .stat-note{font-size:11px;color:var(--muted)}
    .blue{--tint:rgba(57,120,255,.11)} .green{--tint:rgba(32,185,133,.12)}
    .orange{--tint:rgba(242,166,59,.14)} .red{--tint:rgba(239,91,103,.12)}

    .grid-3{display:grid;grid-template-columns:1.02fr 1.25fr 1fr;gap:14px;margin-top:14px}
    .grid-2{display:grid;grid-template-columns:1.15fr .85fr;gap:14px;margin-top:14px}
    .card{
      border:1px solid var(--line);background:var(--surface);border-radius:var(--radius);
      padding:18px;box-shadow:var(--shadow);min-width:0;
    }
    .card-head{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:15px}
    .card-head h3{font-size:15px;margin:0}.card-head a,.link-btn{font-size:12px;color:var(--blue);font-weight:750;text-decoration:none}
    .muted{color:var(--muted)}
    .tiny{font-size:11px}
    .badge{display:inline-flex;align-items:center;gap:5px;border-radius:999px;padding:5px 9px;font-size:10px;font-weight:800}
    .badge.ok{background:rgba(32,185,133,.12);color:var(--green)}
    .badge.wait{background:rgba(57,120,255,.11);color:var(--blue)}
    .badge.warn{background:rgba(242,166,59,.13);color:#d68920}
    .badge.danger{background:rgba(239,91,103,.12);color:var(--red)}
    .badge.gray{background:var(--surface-2);color:var(--muted)}

    .shift-list,.ai-list{display:flex;flex-direction:column;gap:10px}
    .shift{
      border:1px solid var(--line);border-radius:13px;padding:11px 12px;display:grid;
      grid-template-columns:auto 1fr auto;align-items:center;gap:10px;background:var(--surface-2)
    }
    .shift .symbol{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;background:var(--surface)}
    .shift b{font-size:12px}.shift small{display:block;color:var(--muted);margin-top:3px;font-size:10px}

    .chart-wrap{height:245px;position:relative}
    canvas{width:100%;height:100%}
    .legend{display:flex;gap:15px;font-size:11px;color:var(--muted);margin-bottom:8px}
    .legend span:before{content:"";display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;background:var(--legend)}
    .legend .lg1{--legend:var(--blue)}.legend .lg2{--legend:var(--green)}

    .ai-item{display:flex;gap:11px;padding:11px;border-radius:13px;background:var(--surface-2);border:1px solid var(--line)}
    .ai-item .symbol{width:34px;height:34px;flex:0 0 auto;display:grid;place-items:center;border-radius:10px;background:var(--surface)}
    .ai-item b{font-size:12px}.ai-item p{font-size:10px;line-height:1.45;color:var(--muted);margin:4px 0 0}
    .ai-box{margin-top:12px;border:1px solid rgba(57,120,255,.18);border-radius:15px;background:linear-gradient(145deg,rgba(57,120,255,.08),rgba(125,109,242,.05));padding:13px}
    .ai-title{display:flex;align-items:center;gap:9px;font-weight:850;font-size:13px}
    .bot{width:30px;height:30px;border-radius:10px;background:var(--blue);color:white;display:grid;place-items:center}
    .chips{display:flex;gap:7px;flex-wrap:wrap;margin:10px 0}
    .chip{border:1px solid var(--line);background:var(--surface);color:var(--muted);padding:7px 9px;border-radius:999px;font-size:10px}
    .ai-input{display:flex;gap:7px}
    .ai-input input{flex:1;min-width:0;border:1px solid var(--line);background:var(--surface);color:var(--text);border-radius:12px;padding:10px;outline:0}
    .send{border:0;background:var(--blue);color:white;width:40px;border-radius:12px;font-weight:900}
    .ai-answer{margin-top:10px;font-size:12px;line-height:1.55;white-space:pre-wrap;color:var(--text)}

    .table-wrap{overflow:auto;border:1px solid var(--line);border-radius:14px}
    table{width:100%;border-collapse:collapse;min-width:650px}
    th,td{padding:12px 13px;text-align:left;border-bottom:1px solid var(--line);font-size:12px}
    th{color:var(--muted);font-size:10px;text-transform:uppercase;letter-spacing:.6px;background:var(--surface-2)}
    tr:last-child td{border-bottom:0}
    .person{display:flex;align-items:center;gap:9px}
    .face{width:32px;height:32px;border-radius:10px;display:grid;place-items:center;background:var(--surface-3);font-weight:850;color:var(--blue)}

    .toolbar{display:flex;gap:9px;flex-wrap:wrap;align-items:center;margin-bottom:14px}
    .btn{
      border:1px solid var(--line);background:var(--surface);color:var(--text);
      padding:10px 13px;border-radius:12px;font-weight:750;font-size:12px;
    }
    .btn.primary{background:var(--blue);border-color:var(--blue);color:white}
    .btn.danger{color:var(--red)}
    .btn:hover{transform:translateY(-1px)}
    .field{
      border:1px solid var(--line);background:var(--surface);color:var(--text);
      padding:10px 11px;border-radius:12px;outline:0
    }
    select.field{min-width:140px}
    .section-title{margin:0 0 15px;font-size:22px;letter-spacing:-.5px}
    .section-sub{color:var(--muted);margin:-8px 0 20px;font-size:13px}

    .report-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
    .metric{font-size:28px;font-weight:900;margin-top:8px}
    .progress{height:9px;background:var(--surface-2);border-radius:99px;overflow:hidden;margin-top:12px}
    .progress span{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,var(--blue),var(--violet))}

    .empty{padding:35px;text-align:center;color:var(--muted)}
    .mobile-nav{display:none}

    .modal-backdrop{
      position:fixed;inset:0;background:rgba(5,11,25,.48);z-index:80;display:none;place-items:center;padding:18px;
      backdrop-filter:blur(5px)
    }
    .modal-backdrop.show{display:grid}
    .modal{width:min(560px,100%);background:var(--surface);border-radius:20px;border:1px solid var(--line);box-shadow:0 30px 80px rgba(0,0,0,.28);padding:20px}
    .modal h3{margin:0}.modal-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px}
    .close{border:0;background:var(--surface-2);color:var(--text);width:36px;height:36px;border-radius:11px}
    .form-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
    .form-group{display:flex;flex-direction:column;gap:6px}
    .form-group.full{grid-column:1/-1}
    .form-group label{font-size:11px;color:var(--muted);font-weight:750}
    .form-group input,.form-group select,.form-group textarea{
      border:1px solid var(--line);background:var(--surface-2);color:var(--text);padding:11px;border-radius:12px;outline:0;width:100%
    }
    .modal-actions{display:flex;justify-content:flex-end;gap:9px;margin-top:16px}

    .toast{
      position:fixed;right:24px;bottom:24px;z-index:100;background:#15203a;color:white;
      border-radius:14px;padding:12px 15px;box-shadow:0 16px 40px rgba(0,0,0,.25);
      transform:translateY(30px);opacity:0;pointer-events:none;transition:.25s;font-size:12px
    }
    .toast.show{transform:none;opacity:1}

    @media(max-width:1150px){
      :root{--sidebar:210px}
      .stats{grid-template-columns:repeat(2,1fr)}
      .grid-3{grid-template-columns:1fr 1fr}
      .grid-3>.card:last-child{grid-column:1/-1}
      .report-grid{grid-template-columns:1fr 1fr}
    }
    @media(max-width:780px){
      .app{display:block}
      .sidebar{display:none}
      .topbar{padding:12px 14px}
      .search{display:none}
      .profile div{display:none}
      .content{padding:18px 14px 100px}
      .hero{align-items:flex-start}.hero h1{font-size:22px}.date-pill{display:none}
      .stats{grid-template-columns:1fr 1fr;gap:10px}
      .stat{padding:14px}.stat-value{font-size:20px}
      .grid-3,.grid-2,.report-grid{grid-template-columns:1fr}
      .grid-3>.card:last-child{grid-column:auto}
      .mobile-nav{
        position:fixed;display:grid;grid-template-columns:repeat(5,1fr);bottom:0;left:0;right:0;z-index:40;
        padding:8px 8px calc(8px + env(safe-area-inset-bottom));background:color-mix(in srgb,var(--surface) 94%,transparent);
        border-top:1px solid var(--line);backdrop-filter:blur(20px)
      }
      .mobile-nav button{border:0;background:transparent;color:var(--muted);font-size:9px;padding:5px 2px}
      .mobile-nav button span{display:block;font-size:18px;margin-bottom:3px}
      .mobile-nav button.active{color:var(--blue)}
      .form-grid{grid-template-columns:1fr}.form-group.full{grid-column:auto}
    }
    @media(max-width:430px){
      .stats{grid-template-columns:1fr 1fr}
      .stat-label{font-size:10px}.stat-note{display:none}
      .card{padding:14px}
    }
  </style>
</head>
<body>
<div class="app">
  <aside class="sidebar">
    <div class="brand">
      <div class="logo">AI</div>
      <div><strong>AI İşletme Asistanı</strong><small>Akıllı işletme yönetimi</small></div>
    </div>
    <nav class="nav" id="desktopNav">
      <button class="active" data-page="dashboard"><span class="ico">⌂</span>Ana Sayfa</button>
      <button data-page="shifts"><span class="ico">◷</span>Vardiyalar</button>
      <button data-page="staff"><span class="ico">♟</span>Personel</button>
      <button data-page="invoices"><span class="ico">▤</span>Faturalar</button>
      <button data-page="expenses"><span class="ico">₺</span>Giderler</button>
      <button data-page="reports"><span class="ico">▥</span>Raporlar</button>
      <button data-page="settings"><span class="ico">⚙</span>Ayarlar</button>
    </nav>
    <div class="sidebar-bottom">
      <div class="mini-card">
        <b>✨ AI Asistan aktif</b>
        <p>İşletme verilerini özetleyip finans, personel ve operasyon sorularını yanıtlar.</p>
        <button class="btn primary" style="width:100%" onclick="goPage('dashboard');focusAI()">AI'a Sor</button>
      </div>
    </div>
  </aside>

  <main class="main">
    <header class="topbar">
      <div class="search">⌕ <input id="globalSearch" placeholder="İşletmenizde ara..." /></div>
      <div class="top-actions">
        <button class="icon-btn" id="themeBtn" title="Tema">☾</button>
        <button class="icon-btn" id="resetBtn" title="Demo verilerini sıfırla">↺</button>
        <div class="profile">
          <div class="avatar">DK</div>
          <div><div>Demir Kaya</div><small>İşletme Sahibi</small></div>
        </div>
      </div>
    </header>

    <div class="content">
      <section class="page active" id="page-dashboard">
        <div class="hero">
          <div>
            <h1>Merhaba, bugün her şey yolunda. 👋</h1>
            <p>İşletmenizin güncel durumunu tek ekrandan takip edin.</p>
          </div>
          <div class="date-pill" id="todayLabel"></div>
        </div>

        <div class="stats">
          <div class="stat green">
            <div class="stat-top"><div class="stat-icon">👥</div><span class="badge ok">Canlı</span></div>
            <div class="stat-label">Bugün Çalışan Personel</div>
            <div class="stat-value" id="statStaff">0</div>
            <div class="stat-note" id="statStaffNote">Toplam personel</div>
          </div>
          <div class="stat blue">
            <div class="stat-top"><div class="stat-icon">◉</div><span class="badge wait">Ödeme</span></div>
            <div class="stat-label">Bekleyen Ödemeler</div>
            <div class="stat-value" id="statPayments">₺0</div>
            <div class="stat-note" id="statPaymentsNote">Bekleyen kayıt</div>
          </div>
          <div class="stat orange">
            <div class="stat-top"><div class="stat-icon">▤</div><span class="badge warn">Fatura</span></div>
            <div class="stat-label">Kesilecek Faturalar</div>
            <div class="stat-value" id="statInvoices">0</div>
            <div class="stat-note" id="statInvoiceTotal">Toplam ₺0</div>
          </div>
          <div class="stat red">
            <div class="stat-top"><div class="stat-icon">⚠</div><span class="badge danger">Dikkat</span></div>
            <div class="stat-label">Eksik Evrak</div>
            <div class="stat-value" id="statDocs">0</div>
            <div class="stat-note">Bugün tamamlanması önerilir</div>
          </div>
        </div>

        <div class="grid-3">
          <div class="card">
            <div class="card-head"><h3>Vardiya Planı</h3><a href="#" onclick="goPage('shifts');return false">Tümünü Gör</a></div>
            <div class="shift-list" id="dashboardShifts"></div>
          </div>

          <div class="card">
            <div class="card-head"><h3>Gelir - Gider Grafiği</h3><span class="badge gray">Son 6 Ay</span></div>
            <div class="legend"><span class="lg1">Gelir</span><span class="lg2">Gider</span></div>
            <div class="chart-wrap"><canvas id="financeChart"></canvas></div>
          </div>

          <div class="card">
            <div class="card-head"><h3>Yapay Zekâ Önerileri</h3><span>✨</span></div>
            <div class="ai-list" id="aiInsights"></div>
            <div class="ai-box">
              <div class="ai-title"><span class="bot">AI</span>AI Asistan</div>
              <div class="chips">
                <button class="chip" onclick="askPreset('Bu ay neden kâr düştü?')">Bu ay neden kâr düştü?</button>
                <button class="chip" onclick="askPreset('Hangi giderler arttı?')">Hangi giderler arttı?</button>
              </div>
              <div class="ai-input">
                <input id="aiQuestion" placeholder="Bir soru sorun..." />
                <button class="send" id="aiSend">➜</button>
              </div>
              <div class="ai-answer" id="aiAnswer"></div>
            </div>
          </div>
        </div>

        <div class="grid-2">
          <div class="card">
            <div class="card-head"><h3>Personel Durumu</h3><a href="#" onclick="goPage('staff');return false">Tüm Personeli Gör</a></div>
            <div class="table-wrap"><table>
              <thead><tr><th>Personel</th><th>Görev</th><th>Durum</th><th>Vardiya</th></tr></thead>
              <tbody id="dashboardStaff"></tbody>
            </table></div>
          </div>
          <div class="card">
            <div class="card-head"><h3>Son Faturalar</h3><a href="#" onclick="goPage('invoices');return false">Tümünü Gör</a></div>
            <div class="table-wrap"><table>
              <thead><tr><th>Fatura</th><th>Tarih</th><th>Tutar</th><th>Durum</th></tr></thead>
              <tbody id="dashboardInvoices"></tbody>
            </table></div>
          </div>
        </div>
      </section>

      <section class="page" id="page-shifts">
        <h2 class="section-title">Vardiyalar</h2>
        <p class="section-sub">Günlük vardiyaları ve personel dağılımını yönetin.</p>
        <div class="toolbar">
          <button class="btn primary" onclick="openForm('shift')">+ Yeni Vardiya</button>
          <input class="field" id="shiftFilter" placeholder="Vardiya ara..." oninput="renderShiftsPage()" />
        </div>
        <div class="card"><div class="table-wrap"><table>
          <thead><tr><th>Vardiya</th><th>Saat</th><th>Kişi</th><th>Durum</th><th>İşlem</th></tr></thead>
          <tbody id="shiftTable"></tbody>
        </table></div></div>
      </section>

      <section class="page" id="page-staff">
        <h2 class="section-title">Personel</h2>
        <p class="section-sub">Personel, görev, vardiya ve evrak durumunu takip edin.</p>
        <div class="toolbar">
          <button class="btn primary" onclick="openForm('staff')">+ Personel Ekle</button>
          <input class="field" id="staffFilter" placeholder="Ad / görev ara..." oninput="renderStaffPage()" />
          <select class="field" id="staffStatusFilter" onchange="renderStaffPage()">
            <option value="">Tüm durumlar</option><option>Çalışıyor</option><option>Mola</option><option>İzinli</option><option>Pasif</option>
          </select>
        </div>
        <div class="card"><div class="table-wrap"><table>
          <thead><tr><th>Personel</th><th>Görev</th><th>Telefon</th><th>Durum</th><th>Evrak</th><th>İşlem</th></tr></thead>
          <tbody id="staffTable"></tbody>
        </table></div></div>
      </section>

      <section class="page" id="page-invoices">
        <h2 class="section-title">Faturalar</h2>
        <p class="section-sub">Kesilecek, bekleyen ve ödenen faturaları yönetin.</p>
        <div class="toolbar">
          <button class="btn primary" onclick="openForm('invoice')">+ Fatura Ekle</button>
          <input class="field" id="invoiceFilter" placeholder="Fatura / müşteri ara..." oninput="renderInvoicesPage()" />
          <select class="field" id="invoiceStatusFilter" onchange="renderInvoicesPage()">
            <option value="">Tüm durumlar</option><option>Taslak</option><option>Kesilecek</option><option>Bekliyor</option><option>Ödendi</option>
          </select>
        </div>
        <div class="card"><div class="table-wrap"><table>
          <thead><tr><th>No</th><th>Müşteri</th><th>Tarih</th><th>Tutar</th><th>Durum</th><th>İşlem</th></tr></thead>
          <tbody id="invoiceTable"></tbody>
        </table></div></div>
      </section>

      <section class="page" id="page-expenses">
        <h2 class="section-title">Giderler</h2>
        <p class="section-sub">İşletme giderlerini kategori bazında izleyin.</p>
        <div class="toolbar">
          <button class="btn primary" onclick="openForm('expense')">+ Gider Ekle</button>
          <input class="field" id="expenseFilter" placeholder="Açıklama / kategori ara..." oninput="renderExpensesPage()" />
        </div>
        <div class="card"><div class="table-wrap"><table>
          <thead><tr><th>Tarih</th><th>Kategori</th><th>Açıklama</th><th>Tutar</th><th>İşlem</th></tr></thead>
          <tbody id="expenseTable"></tbody>
        </table></div></div>
      </section>

      <section class="page" id="page-reports">
        <h2 class="section-title">Raporlar</h2>
        <p class="section-sub">Finans ve operasyon özetlerini hızlıca inceleyin.</p>
        <div class="report-grid">
          <div class="card"><div class="muted tiny">TOPLAM GELİR</div><div class="metric" id="reportRevenue">₺0</div><div class="progress"><span style="width:82%"></span></div></div>
          <div class="card"><div class="muted tiny">TOPLAM GİDER</div><div class="metric" id="reportExpense">₺0</div><div class="progress"><span style="width:64%"></span></div></div>
          <div class="card"><div class="muted tiny">TAHMİNİ KÂR</div><div class="metric" id="reportProfit">₺0</div><div class="progress"><span id="profitBar" style="width:50%"></span></div></div>
          <div class="card"><div class="muted tiny">AKTİF PERSONEL</div><div class="metric" id="reportStaff">0</div><div class="muted tiny">Bugün çalışan personel</div></div>
          <div class="card"><div class="muted tiny">BEKLEYEN TAHSİLAT</div><div class="metric" id="reportPending">₺0</div><div class="muted tiny">Ödenmemiş faturalar</div></div>
          <div class="card"><div class="muted tiny">EKSİK EVRAK</div><div class="metric" id="reportDocs">0</div><div class="muted tiny">Personel kayıtları</div></div>
        </div>
        <div class="grid-2">
          <div class="card">
            <div class="card-head"><h3>6 Aylık Finans Özeti</h3><button class="btn" onclick="exportJSON()">JSON Dışa Aktar</button></div>
            <div class="chart-wrap"><canvas id="reportChart"></canvas></div>
          </div>
          <div class="card">
            <div class="card-head"><h3>Hızlı Dışa Aktarım</h3></div>
            <p class="muted" style="font-size:12px;line-height:1.6">Personel, fatura ve gider verilerini CSV olarak indirebilirsiniz.</p>
            <div style="display:grid;gap:9px">
              <button class="btn" onclick="exportCSV('staff')">Personelleri CSV İndir</button>
              <button class="btn" onclick="exportCSV('invoices')">Faturaları CSV İndir</button>
              <button class="btn" onclick="exportCSV('expenses')">Giderleri CSV İndir</button>
            </div>
          </div>
        </div>
      </section>

      <section class="page" id="page-settings">
        <h2 class="section-title">Ayarlar</h2>
        <p class="section-sub">Arayüz ve uygulama davranışını özelleştirin.</p>
        <div class="grid-2">
          <div class="card">
            <div class="card-head"><h3>Görünüm</h3></div>
            <div style="display:grid;gap:12px">
              <button class="btn" onclick="toggleTheme()">Açık / Koyu Tema Değiştir</button>
              <button class="btn" onclick="resetDemo()">Demo Verilerini Sıfırla</button>
            </div>
          </div>
          <div class="card">
            <div class="card-head"><h3>AI Bağlantısı</h3><span class="badge gray" id="aiModeBadge">Kontrol ediliyor</span></div>
            <p class="muted" style="font-size:12px;line-height:1.65">
              Render ortam değişkenlerinde <b>OPENAI_API_KEY</b> tanımlanırsa gerçek AI modu otomatik açılır.
              Anahtar tanımlı değilse uygulama yerel demo cevapları verir.
            </p>
          </div>
        </div>
      </section>
    </div>
  </main>
</div>

<nav class="mobile-nav" id="mobileNav">
  <button class="active" data-page="dashboard"><span>⌂</span>Ana Sayfa</button>
  <button data-page="shifts"><span>◷</span>Vardiya</button>
  <button data-page="staff"><span>♟</span>Personel</button>
  <button data-page="invoices"><span>▤</span>Fatura</button>
  <button data-page="reports"><span>▥</span>Rapor</button>
</nav>

<div class="modal-backdrop" id="modalBackdrop">
  <div class="modal">
    <div class="modal-head"><h3 id="modalTitle">Yeni Kayıt</h3><button class="close" onclick="closeModal()">✕</button></div>
    <div id="modalBody"></div>
  </div>
</div>
<div class="toast" id="toast"></div>

<script>
(function(){
  const KEY = "ai_isletme_asistani_v1";

  const defaults = {
    staff: [
      {id:1,name:"Ayşe Demir",role:"Kasiyer",phone:"0532 111 22 33",status:"Çalışıyor",shift:"Sabah",docs:true},
      {id:2,name:"Mehmet Yılmaz",role:"Aşçı",phone:"0535 222 33 44",status:"Çalışıyor",shift:"Öğle",docs:true},
      {id:3,name:"Zeynep Arslan",role:"Servis",phone:"0541 333 44 55",status:"Mola",shift:"Öğle",docs:false},
      {id:4,name:"Emre Çetin",role:"Depo Sorumlusu",phone:"0553 444 55 66",status:"Çalışıyor",shift:"Gece",docs:true},
      {id:5,name:"Can Kaya",role:"Kurye",phone:"0505 555 66 77",status:"Çalışıyor",shift:"Sabah",docs:false},
      {id:6,name:"Selin Aksoy",role:"Operasyon",phone:"0538 666 77 88",status:"İzinli",shift:"-",docs:true}
    ],
    shifts: [
      {id:1,name:"Sabah Vardiyası",time:"08:00 - 16:00",people:12,status:"Devam Ediyor",symbol:"☀"},
      {id:2,name:"Öğle Vardiyası",time:"16:00 - 00:00",people:14,status:"Başlamak Üzere",symbol:"◐"},
      {id:3,name:"Gece Vardiyası",time:"00:00 - 08:00",people:6,status:"Planlandı",symbol:"☾"}
    ],
    invoices: [
      {id:1,no:"#FTR-2026-001",customer:"Atlas Organizasyon",date:"2026-09-08",amount:32500,status:"Taslak"},
      {id:2,no:"#FTR-2026-002",customer:"Mavi Lojistik",date:"2026-09-06",amount:18000,status:"Kesilecek"},
      {id:3,no:"#FTR-2026-003",customer:"Nova Hizmet",date:"2026-09-04",amount:27000,status:"Bekliyor"},
      {id:4,no:"#FTR-2026-004",customer:"Kent Catering",date:"2026-09-01",amount:41000,status:"Ödendi"},
      {id:5,no:"#FTR-2026-005",customer:"Proline Etkinlik",date:"2026-08-29",amount:52500,status:"Bekliyor"}
    ],
    expenses: [
      {id:1,date:"2026-09-08",category:"Personel",description:"Günlük yevmiyeler",amount:28500},
      {id:2,date:"2026-09-07",category:"Ulaşım",description:"Servis gideri",amount:7600},
      {id:3,date:"2026-09-06",category:"Tedarik",description:"Operasyon malzemeleri",amount:12400},
      {id:4,date:"2026-09-03",category:"Ofis",description:"Ofis giderleri",amount:5900}
    ],
    finance: [
      {m:"Nis",revenue:142000,expense:98000},
      {m:"May",revenue:173000,expense:116000},
      {m:"Haz",revenue:162000,expense:124000},
      {m:"Tem",revenue:195000,expense:138000},
      {m:"Ağu",revenue:181000,expense:147000},
      {m:"Eyl",revenue:210000,expense:168000}
    ]
  };

  let state = load();

  function load(){
    try{
      const x = JSON.parse(localStorage.getItem(KEY));
      return x && x.staff ? x : structuredClone(defaults);
    }catch(e){ return structuredClone(defaults); }
  }
  function save(){ localStorage.setItem(KEY, JSON.stringify(state)); renderAll(); }
  function money(n){ return new Intl.NumberFormat("tr-TR",{style:"currency",currency:"TRY",maximumFractionDigits:0}).format(Number(n||0)); }
  function esc(v){
    return String(v ?? "").replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
  }
  function uid(arr){ return Math.max(0,...arr.map(x=>Number(x.id)||0))+1; }
  function initials(name){ return String(name||"?").split(" ").filter(Boolean).slice(0,2).map(x=>x[0]).join("").toUpperCase(); }
  function statusClass(status){
    if(["Çalışıyor","Devam Ediyor","Ödendi"].includes(status)) return "ok";
    if(["Başlamak Üzere","Bekliyor"].includes(status)) return "wait";
    if(["Mola","Kesilecek"].includes(status)) return "warn";
    if(["Eksik","Pasif"].includes(status)) return "danger";
    return "gray";
  }

  window.goPage = function(page){
    document.querySelectorAll(".page").forEach(x=>x.classList.remove("active"));
    const target=document.getElementById("page-"+page);
    if(target) target.classList.add("active");
    document.querySelectorAll("[data-page]").forEach(x=>x.classList.toggle("active",x.dataset.page===page));
    if(page==="reports") setTimeout(()=>{ drawChart("reportChart"); },30);
    window.scrollTo({top:0,behavior:"smooth"});
  };

  document.querySelectorAll("[data-page]").forEach(btn=>btn.addEventListener("click",()=>goPage(btn.dataset.page)));

  function renderDashboard(){
    const active = state.staff.filter(x=>x.status==="Çalışıyor" || x.status==="Mola").length;
    const missing = state.staff.filter(x=>!x.docs).length;
    const pendingInvoices = state.invoices.filter(x=>x.status!=="Ödendi");
    const pending = pendingInvoices.reduce((a,b)=>a+Number(b.amount||0),0);
    const cut = state.invoices.filter(x=>x.status==="Kesilecek").length;
    const cutTotal = state.invoices.filter(x=>x.status==="Kesilecek").reduce((a,b)=>a+Number(b.amount||0),0);

    statStaff.textContent = active;
    statStaffNote.textContent = "Toplam "+state.staff.length+" personel";
    statPayments.textContent = money(pending);
    statPaymentsNote.textContent = pendingInvoices.length+" bekleyen kayıt";
    statInvoices.textContent = cut;
    statInvoiceTotal.textContent = "Toplam "+money(cutTotal);
    statDocs.textContent = missing;

    dashboardShifts.innerHTML = state.shifts.slice(0,4).map(s =>
      '<div class="shift"><div class="symbol">'+esc(s.symbol||"◷")+'</div><div><b>'+esc(s.name)+'</b><small>'+esc(s.time)+' • '+esc(s.people)+' kişi</small></div><span class="badge '+statusClass(s.status)+'">'+esc(s.status)+'</span></div>'
    ).join("") || '<div class="empty">Vardiya yok.</div>';

    dashboardStaff.innerHTML = state.staff.slice(0,5).map(p =>
      '<tr><td><div class="person"><div class="face">'+esc(initials(p.name))+'</div><b>'+esc(p.name)+'</b></div></td><td>'+esc(p.role)+'</td><td><span class="badge '+statusClass(p.status)+'">'+esc(p.status)+'</span></td><td>'+esc(p.shift)+'</td></tr>'
    ).join("");

    dashboardInvoices.innerHTML = [...state.invoices].sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,5).map(i =>
      '<tr><td><b>'+esc(i.no)+'</b><div class="tiny muted">'+esc(i.customer)+'</div></td><td>'+fmtDate(i.date)+'</td><td><b>'+money(i.amount)+'</b></td><td><span class="badge '+statusClass(i.status)+'">'+esc(i.status)+'</span></td></tr>'
    ).join("");

    aiInsights.innerHTML = [
      {i:"↘",t:"Bu ay kâr geçen aya göre değişti.",p:"Gelir ve gider eğilimini raporlar bölümünden karşılaştırabilirsiniz."},
      {i:"▤",t:missing+" personelin evrakı eksik.",p:"Eksik evrakları personel listesinden kontrol edin."},
      {i:"💡",t:"Vardiya yoğunluğunu dengeleyin.",p:"Kişi sayısı yüksek vardiyalarda görev dağılımını gözden geçirin."}
    ].map(x=>'<div class="ai-item"><div class="symbol">'+x.i+'</div><div><b>'+esc(x.t)+'</b><p>'+esc(x.p)+'</p></div></div>').join("");

    requestAnimationFrame(()=>drawChart("financeChart"));
  }

  window.renderShiftsPage = function(){
    const q=(shiftFilter.value||"").toLocaleLowerCase("tr-TR");
    const data=state.shifts.filter(x=>(x.name+" "+x.time+" "+x.status).toLocaleLowerCase("tr-TR").includes(q));
    shiftTable.innerHTML=data.map(s=>
      '<tr><td><b>'+esc(s.symbol)+" "+esc(s.name)+'</b></td><td>'+esc(s.time)+'</td><td>'+esc(s.people)+'</td><td><span class="badge '+statusClass(s.status)+'">'+esc(s.status)+'</span></td><td><button class="btn danger" onclick="removeItem(\'shifts\','+s.id+')">Sil</button></td></tr>'
    ).join("")||'<tr><td colspan="5" class="empty">Kayıt bulunamadı.</td></tr>';
  };

  window.renderStaffPage = function(){
    const q=(staffFilter.value||"").toLocaleLowerCase("tr-TR");
    const sf=staffStatusFilter.value;
    const data=state.staff.filter(x=>(!sf||x.status===sf)&&((x.name+" "+x.role+" "+x.phone).toLocaleLowerCase("tr-TR").includes(q)));
    staffTable.innerHTML=data.map(p=>
      '<tr><td><div class="person"><div class="face">'+esc(initials(p.name))+'</div><b>'+esc(p.name)+'</b></div></td><td>'+esc(p.role)+'</td><td>'+esc(p.phone)+'</td><td><span class="badge '+statusClass(p.status)+'">'+esc(p.status)+'</span></td><td><span class="badge '+(p.docs?'ok':'danger')+'">'+(p.docs?'Tam':'Eksik')+'</span></td><td><button class="btn danger" onclick="removeItem(\'staff\','+p.id+')">Sil</button></td></tr>'
    ).join("")||'<tr><td colspan="6" class="empty">Kayıt bulunamadı.</td></tr>';
  };

  window.renderInvoicesPage = function(){
    const q=(invoiceFilter.value||"").toLocaleLowerCase("tr-TR");
    const sf=invoiceStatusFilter.value;
    const data=state.invoices.filter(x=>(!sf||x.status===sf)&&((x.no+" "+x.customer).toLocaleLowerCase("tr-TR").includes(q)));
    invoiceTable.innerHTML=data.map(i=>
      '<tr><td><b>'+esc(i.no)+'</b></td><td>'+esc(i.customer)+'</td><td>'+fmtDate(i.date)+'</td><td><b>'+money(i.amount)+'</b></td><td><span class="badge '+statusClass(i.status)+'">'+esc(i.status)+'</span></td><td><button class="btn danger" onclick="removeItem(\'invoices\','+i.id+')">Sil</button></td></tr>'
    ).join("")||'<tr><td colspan="6" class="empty">Kayıt bulunamadı.</td></tr>';
  };

  window.renderExpensesPage = function(){
    const q=(expenseFilter.value||"").toLocaleLowerCase("tr-TR");
    const data=state.expenses.filter(x=>((x.category+" "+x.description).toLocaleLowerCase("tr-TR").includes(q)));
    expenseTable.innerHTML=data.map(i=>
      '<tr><td>'+fmtDate(i.date)+'</td><td><span class="badge gray">'+esc(i.category)+'</span></td><td>'+esc(i.description)+'</td><td><b>'+money(i.amount)+'</b></td><td><button class="btn danger" onclick="removeItem(\'expenses\','+i.id+')">Sil</button></td></tr>'
    ).join("")||'<tr><td colspan="5" class="empty">Kayıt bulunamadı.</td></tr>';
  };

  function renderReports(){
    const revenue=state.finance.reduce((a,b)=>a+Number(b.revenue||0),0);
    const baseExpense=state.finance.reduce((a,b)=>a+Number(b.expense||0),0);
    const extra=state.expenses.reduce((a,b)=>a+Number(b.amount||0),0);
    const expense=baseExpense+extra;
    const profit=revenue-expense;
    const pending=state.invoices.filter(x=>x.status!=="Ödendi").reduce((a,b)=>a+Number(b.amount||0),0);
    const active=state.staff.filter(x=>["Çalışıyor","Mola"].includes(x.status)).length;
    const docs=state.staff.filter(x=>!x.docs).length;
    reportRevenue.textContent=money(revenue);
    reportExpense.textContent=money(expense);
    reportProfit.textContent=money(profit);
    reportStaff.textContent=active;
    reportPending.textContent=money(pending);
    reportDocs.textContent=docs;
    const pct = revenue>0 ? Math.max(4,Math.min(100,(Math.max(0,profit)/revenue)*100)) : 4;
    profitBar.style.width=pct+"%";
  }

  function snapshot(){
    const active=state.staff.filter(x=>["Çalışıyor","Mola"].includes(x.status)).length;
    const missing=state.staff.filter(x=>!x.docs).length;
    const pending=state.invoices.filter(x=>x.status!=="Ödendi").reduce((a,b)=>a+Number(b.amount||0),0);
    const revenue=state.finance.reduce((a,b)=>a+Number(b.revenue||0),0);
    const expense=state.finance.reduce((a,b)=>a+Number(b.expense||0),0)+state.expenses.reduce((a,b)=>a+Number(b.amount||0),0);
    return {activeStaff:active,missingDocs:missing,pendingPayments:pending,invoiceCount:state.invoices.length,revenue:revenue,expense:expense};
  }

  function fmtDate(v){
    if(!v)return "-";
    const d=new Date(v+"T12:00:00");
    return Number.isNaN(d.getTime())?esc(v):new Intl.DateTimeFormat("tr-TR",{day:"2-digit",month:"short",year:"numeric"}).format(d);
  }

  function drawChart(id){
    const c=document.getElementById(id); if(!c)return;
    const rect=c.getBoundingClientRect(); if(!rect.width||!rect.height)return;
    const dpr=Math.max(1,window.devicePixelRatio||1);
    c.width=Math.floor(rect.width*dpr); c.height=Math.floor(rect.height*dpr);
    const ctx=c.getContext("2d");ctx.scale(dpr,dpr);
    const W=rect.width,H=rect.height;
    ctx.clearRect(0,0,W,H);
    const styles=getComputedStyle(document.body);
    const line=styles.getPropertyValue("--line").trim();
    const muted=styles.getPropertyValue("--muted").trim();
    const blue=styles.getPropertyValue("--blue").trim();
    const green=styles.getPropertyValue("--green").trim();

    const pad={l:34,r:12,t:10,b:28}; const w=W-pad.l-pad.r,h=H-pad.t-pad.b;
    const max=Math.max(1,...state.finance.flatMap(x=>[x.revenue,x.expense]))*1.15;
    ctx.font="10px sans-serif";ctx.textAlign="right";ctx.textBaseline="middle";
    for(let i=0;i<=4;i++){
      const y=pad.t+h*(i/4);ctx.strokeStyle=line;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(W-pad.r,y);ctx.stroke();
      ctx.fillStyle=muted;ctx.fillText(Math.round(max*(1-i/4)/1000)+"K",pad.l-6,y);
    }
    const step=w/state.finance.length; const bw=Math.min(18,step*.25);
    state.finance.forEach((x,i)=>{
      const cx=pad.l+step*i+step/2;
      const rh=(x.revenue/max)*h; const eh=(x.expense/max)*h;
      roundRect(ctx,cx-bw-2,pad.t+h-rh,bw,rh,5,blue);
      roundRect(ctx,cx+2,pad.t+h-eh,bw,eh,5,green);
      ctx.fillStyle=muted;ctx.textAlign="center";ctx.textBaseline="top";ctx.fillText(x.m,cx,pad.t+h+9);
    });
  }
  function roundRect(ctx,x,y,w,h,r,color){
    r=Math.min(r,w/2,h/2);ctx.fillStyle=color;ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill();
  }

  window.removeItem=function(type,id){
    if(!confirm("Bu kayıt silinsin mi?"))return;
    state[type]=state[type].filter(x=>Number(x.id)!==Number(id));save();toast("Kayıt silindi.");
  };

  window.openForm=function(type){
    const forms={
      shift:{
        title:"Yeni Vardiya",
        html:'<div class="form-grid"><div class="form-group full"><label>Vardiya Adı</label><input id="fName" placeholder="Örn: Sabah Vardiyası"></div><div class="form-group"><label>Saat</label><input id="fTime" placeholder="08:00 - 16:00"></div><div class="form-group"><label>Kişi</label><input id="fPeople" type="number" min="0" value="1"></div><div class="form-group full"><label>Durum</label><select id="fStatus"><option>Planlandı</option><option>Başlamak Üzere</option><option>Devam Ediyor</option></select></div></div>',
        save:function(){
          if(!fName.value.trim())return toast("Vardiya adı gerekli.");
          state.shifts.push({id:uid(state.shifts),name:fName.value.trim(),time:fTime.value.trim()||"-",people:Number(fPeople.value||0),status:fStatus.value,symbol:"◷"});save();
        }
      },
      staff:{
        title:"Personel Ekle",
        html:'<div class="form-grid"><div class="form-group full"><label>Ad Soyad</label><input id="fName"></div><div class="form-group"><label>Görev</label><input id="fRole"></div><div class="form-group"><label>Telefon</label><input id="fPhone"></div><div class="form-group"><label>Durum</label><select id="fStatus"><option>Çalışıyor</option><option>Mola</option><option>İzinli</option><option>Pasif</option></select></div><div class="form-group"><label>Vardiya</label><select id="fShift"><option>Sabah</option><option>Öğle</option><option>Gece</option><option>-</option></select></div><div class="form-group full"><label>Evrak Durumu</label><select id="fDocs"><option value="1">Tam</option><option value="0">Eksik</option></select></div></div>',
        save:function(){
          if(!fName.value.trim())return toast("Ad soyad gerekli.");
          state.staff.push({id:uid(state.staff),name:fName.value.trim(),role:fRole.value.trim()||"-",phone:fPhone.value.trim()||"-",status:fStatus.value,shift:fShift.value,docs:fDocs.value==="1"});save();
        }
      },
      invoice:{
        title:"Fatura Ekle",
        html:'<div class="form-grid"><div class="form-group"><label>Fatura No</label><input id="fNo" placeholder="#FTR-2026-006"></div><div class="form-group"><label>Müşteri</label><input id="fCustomer"></div><div class="form-group"><label>Tarih</label><input id="fDate" type="date"></div><div class="form-group"><label>Tutar</label><input id="fAmount" type="number" min="0"></div><div class="form-group full"><label>Durum</label><select id="fStatus"><option>Taslak</option><option>Kesilecek</option><option>Bekliyor</option><option>Ödendi</option></select></div></div>',
        save:function(){
          if(!fCustomer.value.trim())return toast("Müşteri adı gerekli.");
          state.invoices.push({id:uid(state.invoices),no:fNo.value.trim()||("#FTR-"+Date.now()),customer:fCustomer.value.trim(),date:fDate.value||new Date().toISOString().slice(0,10),amount:Number(fAmount.value||0),status:fStatus.value});save();
        }
      },
      expense:{
        title:"Gider Ekle",
        html:'<div class="form-grid"><div class="form-group"><label>Tarih</label><input id="fDate" type="date"></div><div class="form-group"><label>Kategori</label><select id="fCategory"><option>Personel</option><option>Ulaşım</option><option>Tedarik</option><option>Ofis</option><option>Diğer</option></select></div><div class="form-group full"><label>Açıklama</label><input id="fDescription"></div><div class="form-group full"><label>Tutar</label><input id="fAmount" type="number" min="0"></div></div>',
        save:function(){
          if(!fDescription.value.trim())return toast("Açıklama gerekli.");
          state.expenses.push({id:uid(state.expenses),date:fDate.value||new Date().toISOString().slice(0,10),category:fCategory.value,description:fDescription.value.trim(),amount:Number(fAmount.value||0)});save();
        }
      }
    };
    const cfg=forms[type]; if(!cfg)return;
    modalTitle.textContent=cfg.title;
    modalBody.innerHTML=cfg.html+'<div class="modal-actions"><button class="btn" onclick="closeModal()">Vazgeç</button><button class="btn primary" id="modalSave">Kaydet</button></div>';
    modalBackdrop.classList.add("show");
    modalSave.onclick=function(){cfg.save();closeModal();toast("Kayıt eklendi.");};
  };

  window.closeModal=function(){ modalBackdrop.classList.remove("show"); };
  modalBackdrop.addEventListener("click",e=>{if(e.target===modalBackdrop)closeModal();});

  async function askAI(){
    const q=aiQuestion.value.trim(); if(!q)return;
    aiAnswer.textContent="Analiz ediliyor…"; aiSend.disabled=true;
    try{
      const r=await fetch("/api/ai",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({question:q,snapshot:snapshot()})});
      const d=await r.json();
      if(!r.ok)throw new Error(d.error||"AI isteği başarısız.");
      aiAnswer.textContent=d.answer;
      if(d.mode==="local-demo") aiAnswer.textContent+="\n\n(Demo AI modu)";
    }catch(e){aiAnswer.textContent="Hata: "+e.message;}
    finally{aiSend.disabled=false;}
  }
  aiSend.addEventListener("click",askAI);
  aiQuestion.addEventListener("keydown",e=>{if(e.key==="Enter")askAI();});
  window.askPreset=function(q){aiQuestion.value=q;askAI();};
  window.focusAI=function(){setTimeout(()=>aiQuestion.focus(),100);};

  function renderAll(){
    renderDashboard();renderShiftsPage();renderStaffPage();renderInvoicesPage();renderExpensesPage();renderReports();
  }

  function toast(msg){
    const t=document.getElementById("toast");t.textContent=msg;t.classList.add("show");
    clearTimeout(t._x);t._x=setTimeout(()=>t.classList.remove("show"),2200);
  }
  window.toast=toast;

  window.toggleTheme=function(){
    document.body.classList.toggle("dark");
    localStorage.setItem(KEY+"_theme",document.body.classList.contains("dark")?"dark":"light");
    themeBtn.textContent=document.body.classList.contains("dark")?"☀":"☾";
    renderAll();
  };
  themeBtn.onclick=toggleTheme;

  window.resetDemo=function(){
    if(!confirm("Demo verileri başlangıç haline döndürülsün mü?"))return;
    state=structuredClone(defaults);save();toast("Demo verileri sıfırlandı.");
  };
  resetBtn.onclick=resetDemo;

  window.exportJSON=function(){
    download("ai-isletme-verileri.json",JSON.stringify(state,null,2),"application/json");
  };

  window.exportCSV=function(type){
    const arr=state[type]||[]; if(!arr.length)return toast("Dışa aktarılacak veri yok.");
    const keys=Object.keys(arr[0]);
    const csv=[keys.join(";"),...arr.map(row=>keys.map(k=>'"'+String(row[k]??"").replaceAll('"','""')+'"').join(";"))].join("\n");
    download(type+".csv","\uFEFF"+csv,"text/csv;charset=utf-8");
  };

  function download(name,content,type){
    const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([content],{type:type}));a.download=name;a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href),500);
  }

  globalSearch.addEventListener("input",function(){
    const q=this.value.trim();
    if(q.length<2)return;
    const all=[
      ...state.staff.map(x=>({p:"staff",t:x.name+" "+x.role})),
      ...state.invoices.map(x=>({p:"invoices",t:x.no+" "+x.customer})),
      ...state.expenses.map(x=>({p:"expenses",t:x.category+" "+x.description}))
    ];
    const hit=all.find(x=>x.t.toLocaleLowerCase("tr-TR").includes(q.toLocaleLowerCase("tr-TR")));
    if(hit)goPage(hit.p);
  });

  async function health(){
    try{
      const r=await fetch("/api/health");const d=await r.json();
      aiModeBadge.textContent=d.aiConfigured?"OpenAI bağlı":"Yerel demo";
      aiModeBadge.className="badge "+(d.aiConfigured?"ok":"gray");
    }catch(e){
      aiModeBadge.textContent="Bağlantı yok";
      aiModeBadge.className="badge danger";
    }
  }

  function init(){
    const theme=localStorage.getItem(KEY+"_theme");
    if(theme==="dark"){document.body.classList.add("dark");themeBtn.textContent="☀";}
    const now=new Date();
    todayLabel.textContent=new Intl.DateTimeFormat("tr-TR",{weekday:"long",day:"2-digit",month:"long",year:"numeric"}).format(now);
    renderAll();health();
    window.addEventListener("resize",()=>{drawChart("financeChart");if(document.getElementById("page-reports").classList.contains("active"))drawChart("reportChart");});
  }
  init();
})();
</script>
</body>
</html>
__HTML_END__*/
