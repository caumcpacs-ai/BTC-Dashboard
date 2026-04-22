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

let chartMonthlyTotal, chartMonthlyByYear, chartMonthlyInOut;

let currentDashboardData = null;
let currentFilters = {};

const FILTER_LABELS = {
  Hak: "학년도",
  Year: "Year",
  Month: "Month",
  Weekday: "Weekday",
  Gbn: "구분",
  JuYa: "주야간",
  Room: "촬영실"
};

// ─── API Calls ────────────────────────────────────────────
async function fetchDashboardData() {
  try {
    let filterObj = {};
    for (let key in currentFilters) {
      if (currentFilters[key].length > 0) {
        filterObj[key] = currentFilters[key].join("|||");
      }
    }
    const url = `/api/stats?filters=${encodeURIComponent(JSON.stringify(filterObj))}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to fetch stats');
    currentDashboardData = await res.json();
    renderCharts(currentDashboardData);
  } catch (err) {
    console.error('Error fetching dashboard data:', err);
  }
}

async function fetchFilters() {
  try {
    const res = await fetch('/api/filters');
    if (!res.ok) throw new Error('Failed to fetch filters');
    const filterData = await res.json();
    renderSlicers(filterData);
  } catch (err) {
    console.error('Error fetching filters:', err);
  }
}

// ─── SLICER RENDERING ────────────────────────────────────
function renderSlicers(filterData) {
  const container = document.getElementById('slicer-container');
  if (!container) return;
  container.innerHTML = '';

  for (let key of Object.keys(FILTER_LABELS)) {
    if (!filterData[key] || filterData[key].length === 0) continue;

    let items = [...filterData[key]];
    const allNumeric = items.every(v => !isNaN(v) && v !== '');
    if (allNumeric) {
      items.sort((a, b) => Number(a) - Number(b));
    } else {
      items.sort((a, b) => a.localeCompare(b, 'ko'));
    }

    const groupDiv = document.createElement('div');
    groupDiv.className = 'slicer-group';

    const titleDiv = document.createElement('div');
    titleDiv.className = 'slicer-title';
    titleDiv.innerHTML = `
      <span>${FILTER_LABELS[key]}</span>
      <button class="slicer-clear" data-key="${key}">초기화</button>
    `;

    const itemsDiv = document.createElement('div');
    itemsDiv.className = 'slicer-items';

    const GRID3_KEYS = ['Month', 'Weekday'];
    const isGrid3 = GRID3_KEYS.includes(key);

    if (isGrid3) {
      itemsDiv.style.display = 'grid';
      itemsDiv.style.gridTemplateColumns = 'repeat(3, 1fr)';
      itemsDiv.style.gap = '4px';
      itemsDiv.style.padding = '8px';
      const rows = Math.ceil(items.length / 3);
      itemsDiv.style.maxHeight = (rows * 32 + 40 + 12) + 'px';
      itemsDiv.style.overflowY = 'visible';
    } else {
      const ITEM_HEIGHT = 30;
      const PADDING = 16;
      const maxVisible = 5;
      const totalItems = items.length + 1;
      const dynamicHeight = Math.min(totalItems, maxVisible) * ITEM_HEIGHT + PADDING;
      itemsDiv.style.maxHeight = dynamicHeight + 'px';
      itemsDiv.style.overflowY = totalItems > maxVisible ? 'auto' : 'visible';
    }

    currentFilters[key] = [];

    // 전체 button
    const allDiv = document.createElement('div');
    allDiv.className = 'slicer-item slicer-all active';
    allDiv.textContent = '전체';
    allDiv.dataset.key = key;
    if (isGrid3) allDiv.style.gridColumn = '1 / -1';

    const refreshAllState = () => {
      if (currentFilters[key].length === 0) allDiv.classList.add('active');
      else allDiv.classList.remove('active');
    };

    allDiv.addEventListener('click', () => {
      currentFilters[key] = [];
      itemsDiv.querySelectorAll('.slicer-item:not(.slicer-all)').forEach(n => n.classList.remove('active'));
      allDiv.classList.add('active');
      fetchDashboardData();
    });
    itemsDiv.appendChild(allDiv);

    items.forEach(val => {
      const itemDiv = document.createElement('div');
      itemDiv.className = 'slicer-item';
      if (isGrid3) {
        itemDiv.style.justifyContent = 'center';
        itemDiv.style.textAlign = 'center';
        itemDiv.style.padding = '5px 4px';
        itemDiv.style.fontSize = '11px';
      }
      itemDiv.textContent = val;
      itemDiv.dataset.key = key;
      itemDiv.dataset.val = val;

      itemDiv.addEventListener('click', () => {
        itemDiv.classList.toggle('active');
        if (itemDiv.classList.contains('active')) {
          if (!currentFilters[key].includes(val)) currentFilters[key].push(val);
        } else {
          currentFilters[key] = currentFilters[key].filter(v => v !== val);
        }
        refreshAllState();
        fetchDashboardData();
      });

      itemsDiv.appendChild(itemDiv);
    });

    const clearBtn = titleDiv.querySelector('.slicer-clear');
    clearBtn.addEventListener('click', () => {
      currentFilters[key] = [];
      itemsDiv.querySelectorAll('.slicer-item:not(.slicer-all)').forEach(n => n.classList.remove('active'));
      allDiv.classList.add('active');
      fetchDashboardData();
    });

    groupDiv.appendChild(titleDiv);
    groupDiv.appendChild(itemsDiv);
    container.appendChild(groupDiv);
  }
}

// ─── Shared helpers ───────────────────────────────────────
function buildMonthKeys(data) {
  return [...new Set(data.map(d => `${d.YR}-${String(d.MN).padStart(2,'0')}`))].sort();
}

function lineChartOptions(legendPos = 'right') {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: '#6e6fa0', font: { size: 11 } }
      },
      y: {
        display: false,
        grid: { display: false },
        ticks: { display: false }
      }
    },
    plugins: {
      legend: {
        display: true,
        position: legendPos,
        labels: { usePointStyle: true, pointStyleWidth: 10, color: '#6e6fa0', font: { size: 11 } }
      },
      tooltip: {
        callbacks: { label: c => ` ${c.dataset.label}: ${c.parsed.y.toLocaleString()}건` }
      }
    }
  };
}

// ─── CHART 1: 월별 검사 현황 (구분별 선 그래프) ────────────
function renderMonthlyTotalChart(monthlyData) {
  const ctx = document.getElementById('chartMonthlyTotal');
  if (!ctx || !monthlyData || !monthlyData.length) return;

  const monthKeys = buildMonthKeys(monthlyData);
  const categories = [...new Set(monthlyData.map(d => d.Gbn).filter(Boolean))].sort();
  const palette = [COLORS.blue, COLORS.pink, COLORS.amber, COLORS.teal, COLORS.violet, COLORS.purple, '#ff8a65', '#4dd9e1'];

  const datasets = categories.map((cat, idx) => {
    const color = palette[idx % palette.length];
    const data = monthKeys.map(mk => {
      const [y, m] = mk.split('-');
      return monthlyData
        .filter(d => String(d.YR) === y && String(d.MN).padStart(2,'0') === m && d.Gbn === cat)
        .reduce((s, d) => s + parseInt(d.Cnt || 0), 0);
    });
    return {
      label: cat,
      data,
      borderColor: color,
      backgroundColor: rgba(color, 0.05),
      pointBackgroundColor: color,
      pointRadius: 3,
      pointHoverRadius: 5,
      borderWidth: 2,
      tension: 0.3,
      fill: false,
    };
  });

  const grandTotal = monthlyData.reduce((s, d) => s + parseInt(d.Cnt || 0), 0);
  const avg = monthKeys.length ? Math.round(grandTotal / monthKeys.length) : 0;

  const badge = document.getElementById('badge-monthly-total');
  if (badge) badge.innerHTML =
    `월평균 &nbsp;<strong style="color:var(--violet);font-size:15px;">${avg.toLocaleString()}</strong>건` +
    `&nbsp;&nbsp;|&nbsp;&nbsp;합계 <strong style="color:var(--teal);font-size:14px;">${grandTotal.toLocaleString()}</strong>건`;

  const labels = monthKeys.map(mk => {
    const [y, m] = mk.split('-');
    return parseInt(m) === 1 ? `${y}\n1` : `${parseInt(m)}`;
  });

  if (chartMonthlyTotal) chartMonthlyTotal.destroy();
  chartMonthlyTotal = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      ...lineChartOptions('right'),
      plugins: {
        ...lineChartOptions('right').plugins,
        legend: { display: true, position: 'right' }
      }
    }
  });
}

// ─── CHART 2: 연도별 월별 검사 현황 ──────────────────────────
function renderMonthlyByYearChart(monthlyData) {
  const ctx = document.getElementById('chartMonthlyByYear');
  if (!ctx || !monthlyData || !monthlyData.length) return;

  const years = [...new Set(monthlyData.map(d => String(d.YR)))].sort();
  const MONTHS = [1,2,3,4,5,6,7,8,9,10,11,12];
  const labels = MONTHS.map(m => `${m}월`);
  const palette = [COLORS.blue, COLORS.pink, COLORS.amber, COLORS.teal, COLORS.violet, COLORS.purple];

  const datasets = years.map((yr, idx) => {
    const color = palette[idx % palette.length];
    const data = MONTHS.map(m =>
      monthlyData.filter(d => String(d.YR) === yr && parseInt(d.MN) === m)
                 .reduce((s, d) => s + parseInt(d.Cnt || 0), 0)
    );
    return {
      label: `${yr}년`,
      data,
      borderColor: color,
      backgroundColor: rgba(color, 0.08),
      pointBackgroundColor: color,
      pointRadius: 4,
      pointHoverRadius: 6,
      borderWidth: 2,
      tension: 0.3,
      fill: false,
    };
  });

  if (chartMonthlyByYear) chartMonthlyByYear.destroy();
  chartMonthlyByYear = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: lineChartOptions('right'),
  });
}

// ─── CHART 3: 입원/외래 구분 월별 현황 ───────────────────────
function renderMonthlyInOutChart(inOutData) {
  const ctx = document.getElementById('chartMonthlyInOut');
  if (!ctx || !inOutData || !inOutData.length) return;

  const typeMap = {};
  inOutData.forEach(d => {
    const t = d.InOutType || '기타';
    typeMap[t] = (typeMap[t] || 0) + parseInt(d.Cnt || 0);
  });

  const labels = Object.keys(typeMap);
  const data = Object.values(typeMap);

  const colors = [COLORS.blue, COLORS.pink, COLORS.amber, COLORS.teal, COLORS.violet, COLORS.purple];

  if (chartMonthlyInOut) chartMonthlyInOut.destroy();
  chartMonthlyInOut = new Chart(ctx, {
    type: 'pie',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors.map(c => rgba(c, 0.7)),
        borderColor: '#fff',
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: true, position: 'right' },
        tooltip: {
          callbacks: {
            label: c => ` ${c.label}: ${c.parsed.toLocaleString()}건 (${((c.parsed / data.reduce((a,b)=>a+b,0)) * 100).toFixed(1)}%)`
          }
        }
      }
    }
  });
}

// ─── CHART 4: 시간대별 촬영 현황 ─────────────────────────────
let chartHourly;
function renderHourlyChart(hourlyData) {
  const ctx = document.getElementById('chartHourly');
  if (!ctx || !hourlyData || !hourlyData.length) return;

  const labels = hourlyData.map(d => `${d.HR}\uC2DC`);
  const data = hourlyData.map(d => parseInt(d.Cnt || 0));

  if (chartHourly) chartHourly.destroy();
  chartHourly = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: '\uC2DC\uAC04\uB300\uBCC4',
        data,
        borderColor: COLORS.teal,
        backgroundColor: rgba(COLORS.teal, 0.1),
        pointBackgroundColor: COLORS.teal,
        borderWidth: 2,
        tension: 0.3,
        fill: true
      }]
    },
    options: lineChartOptions('top')
  });
}

// ─── CHART 5: 처방과별 검사 비율 ─────────────────────────────
let chartDept;
function renderDeptChart(deptData) {
  const ctx = document.getElementById('chartDept');
  if (!ctx || !deptData || !deptData.length) return;

  const labels = deptData.map(d => d.Dept);
  const data = deptData.map(d => parseInt(d.Cnt || 0));

  if (chartDept) chartDept.destroy();
  chartDept = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: '\uAC80\uC0AC\uAC74\uC218',
        data,
        backgroundColor: COLORS.violet,
        borderRadius: 4
      }]
    },
    options: {
      ...lineChartOptions('top'),
      indexAxis: 'y',
      plugins: {
        ...lineChartOptions('top').plugins,
        legend: { display: false }
      }
    }
  });
}

// ─── CHART 6: 요일별 검사 현황 ─────────────────────────────
let chartWeekday;
function renderWeekdayChart(weekdayData) {
  const ctx = document.getElementById('chartWeekday');
  if (!ctx || !weekdayData || !weekdayData.length) return;

  const WD_ORDER = ['\uC6d4', '\uD654', '\uC218', '\uBAA9', '\uAE08', '\uD1A0', '\uC77C'];
  const sorted = WD_ORDER.map(wd => {
    const found = weekdayData.find(d => d.WD && d.WD.includes(wd));
    return found ? parseInt(found.Cnt || 0) : 0;
  });

  if (chartWeekday) chartWeekday.destroy();
  chartWeekday = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: WD_ORDER.map(w => w + '\uC694\uC77C'),
      datasets: [{
        label: '\uAC80\uC0AC\uAC74\uC218',
        data: sorted,
        backgroundColor: COLORS.amber,
        borderRadius: 4
      }]
    },
    options: {
      ...lineChartOptions('top'),
      plugins: {
        ...lineChartOptions('top').plugins,
        legend: { display: false }
      }
    }
  });
}

// ─── MAIN: render all charts ─────────────────────────────
function renderCharts(data) {
  renderMonthlyTotalChart(data.monthly);
  renderMonthlyByYearChart(data.monthly);
  renderMonthlyInOutChart(data.monthlyInOut);
  renderHourlyChart(data.hourly);
  renderDeptChart(data.dept);
  renderWeekdayChart(data.weekday);

  // Update last upload time display
  const timeEl = document.getElementById('last-upload-time');
  if (timeEl && data.lastUpdate) {
    const d = new Date(data.lastUpdate);
    const dateStr = d.getFullYear() + '-' + 
                    String(d.getMonth() + 1).padStart(2,'0') + '-' + 
                    String(d.getDate()).padStart(2,'0') + ' ' + 
                    String(d.getHours()).padStart(2,'0') + ':' + 
                    String(d.getMinutes()).padStart(2,'0');
    timeEl.innerHTML = `<span style="font-size:10px; opacity:0.7;">\uCD5C\uC885 \uC5C5\uB370\uC774\uD2B8:</span> ${dateStr}`;
  }
}

// ─── Initialize ──────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  fetchFilters();
  fetchDashboardData();
});

// ─── Sidebar toggle dots ─────────────────────────────────
document.querySelectorAll(".toggle-item").forEach(dot => {
  dot.addEventListener("click", () => {
    document.querySelectorAll(".toggle-item").forEach(d => d.classList.remove("active"));
    dot.classList.add("active");
  });
});

// ─── Search input focus effect ───────────────────────────
const searchInput = document.getElementById("search-input");
const searchWrap  = searchInput && searchInput.closest(".topbar-search");
if (searchInput && searchWrap) {
  searchInput.addEventListener("focus", () => { searchWrap.style.boxShadow = "0 0 0 2px #7c6ff730"; });
  searchInput.addEventListener("blur",  () => { searchWrap.style.boxShadow = ""; });
}

// ─── File Upload Interaction ─────────────────────────────
const btnUpload = document.getElementById("btn-upload");
const fileUpload = document.getElementById("menu-file-upload");
if (btnUpload && fileUpload) {
  btnUpload.addEventListener("click", () => { fileUpload.click(); });

  fileUpload.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (file) {
      alert(`Uploading ${file.name}... Please wait.`);
      const formData = new FormData();
      formData.append('file', file);
      try {
        const response = await fetch('/upload', { method: 'POST', body: formData });
        const result = await response.json();
        if (response.ok) {
          alert(`Success: ${result.message}\n${result.details || ''}`);
          fetchDashboardData();
        } else {
          alert(`Error: ${result.message}\n${result.error || ''}`);
        }
      } catch (err) {
        alert(`Upload failed: ${err.message}`);
      }
      e.target.value = '';
    }
  });
}
