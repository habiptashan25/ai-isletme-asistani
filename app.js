const http = require("http");

const PORT = Number(process.env.PORT || 3000);
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5.2";

function send(res, status, body, type) {
  res.writeHead(status, {
    "Content-Type": type || "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
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
      if (body.length > 1000000) {
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

function money(n) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 0
  }).format(Number(n || 0));
}

function localAI(question, snapshot) {
  const q = String(question || "").toLocaleLowerCase("tr-TR");
  const s = snapshot || {};

  if (q.includes("kâr") || q.includes("kar")) {
    const profit = Number(s.revenue || 0) - Number(s.expense || 0);

    return (
      "Mevcut verilere göre gelir " +
      money(s.revenue) +
      ", gider " +
      money(s.expense) +
      " ve tahmini kâr " +
      money(profit) +
      ". En hızlı kontrol edilmesi gereken alanlar gider artışları, bekleyen tahsilatlar ve personel maliyetleri."
    );
  }

  if (q.includes("gider")) {
    return (
      "Toplam gider " +
      money(s.expense) +
      " görünüyor. Personel, ulaşım, tedarik ve ofis giderlerini ayrı ayrı karşılaştırıp en çok artan kalemi kontrol etmeni öneririm."
    );
  }

  if (q.includes("personel") || q.includes("çalışan")) {
    return (
      "Bugün " +
      Number(s.activeStaff || 0) +
      " aktif çalışan ve " +
      Number(s.missingDocs || 0) +
      " eksik evrak kaydı görünüyor. Yoğun vardiyalarda personel dağılımını dengelemek faydalı olabilir."
    );
  }

  if (
    q.includes("fatura") ||
    q.includes("ödeme") ||
    q.includes("tahsil")
  ) {
    return (
      "Bekleyen ödeme toplamı " +
      money(s.pendingPayments) +
      ". Sistemde " +
      Number(s.invoiceCount || 0) +
      " fatura kaydı bulunuyor. Vadesi yaklaşan ve tutarı yüksek kalemlere öncelik verebilirsin."
    );
  }

  return (
    "İşletme özetine göre bugün " +
    Number(s.activeStaff || 0) +
    " çalışan aktif, bekleyen ödemeler " +
    money(s.pendingPayments) +
    " ve " +
    Number(s.missingDocs || 0) +
    " eksik evrak bulunuyor. Finans, vardiya, personel veya fatura hakkında daha özel bir soru sorabilirsin."
  );
}

function extractOpenAIText(data) {
  if (!data) return "";

  if (typeof data.output_text === "string") {
    return data.output_text;
  }

  const parts = [];

  (Array.isArray(data.output) ? data.output : []).forEach(item => {
    (Array.isArray(item.content) ? item.content : []).forEach(c => {
      if (c && typeof c.text === "string") {
        parts.push(c.text);
      }
    });
  });

  return parts.join("\n").trim();
}

async function callOpenAI(question, snapshot) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + OPENAI_API_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      instructions:
        "Türkçe konuşan bir işletme asistanısın. Kısa, uygulanabilir ve yalnızca verilen işletme verilerine dayalı cevap ver. Olmayan verileri uydurma.",
      input:
        "Kullanıcı sorusu: " +
        question +
        "\nİşletme özeti: " +
        JSON.stringify(snapshot || {})
    })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      (data.error && data.error.message) || "OpenAI API hatası"
    );
  }

  return extractOpenAIText(data) || "Yanıt oluşturulamadı.";
}

