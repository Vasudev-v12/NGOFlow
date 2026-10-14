// Detailed activity report for NGO admins and the super admin: filters, charts, tables, PDF export.
// Relies on helpers defined in app.js (api, esc, el, money, pct, fmtDate, roleName, reports).

const REPORT_COLORS = { s1: "#2a78d6", s2: "#eb6834", s3: "#1baf7a", grid: "#ECEAE3", axis: "#4A5750", ink: "#1E2A22" };
// Series color follows the entity, never its rank.
const ROLE_SERIES = [["donor", "Donors", REPORT_COLORS.s1], ["staff", "NGO staff", REPORT_COLORS.s2], ["ngo_admin", "NGO admins", REPORT_COLORS.s3]];
const ACTION_LABELS = {
    "donation.created": "Donation received",
    "fund.utilization_recorded": "Fund utilization recorded",
    "campaign.created": "Campaign created",
    "campaign.updated": "Campaign updated",
    "campaign.deleted": "Campaign deleted",
    "ngo.created": "NGO registered",
    "ngo.status_changed": "NGO status changed",
    "staff.registered": "Staff registered",
    "user.status_changed": "User status changed",
    "user.deleted": "User deleted",
};
const PDF_LIBS = [
    "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
    "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js",
];

const reportState = { user: null, ngos: [], loaded: false, loading: false, data: null, charts: [], range: null };

