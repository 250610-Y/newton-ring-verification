import { filterRecords, serializeRecordsCsv, verifyRadius } from "./logic.js";

const SYSTEM_RADIUS = 0.1969;
const scenarios = {
  qualified: { value: 0.2018, title: "NR-024 · 合格样例" },
  "operation-error": { value: 0.2264, title: "NR-024 · 操作误差" },
  review: { value: 0.254, title: "NR-024 · 重点复核" },
};

const layerMap = {
  original: { src: "./assets/sample-original.png", label: "原始增强图", alt: "牛顿环实验原始增强图像" },
  rings: { src: "./assets/sample-rings.png", label: "圆环拟合标注", alt: "牛顿环圆心与圆环拟合标注图" },
  overlay: { src: "./assets/sample-overlay.png", label: "缺陷检测叠加", alt: "牛顿环局部缺陷检测叠加图" },
  mask: { src: "./assets/sample-mask.png", label: "缺陷二值掩膜", alt: "牛顿环缺陷二值掩膜图" },
  heatmap: { src: "./assets/sample-heatmap.png", label: "面形偏差热力图", alt: "平凸透镜平整度热力图" },
};

const sourceRows = [
  ["A001",3.7925,.022],["A002",3.5064,.061],["A003",3.2770,.084],["A004",3.8509,.032],
  ["A005",3.9989,.129],["A006",3.4254,.046],["A007",1.9519,.228],["A008",2.7393,.074],
  ["A009",2.1628,.102],["A010",3.0303,.019],["A011",2.8841,.176],["A012",3.2186,.052],
  ["A013",3.7062,.097],["A014",2.4817,.263],["A015",3.6418,.043],["A016",2.9704,.079],
  ["A017",3.3352,.116],["A018",2.5261,.024],["A019",3.9097,.204],["A020",2.8043,.069],
  ["A021",3.1218,.151],["A022",2.6485,.037],["A023",3.4721,.087],["A024",3.0164,.056],
];

