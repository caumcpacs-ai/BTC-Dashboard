/* ==========================================
   DASHBOARD – app.js
   ========================================== */

"use strict";

// ─── Palette ───────────────────────────────────────────────
const COLORS = {
  violet:  "#7c6ff7",
  pink:    "#f76f9d",
  teal:    "#4dd9c4",
  amber:   "#f7c36f",
  blue:    "#6faef7",
  purple:  "#a78bfa",
};

// Helper: hex → rgba
function rgba(hex, alpha) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ─── Chart.js defaults ────────────────────────────────────
Chart.defaults.font.family = "'Inter', sans-serif";
Chart.defaults.plugins.legend.display = false;
Chart.defaults.plugins.tooltip.cornerRadius = 10;
Chart.defaults.plugins.tooltip.padding = 10;
Chart.defaults.animation.duration = 900;
Chart.defaults.animation.easing = "easeOutQuart";

// ─── 1. TRANSITION CHART (Grouped Bar) ────────────────────
(function buildTransitionChart() {
  const ctx = document.getElementById("transitionChart");
  if (!ctx) return;

  const labels = ["0.0","1.0","2.0","3.0","4.0","5.0","6.0","7.0","8.0"];
  const datasets = [
    { label:"Te tota",   data:[28,32,22,18,28,35,20,22,18], backgroundColor: rgba(COLORS.violet,.8), borderRadius:4, borderSkipped:false },
    { label:"Posse",     data:[20,18,28,22,18,24,32,18,24], backgroundColor: rgba(COLORS.pink,.8),   borderRadius:4, borderSkipped:false },
    { label:"Vis an",    data:[14,22,18,26,16,20,18,28,16], backgroundColor: rgba(COLORS.teal,.8),   borderRadius:4, borderSkipped:false },
    { label:"Electram1", data:[10,14,16,18,12,16,14,16,12], backgroundColor: rgba(COLORS.amber,.8),  borderRadius:4, borderSkipped:false },
    { label:"Electram2", data:[8, 10,12,14,10,12,10,12,10], backgroundColor: rgba(COLORS.blue,.8),   borderRadius:4, borderSkipped:false },
  ];

  new Chart(ctx, {
    type: "bar",
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { grid:{ display:false }, ticks:{ font:{ size:10 }, color:"#b0b3cc" } },
        y: { grid:{ color:"rgba(0,0,0,.04)", drawBorder:false }, ticks:{ font:{ size:10 }, color:"#b0b3cc" }, border:{ display:false } },
      },
      plugins: { legend:{ display:false }, tooltip:{ mode:"index", intersect:false } },
    },
  });
})();

// ─── 2. PRODUCT CHART (Horizontal Lollipop / Line) ────────
(function buildProductChart() {
  const ctx = document.getElementById("productChart");
  if (!ctx) return;

  // Concentric-ring style: polar area
  new Chart(ctx, {
    type: "polarArea",
    data: {
      labels: ["A","B","C","D","E"],
      datasets: [{
        data: [57, 22, 10, 6, 5],
        backgroundColor: [
          rgba(COLORS.violet,.85),
          rgba(COLORS.pink,.85),
          rgba(COLORS.teal,.85),
          rgba(COLORS.amber,.85),
          rgba(COLORS.blue,.85),
        ],
        borderWidth: 0,
        spacing: 4,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: { r:{ display:false } },
      plugins: { legend:{ display:false }, tooltip:{ callbacks:{
        label: (ctx) => ` ${ctx.label}: ${ctx.raw}%`
      }}},
      animation: { duration:1200 },
    },
  });
})();

// ─── 3. SALES DONUT ──────────────────────────────────────
(function buildSalesChart() {
  const ctx = document.getElementById("salesChart");
  if (!ctx) return;

  new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["A","B","C","D","E","F"],
      datasets: [{
        data: [72.3, 4.5, 8.1, 3.2, 7.7, 4.2],
        backgroundColor: [
          COLORS.violet, COLORS.pink, COLORS.teal,
          COLORS.amber, COLORS.blue, COLORS.purple,
        ],
        borderWidth: 3,
        borderColor: "#fff",
        hoverBorderWidth: 3,
        hoverOffset: 6,
      }],
    },
    options: {
      responsive: false,
      cutout: "68%",
      plugins: {
        legend: { display: false },
        tooltip: { callbacks:{ label:(c) => ` ${c.label}: ${c.raw}%` } },
      },
      animation: { duration:1400, animateRotate:true },
    },
  });
})();