const actionLabel = a => ACTION_LABELS[a] || String(a || "").replace(/[._]/g, " ");
const compactMoney = v => `₹${new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 }).format(v)}`;
const shorten = (s, n = 26) => (String(s).length > n ? String(s).slice(0, n - 1) + "…" : String(s));
const localKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parseLocalDate = s => { const [y, m, d] = String(s).split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const isReportAdmin = r => r === "super_admin" || r === "ngo_admin" || r === "admin";

function initReports(u, d) {
    reportState.charts.forEach((chart) => chart.destroy());
    Object.assign(reportState, { user: u, ngos: d.ngos || [], loaded: false, data: null, charts: [] });
    const today = localKey(new Date());
    const ngoFilter = u.role === "super_admin"
        ? `<div class="field"><label for="r-ngo">Scope</label><select id="r-ngo"><option value="">All NGOs (platform)</option>${reportState.ngos.map((n) => `<option value="${esc(n.id)}">${esc(n.name)}</option>`).join("")}</select></div>`
        : "";
    reports.innerHTML = `<div class="main-header"><div><h1>Reports</h1><p>Donations, fund utilization and activity${u.role === "super_admin" ? ", plus platform growth and user sign-ups" : " for your NGO"}.</p></div><div class="header-actions"><button class="btn-solid" type="button" id="r-pdf" disabled>Download PDF</button></div></div>
<form class="panel report-filters" id="report-filters"><div class="field"><label for="r-preset">Period</label><select id="r-preset"><option value="7">Last 7 days</option><option value="30" selected>Last 30 days</option><option value="90">Last 90 days</option><option value="365">Last 12 months</option><option value="custom">Custom range</option></select></div><div class="field r-custom hidden"><label for="r-from">From</label><input id="r-from" type="date" max="${today}"></div><div class="field r-custom hidden"><label for="r-to">To</label><input id="r-to" type="date" max="${today}" value="${today}"></div>${ngoFilter}<div class="field"><button class="row-btn" type="submit">Apply</button></div></form>
<div class="error-msg" id="report-error"></div><div id="report-body"><div class="empty-state"><div class="serif">Loading report…</div></div></div>`;
    el("r-preset").onchange = () => document.querySelectorAll(".r-custom").forEach((x) => x.classList.toggle("hidden", el("r-preset").value !== "custom"));
    el("report-filters").onsubmit = (e) => { e.preventDefault(); loadReport(); };
    el("r-pdf").onclick = () => downloadReportPdf();
    if (!el("reports").classList.contains("hidden")) loadReport();
}

function onReportsTabShown() {
    if (reportState.user && !reportState.loaded && !reportState.loading) loadReport();
}

function selectedRange() {
    const preset = el("r-preset").value;
    const tomorrow = addDays(parseLocalDate(localKey(new Date())), 1);
    if (preset !== "custom") return { from: addDays(tomorrow, -Number(preset)), to: tomorrow };
    if (!el("r-from").value || !el("r-to").value) throw Error("Choose both a start and an end date.");
    const from = parseLocalDate(el("r-from").value), to = addDays(parseLocalDate(el("r-to").value), 1);
    if (from >= to) throw Error("The start date must be on or before the end date.");
    return { from, to };
}

async function loadReport() {
    const errorEl = el("report-error");
    errorEl.classList.remove("show");
    let range;
    try { range = selectedRange(); } catch (x) { return error("report-error", x.message); }
    const params = new URLSearchParams({ from: range.from.toISOString(), to: range.to.toISOString(), tz: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC" });
    if (el("r-ngo")?.value) params.set("ngoId", el("r-ngo").value);
    reportState.loading = true;
    el("r-pdf").disabled = true;
    try {
        const data = await api(`/reports/detailed?${params}`);
        Object.assign(reportState, { data, range, loaded: true });
        renderReport(data);
        el("r-pdf").disabled = false;
    } catch (x) {
        error("report-error", x.message);
    } finally {
        reportState.loading = false;
    }
}

// ---- Report model: one list of sections drives both the HTML view and the PDF ----

function bucketKeys(range, unit) {
    const keys = [];
    let d = parseLocalDate(localKey(range.from));
    if (unit === "week") d = addDays(d, -((d.getDay() + 6) % 7));
    if (unit === "month") d.setDate(1);
    while (d < range.to && keys.length < 1200) {
        keys.push(localKey(d));
        if (unit === "day") d = addDays(d, 1);
        else if (unit === "week") d = addDays(d, 7);
        else d.setMonth(d.getMonth() + 1);
    }
    return keys;
}

function bucketLabel(key, unit) {
    const d = parseLocalDate(key);
    return unit === "month"
        ? d.toLocaleDateString("en-IN", { month: "short", year: "numeric" })
        : d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function rangeLabel(range) {
    return `${fmtDate(range.from)} – ${fmtDate(addDays(range.to, -1))}`;
}

function summaryTiles(r) {
    const s = r.summary;
    const tiles = [
        ["Donations received", money(s.raised), `${s.donationCount} donation${s.donationCount === 1 ? "" : "s"}`],
        ["Unique donors", s.uniqueDonors, `${s.repeatDonors} gave more than once`],
        ["Average donation", money(s.averageDonation)],
        ["Funds utilized", money(s.utilized), `${pct(s.utilizationRate)} of period donations`],
        ["Available balance", money(s.balanceAllTime), "all time, received minus utilized"],
        ["Campaigns", s.campaigns, `${s.activeCampaigns} active · ${s.newCampaigns} new in period`],
        ["Beneficiaries served", Number(s.beneficiariesServed).toLocaleString("en-IN"), `of ${Number(s.beneficiaryTarget).toLocaleString("en-IN")} targeted`],
        ["Activity events", s.activityCount],
    ];
    if (!r.platform) return [["Overview", tiles]];
    const p = r.platform;
    return [["Overview", tiles], ["Platform", [
        ["Total users", p.users.total, `${p.users.byStatus.active} active · ${p.users.byStatus.pending} pending`],
        ["New users", p.users.newInRange, "joined in period"],
        ["Donors", p.users.byRole.donor, `${s.uniqueDonors} donated in period`],
        ["NGOs", p.ngos.total, `${p.ngos.active} active · ${p.ngos.newInRange} new in period`],
        ["NGO staff", p.users.byRole.staff],
        ["NGO admins", p.users.byRole.ngo_admin],
    ]]];
}

function reportSections(r) {
    const platformScope = r.scope.type === "platform";
    const unit = r.range.unit;
    const keys = bucketKeys(reportState.range, unit);
    const donationsBy = new Map(r.series.donations.map((x) => [x.bucket, x]));
    const utilBy = new Map(r.series.utilizations.map((x) => [x.bucket, x.amount]));
    const unitWord = unit === "day" ? "day" : unit === "week" ? "week (starting Monday)" : "month";
    const sections = [];

    sections.push({
        title: "Donations and fund utilization over time", note: `Totals per ${unitWord}.`,
        chart: (r.summary.raised || r.summary.utilized) ? {
            height: 280,
            config: {
                type: "line",
                data: {
                    labels: keys.map((k) => bucketLabel(k, unit)),
                    datasets: [
                        lineSeries("Donations received", keys.map((k) => donationsBy.get(k)?.amount || 0), REPORT_COLORS.s1, keys.length),
                        lineSeries("Funds utilized", keys.map((k) => utilBy.get(k) || 0), REPORT_COLORS.s2, keys.length),
                    ],
                },
                options: { interaction: { mode: "index", intersect: false }, scales: { y: moneyAxis(), x: { grid: { display: false }, ticks: { maxTicksLimit: 10, maxRotation: 0 } } } },
            },
        } : null,
        empty: "No donations or utilization in this period.",
        table: { head: [unit === "month" ? "Month" : unit === "week" ? "Week starting" : "Date", "Donations", "Amount received", "Funds utilized"], rows: keys.filter((k) => donationsBy.has(k) || utilBy.has(k)).map((k) => [bucketLabel(k, unit), String(donationsBy.get(k)?.count || 0), money(donationsBy.get(k)?.amount), money(utilBy.get(k))]) },
        collapsed: true, pdfTable: false,
    });

    const cats = r.utilizationByCategory;
    sections.push({
        title: "Fund utilization by category",
        chart: cats.length ? barChart(cats.map((c) => c.label), [{ label: "Amount utilized", data: cats.map((c) => c.amount), color: REPORT_COLORS.s1 }]) : null,
        empty: "No fund utilization recorded in this period.",
        table: { head: ["Category", "Entries", "Amount", "Share"], rows: cats.map((c) => [c.label, String(c.count), money(c.amount), pct(c.amount / (r.summary.utilized || 1))]) },
    });

    const topCampaigns = [...r.campaigns].filter((c) => c.raisedAllTime > 0).sort((a, b) => b.raisedAllTime - a.raisedAllTime).slice(0, 8);
    sections.push({
        title: "Campaign performance", note: "Chart shows the eight campaigns with the most funds raised, all time.",
        chart: topCampaigns.length ? barChart(topCampaigns.map((c) => c.title), [
            { label: "Raised", data: topCampaigns.map((c) => c.raisedAllTime), color: REPORT_COLORS.s1 },
            { label: "Utilized", data: topCampaigns.map((c) => c.utilizedAllTime), color: REPORT_COLORS.s2 },
        ]) : null,
        empty: "No campaign has received funds yet.",
        table: {
            head: ["Campaign", ...(platformScope ? ["NGO"] : []), "Status", "Goal", "Raised", "Goal %", "Utilized", "Used %", "Raised in period", "Donors in period", "Served / target"],
            rows: r.campaigns.map((c) => [c.title, ...(platformScope ? [c.ngoName] : []), c.status, money(c.goalAmount), money(c.raisedAllTime), pct(c.goalProgress), money(c.utilizedAllTime), pct(c.utilizationRate), money(c.raisedInRange), String(c.donorsInRange), `${c.beneficiariesServed} / ${c.beneficiaryTarget}`]),
        },
    });

    sections.push({
        title: "Top donors in period",
        table: { head: ["Donor", "Donations", "Amount"], rows: r.topDonors.map((d) => [d.name, String(d.count), money(d.amount)]) },
        empty: "No donations in this period.",
    });

    const actions = r.activityByAction;
    sections.push({
        title: "Activity by type",
        chart: actions.length ? barChart(actions.map((a) => actionLabel(a.action)), [{ label: "Events", data: actions.map((a) => a.count), color: REPORT_COLORS.s1 }], false) : null,
        empty: "No activity recorded in this period.",
        table: { head: ["Activity", "Events"], rows: actions.map((a) => [actionLabel(a.action), String(a.count)]) },
        collapsed: true, pdfTable: false,
    });

    if (r.platform) {
        const p = r.platform;
        const joined = new Map(p.users.newSeries.map((x) => [`${x.bucket}|${x.role}`, x.count]));
        sections.push({
            title: "New users by role", note: `Sign-ups per ${unitWord}, platform-wide.`,
            chart: p.users.newInRange ? {
                height: 260,
                config: {
                    type: "bar",
                    data: {
                        labels: keys.map((k) => bucketLabel(k, unit)),
                        datasets: ROLE_SERIES.map(([role, label, color]) => ({ label, data: keys.map((k) => joined.get(`${k}|${role}`) || 0), backgroundColor: color, borderColor: "#fff", borderWidth: { top: 2 }, borderSkipped: "bottom", maxBarThickness: 18 })),
                    },
                    options: { interaction: { mode: "index", intersect: false }, scales: { x: { stacked: true, grid: { display: false }, ticks: { maxTicksLimit: 10, maxRotation: 0 } }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0 }, grid: { color: REPORT_COLORS.grid } } } },
                },
            } : null,
            empty: "No new users joined in this period.",
            table: { head: ["Name", "Email", "Role", "NGO", "Status", "Joined"], rows: p.users.recent.map((x) => [x.name, x.email, roleName(x.role), x.ngoName || "—", x.status, fmtDate(x.joinedAt)]) },
            truncated: p.users.newInRange > p.users.recent.length,
        });
        sections.push({
            title: "Users by role and status", note: "All users on the platform.",
            table: {
                head: ["Role", "Users", "", "Status", "Users"],
                rows: [["donor", "active"], ["staff", "pending"], ["ngo_admin", "inactive"], ["super_admin", "suspended"]].map(([role, status]) => [roleName(role), String(p.users.byRole[role] || 0), "", status[0].toUpperCase() + status.slice(1), String(p.users.byStatus[status] || 0)]),
            },
        });
        const topNgos = p.ngos.rows.filter((n) => n.raisedAllTime > 0).slice(0, 8);
        sections.push({
            title: "NGO comparison", note: "Platform-wide. Chart shows the eight NGOs with the most funds raised, all time.",
            chart: topNgos.length ? barChart(topNgos.map((n) => n.name), [
                { label: "Raised", data: topNgos.map((n) => n.raisedAllTime), color: REPORT_COLORS.s1 },
                { label: "Utilized", data: topNgos.map((n) => n.utilizedAllTime), color: REPORT_COLORS.s2 },
            ]) : null,
            empty: "No NGO has received funds yet.",
            table: { head: ["NGO", "Status", "Joined", "Staff", "Donors", "Campaigns", "Raised", "Utilized", "Used %", "Raised in period"], rows: p.ngos.rows.map((n) => [n.name, n.status, fmtDate(n.joinedAt), String(n.staff), String(n.donors), `${n.activeCampaigns} / ${n.campaigns}`, money(n.raisedAllTime), money(n.utilizedAllTime), pct(n.utilizationRate), money(n.raisedInRange)]) },
        });
    }

    sections.push({
        title: "Donations", empty: "No donations in this period.", long: true, truncated: r.truncated.donations,
        table: { head: ["Date", "Donor", "Campaign", ...(platformScope ? ["NGO"] : []), "Amount"], rows: r.donations.map((x) => [fmtDate(x.date), x.donorName, x.campaignTitle || "—", ...(platformScope ? [x.ngoName] : []), money(x.amount)]) },
    });
    sections.push({
        title: "Fund utilizations", empty: "No fund utilization in this period.", long: true, truncated: r.truncated.utilizations,
        table: { head: ["Date", "Campaign", ...(platformScope ? ["NGO"] : []), "Category", "Description", "People reached", "Amount", "Proof"], rows: r.utilizations.map((x) => [fmtDate(x.date), x.campaignTitle || "General operations", ...(platformScope ? [x.ngoName] : []), x.label, x.description || "—", String(x.beneficiariesReached || 0), money(x.amount), x.proofUrl ? { text: "View", href: x.proofUrl } : "—"]) },
    });
    sections.push({
        title: "Activity log", empty: "No activity in this period.", long: true, truncated: r.truncated.activities,
        table: { head: ["When", "User", "Activity", "Record", ...(platformScope ? ["NGO"] : [])], rows: r.activities.map((x) => [new Date(x.date).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }), `${x.actorName}${x.actorRole ? ` (${roleName(x.actorRole)})` : ""}`, actionLabel(x.action), x.entityType.replace(/_/g, " "), ...(platformScope ? [x.ngoName] : [])]) },
    });
    return sections;
}