const HTML = String.raw`<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#f5f7fb">

<title>AI İşletme Asistanı</title>

<style>
:root{
  --bg:#f5f7fb;
  --surface:#fff;
  --surface2:#f8faff;
  --text:#162039;
  --muted:#76839c;
  --line:#e7ebf3;
  --blue:#3978ff;
  --green:#20b985;
  --orange:#f1a43b;
  --red:#ef5b67;
  --violet:#7b6cf0;
  --shadow:0 12px 32px rgba(20,36,74,.08);
  --r:18px;
  --side:240px;
}

body.dark{
  --bg:#0e1522;
  --surface:#151d2d;
  --surface2:#1a2436;
  --text:#eef3ff;
  --muted:#99a7c0;
  --line:#283348;
  --shadow:0 14px 36px rgba(0,0,0,.25);
}

*{
  box-sizing:border-box;
}

html{
  scroll-behavior:smooth;
}

body{
  margin:0;
  background:var(--bg);
  color:var(--text);
  font-family:
    Inter,
    ui-sans-serif,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    Arial,
    sans-serif;
}

button,
input,
select{
  font:inherit;
}

button{
  cursor:pointer;
}

.app{
  display:grid;
  grid-template-columns:var(--side) 1fr;
  min-height:100vh;
}

.side{
  height:100vh;
  position:sticky;
  top:0;
  background:var(--surface);
  border-right:1px solid var(--line);
  padding:22px 16px;
}

.brand{
  display:flex;
  gap:11px;
  align-items:center;
  padding:8px 9px 24px;
}

.logo{
  width:40px;
  height:40px;
  border-radius:13px;
  background:linear-gradient(145deg,var(--blue),#76a7ff);
  display:grid;
  place-items:center;
  color:#fff;
  font-weight:900;
  box-shadow:0 9px 24px rgba(57,120,255,.25);
}

.brand b{
  font-size:15px;
}

.brand small{
  display:block;
  color:var(--muted);
  margin-top:3px;
}

.nav{
  display:grid;
  gap:7px;
}

.nav button{
  border:0;
  background:transparent;
  color:var(--muted);
  padding:12px 13px;
  border-radius:13px;
  text-align:left;
  font-weight:700;
}

.nav button:hover,
.nav button.active{
  background:rgba(57,120,255,.10);
  color:var(--blue);
}

.main{
  min-width:0;
}

.top{
  height:74px;
  position:sticky;
  top:0;
  z-index:20;
  background:color-mix(in srgb,var(--bg) 85%,transparent);
  backdrop-filter:blur(16px);
  display:flex;
  align-items:center;
  justify-content:space-between;
  padding:0 26px;
  border-bottom:1px solid var(--line);
}

.search{
  width:min(520px,55vw);
  display:flex;
  gap:9px;
  align-items:center;
  background:var(--surface);
  border:1px solid var(--line);
  border-radius:14px;
  padding:10px 12px;
}

.search input{
  border:0;
  outline:0;
  background:transparent;
  color:var(--text);
  width:100%;
}

.topActions{
  display:flex;
  gap:9px;
  align-items:center;
}

.icon{
  width:42px;
  height:42px;
  border:1px solid var(--line);
  background:var(--surface);
  color:var(--text);
  border-radius:13px;
}

.profile{
  display:flex;
  align-items:center;
  gap:9px;
  border:1px solid var(--line);
  background:var(--surface);
  border-radius:14px;
  padding:6px 9px;
}

.avatar{
  width:34px;
  height:34px;
  background:#13203c;
  color:#fff;
  display:grid;
  place-items:center;
  border-radius:11px;
  font-weight:900;
}

.profile small{
  display:block;
  color:var(--muted);
  font-size:10px;
}

.content{
  max-width:1550px;
  margin:auto;
  padding:26px 28px 100px;
}

.page{
  display:none;
}

.page.active{
  display:block;
}

.hero{
  display:flex;
  justify-content:space-between;
  align-items:end;
  gap:14px;
  margin-bottom:20px;
}

.hero h1{
  font-size:28px;
  margin:0 0 6px;
  letter-spacing:-.7px;
}

.hero p,
.sub{
  margin:0;
  color:var(--muted);
}

.date{
  font-size:12px;
  color:var(--muted);
  background:var(--surface);
  border:1px solid var(--line);
  padding:10px 12px;
  border-radius:13px;
}

.stats{
  display:grid;
  grid-template-columns:repeat(4,1fr);
  gap:14px;
}

.stat,
.card{
  background:var(--surface);
  border:1px solid var(--line);
  border-radius:var(--r);
  box-shadow:var(--shadow);
}

.stat{
  padding:17px;
}

.statTop{
  display:flex;
  justify-content:space-between;
}

.statIcon{
  width:42px;
  height:42px;
  border-radius:13px;
  display:grid;
  place-items:center;
  background:var(--surface2);
  font-size:20px;
}

.label{
  font-size:11px;
  color:var(--muted);
  font-weight:800;
  margin-top:11px;
}

.value{
  font-size:25px;
  font-weight:900;
  letter-spacing:-.7px;
  margin:4px 0;
}

.note{
  font-size:10px;
  color:var(--muted);
}

.badge{
  display:inline-block;
  padding:5px 9px;
  border-radius:999px;
  font-size:10px;
  font-weight:800;
}

.ok{
  background:rgba(32,185,133,.12);
  color:var(--green);
}

.wait{
  background:rgba(57,120,255,.11);
  color:var(--blue);
}

.warn{
  background:rgba(241,164,59,.13);
  color:#d68920;
}

.danger{
  background:rgba(239,91,103,.12);
  color:var(--red);
}

.gray{
  background:var(--surface2);
  color:var(--muted);
}

.grid3{
  display:grid;
  grid-template-columns:1fr 1.2fr 1fr;
  gap:14px;
  margin-top:14px;
}

.grid2{
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:14px;
  margin-top:14px;
}

.card{
  padding:18px;
}

.head{
  display:flex;
  justify-content:space-between;
  align-items:center;
  gap:10px;
  margin-bottom:14px;
}

.head h3{
  font-size:15px;
  margin:0;
}

.link{
  border:0;
  background:transparent;
  color:var(--blue);
  font-size:11px;
  font-weight:800;
}

.shiftList,
.aiList{
  display:grid;
  gap:9px;
}

.shift{
  display:grid;
  grid-template-columns:36px 1fr auto;
  align-items:center;
  gap:9px;
  border:1px solid var(--line);
  background:var(--surface2);
  padding:10px;
  border-radius:13px;
}

.symbol{
  width:34px;
  height:34px;
  border-radius:10px;
  background:var(--surface);
  display:grid;
  place-items:center;
}

.shift b{
  font-size:12px;
}

.shift small{
  display:block;
  color:var(--muted);
  font-size:10px;
  margin-top:3px;
}

.aiItem{
  display:flex;
  gap:10px;
  background:var(--surface2);
  border:1px solid var(--line);
  border-radius:13px;
  padding:10px;
}

.aiItem b{
  font-size:12px;
}

.aiItem p{
  font-size:10px;
  color:var(--muted);
  line-height:1.45;
  margin:4px 0 0;
}

.aiBox{
  margin-top:10px;
  border:1px solid rgba(57,120,255,.2);
  background:linear-gradient(
    145deg,
    rgba(57,120,255,.08),
    rgba(123,108,240,.05)
  );
  border-radius:15px;
  padding:12px;
}

.chips{
  display:flex;
  gap:6px;
  flex-wrap:wrap;
  margin:9px 0;
}

.chip{
  border:1px solid var(--line);
  background:var(--surface);
  color:var(--muted);
  border-radius:999px;
  padding:6px 9px;
  font-size:10px;
}

.aiInput{
  display:flex;
  gap:7px;
}

.aiInput input{
  flex:1;
  min-width:0;
  border:1px solid var(--line);
  background:var(--surface);
  color:var(--text);
  padding:10px;
  border-radius:12px;
  outline:0;
}

.send{
  width:40px;
  border:0;
  border-radius:12px;
  background:var(--blue);
  color:#fff;
  font-weight:900;
}

.answer{
  white-space:pre-wrap;
  font-size:12px;
  line-height:1.55;
  margin-top:10px;
}

.tableWrap{
  overflow:auto;
  border:1px solid var(--line);
  border-radius:14px;
}

table{
  width:100%;
  border-collapse:collapse;
  min-width:620px;
}

th,
td{
  padding:12px;
  border-bottom:1px solid var(--line);
  text-align:left;
  font-size:12px;
}

th{
  background:var(--surface2);
  color:var(--muted);
  font-size:10px;
  text-transform:uppercase;
  letter-spacing:.5px;
}

tr:last-child td{
  border-bottom:0;
}

.sectionTitle{
  font-size:23px;
  margin:0 0 6px;
}

.toolbar{
  display:flex;
  gap:8px;
  flex-wrap:wrap;
  margin:18px 0 13px;
}

.btn,
.field{
  border:1px solid var(--line);
  background:var(--surface);
  color:var(--text);
  border-radius:12px;
  padding:10px 12px;
}

.btn{
  font-weight:800;
  font-size:12px;
}

.btn.primary{
  background:var(--blue);
  border-color:var(--blue);
  color:#fff;
}

.btn.red{
  color:var(--red);
}

.field{
  outline:0;
}

.person{
  display:flex;
  align-items:center;
  gap:8px;
}

.face{
  width:32px;
  height:32px;
  border-radius:10px;
  background:rgba(57,120,255,.1);
  color:var(--blue);
  font-weight:900;
  display:grid;
  place-items:center;
}

.chart{
  height:230px;
  display:flex;
  align-items:end;
  gap:12px;
  padding:20px 8px 24px;
  border-bottom:1px solid var(--line);
}

.barGroup{
  flex:1;
  height:100%;
  display:flex;
  align-items:end;
  justify-content:center;
  gap:4px;
  position:relative;
}

.bar{
  width:15px;
  border-radius:6px 6px 2px 2px;
}

.bar.rev{
  background:var(--blue);
}

.bar.exp{
  background:var(--green);
}

.month{
  position:absolute;
  bottom:-19px;
  font-size:9px;
  color:var(--muted);
}

.reportGrid{
  display:grid;
  grid-template-columns:repeat(3,1fr);
  gap:14px;
  margin-top:18px;
}

.metric{
  font-size:28px;
  font-weight:900;
  margin-top:8px;
}

.mobileNav{
  display:none;
}

.modalBg{
  display:none;
  position:fixed;
  inset:0;
  background:rgba(4,10,25,.5);
  z-index:100;
  place-items:center;
  padding:18px;
}

.modalBg.show{
  display:grid;
}

.modal{
  width:min(560px,100%);
  background:var(--surface);
  border:1px solid var(--line);
  border-radius:20px;
  padding:20px;
  box-shadow:0 30px 80px rgba(0,0,0,.28);
}

.modalHead{
  display:flex;
  justify-content:space-between;
  align-items:center;
  margin-bottom:14px;
}

.modalHead h3{
  margin:0;
}

.close{
  width:36px;
  height:36px;
  border:0;
  border-radius:11px;
  background:var(--surface2);
  color:var(--text);
}

.formGrid{
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:11px;
}

.fg{
  display:grid;
  gap:5px;
}

.fg.full{
  grid-column:1/-1;
}

.fg label{
  font-size:10px;
  color:var(--muted);
  font-weight:800;
}

.fg input,
.fg select{
  border:1px solid var(--line);
  background:var(--surface2);
  color:var(--text);
  padding:10px;
  border-radius:11px;
  outline:0;
}

.modalActions{
  display:flex;
  justify-content:flex-end;
  gap:8px;
  margin-top:15px;
}

.toast{
  position:fixed;
  right:22px;
  bottom:22px;
  background:#15203a;
  color:white;
  padding:11px 14px;
  border-radius:13px;
  opacity:0;
  transform:translateY(20px);
  transition:.25s;
  z-index:130;
  font-size:12px;
}

.toast.show{
  opacity:1;
  transform:none;
}

@media(max-width:1100px){
  :root{
    --side:205px;
  }

  .stats{
    grid-template-columns:1fr 1fr;
  }

  .grid3{
    grid-template-columns:1fr 1fr;
  }

  .grid3 .card:last-child{
    grid-column:1/-1;
  }

  .reportGrid{
    grid-template-columns:1fr 1fr;
  }
}

@media(max-width:760px){
  .app{
    display:block;
  }

  .side{
    display:none;
  }

  .top{
    height:64px;
    padding:0 14px;
  }

  .search{
    display:none;
  }

  .profile>div:last-child{
    display:none;
  }

  .content{
    padding:18px 14px 95px;
  }

  .hero h1{
    font-size:22px;
  }

  .date{
    display:none;
  }

  .stats{
    gap:9px;
  }

  .stat{
    padding:13px;
  }

  .value{
    font-size:20px;
  }

  .grid3,
  .grid2,
  .reportGrid{
    grid-template-columns:1fr;
  }

  .grid3 .card:last-child{
    grid-column:auto;
  }

  .mobileNav{
    display:grid;
    position:fixed;
    bottom:0;
    left:0;
    right:0;
    z-index:50;
    grid-template-columns:repeat(5,1fr);
    background:var(--surface);
    border-top:1px solid var(--line);
    padding:7px 5px calc(7px + env(safe-area-inset-bottom));
  }

  .mobileNav button{
    border:0;
    background:transparent;
    color:var(--muted);
    font-size:9px;
    padding:6px 2px;
  }

  .mobileNav button span{
    display:block;
    font-size:17px;
    margin-bottom:3px;
  }

  .mobileNav button.active{
    color:var(--blue);
  }

  .formGrid{
    grid-template-columns:1fr;
  }

  .fg.full{
    grid-column:auto;
  }
}
</style>
</head>

<body>

<div class="app">

  <aside class="side">

    <div class="brand">
      <div class="logo">AI</div>

      <div>
        <b>AI İşletme Asistanı</b>
        <small>Akıllı işletme yönetimi</small>
      </div>
    </div>

    <nav class="nav">
      <button class="active" data-page="dashboard">⌂ Ana Sayfa</button>
      <button data-page="shifts">◷ Vardiyalar</button>
      <button data-page="staff">♟ Personel</button>
      <button data-page="invoices">▤ Faturalar</button>
      <button data-page="expenses">₺ Giderler</button>
      <button data-page="reports">▥ Raporlar</button>
      <button data-page="settings">⚙ Ayarlar</button>
    </nav>

  </aside>

  <main class="main">

    <header class="top">

      <div class="search">
        ⌕
        <input id="globalSearch" placeholder="İşletmenizde ara...">
      </div>

      <div class="topActions">

        <button class="icon" id="themeBtn">
          ☾
        </button>

        <button class="icon" id="resetBtn">
          ↺
        </button>

        <div class="profile">

          <div class="avatar">
            DK
          </div>

          <div>
            <b>Demir Kaya</b>
            <small>İşletme Sahibi</small>
          </div>

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

          <div class="date" id="todayLabel"></div>

        </div>

        <div class="stats">

          <div class="stat">

            <div class="statTop">
              <div class="statIcon">👥</div>
              <span class="badge ok">Canlı</span>
            </div>

            <div class="label">
              Bugün Çalışan Personel
            </div>

            <div class="value" id="statStaff">
              0
            </div>

            <div class="note" id="statStaffNote"></div>

          </div>

          <div class="stat">

            <div class="statTop">
              <div class="statIcon">◉</div>
              <span class="badge wait">Ödeme</span>
            </div>

            <div class="label">
              Bekleyen Ödemeler
            </div>

            <div class="value" id="statPayments">
              ₺0
            </div>

            <div class="note" id="statPaymentsNote"></div>

          </div>

          <div class="stat">

            <div class="statTop">
              <div class="statIcon">▤</div>
              <span class="badge warn">Fatura</span>
            </div>

            <div class="label">
              Kesilecek Faturalar
            </div>

            <div class="value" id="statInvoices">
              0
            </div>

            <div class="note" id="statInvoiceTotal"></div>

          </div>

          <div class="stat">

            <div class="statTop">
              <div class="statIcon">⚠</div>
              <span class="badge danger">Dikkat</span>
            </div>

            <div class="label">
              Eksik Evrak
            </div>

            <div class="value" id="statDocs">
              0
            </div>

            <div class="note">
              Bugün tamamlanması önerilir
            </div>

          </div>

        </div>

        <div class="grid3">

          <div class="card">

            <div class="head">

              <h3>Vardiya Planı</h3>

              <button
                class="link"
                onclick="goPage('shifts')"
              >
                Tümünü Gör
              </button>

            </div>

            <div class="shiftList" id="dashboardShifts"></div>

          </div>

          <div class="card">

            <div class="head">

              <h3>Gelir - Gider Grafiği</h3>

              <span class="badge gray">
                Son 6 Ay
              </span>

            </div>

            <div class="chart" id="financeChart"></div>

          </div>

          <div class="card">

            <div class="head">

              <h3>Yapay Zekâ Önerileri</h3>

              <span>✨</span>

            </div>

            <div class="aiList" id="aiInsights"></div>

            <div class="aiBox">

              <b>🤖 AI Asistan</b>

              <div class="chips">

                <button
                  class="chip"
                  onclick="askPreset('Bu ay neden kâr düştü?')"
                >
                  Bu ay neden kâr düştü?
                </button>

                <button
                  class="chip"
                  onclick="askPreset('Hangi giderler arttı?')"
                >
                  Hangi giderler arttı?
                </button>

              </div>

              <div class="aiInput">

                <input
                  id="aiQuestion"
                  placeholder="Bir soru sorun..."
                >

                <button
                  class="send"
                  id="aiSend"
                >
                  ➜
                </button>

              </div>

              <div
                class="answer"
                id="aiAnswer"
              ></div>

            </div>

          </div>

        </div>

        <div class="grid2">

          <div class="card">

            <div class="head">

              <h3>Personel Durumu</h3>

              <button
                class="link"
                onclick="goPage('staff')"
              >
                Tümünü Gör
              </button>

            </div>

            <div class="tableWrap">

              <table>

                <thead>
                  <tr>
                    <th>Personel</th>
                    <th>Görev</th>
                    <th>Durum</th>
                    <th>Vardiya</th>
                  </tr>
                </thead>

                <tbody id="dashboardStaff"></tbody>

              </table>

            </div>

          </div>

          <div class="card">

            <div class="head">

              <h3>Son Faturalar</h3>

              <button
                class="link"
                onclick="goPage('invoices')"
              >
                Tümünü Gör
              </button>

            </div>

            <div class="tableWrap">

              <table>

                <thead>
                  <tr>
                    <th>Fatura</th>
                    <th>Tarih</th>
                    <th>Tutar</th>
                    <th>Durum</th>
                  </tr>
                </thead>

                <tbody id="dashboardInvoices"></tbody>

              </table>

            </div>

          </div>

        </div>

      </section>

      <section class="page" id="page-shifts">

        <h2 class="sectionTitle">
          Vardiyalar
        </h2>

        <p class="sub">
          Günlük vardiyaları yönetin.
        </p>

        <div class="toolbar">

          <button
            class="btn primary"
            onclick="openForm('shift')"
          >
            + Yeni Vardiya
          </button>

          <input
            class="field"
            id="shiftFilter"
            placeholder="Vardiya ara..."
            oninput="renderShiftsPage()"
          >

        </div>

        <div class="card">

          <div class="tableWrap">

            <table>

              <thead>
                <tr>
                  <th>Vardiya</th>
                  <th>Saat</th>
                  <th>Kişi</th>
                  <th>Durum</th>
                  <th>İşlem</th>
                </tr>
              </thead>

              <tbody id="shiftTable"></tbody>

            </table>

          </div>

        </div>

      </section>

      <section class="page" id="page-staff">

        <h2 class="sectionTitle">
          Personel
        </h2>

        <p class="sub">
          Personel, görev ve evrak durumunu takip edin.
        </p>

        <div class="toolbar">

          <button
            class="btn primary"
            onclick="openForm('staff')"
          >
            + Personel Ekle
          </button>

          <input
            class="field"
            id="staffFilter"
            placeholder="Ad / görev ara..."
            oninput="renderStaffPage()"
          >

          <select
            class="field"
            id="staffStatusFilter"
            onchange="renderStaffPage()"
          >
            <option value="">
              Tüm durumlar
            </option>

            <option>
              Çalışıyor
            </option>

            <option>
              Mola
            </option>

            <option>
              İzinli
            </option>

            <option>
              Pasif
            </option>

          </select>

        </div>

        <div class="card">

          <div class="tableWrap">

            <table>

              <thead>
                <tr>
                  <th>Personel</th>
                  <th>Görev</th>
                  <th>Telefon</th>
                  <th>Durum</th>
                  <th>Evrak</th>
                  <th>İşlem</th>
                </tr>
              </thead>

              <tbody id="staffTable"></tbody>

            </table>

          </div>

        </div>

      </section>

      <section class="page" id="page-invoices">

        <h2 class="sectionTitle">
          Faturalar
        </h2>

        <p class="sub">
          Kesilecek, bekleyen ve ödenen faturaları yönetin.
        </p>

        <div class="toolbar">

          <button
            class="btn primary"
            onclick="openForm('invoice')"
          >
            + Fatura Ekle
          </button>

          <input
            class="field"
            id="invoiceFilter"
            placeholder="Fatura / müşteri ara..."
            oninput="renderInvoicesPage()"
          >

          <select
            class="field"
            id="invoiceStatusFilter"
            onchange="renderInvoicesPage()"
          >
            <option value="">
              Tüm durumlar
            </option>

            <option>
              Taslak
            </option>

            <option>
              Kesilecek
            </option>

            <option>
              Bekliyor
            </option>

            <option>
              Ödendi
            </option>

          </select>

        </div>

        <div class="card">

          <div class="tableWrap">

            <table>

              <thead>
                <tr>
                  <th>No</th>
                  <th>Müşteri</th>
                  <th>Tarih</th>
                  <th>Tutar</th>
                  <th>Durum</th>
                  <th>İşlem</th>
                </tr>
              </thead>

              <tbody id="invoiceTable"></tbody>

            </table>

          </div>

        </div>

      </section>

      <section class="page" id="page-expenses">

        <h2 class="sectionTitle">
          Giderler
        </h2>

        <p class="sub">
          İşletme giderlerini kategori bazında izleyin.
        </p>

        <div class="toolbar">

          <button
            class="btn primary"
            onclick="openForm('expense')"
          >
            + Gider Ekle
          </button>

          <input
            class="field"
            id="expenseFilter"
            placeholder="Açıklama / kategori ara..."
            oninput="renderExpensesPage()"
          >

        </div>

        <div class="card">

          <div class="tableWrap">

            <table>

              <thead>
                <tr>
                  <th>Tarih</th>
                  <th>Kategori</th>
                  <th>Açıklama</th>
                  <th>Tutar</th>
                  <th>İşlem</th>
                </tr>
              </thead>

              <tbody id="expenseTable"></tbody>

            </table>

          </div>

        </div>

      </section>

      <section class="page" id="page-reports">

        <h2 class="sectionTitle">
          Raporlar
        </h2>

        <p class="sub">
          Finans ve operasyon özetlerini inceleyin.
        </p>

        <div class="reportGrid">

          <div class="card">
            <div class="label">
              TOPLAM GELİR
            </div>
            <div class="metric" id="reportRevenue"></div>
          </div>

          <div class="card">
            <div class="label">
              TOPLAM GİDER
            </div>
            <div class="metric" id="reportExpense"></div>
          </div>

          <div class="card">
            <div class="label">
              TAHMİNİ KÂR
            </div>
            <div class="metric" id="reportProfit"></div>
          </div>

          <div class="card">
            <div class="label">
              AKTİF PERSONEL
            </div>
            <div class="metric" id="reportStaff"></div>
          </div>

          <div class="card">
            <div class="label">
              BEKLEYEN TAHSİLAT
            </div>
            <div class="metric" id="reportPending"></div>
          </div>

          <div class="card">
            <div class="label">
              EKSİK EVRAK
            </div>
            <div class="metric" id="reportDocs"></div>
          </div>

        </div>

        <div class="grid2">

          <div class="card">

            <div class="head">
              <h3>6 Aylık Finans Özeti</h3>
            </div>

            <div class="chart" id="reportChart"></div>

          </div>

          <div class="card">

            <div class="head">
              <h3>Dışa Aktarım</h3>
            </div>

            <div style="display:grid;gap:9px">

              <button
                class="btn"
                onclick="exportCSV('staff')"
              >
                Personelleri CSV İndir
              </button>

              <button
                class="btn"
                onclick="exportCSV('invoices')"
              >
                Faturaları CSV İndir
              </button>

              <button
                class="btn"
                onclick="exportCSV('expenses')"
              >
                Giderleri CSV İndir
              </button>

            </div>

          </div>

        </div>

      </section>

      <section class="page" id="page-settings">

        <h2 class="sectionTitle">
          Ayarlar
        </h2>

        <p class="sub">
          Uygulama görünümünü ve AI bağlantısını yönetin.
        </p>

        <div class="grid2">

          <div class="card">

            <div class="head">
              <h3>Görünüm</h3>
            </div>

            <button
              class="btn"
              onclick="toggleTheme()"
            >
              Açık / Koyu Tema
            </button>

          </div>

          <div class="card">

            <div class="head">

              <h3>AI Bağlantısı</h3>

              <span
                class="badge gray"
                id="aiModeBadge"
              >
                Kontrol ediliyor
              </span>

            </div>

            <p
              class="sub"
              style="font-size:12px;line-height:1.6"
            >
              Render Environment alanına OPENAI_API_KEY
              eklerseniz gerçek AI modu açılır.
              Anahtar yoksa demo AI çalışır.
            </p>

          </div>

        </div>

      </section>

    </div>

  </main>

</div>

<nav class="mobileNav">

  <button
    class="active"
    data-page="dashboard"
  >
    <span>⌂</span>
    Ana Sayfa
  </button>

  <button data-page="shifts">
    <span>◷</span>
    Vardiya
  </button>

  <button data-page="staff">
    <span>♟</span>
    Personel
  </button>

  <button data-page="invoices">
    <span>▤</span>
    Fatura
  </button>

  <button data-page="reports">
    <span>▥</span>
    Rapor
  </button>

</nav>

<div class="modalBg" id="modalBg">

  <div class="modal">

    <div class="modalHead">

      <h3 id="modalTitle"></h3>

      <button
        class="close"
        onclick="closeModal()"
      >
        ✕
      </button>

    </div>

    <div id="modalBody"></div>

  </div>

</div>

<div
  class="toast"
  id="toast"
></div>

<script>
(function(){

var KEY="ai_business_v2";

var defaults={

 staff:[

  {
   id:1,
   name:"Ayşe Demir",
   role:"Kasiyer",
   phone:"0532 111 22 33",
   status:"Çalışıyor",
   shift:"Sabah",
   docs:true
  },

  {
   id:2,
   name:"Mehmet Yılmaz",
   role:"Aşçı",
   phone:"0535 222 33 44",
   status:"Çalışıyor",
   shift:"Öğle",
   docs:true
  },

  {
   id:3,
   name:"Zeynep Arslan",
   role:"Servis",
   phone:"0541 333 44 55",
   status:"Mola",
   shift:"Öğle",
   docs:false
  },

  {
   id:4,
   name:"Emre Çetin",
   role:"Depo Sorumlusu",
   phone:"0553 444 55 66",
   status:"Çalışıyor",
   shift:"Gece",
   docs:true
  },

  {
   id:5,
   name:"Can Kaya",
   role:"Kurye",
   phone:"0505 555 66 77",
   status:"Çalışıyor",
   shift:"Sabah",
   docs:false
  }

 ],

 shifts:[

  {
   id:1,
   name:"Sabah Vardiyası",
   time:"08:00 - 16:00",
   people:12,
   status:"Devam Ediyor",
   symbol:"☀"
  },

  {
   id:2,
   name:"Öğle Vardiyası",
   time:"16:00 - 00:00",
   people:14,
   status:"Başlamak Üzere",
   symbol:"◐"
  },

  {
   id:3,
   name:"Gece Vardiyası",
   time:"00:00 - 08:00",
   people:6,
   status:"Planlandı",
   symbol:"☾"
  }

 ],

 invoices:[

  {
   id:1,
   no:"#FTR-2026-001",
   customer:"Atlas Organizasyon",
   date:"2026-09-08",
   amount:32500,
   status:"Taslak"
  },

  {
   id:2,
   no:"#FTR-2026-002",
   customer:"Mavi Lojistik",
   date:"2026-09-06",
   amount:18000,
   status:"Kesilecek"
  },

  {
   id:3,
   no:"#FTR-2026-003",
   customer:"Nova Hizmet",
   date:"2026-09-04",
   amount:27000,
   status:"Bekliyor"
  },

  {
   id:4,
   no:"#FTR-2026-004",
   customer:"Kent Catering",
   date:"2026-09-01",
   amount:41000,
   status:"Ödendi"
  },

  {
   id:5,
   no:"#FTR-2026-005",
   customer:"Proline Etkinlik",
   date:"2026-08-29",
   amount:52500,
   status:"Bekliyor"
  }

 ],

 expenses:[

  {
   id:1,
   date:"2026-09-08",
   category:"Personel",
   description:"Günlük yevmiyeler",
   amount:28500
  },

  {
   id:2,
   date:"2026-09-07",
   category:"Ulaşım",
   description:"Servis gideri",
   amount:7600
  },

  {
   id:3,
   date:"2026-09-06",
   category:"Tedarik",
   description:"Operasyon malzemeleri",
   amount:12400
  },

  {
   id:4,
   date:"2026-09-03",
   category:"Ofis",
   description:"Ofis giderleri",
   amount:5900
  }

 ],

 finance:[

  {
   m:"Nis",
   revenue:142000,
   expense:98000
  },

  {
   m:"May",
   revenue:173000,
   expense:116000
  },

  {
   m:"Haz",
   revenue:162000,
   expense:124000
  },

  {
   m:"Tem",
   revenue:195000,
   expense:138000
  },

  {
   m:"Ağu",
   revenue:181000,
   expense:147000
  },

  {
   m:"Eyl",
   revenue:210000,
   expense:168000
  }

 ]

};

var state=load();

function clone(x){
 return JSON.parse(JSON.stringify(x));
}

function load(){

 try{

  var x=JSON.parse(
   localStorage.getItem(KEY)
  );

  return x&&x.staff
   ?x
   :clone(defaults);

 }catch(e){

  return clone(defaults);

 }

}

function save(){

 localStorage.setItem(
  KEY,
  JSON.stringify(state)
 );

 renderAll();

}

function money(n){

 return new Intl.NumberFormat(
  "tr-TR",
  {
   style:"currency",
   currency:"TRY",
   maximumFractionDigits:0
  }
 ).format(
  Number(n||0)
 );

}

function esc(v){

 return String(
  v==null
   ?""
   :v
 ).replace(
  /[&<>"']/g,
  function(m){

   return {
    "&":"&amp;",
    "<":"&lt;",
    ">":"&gt;",
    "\"":"&quot;",
    "'":"&#039;"
   }[m];

  }
 );

}

function uid(a){

 return Math.max.apply(
  null,
  [0].concat(
   a.map(function(x){
    return Number(x.id)||0;
   })
  )
 )+1;

}

function initials(n){

 return String(
  n||"?"
 )
 .split(" ")
 .filter(Boolean)
 .slice(0,2)
 .map(function(x){
  return x[0];
 })
 .join("")
 .toUpperCase();

}

function sc(s){

 if(
  [
   "Çalışıyor",
   "Devam Ediyor",
   "Ödendi"
  ].indexOf(s)>=0
 ){
  return "ok";
 }

 if(
  [
   "Başlamak Üzere",
   "Bekliyor"
  ].indexOf(s)>=0
 ){
  return "wait";
 }

 if(
  [
   "Mola",
   "Kesilecek"
  ].indexOf(s)>=0
 ){
  return "warn";
 }

 if(
  [
   "Pasif",
   "Eksik"
  ].indexOf(s)>=0
 ){
  return "danger";
 }

 return "gray";

}

function fd(v){

 if(!v){
  return "-";
 }

 var d=new Date(
  v+"T12:00:00"
 );

 return new Intl.DateTimeFormat(
  "tr-TR",
  {
   day:"2-digit",
   month:"short",
   year:"numeric"
  }
 ).format(d);

}

window.goPage=function(p){

 document
 .querySelectorAll(".page")
 .forEach(function(x){
  x.classList.remove("active");
 });

 var t=document.getElementById(
  "page-"+p
 );

 if(t){
  t.classList.add("active");
 }

 document
 .querySelectorAll("[data-page]")
 .forEach(function(x){

  x.classList.toggle(
   "active",
   x.getAttribute("data-page")===p
  );

 });

 if(p==="reports"){
  renderChart("reportChart");
 }

 window.scrollTo(0,0);

};

document
.querySelectorAll("[data-page]")
.forEach(function(b){

 b.addEventListener(
  "click",
  function(){
   goPage(
    b.getAttribute("data-page")
   );
  }
 );

});

function renderDashboard(){

 var active=
  state.staff.filter(function(x){
   return x.status==="Çalışıyor"||
          x.status==="Mola";
  }).length;

 var missing=
  state.staff.filter(function(x){
   return !x.docs;
  }).length;

 var pend=
  state.invoices.filter(function(x){
   return x.status!=="Ödendi";
  });

 var pending=
  pend.reduce(function(a,b){
   return a+Number(b.amount||0);
  },0);

 var cut=
  state.invoices.filter(function(x){
   return x.status==="Kesilecek";
  });

 statStaff.textContent=
  active;

 statStaffNote.textContent=
  "Toplam "+
  state.staff.length+
  " personel";

 statPayments.textContent=
  money(pending);

 statPaymentsNote.textContent=
  pend.length+
  " bekleyen kayıt";

 statInvoices.textContent=
  cut.length;

 statInvoiceTotal.textContent=
  "Toplam "+
  money(
   cut.reduce(function(a,b){
    return a+Number(b.amount||0);
   },0)
  );

 statDocs.textContent=
  missing;

 dashboardShifts.innerHTML=
  state.shifts.map(function(s){

   return (
    '<div class="shift">'+
     '<div class="symbol">'+
      esc(s.symbol)+
     '</div>'+
     '<div>'+
      '<b>'+
       esc(s.name)+
      '</b>'+
      '<small>'+
       esc(s.time)+
       ' • '+
       esc(s.people)+
       ' kişi'+
      '</small>'+
     '</div>'+
     '<span class="badge '+
      sc(s.status)+
     '">'+
      esc(s.status)+
     '</span>'+
    '</div>'
   );

  }).join("");

 dashboardStaff.innerHTML=
  state.staff
  .slice(0,5)
  .map(function(p){

   return (
    '<tr>'+
     '<td>'+
      '<div class="person">'+
       '<div class="face">'+
        esc(initials(p.name))+
       '</div>'+
       '<b>'+
        esc(p.name)+
       '</b>'+
      '</div>'+
     '</td>'+
     '<td>'+
      esc(p.role)+
     '</td>'+
     '<td>'+
      '<span class="badge '+
       sc(p.status)+
      '">'+
       esc(p.status)+
      '</span>'+
     '</td>'+
     '<td>'+
      esc(p.shift)+
     '</td>'+
    '</tr>'
   );

  }).join("");

 dashboardInvoices.innerHTML=
  state.invoices
  .slice()
  .sort(function(a,b){
   return String(b.date)
   .localeCompare(
    String(a.date)
   );
  })
  .slice(0,5)
  .map(function(i){

   return (
    '<tr>'+
     '<td>'+
      '<b>'+
       esc(i.no)+
      '</b>'+
      '<div class="note">'+
       esc(i.customer)+
      '</div>'+
     '</td>'+
     '<td>'+
      fd(i.date)+
     '</td>'+
     '<td>'+
      '<b>'+
       money(i.amount)+
      '</b>'+
     '</td>'+
     '<td>'+
      '<span class="badge '+
       sc(i.status)+
      '">'+
       esc(i.status)+
      '</span>'+
     '</td>'+
    '</tr>'
   );

  }).join("");

 aiInsights.innerHTML=
  '<div class="aiItem">'+
   '<div class="symbol">↘</div>'+
   '<div>'+
    '<b>Finans hareketlerini takip edin.</b>'+
    '<p>Gelir ve gider değişimini raporlardan karşılaştırabilirsiniz.</p>'+
   '</div>'+
  '</div>'+
  '<div class="aiItem">'+
   '<div class="symbol">▤</div>'+
   '<div>'+
    '<b>'+
     missing+
     ' personelin evrakı eksik.'+
    '</b>'+
    '<p>Personel ekranından eksik kayıtları kontrol edin.</p>'+
   '</div>'+
  '</div>';

 renderChart(
  "financeChart"
 );

}

window.renderShiftsPage=function(){

 var q=
  (shiftFilter.value||"")
  .toLocaleLowerCase(
   "tr-TR"
  );

 var d=
  state.shifts.filter(function(x){

   return (
    x.name+
    " "+
    x.time+
    " "+
    x.status
   )
   .toLocaleLowerCase("tr-TR")
   .indexOf(q)>=0;

  });

 shiftTable.innerHTML=
  d.map(function(s){

   return (
    '<tr>'+
     '<td>'+
      '<b>'+
       esc(s.symbol)+
       ' '+
       esc(s.name)+
      '</b>'+
     '</td>'+
     '<td>'+
      esc(s.time)+
     '</td>'+
     '<td>'+
      esc(s.people)+
     '</td>'+
     '<td>'+
      '<span class="badge '+
       sc(s.status)+
      '">'+
       esc(s.status)+
      '</span>'+
     '</td>'+
     '<td>'+
      '<button class="btn red" onclick="removeItem(\'shifts\','+
       s.id+
      ')">Sil</button>'+
     '</td>'+
    '</tr>'
   );

  }).join("")||
  '<tr><td colspan="5">Kayıt yok.</td></tr>';

};

window.renderStaffPage=function(){

 var q=
  (staffFilter.value||"")
  .toLocaleLowerCase(
   "tr-TR"
  );

 var sf=
  staffStatusFilter.value;

 var d=
  state.staff.filter(function(x){

   return (
    !sf||
    x.status===sf
   )&&
   (
    x.name+
    " "+
    x.role+
    " "+
    x.phone
   )
   .toLocaleLowerCase("tr-TR")
   .indexOf(q)>=0;

  });

 staffTable.innerHTML=
  d.map(function(p){

   return (
    '<tr>'+
     '<td>'+
      '<div class="person">'+
       '<div class="face">'+
        esc(initials(p.name))+
       '</div>'+
       '<b>'+
        esc(p.name)+
       '</b>'+
      '</div>'+
     '</td>'+
     '<td>'+
      esc(p.role)+
     '</td>'+
     '<td>'+
      esc(p.phone)+
     '</td>'+
     '<td>'+
      '<span class="badge '+
       sc(p.status)+
      '">'+
       esc(p.status)+
      '</span>'+
     '</td>'+
     '<td>'+
      '<span class="badge '+
       (p.docs?"ok":"danger")+
      '">'+
       (p.docs?"Tam":"Eksik")+
      '</span>'+
     '</td>'+
     '<td>'+
      '<button class="btn red" onclick="removeItem(\'staff\','+
       p.id+
      ')">Sil</button>'+
     '</td>'+
    '</tr>'
   );

  }).join("")||
  '<tr><td colspan="6">Kayıt yok.</td></tr>';

};

window.renderInvoicesPage=function(){

 var q=
  (invoiceFilter.value||"")
  .toLocaleLowerCase(
   "tr-TR"
  );

 var sf=
  invoiceStatusFilter.value;

 var d=
  state.invoices.filter(function(x){

   return (
    !sf||
    x.status===sf
   )&&
   (
    x.no+
    " "+
    x.customer
   )
   .toLocaleLowerCase("tr-TR")
   .indexOf(q)>=0;

  });

 invoiceTable.innerHTML=
  d.map(function(i){

   return (
    '<tr>'+
     '<td>'+
      '<b>'+
       esc(i.no)+
      '</b>'+
     '</td>'+
     '<td>'+
      esc(i.customer)+
     '</td>'+
     '<td>'+
      fd(i.date)+
     '</td>'+
     '<td>'+
      '<b>'+
       money(i.amount)+
      '</b>'+
     '</td>'+
     '<td>'+
      '<span class="badge '+
       sc(i.status)+
      '">'+
       esc(i.status)+
      '</span>'+
     '</td>'+
     '<td>'+
      '<button class="btn red" onclick="removeItem(\'invoices\','+
       i.id+
      ')">Sil</button>'+
     '</td>'+
    '</tr>'
   );

  }).join("")||
  '<tr><td colspan="6">Kayıt yok.</td></tr>';

};

window.renderExpensesPage=function(){

 var q=
  (expenseFilter.value||"")
  .toLocaleLowerCase(
   "tr-TR"
  );

 var d=
  state.expenses.filter(function(x){

   return (
    x.category+
    " "+
    x.description
   )
   .toLocaleLowerCase("tr-TR")
   .indexOf(q)>=0;

  });

 expenseTable.innerHTML=
  d.map(function(i){

   return (
    '<tr>'+
     '<td>'+
      fd(i.date)+
     '</td>'+
     '<td>'+
      '<span class="badge gray">'+
       esc(i.category)+
      '</span>'+
     '</td>'+
     '<td>'+
      esc(i.description)+
     '</td>'+
     '<td>'+
      '<b>'+
       money(i.amount)+
      '</b>'+
     '</td>'+
     '<td>'+
      '<button class="btn red" onclick="removeItem(\'expenses\','+
       i.id+
      ')">Sil</button>'+
     '</td>'+
    '</tr>'
   );

  }).join("")||
  '<tr><td colspan="5">Kayıt yok.</td></tr>';

};

function renderReports(){

 var rev=
  state.finance.reduce(function(a,b){
   return a+Number(b.revenue||0);
  },0);

 var exp=
  state.finance.reduce(function(a,b){
   return a+Number(b.expense||0);
  },0)+
  state.expenses.reduce(function(a,b){
   return a+Number(b.amount||0);
  },0);

 var pending=
  state.invoices
  .filter(function(x){
   return x.status!=="Ödendi";
  })
  .reduce(function(a,b){
   return a+Number(b.amount||0);
  },0);

 reportRevenue.textContent=
  money(rev);

 reportExpense.textContent=
  money(exp);

 reportProfit.textContent=
  money(rev-exp);

 reportStaff.textContent=
  state.staff.filter(function(x){
   return x.status==="Çalışıyor"||
          x.status==="Mola";
  }).length;

 reportPending.textContent=
  money(pending);

 reportDocs.textContent=
  state.staff.filter(function(x){
   return !x.docs;
  }).length;

}

function renderChart(id){

 var e=
  document.getElementById(id);

 if(!e){
  return;
 }

 var max=
  Math.max.apply(
   null,
   state.finance.map(function(x){
    return Math.max(
     x.revenue,
     x.expense
    );
   })
  );

 e.innerHTML=
  state.finance.map(function(x){

   return (
    '<div class="barGroup">'+
     '<div class="bar rev" title="Gelir '+
      money(x.revenue)+
     '" style="height:'+
      Math.max(
       8,
       x.revenue/max*100
      )+
     '%"></div>'+
     '<div class="bar exp" title="Gider '+
      money(x.expense)+
     '" style="height:'+
      Math.max(
       8,
       x.expense/max*100
      )+
     '%"></div>'+
     '<span class="month">'+
      esc(x.m)+
     '</span>'+
    '</div>'
   );

  }).join("");

}

function snapshot(){

 var rev=
  state.finance.reduce(function(a,b){
   return a+Number(b.revenue||0);
  },0);

 var exp=
  state.finance.reduce(function(a,b){
   return a+Number(b.expense||0);
  },0)+
  state.expenses.reduce(function(a,b){
   return a+Number(b.amount||0);
  },0);

 return {

  activeStaff:
   state.staff.filter(function(x){
    return x.status==="Çalışıyor"||
           x.status==="Mola";
   }).length,

  missingDocs:
   state.staff.filter(function(x){
    return !x.docs;
   }).length,

  pendingPayments:
   state.invoices
   .filter(function(x){
    return x.status!=="Ödendi";
   })
   .reduce(function(a,b){
    return a+Number(b.amount||0);
   },0),

  invoiceCount:
   state.invoices.length,

  revenue:
   rev,

  expense:
   exp

 };

}

window.removeItem=function(type,id){

 if(
  !confirm(
   "Bu kayıt silinsin mi?"
  )
 ){
  return;
 }

 state[type]=
  state[type].filter(function(x){
   return Number(x.id)!==Number(id);
  });

 save();

 toastMsg(
  "Kayıt silindi."
 );

};

window.openForm=function(type){

 var c={};

 if(type==="shift"){

  c={

   title:"Yeni Vardiya",

   html:
    '<div class="formGrid">'+

     '<div class="fg full">'+
      '<label>Vardiya Adı</label>'+
      '<input id="fName">'+
     '</div>'+

     '<div class="fg">'+
      '<label>Saat</label>'+
      '<input id="fTime" placeholder="08:00 - 16:00">'+
     '</div>'+

     '<div class="fg">'+
      '<label>Kişi</label>'+
      '<input id="fPeople" type="number" value="1">'+
     '</div>'+

     '<div class="fg full">'+
      '<label>Durum</label>'+
      '<select id="fStatus">'+
       '<option>Planlandı</option>'+
       '<option>Başlamak Üzere</option>'+
       '<option>Devam Ediyor</option>'+
      '</select>'+
     '</div>'+

    '</div>',

   save:function(){

    if(
     !fName.value.trim()
    ){
     return false;
    }

    state.shifts.push({

     id:
      uid(state.shifts),

     name:
      fName.value.trim(),

     time:
      fTime.value.trim()||
      "-",

     people:
      Number(
       fPeople.value||0
      ),

     status:
      fStatus.value,

     symbol:
      "◷"

    });

    return true;

   }

  };

 }

 if(type==="staff"){

  c={

   title:"Personel Ekle",

   html:
    '<div class="formGrid">'+

     '<div class="fg full">'+
      '<label>Ad Soyad</label>'+
      '<input id="fName">'+
     '</div>'+

     '<div class="fg">'+
      '<label>Görev</label>'+
      '<input id="fRole">'+
     '</div>'+

     '<div class="fg">'+
      '<label>Telefon</label>'+
      '<input id="fPhone">'+
     '</div>'+

     '<div class="fg">'+
      '<label>Durum</label>'+
      '<select id="fStatus">'+
       '<option>Çalışıyor</option>'+
       '<option>Mola</option>'+
       '<option>İzinli</option>'+
       '<option>Pasif</option>'+
      '</select>'+
     '</div>'+

     '<div class="fg">'+
      '<label>Vardiya</label>'+
      '<select id="fShift">'+
       '<option>Sabah</option>'+
       '<option>Öğle</option>'+
       '<option>Gece</option>'+
       '<option>-</option>'+
      '</select>'+
     '</div>'+

     '<div class="fg full">'+
      '<label>Evrak</label>'+
      '<select id="fDocs">'+
       '<option value="1">Tam</option>'+
       '<option value="0">Eksik</option>'+
      '</select>'+
     '</div>'+

    '</div>',

   save:function(){

    if(
     !fName.value.trim()
    ){
     return false;
    }

    state.staff.push({

     id:
      uid(state.staff),

     name:
      fName.value.trim(),

     role:
      fRole.value.trim()||
      "-",

     phone:
      fPhone.value.trim()||
      "-",

     status:
      fStatus.value,

     shift:
      fShift.value,

     docs:
      fDocs.value==="1"

    });

    return true;

   }

  };

 }

 if(type==="invoice"){

  c={

   title:"Fatura Ekle",

   html:
    '<div class="formGrid">'+

     '<div class="fg">'+
      '<label>Fatura No</label>'+
      '<input id="fNo">'+
     '</div>'+

     '<div class="fg">'+
      '<label>Müşteri</label>'+
      '<input id="fCustomer">'+
     '</div>'+

     '<div class="fg">'+
      '<label>Tarih</label>'+
      '<input id="fDate" type="date">'+
     '</div>'+

     '<div class="fg">'+
      '<label>Tutar</label>'+
      '<input id="fAmount" type="number">'+
     '</div>'+

     '<div class="fg full">'+
      '<label>Durum</label>'+
      '<select id="fStatus">'+
       '<option>Taslak</option>'+
       '<option>Kesilecek</option>'+
       '<option>Bekliyor</option>'+
       '<option>Ödendi</option>'+
      '</select>'+
     '</div>'+

    '</div>',

   save:function(){

    if(
     !fCustomer.value.trim()
    ){
     return false;
    }

    state.invoices.push({

     id:
      uid(state.invoices),

     no:
      fNo.value.trim()||
      (
       "#FTR-"+
       Date.now()
      ),

     customer:
      fCustomer.value.trim(),

     date:
      fDate.value||
      new Date()
      .toISOString()
      .slice(0,10),

     amount:
      Number(
       fAmount.value||0
      ),

     status:
      fStatus.value

    });

    return true;

   }

  };

 }

 if(type==="expense"){

  c={

   title:"Gider Ekle",

   html:
    '<div class="formGrid">'+

     '<div class="fg">'+
      '<label>Tarih</label>'+
      '<input id="fDate" type="date">'+
     '</div>'+

     '<div class="fg">'+
      '<label>Kategori</label>'+
      '<select id="fCategory">'+
       '<option>Personel</option>'+
       '<option>Ulaşım</option>'+
       '<option>Tedarik</option>'+
       '<option>Ofis</option>'+
       '<option>Diğer</option>'+
      '</select>'+
     '</div>'+

     '<div class="fg full">'+
      '<label>Açıklama</label>'+
      '<input id="fDescription">'+
     '</div>'+

     '<div class="fg full">'+
      '<label>Tutar</label>'+
      '<input id="fAmount" type="number">'+
     '</div>'+

    '</div>',

   save:function(){

    if(
     !fDescription.value.trim()
    ){
     return false;
    }

    state.expenses.push({

     id:
      uid(state.expenses),

     date:
      fDate.value||
      new Date()
      .toISOString()
      .slice(0,10),

     category:
      fCategory.value,

     description:
      fDescription.value.trim(),

     amount:
      Number(
       fAmount.value||0
      )

    });

    return true;

   }

  };

 }

 modalTitle.textContent=
  c.title;

 modalBody.innerHTML=
  c.html+
  '<div class="modalActions">'+
   '<button class="btn" onclick="closeModal()">Vazgeç</button>'+
   '<button class="btn primary" id="modalSave">Kaydet</button>'+
  '</div>';

 modalBg.classList.add(
  "show"
 );

 modalSave.onclick=function(){

  if(c.save()){

   save();

   closeModal();

   toastMsg(
    "Kayıt eklendi."
   );

  }else{

   toastMsg(
    "Zorunlu alanı doldurun."
   );

  }

 };

};

window.closeModal=function(){

 modalBg.classList.remove(
  "show"
 );

};

modalBg.addEventListener(
 "click",
 function(e){

  if(e.target===modalBg){
   closeModal();
  }

 }
);

async function askAI(){

 var q=
  aiQuestion.value.trim();

 if(!q){
  return;
 }

 aiAnswer.textContent=
  "Analiz ediliyor…";

 aiSend.disabled=
  true;

 try{

  var r=
   await fetch(
    "/api/ai",
    {
     method:"POST",

     headers:{
      "Content-Type":
       "application/json"
     },

     body:
      JSON.stringify({
       question:q,
       snapshot:snapshot()
      })
    }
   );

  var d=
   await r.json();

  if(!r.ok){

   throw new Error(
    d.error||
    "AI isteği başarısız"
   );

  }

  aiAnswer.textContent=
   d.answer+
   (
    d.mode==="local-demo"
     ?"\n\n(Demo AI modu)"
     :""
   );

 }catch(e){

  aiAnswer.textContent=
   "Hata: "+
   e.message;

 }finally{

  aiSend.disabled=
   false;

 }

}

aiSend.addEventListener(
 "click",
 askAI
);

aiQuestion.addEventListener(
 "keydown",
 function(e){

  if(e.key==="Enter"){
   askAI();
  }

 }
);

window.askPreset=function(q){

 aiQuestion.value=q;

 askAI();

};

function renderAll(){

 renderDashboard();

 renderShiftsPage();

 renderStaffPage();

 renderInvoicesPage();

 renderExpensesPage();

 renderReports();

}

function toastMsg(m){

 toast.textContent=m;

 toast.classList.add(
  "show"
 );

 clearTimeout(
  toast._x
 );

 toast._x=
  setTimeout(
   function(){

    toast.classList.remove(
     "show"
    );

   },
   2000
  );

}

window.toggleTheme=function(){

 document.body.classList.toggle(
  "dark"
 );

 localStorage.setItem(
  KEY+"_theme",
  document.body.classList.contains(
   "dark"
  )
   ?"dark"
   :"light"
 );

 themeBtn.textContent=
  document.body.classList.contains(
   "dark"
  )
   ?"☀"
   :"☾";

};

themeBtn.onclick=
 toggleTheme;

resetBtn.onclick=function(){

 if(
  confirm(
   "Demo verileri sıfırlansın mı?"
  )
 ){

  state=
   clone(defaults);

  save();

  toastMsg(
   "Demo verileri sıfırlandı."
  );

 }

};

window.exportCSV=function(type){

 var a=
  state[type]||[];

 if(!a.length){
  return;
 }

 var keys=
  Object.keys(
   a[0]
  );

 var csv=
  [
   keys.join(";")
  ]
  .concat(
   a.map(function(row){

    return keys.map(function(k){

     return (
      '"'+
      String(
       row[k]==null
        ?""
        :row[k]
      )
      .replace(
       /"/g,
       '""'
      )+
      '"'
     );

    }).join(";");

   })
  )
  .join("\n");

 var blob=
  new Blob(
   [
    "\uFEFF"+
    csv
   ],
   {
    type:
     "text/csv;charset=utf-8"
   }
  );

 var l=
  document.createElement(
   "a"
  );

 l.href=
  URL.createObjectURL(
   blob
  );

 l.download=
  type+
  ".csv";

 l.click();

};

globalSearch.addEventListener(
 "input",
 function(){

  var q=
   this.value
   .trim()
   .toLocaleLowerCase(
    "tr-TR"
   );

  if(q.length<2){
   return;
  }

  var hit=
   state.staff.find(function(x){

    return (
     x.name+
     " "+
     x.role
    )
    .toLocaleLowerCase("tr-TR")
    .indexOf(q)>=0;

   });

  if(hit){
   return goPage("staff");
  }

  hit=
   state.invoices.find(function(x){

    return (
     x.no+
     " "+
     x.customer
    )
    .toLocaleLowerCase("tr-TR")
    .indexOf(q)>=0;

   });

  if(hit){
   return goPage("invoices");
  }

 }
);

async function health(){

 try{

  var r=
   await fetch(
    "/api/health"
   );

  var d=
   await r.json();

  aiModeBadge.textContent=
   d.aiConfigured
    ?"OpenAI bağlı"
    :"Yerel demo";

  aiModeBadge.className=
   "badge "+
   (
    d.aiConfigured
     ?"ok"
     :"gray"
   );

 }catch(e){

  aiModeBadge.textContent=
   "Bağlantı yok";

  aiModeBadge.className=
   "badge danger";

 }

}

function init(){

 if(
  localStorage.getItem(
   KEY+"_theme"
  )==="dark"
 ){

  document.body.classList.add(
   "dark"
  );

  themeBtn.textContent=
   "☀";

 }

 todayLabel.textContent=
  new Intl.DateTimeFormat(
   "tr-TR",
   {
    weekday:"long",
    day:"2-digit",
    month:"long",
    year:"numeric"
   }
  ).format(
   new Date()
  );

 renderAll();

 health();

}

init();

})();
</script>

</body>
</html>`;