// ─── 4. ACTIVITY RADIAL ──────────────────────────────────
(function buildActivityChart() {
  const ctx = document.getElementById("activityChart");
  if (!ctx) return;

  // Radar chart resembling a sunburst
  const N = 24;
  const base  = Array.from({length:N},(_,i)=>Math.sin(i/N*Math.PI*2)*18+20);
  const spike = Array.from({length:N},(_,i)=>Math.cos(i/N*Math.PI*4)*30+50);

  new Chart(ctx, {
    type: "radar",
    data: {
      labels: Array.from({length:N},(_,i)=>`${i}`),
      datasets: [
        {
          data: spike,
          backgroundColor: rgba(COLORS.violet,.15),
          borderColor: COLORS.violet,
          borderWidth: 1.5,
          pointRadius: 0,
          fill: true,
        },
        {
          data: base,
          backgroundColor: rgba(COLORS.pink,.10),
          borderColor: COLORS.pink,
          borderWidth: 1,
          pointRadius: 0,
          fill: true,
        },
      ],
    },
    options: {
      responsive: false,
      scales: {
        r: {
          display: false,
          min: 0, max: 90,
          grid: { display:false },
          pointLabels: { display:false },
        },
      },
      plugins: { legend:{ display:false }, tooltip:{ enabled:false } },
      animation: { duration:1600 },
    },
  });
})();

// ─── 5. MINI BAR CHARTS ──────────────────────────────────
function buildMiniBar(id, color, data) {
  const ctx = document.getElementById(id);
  if (!ctx) return;

  new Chart(ctx, {
    type: "bar",
    data: {
      labels: data.map((_,i)=>i),
      datasets: [{
        data,
        backgroundColor: data.map((v,i) => i === data.length-1 ? color : rgba(color,.35)),
        borderRadius: 3,
        borderSkipped: false,
        barPercentage: 0.72,
      }],
    },
    options: {
      responsive: false,
      scales: { x:{ display:false }, y:{ display:false } },
      plugins: { legend:{ display:false }, tooltip:{ enabled:false } },
      animation: { duration:800 },
    },
  });
}

buildMiniBar("miniBar1", COLORS.teal,   [18,24,16,28,22,30,26,34]);
buildMiniBar("miniBar2", COLORS.pink,   [28,20,24,18,22,16,20,14]);
buildMiniBar("miniBar3", COLORS.violet, [14,18,22,16,26,20,28,32]);
buildMiniBar("miniBar4", COLORS.amber,  [32,26,28,24,20,22,18,16]);

// ─── SIDEBAR NAV INTERACTION ─────────────────────────────
document.querySelectorAll(".nav-item").forEach(item => {
  item.addEventListener("click", e => {
    e.preventDefault();
    document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
    item.classList.add("active");
  });
});

// ─── Sidebar toggle dots ─────────────────────────────────
document.querySelectorAll(".toggle-item").forEach(dot => {
  dot.addEventListener("click", () => {
    document.querySelectorAll(".toggle-item").forEach(d => d.classList.remove("active"));
    dot.classList.add("active");
  });
});

// ─── Notification badge dismiss ─────────────────────────
const notifBtn = document.getElementById("btn-notification");
if (notifBtn) {
  notifBtn.addEventListener("click", () => {
    const badge = notifBtn.querySelector(".notif-badge");
    if (badge) { badge.style.display = "none"; }
  });
}

// ─── Search input focus effect ───────────────────────────
const searchInput = document.getElementById("search-input");
const searchWrap  = searchInput && searchInput.closest(".topbar-search");
if (searchInput && searchWrap) {
  searchInput.addEventListener("focus", () => { searchWrap.style.boxShadow = "0 0 0 2px #7c6ff730"; });
  searchInput.addEventListener("blur",  () => { searchWrap.style.boxShadow = ""; });
}

// ─── File Upload Interaction ─────────────────────────────
const btnMenu = document.getElementById("btn-menu");
const fileUpload = document.getElementById("menu-file-upload");
if (btnMenu && fileUpload) {
  btnMenu.addEventListener("click", () => {
    fileUpload.click();
  });

  fileUpload.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) {
      alert(`File selected: ${file.name}`);
      // Reset input so the same file can be selected again
      e.target.value = '';
    }
  });
}