const records = sourceRows.map(([id, systemRadius, delta], index) => {
  const studentRadius = Number((systemRadius * (1 + (index % 4 === 0 ? -delta : delta))).toFixed(4));
  const result = verifyRadius(studentRadius, systemRadius);
  return { id, systemRadius, studentRadius, relativeError: result.relativeError, status: result.status, label: result.label };
});

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function switchView(view) {
  $$(".nav-item").forEach((button) => button.classList.toggle("is-active", button.dataset.view === view));
  $$(".workspace").forEach((section) => {
    const active = section.id === `view-${view}`;
    section.hidden = !active;
    section.classList.toggle("is-active", active);
  });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function validateRadius() {
  const input = $("#student-radius");
  const value = Number(input.value);
  const valid = Number.isFinite(value) && value > 0;
  $("#radius-error").textContent = valid ? "" : "请输入大于 0 的曲率半径";
  $("#run-analysis").disabled = !valid;
  return valid ? value : null;
}

function resetProgress() {
  $("#progress-percent").textContent = "0%";
  $("#progress-bar").style.width = "0%";
  $$("#analysis-steps li").forEach((item) => {
    item.className = "";
    $("b", item).textContent = "等待";
  });
}

async function runAnalysis() {
  const studentRadius = validateRadius();
  if (studentRadius === null) return;
  const button = $("#run-analysis");
  button.disabled = true;
  resetProgress();
  const steps = $$("#analysis-steps li");
  for (let index = 0; index < steps.length; index += 1) {
    const item = steps[index];
    item.classList.add("is-active");
    $("b", item).textContent = "处理中";
    await wait(330);
    item.classList.remove("is-active");
    item.classList.add("is-done");
    $("b", item).textContent = "完成";
    const percent = Math.round(((index + 1) / steps.length) * 100);
    $("#progress-percent").textContent = `${percent}%`;
    $("#progress-bar").style.width = `${percent}%`;
  }
  const result = verifyRadius(studentRadius, SYSTEM_RADIUS);
  const panel = $("#result-panel");
  panel.dataset.status = result.status;
  $("#result-icon").textContent = result.status === "qualified" ? "✓" : result.status === "operation-error" ? "!" : "↗";
  $("#result-label").textContent = result.label;
  $("#student-result").innerHTML = `${studentRadius.toFixed(4)} <small>m</small>`;
  $("#error-result").textContent = `${(result.relativeError * 100).toFixed(2)}%`;
  const notes = {
    qualified: "误差在允许范围内，实验结果与图像反演结果一致，可通过核验。",
    "operation-error": "偏差可能来自读数、对焦或环序标注，请复查实验操作与原始记录。",
    review: "偏差超过 20%，建议重点复核原始图像、测量记录与计算过程。",
  };
  $("#result-note").textContent = notes[result.status];
  button.disabled = false;
  button.querySelector("span").textContent = "重新核验";
}

function selectLayer(key) {
  const layer = layerMap[key];
  const image = $("#layer-image");
  $("#image-error").hidden = true;
  image.hidden = false;
  image.src = layer.src;
  image.alt = layer.alt;
  $("#layer-name").textContent = layer.label;
  $$(".layer-tabs button").forEach((button) => button.setAttribute("aria-selected", String(button.dataset.layer === key)));
}

function summarizeRecords(items) {
  const counts = { qualified: 0, "operation-error": 0, review: 0 };
  items.forEach((item) => { counts[item.status] += 1; });
  return { total: items.length, counts, passRate: items.length ? counts.qualified / items.length : 0 };
}

function renderSummary() {
  const summary = summarizeRecords(records);
  const cards = [
    ["", "报告总数", summary.total, "匿名演示记录"],
    ["qualified", "核验合格", summary.counts.qualified, `${(summary.passRate * 100).toFixed(1)}% 合格率`],
    ["operation-error", "操作误差", summary.counts["operation-error"], "建议复查操作"],
    ["review", "重点复核", summary.counts.review, "需核对原始记录"],
  ];
  $("#summary-strip").innerHTML = cards.map(([tone,label,value,note]) => `<div class="summary-card ${tone}"><span>${label}</span><strong>${value}</strong><small>${note}</small></div>`).join("");
  const qualified = summary.counts.qualified / summary.total * 100;
  const operation = summary.counts["operation-error"] / summary.total * 100;
  $("#donut").style.background = `conic-gradient(var(--cyan) 0 ${qualified}%, var(--orange) ${qualified}% ${qualified + operation}%, var(--red) ${qualified + operation}% 100%)`;
  $("#pass-rate").textContent = `${qualified.toFixed(1)}%`;
  const legend = [
    ["var(--cyan)","合格",summary.counts.qualified],
    ["var(--orange)","操作误差",summary.counts["operation-error"]],
    ["var(--red)","重点复核",summary.counts.review],
  ];
  $("#distribution-legend").innerHTML = legend.map(([color,label,value]) => `<div class="legend-row"><i style="background:${color}"></i><span>${label}</span><span>${value} 人</span></div>`).join("");
}

function currentRecords() {
  return filterRecords(records, $("#record-search").value, $("#status-filter").value);
}

function renderRecords() {
  const filtered = currentRecords();
  $("#records-body").innerHTML = filtered.map((record) => `<tr><td>${record.id}</td><td>${record.systemRadius.toFixed(4)}</td><td>${record.studentRadius.toFixed(4)}</td><td>${(record.relativeError * 100).toFixed(2)}%</td><td><span class="status-pill ${record.status}">${record.label}</span></td></tr>`).join("");
  $("#empty-state").hidden = filtered.length !== 0;
  $("#records-body").closest("table").hidden = filtered.length === 0;
}

function exportRecords() {
  const filtered = currentRecords();
  if (!filtered.length) return;
  const blob = new Blob([serializeRecordsCsv(filtered)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "牛顿环实验核验结果.csv";
  link.click();
  URL.revokeObjectURL(url);
  $("#export-toast").textContent = `已导出 ${filtered.length} 条记录`;
  setTimeout(() => { $("#export-toast").textContent = ""; }, 2800);
}

function init() {
  $$(".nav-item").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.view)));
  $("#student-radius").addEventListener("input", validateRadius);
  $("#run-analysis").addEventListener("click", runAnalysis);
  $("#scenario-select").addEventListener("change", (event) => {
    $("#student-radius").value = scenarios[event.target.value].value;
    validateRadius();
    resetProgress();
    $("#result-panel").removeAttribute("data-status");
    $("#result-label").textContent = "等待核验";
    $("#student-result").innerHTML = "— <small>m</small>";
    $("#error-result").textContent = "—";
    $("#result-note").textContent = "情景已切换，点击开始智能核验查看判定。";
  });
  let localImageUrl = null;
  $("#image-upload").addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (localImageUrl) URL.revokeObjectURL(localImageUrl);
    localImageUrl = URL.createObjectURL(file);
    $("#input-image").src = localImageUrl;
    $("#upload-note").textContent = `已预览 ${file.name} · 分析结果仍使用 NR-024 演示数据`;
  });
  $$(".layer-tabs button").forEach((button) => button.addEventListener("click", () => selectLayer(button.dataset.layer)));
  $("#layer-image").addEventListener("error", (event) => {
    event.currentTarget.hidden = true;
    $("#image-error").hidden = false;
    $("#image-error-name").textContent = event.currentTarget.getAttribute("src");
  });
  $("#return-original").addEventListener("click", () => selectLayer("original"));
  $("#record-search").addEventListener("input", renderRecords);
  $("#status-filter").addEventListener("change", renderRecords);
  $("#clear-filters").addEventListener("click", () => { $("#record-search").value = ""; $("#status-filter").value = "all"; renderRecords(); });
  $("#export-button").addEventListener("click", exportRecords);
  renderSummary();
  renderRecords();
}

init();