const server = http.createServer(async (req, res) => {
  const url = new URL(
    req.url,
    "http://" + (req.headers.host || "localhost")
  );

  if (
    req.method === "GET" &&
    url.pathname === "/api/health"
  ) {
    return sendJSON(res, 200, {
      ok: true,
      app: "AI İşletme Asistanı",
      aiConfigured: Boolean(OPENAI_API_KEY),
      model: OPENAI_API_KEY
        ? OPENAI_MODEL
        : "local-demo"
    });
  }

  if (
    req.method === "POST" &&
    url.pathname === "/api/ai"
  ) {
    try {
      const body = await readJSON(req);

      const question = String(
        body.question || ""
      ).trim();

      if (!question) {
        return sendJSON(res, 400, {
          error: "Soru boş olamaz."
        });
      }

      const answer = OPENAI_API_KEY
        ? await callOpenAI(
            question,
            body.snapshot || {}
          )
        : localAI(
            question,
            body.snapshot || {}
          );

      return sendJSON(res, 200, {
        answer,
        mode: OPENAI_API_KEY
          ? "openai"
          : "local-demo"
      });

    } catch (err) {

      return sendJSON(res, 500, {
        error:
          err.message ||
          "Sunucu hatası."
      });

    }
  }

  if (
    req.method === "GET" &&
    url.pathname === "/favicon.ico"
  ) {
    return send(
      res,
      204,
      ""
    );
  }

  if (req.method === "GET") {
    return send(
      res,
      200,
      HTML,
      "text/html; charset=utf-8"
    );
  }

  return sendJSON(res, 404, {
    error: "Bulunamadı."
  });
});

server.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      "AI İşletme Asistanı çalışıyor: http://localhost:" +
      PORT
    );

    console.log(
      "AI modu: " +
      (
        OPENAI_API_KEY
          ? "OpenAI / " + OPENAI_MODEL
          : "Yerel demo"
      )
    );

  }
);