function lineSeries(label, data, color, points) {
    return { label, data, borderColor: color, backgroundColor: color, borderWidth: 2, tension: 0, pointRadius: points <= 2 ? 4 : 0, pointHoverRadius: 5, pointHitRadius: 12 };
}

function moneyAxis() {
    return { beginAtZero: true, grid: { color: REPORT_COLORS.grid }, border: { display: false }, ticks: { callback: (v) => compactMoney(v) } };
}

function barChart(labels, series, isMoney = true) {
    return {
        height: Math.max(140, labels.length * (series.length > 1 ? 44 : 30) + 60),
        config: {
            type: "bar",
            data: { labels, datasets: series.map((s) => ({ label: s.label, data: s.data, backgroundColor: s.color, borderRadius: 4, borderSkipped: "start", maxBarThickness: 14, categoryPercentage: 0.75, barPercentage: 0.85 })) },
            options: {
                indexAxis: "y",
                plugins: { legend: { display: series.length > 1 }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${isMoney ? money(c.parsed.x) : c.parsed.x}` } } },
                scales: {
                    x: isMoney ? moneyAxis() : { beginAtZero: true, ticks: { precision: 0 }, grid: { color: REPORT_COLORS.grid }, border: { display: false } },
                    y: { grid: { display: false }, ticks: { callback(v) { return shorten(this.getLabelForValue(v)); } } },
                },
            },
        },
    };
}

// ---- HTML view ----

function cellHtml(cell) {
    if (cell && typeof cell === "object") return safeUrl(cell.href) ? `<a href="${safeUrl(cell.href)}" target="_blank" rel="noopener noreferrer">${esc(cell.text)}</a>` : esc(cell.text);
    return esc(cell);
}

function tableHtml(t, long) {
    return `<div class="table-scroll${long ? " tall" : ""}"><table><thead><tr>${t.head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${t.rows.map((row) => `<tr>${row.map((c) => `<td>${cellHtml(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}

function renderReport(r) {
    reportState.charts.forEach((chart) => chart.destroy());
    reportState.charts = [];
    const scope = r.scope.type === "platform" ? "All NGOs" : r.scope.ngoName;
    const sections = reportSections(r);
    const tiles = summaryTiles(r).map(([group, items]) => `<h3 class="section-title">${esc(group)}</h3>${statCards(items)}`).join("");
    const body = sections.map((s, i) => {
        const hasRows = s.table && s.table.rows.length;
        const chart = s.chart ? `<div class="chart-box" style="height:${s.chart.height}px"><canvas id="report-chart-${i}" role="img" aria-label="${esc(s.title)} chart"></canvas></div>` : "";
        const table = hasRows ? (s.chart && s.collapsed ? `<details class="data-view"><summary>Show data table</summary>${tableHtml(s.table, s.long)}</details>` : tableHtml(s.table, s.long)) : "";
        const empty = !s.chart && !hasRows ? `<div class="empty-state"><div>${esc(s.empty || "No data for this period.")}</div></div>` : "";
        const more = s.truncated ? `<div class="muted report-note">Showing the most recent ${s.table.rows.length} entries.</div>` : "";
        return `<div class="panel"><div class="panel-head"><h3>${esc(s.title)}</h3>${s.note ? `<div class="muted">${esc(s.note)}</div>` : ""}</div>${chart ? `<div class="panel-body">${chart}</div>` : ""}${table}${empty}${more}</div>`;
    }).join("");
    el("report-body").innerHTML = `<p class="muted report-meta">${esc(scope)} · ${esc(rangeLabel(reportState.range))} · generated ${esc(new Date(r.generatedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }))}</p>${tiles}${body}`;
    if (!window.Chart) return;
    Chart.defaults.font.family = "'IBM Plex Sans', system-ui, sans-serif";
    Chart.defaults.color = REPORT_COLORS.axis;
    sections.forEach((s, i) => {
        if (!s.chart) return;
        const options = { responsive: true, maintainAspectRatio: false, animation: false, devicePixelRatio: Math.max(2, window.devicePixelRatio || 1), ...s.chart.config.options };
        options.plugins = { legend: { position: "top", align: "start", labels: { usePointStyle: true, boxWidth: 8, boxHeight: 8, color: REPORT_COLORS.ink } }, ...options.plugins };
        if (s.chart.config.type === "line") options.plugins.tooltip = { callbacks: { label: (c) => `${c.dataset.label}: ${money(c.parsed.y)}` } };
        reportState.charts.push(new Chart(el(`report-chart-${i}`), { ...s.chart.config, options }));
    });
}

// ---- PDF export ----

function loadScript(src) {
    if (document.querySelector(`script[src="${src}"]`)) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = src;
        script.onload = resolve;
        script.onerror = () => reject(Error("Could not load the PDF library. Check your connection and try again."));
        document.head.appendChild(script);
    });
}

// jsPDF's built-in fonts only cover Latin-1, so swap the rupee sign and typographic characters.
const pdfText = v => String(v ?? "").replace(/₹/g, "Rs ").replace(/[–—]/g, "-").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/…/g, "...").replace(/[^\x00-\xFF]/g, "?");

async function downloadReportPdf() {
    const r = reportState.data;
    if (!r) return;
    const button = el("r-pdf");
    button.disabled = true;
    button.textContent = "Preparing PDF…";
    try {
        for (const src of PDF_LIBS) await loadScript(src);
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
        const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 14;
        const scope = r.scope.type === "platform" ? "All NGOs (platform)" : r.scope.ngoName;
        let y = M;
        const ensure = (h) => { if (y + h > H - M) { doc.addPage(); y = M; } };
        const tableStyle = { theme: "grid", margin: { left: M, right: M }, styles: { fontSize: 8, cellPadding: 1.8, lineColor: [216, 211, 196], lineWidth: 0.1, textColor: [30, 42, 34], overflow: "linebreak" }, headStyles: { fillColor: [30, 42, 34], textColor: [237, 238, 230], fontStyle: "bold" }, alternateRowStyles: { fillColor: [247, 247, 242] } };

        doc.setFont("helvetica", "bold").setFontSize(18).setTextColor(30, 42, 34).text("NGOFlow activity report", M, y + 4);
        doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(74, 87, 80);
        doc.text(pdfText(`${scope}  |  ${rangeLabel(reportState.range)}  |  Generated ${new Date(r.generatedAt).toLocaleString("en-IN")} by ${reportState.user.name}`), M, y + 11);
        y += 18;

        for (const [group, items] of summaryTiles(r)) {
            const rows = [];
            for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2).flatMap(([label, value, note]) => [pdfText(label), pdfText(`${value}${note ? `  (${note})` : ""}`)]));
            doc.autoTable({ ...tableStyle, startY: y, head: [[pdfText(group), "", "", ""]], body: rows, columnStyles: { 0: { fontStyle: "bold", cellWidth: 40 }, 2: { fontStyle: "bold", cellWidth: 40 } } });
            y = doc.lastAutoTable.finalY + 6;
        }

        reportSections(r).forEach((s, i) => {
            const canvas = s.chart ? el(`report-chart-${i}`) : null;
            const rows = s.table && s.pdfTable !== false ? s.table.rows : [];
            if (!canvas && !rows.length) return;
            ensure(canvas ? 60 : 24);
            doc.setFont("helvetica", "bold").setFontSize(12).setTextColor(30, 42, 34).text(pdfText(s.title), M, y + 4);
            y += 6;
            if (s.note) { doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(74, 87, 80).text(pdfText(s.note), M, y + 3); y += 5; }
            if (canvas) {
                const aspect = canvas.height / canvas.width, maxH = H - 2 * M - 12;
                let w = Math.min(W - 2 * M, 200), h = w * aspect;
                if (h > maxH) { h = maxH; w = h / aspect; }
                ensure(h + 2);
                doc.addImage(canvas.toDataURL("image/png"), "PNG", M, y + 1, w, h, undefined, "FAST");
                y += h + 4;
            }
            if (rows.length) {
                doc.autoTable({ ...tableStyle, startY: y, head: [s.table.head.map(pdfText)], body: rows.map((row) => row.map((c) => pdfText(c && typeof c === "object" ? c.href : c))) });
                y = doc.lastAutoTable.finalY + 2;
                if (s.truncated) { doc.setFontSize(8).setTextColor(74, 87, 80).text(`Showing the most recent ${rows.length} entries.`, M, y + 3); y += 4; }
            }
            y += 6;
        });

        const pages = doc.getNumberOfPages();
        for (let p = 1; p <= pages; p++) {
            doc.setPage(p);
            doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(138, 130, 114);
            doc.text(pdfText(`NGOFlow · ${scope}`), M, H - 6);
            doc.text(`Page ${p} of ${pages}`, W - M, H - 6, { align: "right" });
        }
        const slug = pdfText(r.scope.type === "platform" ? "platform" : r.scope.ngoName).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "ngo";
        doc.save(`ngoflow-report-${slug}-${localKey(reportState.range.from)}-to-${localKey(addDays(reportState.range.to, -1))}.pdf`);
    } catch (x) {
        error("report-error", x.message || "The PDF could not be created.");
    } finally {
        button.disabled = false;
        button.textContent = "Download PDF";
    }
}
