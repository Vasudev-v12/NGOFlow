const API = "/api",
    tokenKey = "ngoflow_access_token",
    getToken = () => localStorage.getItem(tokenKey),
    setToken = t => localStorage.setItem(tokenKey, t);

const api = async (p, o = {}) => {
    const h = { "Content-Type": "application/json", ...(o.headers || {}) };
    if (getToken()) h.Authorization = `Bearer ${getToken()}`;
    const r = await fetch(API + p, { ...o, headers: h }),
        b = r.status === 204 ? null : await r.json().catch(() => ({}));
    if (!r.ok) throw Error(b?.detail || "Something went wrong. Please try again.");
    return b;
};

const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c])),
    initials = n => (n || "").split(" ").filter(Boolean).map(x => x[0]).join("").slice(0, 2).toUpperCase(),
    roleName = r => r === "super_admin" ? "Super admin" : r === "ngo_admin" || r === "admin" ? "NGO admin" : r === "staff" ? "NGO staff" : "Donor",
    error = (id, m) => {
        const e = document.getElementById(id);
        if (e) {
            e.textContent = m;
            e.classList.add("show");
        }
    };

const el = id => document.getElementById(id),
    loginEmail = el("login-email"),
    loginPassword = el("login-password"),
    regName = el("reg-name"),
    regEmail = el("reg-email"),
    regPassword = el("reg-password"),
    regConfirm = el("reg-confirm"),
    regNgo = el("reg-ngo"),
    staffNote = el("staff-note"),
    userStamp = el("user-stamp"),
    sidebarName = el("sidebar-name"),
    sidebarRole = el("sidebar-role"),
    logoutButton = el("logout-button"),
    navGroup = el("nav-group"),
    overview = el("overview"),
    giving = el("giving"),
    profile = el("profile"),
    users = el("users"),
    donors = el("donors"),
    ngos = el("ngos"),
    campaigns = el("campaigns"),
    beneficiaries = el("beneficiaries"),
    funds = el("funds"),
    reports = el("reports"),
    activities = el("activities"),
    impact = el("impact");

const money = v => `₹${Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`,
    pct = v => `${Math.round(Number(v || 0) * 100)}%`,
    fmtDate = v => {
        const date = v ? new Date(v) : null;
        return date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";
    },
    safeUrl = v => /^https?:\/\//i.test(String(v || "")) ? esc(v) : "",
    isNgoAdmin = r => r === "ngo_admin" || r === "admin";

document.addEventListener("DOMContentLoaded", () => {
    if (document.getElementById("login-form")) login();
    if (document.getElementById("register-form")) register();
    if (document.getElementById("dashboard")) dashboard();
});

function login() {
    if (getToken()) return location.replace("/dashboard");
    document.getElementById("login-form").addEventListener("submit", async e => {
        e.preventDefault();
        try {
            const d = await api("/auth/login", {
                method: "POST",
                body: JSON.stringify({
                    email: loginEmail.value.trim(),
                    password: loginPassword.value,
                }),
            });
            setToken(d.access_token);
            location.assign("/dashboard");
        } catch (x) {
            error("login-error", x.message);
        }
    });
}

function register() {
    let role = "donor";
    const ngoField = document.getElementById("ngo-field");

    document.querySelectorAll("[data-reg-role]").forEach((button) => {
        button.onclick = () => {
            role = button.dataset.regRole;
            document.querySelectorAll("[data-reg-role]").forEach((item) => item.classList.toggle("active", item === button));
            ngoField.classList.toggle("hidden", role !== "ngo_admin" && role !== "staff");
            staffNote.classList.toggle("hidden", role !== "staff");
        };
    });

    document.getElementById("register-form").addEventListener("submit", async e => {
        e.preventDefault();
        if (regPassword.value !== regConfirm.value) return error("register-error", "Passwords don’t match.");

        const payload = {
            name: regName.value.trim(),
            email: regEmail.value.trim(),
            password: regPassword.value,
            role,
        };

        if (role === "ngo_admin" || role === "staff") payload.ngoName = regNgo.value.trim();

        try {
            const d = await api("/auth/register", {
                method: "POST",
                body: JSON.stringify(payload),
            });

            if (d.access_token) {
                setToken(d.access_token);
                location.assign("/dashboard");
            } else {
                alert(d.message);
                location.assign("/");
            }
        } catch (x) {
            error("register-error", x.message);
        }
    });
}

async function dashboard() {
    let u, d;
    try {
        u = await api("/auth/me");
        d = await api("/dashboard/" + u.role);
    } catch (x) {
        localStorage.removeItem(tokenKey);
        return location.replace("/");
    }

    document.getElementById("dashboard").classList.remove("hidden");
    userStamp.textContent = initials(u.name);
    sidebarName.textContent = u.name;
    const ngoName = (u.role === "ngo_admin" || u.role === "staff") ? (d?.ngo?.name || "") : "";
    sidebarRole.textContent = roleName(u.role);
    const ngoNameEl = document.getElementById("ngo-name");
    if (ngoNameEl) ngoNameEl.textContent = ngoName || "";
    document.querySelector(".sidebar").style.setProperty("--stamp-color", u.role === "super_admin" || u.role === "ngo_admin" || u.role === "admin" ? "#B8873A" : u.role === "staff" ? "#4C8A6E" : "#B15C3A");
    logoutButton.onclick = () => {
        localStorage.removeItem(tokenKey);
        location.assign("/");
    };
    render(u, d);
}

function render(u, d) {
    const tabs = u.role === "super_admin" || u.role === "ngo_admin" || u.role === "admin"
        ? [["overview", "Overview"], ["users", "User management"], ["donors", "Donors"], ...(u.role === "super_admin" ? [["ngos", "NGOs"]] : []), ["campaigns", "Campaigns"], ["beneficiaries", "Beneficiaries"], ["funds", "Funds"], ["reports", "Reports"], ["activities", "Activity log"], ["profile", "Profile"]]
        : u.role === "staff"
            ? [["overview", "Overview"], ["donors", "Donors"], ["campaigns", "Campaigns"], ["beneficiaries", "Beneficiaries"], ["funds", "Funds"], ["reports", "Reports"], ["profile", "Profile"]]
            : [["overview", "Overview"], ["impact", "Fund tracking"], ["funds", "Giving history"], ["profile", "Profile"]];

    navGroup.innerHTML = tabs.map(([tabName, label], idx) => `<button class="nav-btn ${idx === 0 ? "active" : ""}" data-tab="${tabName}"><span class="dash"></span>${label}</button>`).join("");
    document.querySelectorAll(".nav-btn").forEach((button) => {
        button.onclick = () => tab(button.dataset.tab);
    });

    overview.innerHTML = overviewHtml(u.role, d);
    users.innerHTML = u.role === "super_admin" || u.role === "ngo_admin" || u.role === "admin" ? userManagementHtml(d.users || [], u.role) : "";
    donors.innerHTML = u.role !== "donor" ? donorHtml(d.donors || []) : "";
    ngos.innerHTML = u.role === "super_admin" ? ngoManagementHtml(d.ngos || []) : "";
    campaigns.innerHTML = campaignHtml(d.campaigns || []);
    beneficiaries.innerHTML = beneficiaryHtml(d.campaigns || [], d.beneficiary_target, d.beneficiaries_served);
    funds.innerHTML = u.role === "donor" ? givingHtml(d.giving_history || [], true) : fundsHtml(u.role, d);
    impact.innerHTML = u.role === "donor" ? impactHtml(d.impact) : "";
    if (isReportAdmin(u.role)) initReports(u, d);
    else reports.innerHTML = reportHtml(d);
    activities.innerHTML = activityHtml(d.activities || []);
    profile.innerHTML = profileHtml(u);
    bindProfile();

    if (u.role === "super_admin" || u.role === "ngo_admin" || u.role === "admin") bindUsers(d.users || [], u.role);
    if (u.role === "super_admin") bindNgos();
    if (isNgoAdmin(u.role)) bindUtilization();
    document.querySelectorAll("[data-goto]").forEach((button) => {
        button.onclick = () => tab(button.dataset.goto);
    });
}

function tab(x) {
    document.querySelectorAll(".nav-btn").forEach((button) => button.classList.toggle("active", button.dataset.tab === x));
    document.querySelectorAll(".tab-panel").forEach((panel) => panel.classList.toggle("hidden", panel.id !== x));
    if (x === "reports") onReportsTabShown();
}

function overviewHtml(role, d) {
    if (role === "super_admin" || role === "ngo_admin" || role === "admin") {
        return `<div class="main-header"><div><h1>Overview</h1><p>What’s happening across NGOFlow today.</p></div></div><div class="stat-cards">${[["Total users", d.total_users || 0], ["NGO staff", d.staff_count || 0], ["Donors", d.donor_count || 0], ["Funds raised", `₹${Number(d.total_raised || 0).toLocaleString('en-IN')}`]].map((entry) => `<div class="stat-card"><div class="label">${entry[0]}</div><div class="value">${entry[1]}</div></div>`).join("")}</div><div class="panel"><div class="panel-head"><h3>Accounts awaiting activation</h3></div><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th></th></tr></thead><tbody>${pending(d.pending_users || d.users || [])}</tbody></table></div>`;
    }

    if (role === "staff") {
        const totalRaised = Number((d.donations || []).reduce((sum, item) => sum + Number(item.amount || 0), 0));
        return `<div class="main-header"><div><h1>Overview</h1><p>Your assigned campaigns and community impact.</p></div></div><div class="stat-cards">${[["Active campaigns", (d.campaigns || []).length], ["Beneficiaries served", d.beneficiaries_served || 0], ["Funds tracked", `₹${totalRaised.toLocaleString('en-IN')}`]].map((entry) => `<div class="stat-card"><div class="label">${entry[0]}</div><div class="value">${entry[1]}</div></div>`).join("")}</div><div class="panel"><div class="panel-head"><h3>Staff workflow</h3></div><div class="empty-state"><div class="serif">Operations ready.</div><div>Campaign, donor, and beneficiary-count information is tracked here.</div></div></div>`;
    }

    const im = d.impact || { summary: {}, categories: [], campaigns: [] };
    const sm = im.summary || {};
    const last = (d.giving_history || [])[0];
    const stats = [["Total given", money(sm.totalGiven)], ["Campaigns supported", sm.campaignsSupported || 0], ["Funds put to use", money(sm.utilizedEstimate), `${pct(sm.utilizationRate)} of your giving`], ["Last gift", last ? money(last.amount) : "—", last ? fmtDate(last.date) : ""]];
    const top = (im.campaigns || []).slice(0, 3);
    return `<div class="main-header"><div><h1>Overview</h1><p>Track every contribution and see how NGOs are putting it to work.</p></div></div>${statCards(stats)}<div class="impact-two"><div class="panel"><div class="panel-head"><h3>Where your money went</h3></div><div class="panel-body">${categoryBars(im.categories, sm.totalGiven, sm.unspentEstimate)}</div></div><div class="panel"><div class="panel-head"><h3>Campaigns you support</h3></div><div class="panel-body">${top.length ? top.map((c) => `<div class="mini-campaign"><div class="mini-title">${esc(c.title)}</div><div class="muted">${esc(c.ngoName)} · you gave ${money(c.yourContribution)}</div>${meter(c.utilizationRate, `${pct(c.utilizationRate)} of funds raised has been utilized`)}</div>`).join("") + `<button class="row-btn" data-goto="impact">View full fund tracking</button>` : '<div class="muted">You haven’t donated yet. <a href="/">Browse active campaigns</a> to get started.</div>'}</div></div></div>`;
}

function statCards(entries) {
    return `<div class="stat-cards">${entries.map(([label, value, note]) => `<div class="stat-card"><div class="label">${label}</div><div class="value">${value}</div>${note ? `<div class="delta">${esc(note)}</div>` : ""}</div>`).join("")}</div>`;
}

function meter(ratio, caption) {
    const width = Math.max(0, Math.min(100, Math.round(Number(ratio || 0) * 100)));
    return `<div class="meter" role="img" aria-label="${esc(caption)}"><span style="width:${width}%"></span></div><div class="meter-caption">${esc(caption)}</div>`;
}

function categoryBars(categories, total, unspent) {
    const rows = [...(categories || []).map((c) => [c.label, c.amount, ""]), ...(Number(unspent) > 0 ? [["Not yet utilized", unspent, "is-pending"]] : [])];
    if (!rows.length) return '<div class="muted">No spending has been reported against your donations yet.</div>';
    const base = Number(total) || rows.reduce((sum, row) => sum + Number(row[1]), 0);
    return `<div class="bar-list">${rows.map(([label, amount, cls]) => `<div class="bar-row"><div class="bar-label"><span>${esc(label)}</span><span>${money(amount)}</span></div><div class="bar-track"><span class="${cls}" style="width:${Math.max(1, Math.round(Number(amount) / base * 100))}%"></span></div></div>`).join("")}</div>`;
}

function impactHtml(im) {
    const data = im || { summary: {}, categories: [], campaigns: [], ngos: [], recentUtilizations: [] };
    const sm = data.summary || {};
    const header = '<div class="main-header"><div><h1>Fund tracking</h1><p>How the NGOs you support have used the money raised. Your share of spending is estimated in proportion to your contribution to each campaign.</p></div></div>';
    if (!sm.donationCount) return `${header}<div class="panel"><div class="empty-state"><div class="serif">Nothing to track yet.</div><div>Once you donate to a campaign, you’ll see exactly how those funds are being used.</div></div></div>`;
    const stats = [["Total given", money(sm.totalGiven), `${sm.donationCount} donation${sm.donationCount === 1 ? "" : "s"}`], ["Utilized (your share)", money(sm.utilizedEstimate), `${pct(sm.utilizationRate)} of your giving`], ["Awaiting use", money(sm.unspentEstimate)], ["People served", Number(sm.beneficiariesServed || 0).toLocaleString("en-IN"), "across campaigns you support"]];
    const campaignCards = (data.campaigns || []).map((c) => `<div class="impact-card"><div class="impact-card-head"><div><div class="mini-title">${esc(c.title)}</div><div class="muted">${esc(c.ngoName)} · ${esc(c.category)} · ${esc(c.location)}</div></div><span class="badge ${c.status === "active" ? "badge-active" : "badge-inactive"}">${esc(c.status)}</span></div><div class="impact-figures"><div><div class="label">You gave</div><div class="fig">${money(c.yourContribution)}</div><div class="muted">${pct(c.yourShare)} of campaign funds</div></div><div><div class="label">Your share used</div><div class="fig">${money(c.yourUtilized)}</div></div><div><div class="label">Raised</div><div class="fig">${money(c.raisedAmount)}</div><div class="muted">of ${money(c.goalAmount)} goal</div></div><div><div class="label">Utilized</div><div class="fig">${money(c.utilizedAmount)}</div><div class="muted">${money(c.balance)} remaining</div></div></div>${meter(c.utilizationRate, `${pct(c.utilizationRate)} of funds raised has been utilized`)}${c.beneficiaryTarget ? meter(c.beneficiariesServed / c.beneficiaryTarget, `${Number(c.beneficiariesServed).toLocaleString("en-IN")} of ${Number(c.beneficiaryTarget).toLocaleString("en-IN")} beneficiaries served`) : ""}${c.categories.length ? `<div class="chip-row">${c.categories.map((cat) => `<span class="chip">${esc(cat.label)} · ${money(cat.amount)}</span>`).join("")}</div>` : '<div class="muted">No spending reported for this campaign yet.</div>'}</div>`).join("");
    const ngoRows = (data.ngos || []).map((n) => `<tr><td>${esc(n.name)}${n.location ? `<div class="muted">${esc(n.location)}</div>` : ""}</td><td>${money(n.yourContribution)}</td><td>${money(n.totalReceived)}</td><td>${money(n.totalUtilized)}${n.generalUtilized ? `<div class="muted">${money(n.generalUtilized)} general operations</div>` : ""}</td><td>${pct(n.utilizationRate)}</td></tr>`).join("");
    const feed = (data.recentUtilizations || []).map((x) => `<tr><td>${fmtDate(x.utilizedOn)}</td><td>${esc(x.campaignTitle || "General operations")}<div class="muted">${esc(x.ngoName)}</div></td><td><span class="chip">${esc(x.label)}</span></td><td>${esc(x.description || "—")}${x.beneficiariesReached ? `<div class="muted">${Number(x.beneficiariesReached).toLocaleString("en-IN")} people reached</div>` : ""}</td><td>${money(x.amount)}</td><td>${safeUrl(x.proofUrl) ? `<a href="${safeUrl(x.proofUrl)}" target="_blank" rel="noopener noreferrer">View</a>` : "—"}</td></tr>`).join("");
    return `${header}${statCards(stats)}<div class="panel"><div class="panel-head"><h3>Where your money went</h3></div><div class="panel-body">${categoryBars(data.categories, sm.totalGiven, sm.unspentEstimate)}</div></div><h3 class="section-title">Campaigns you support</h3><div class="impact-grid">${campaignCards}</div><div class="panel"><div class="panel-head"><h3>NGO transparency</h3></div><div class="table-scroll"><table><thead><tr><th>NGO</th><th>You gave</th><th>Total received</th><th>Total utilized</th><th>Utilization</th></tr></thead><tbody>${ngoRows}</tbody></table></div></div><div class="panel"><div class="panel-head"><h3>Spending reported by NGOs</h3></div>${feed ? `<div class="table-scroll"><table><thead><tr><th>Date</th><th>Campaign</th><th>Category</th><th>Details</th><th>Amount</th><th>Proof</th></tr></thead><tbody>${feed}</tbody></table></div>` : '<div class="empty-state"><div class="serif">No spending reported yet.</div><div>The NGOs you support haven’t recorded any fund utilization so far.</div></div>'}</div>`;
}

function pending(us) {
    const pendingUsers = (us || []).filter((entry) => entry.status === "pending");
    return pendingUsers.length
        ? pendingUsers.map((user) => `<tr><td>${esc(user.name)}</td><td>${esc(user.email)}</td><td><span class="badge badge-staff">${roleName(user.role)}</span></td><td>Awaiting review</td><td><button class="row-btn" data-id="${user.id}" data-status="active">Activate</button></td></tr>`).join("")
        : '<tr><td colspan="5">No accounts awaiting activation.</td></tr>';
}

function userManagementHtml(usersList, currentRole) {
    return `<div class="main-header"><div><h1>User management</h1><p>Every account within your permitted scope.</p></div></div><div class="panel"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th></th></tr></thead><tbody>${(usersList || []).map((user) => { const canManage = currentRole === "super_admin" ? user.role !== "super_admin" : user.role === "staff"; return `<tr><td>${esc(user.name)}</td><td>${esc(user.email)}</td><td><span class="badge badge-${user.role}">${roleName(user.role)}</span></td><td><span class="badge ${user.status === "active" ? "badge-active" : "badge-inactive"}">${user.status}</span></td><td>${canManage ? `<button class="row-btn ${user.status === "active" ? "danger" : ""}" data-id="${user.id}" data-status="${user.status === "active" ? "inactive" : "active"}">${user.status === "active" ? "Deactivate" : "Activate"}</button>` : "&mdash;"}</td></tr>`; }).join("")}</tbody></table></div>`;
}

function campaignHtml(items) {
    const campaignsList = items || [];
    return `<div class="main-header"><div><h1>Campaigns</h1><p>Open programs across the NGO portfolio.</p></div></div><div class="panel">${campaignsList.length ? `<table><thead><tr><th>Title</th><th>Category</th><th>Goal</th><th>Raised</th><th>Status</th></tr></thead><tbody>${campaignsList.map((item) => `<tr><td>${esc(item.title)}</td><td>${esc(item.category)}</td><td>₹${Number(item.goal_amount || item.goalAmount || 0).toLocaleString('en-IN')}</td><td>₹${Number(item.raised_amount || item.raisedAmount || 0).toLocaleString('en-IN')}</td><td>${esc(item.status || 'active')}</td></tr>`).join("")}</tbody></table>` : '<div class="empty-state"><div class="serif">No campaigns yet.</div><div>Campaigns created by your NGO staff will appear here.</div></div>'}</div>`;
}

function beneficiaryHtml(campaignsList, target = 0, served = 0) {
    const list = campaignsList || [];
    return `<div class="main-header"><div><h1>Beneficiary impact</h1><p>Aggregate counts are tracked per campaign; individual beneficiary records are not stored.</p></div></div><div class="stat-cards">${[["Target", target || 0], ["Served", served || 0]].map((entry) => `<div class="stat-card"><div class="label">${entry[0]}</div><div class="value">${entry[1]}</div></div>`).join("")}</div><div class="panel">${list.length ? `<table><thead><tr><th>Campaign</th><th>Target</th><th>Served</th></tr></thead><tbody>${list.map((item) => `<tr><td>${esc(item.title)}</td><td>${Number(item.beneficiary_target || item.beneficiaryTarget || 0).toLocaleString('en-IN')}</td><td>${Number(item.beneficiaries_served || item.beneficiariesServed || 0).toLocaleString('en-IN')}</td></tr>`).join("")}</tbody></table>` : '<div class="empty-state"><div class="serif">No campaign impact counts yet.</div><div>Create a campaign to begin tracking aggregate beneficiary targets and outcomes.</div></div>'}</div>`;
}

function givingHtml(items, donorView = false) {
    const list = items || [];
    const title = donorView ? "Giving history" : "Funds";
    const sub = donorView ? "Every donation you’ve made on NGOFlow." : "Donations and utilization records, scoped to the NGO and optionally a campaign.";
    return `<div class="main-header"><div><h1>${title}</h1><p>${sub}</p></div></div><div class="panel">${list.length ? `<div class="table-scroll"><table><thead><tr><th>Date</th><th>Type</th><th>${donorView ? "Campaign" : "Description"}</th>${donorView ? "" : "<th>Category</th>"}<th>Amount</th></tr></thead><tbody>${list.map((item) => `<tr><td>${fmtDate(item.utilizedOn || item.createdAt || item.date)}</td><td><span class="badge ${item.type === "utilization" ? "badge-donor" : "badge-active"}">${esc(item.type || "fund")}</span></td><td>${esc(donorView ? item.program : (item.description || item.message || "Campaign contribution"))}</td>${donorView ? "" : `<td>${item.type === "utilization" ? esc(item.category || "other").replace(/_/g, " ") : "—"}</td>`}<td>${money(item.amount)}</td></tr>`).join("")}</tbody></table></div>` : `<div class="empty-state"><div class="serif">${donorView ? "No donations yet." : "No funds recorded yet."}</div><div>${donorView ? "Your contributions will appear here." : "Donations and fund utilization will appear here."}</div></div>`}</div>`;
}

function fundsHtml(role, d) {
    const list = givingHtml(d.funds || []);
    if (!isNgoAdmin(role)) return list;
    const options = (d.campaigns || []).map((c) => `<option value="${esc(c.id)}">${esc(c.title)}</option>`).join("");
    const categories = (d.utilization_categories || []).map((c) => `<option value="${esc(c.value)}">${esc(c.label)}</option>`).join("");
    const today = new Date().toISOString().slice(0, 10);
    const form = `<div class="panel"><div class="panel-head"><h3>Record fund utilization</h3></div><form class="panel-body" id="utilization-form"><p class="muted" style="margin-top:0">Donors to the selected campaign see this entry on their dashboard, so describe the spend clearly.</p><div class="field-row"><div class="field"><label>Campaign</label><select id="u-campaign"><option value="">General NGO operations</option>${options}</select></div><div class="field"><label>Category</label><select id="u-category" required>${categories}</select></div></div><div class="field-row"><div class="field"><label>Amount (₹)</label><input id="u-amount" type="number" min="1" step="1" required></div><div class="field"><label>Date used</label><input id="u-date" type="date" max="${today}" value="${today}" required></div><div class="field"><label>People reached</label><input id="u-beneficiaries" type="number" min="0" step="1" value="0"></div></div><div class="field"><label>What were the funds used for?</label><input id="u-description" maxlength="300" required placeholder="e.g. 200 school kits distributed in Ward 4"></div><div class="field"><label>Proof link (optional)</label><input id="u-proof" type="url" placeholder="https://… receipt, invoice or photo"></div><div class="save-row"><span class="error-msg" id="utilization-error"></span><span class="saved-msg" id="utilization-saved">Utilization recorded.</span><button class="btn-solid">Record utilization</button></div></form></div>`;
    return list.replace('<div class="panel">', `${form}<div class="panel">`);
}

function bindUtilization() {
    const form = document.getElementById("utilization-form");
    if (!form) return;
    form.onsubmit = async e => {
        e.preventDefault();
        document.getElementById("utilization-error").classList.remove("show");
        try {
            await api("/funds/utilizations", {
                method: "POST",
                body: JSON.stringify({
                    campaignId: el("u-campaign").value || null,
                    category: el("u-category").value,
                    amount: Number(el("u-amount").value),
                    utilizedOn: el("u-date").value,
                    beneficiariesReached: Number(el("u-beneficiaries").value || 0),
                    description: el("u-description").value.trim(),
                    proofUrl: el("u-proof").value.trim(),
                }),
            });
            await dashboard();
            tab("funds");
            flash("utilization-saved");
        } catch (x) {
            error("utilization-error", x.message);
        }
    };
}

function reportHtml(d) {
    const totalRaised = Number((d.donations || []).reduce((sum, item) => sum + Number(item.amount || 0), 0));
    return `<div class="main-header"><div><h1>Reports</h1><p>Operational analytics for the NGO lifecycle.</p></div></div><div class="stat-cards">${[["Total raised", `₹${totalRaised.toLocaleString('en-IN')}`], ["Campaigns", (d.campaigns || []).length], ["Beneficiaries served", d.beneficiaries_served || 0], ["Donors", d.donor_count || 0]].map((entry) => `<div class="stat-card"><div class="label">${entry[0]}</div><div class="value">${entry[1]}</div></div>`).join("")}</div><div class="panel"><div class="panel-head"><h3>Donation overview</h3></div><div class="empty-state"><div class="serif">Ready for reporting.</div><div>Use this area to review campaign performance, beneficiary support, and donation totals.</div></div></div>`;
}

function activityHtml(entries) {
    return `<div class="main-header"><div><h1>Activity log</h1><p>Recent tenant-scoped audit events.</p></div></div><div class="panel">${entries.length ? `<table><thead><tr><th>When</th><th>Action</th><th>Entity</th></tr></thead><tbody>${entries.map((entry) => `<tr><td>${esc(entry.createdAt || '—')}</td><td>${esc(entry.action)}</td><td>${esc(entry.entityType)}</td></tr>`).join("")}</tbody></table>` : '<div class="empty-state"><div class="serif">No activity recorded yet.</div></div>'}</div>`;
}

function profileHtml(u) {
    return `<div class="main-header"><div><h1>Profile</h1><p>Manage the details tied to your account.</p></div></div><div class="profile-grid"><div class="avatar-card"><div class="avatar-circle">${initials(u.name)}</div><h4>${esc(u.name)}</h4><div class="role-tag">${roleName(u.role)}</div></div><div><form class="profile-form" id="profile-form"><div class="field-row"><div class="field"><label>Full name</label><input id="p-name" value="${esc(u.name)}" required></div><div class="field"><label>Email</label><input id="p-email" type="email" value="${esc(u.email)}" required></div></div><div class="field"><label>Phone</label><input id="p-phone" value="${esc(u.phone || '')}" placeholder="+91 98xxx xxxxx"></div><div class="field"><label>About</label><textarea id="p-bio">${esc(u.bio || '')}</textarea></div><div class="save-row"><span class="saved-msg" id="profile-saved">Profile saved.</span><button class="btn-outline" type="button" id="profile-cancel">Cancel</button><button class="btn-solid">Save changes</button></div></form><form class="profile-form" id="password-form" style="margin-top:28px"><div class="field"><label>Current password</label><input id="p-current" type="password" required></div><div class="field-row"><div class="field"><label>New password</label><input id="p-new" type="password" minlength="8" required></div><div class="field"><label>Confirm</label><input id="p-confirm" type="password" minlength="8" required></div></div><div class="save-row"><span class="saved-msg" id="password-saved">Password changed.</span><button class="btn-solid">Change password</button></div></form></div></div>`;
}

function flash(id) {
    document.getElementById(id).classList.add("show");
    setTimeout(() => document.getElementById(id).classList.remove("show"), 2200);
}

function bindProfile() {
    const cancelButton = document.getElementById("profile-cancel");
    const profileForm = document.getElementById("profile-form");
    const passwordForm = document.getElementById("password-form");

    if (cancelButton && profileForm) cancelButton.onclick = () => profileForm.reset();

    if (profileForm) {
        profileForm.onsubmit = async e => {
            e.preventDefault();
            try {
                const u = await api("/profile", {
                    method: "PATCH",
                    body: JSON.stringify({
                        name: document.getElementById("p-name").value.trim(),
                        email: document.getElementById("p-email").value.trim(),
                        phone: document.getElementById("p-phone").value.trim(),
                        bio: document.getElementById("p-bio").value.trim(),
                    }),
                });
                sidebarName.textContent = u.name;
                userStamp.textContent = initials(u.name);
                flash("profile-saved");
            } catch (x) {
                alert(x.message);
            }
        };
    }

    if (passwordForm) {
        passwordForm.onsubmit = async e => {
            e.preventDefault();
            if (document.getElementById("p-new").value !== document.getElementById("p-confirm").value) return alert("New passwords don’t match.");
            try {
                await api("/profile/change-password", {
                    method: "POST",
                    body: JSON.stringify({
                        current_password: document.getElementById("p-current").value,
                        new_password: document.getElementById("p-new").value,
                    }),
                });
                passwordForm.reset();
                flash("password-saved");
            } catch (x) {
                alert(x.message);
            }
        };
    }
}

function bindUsers(us, currentRole) {
    if (!users) return;
    users.innerHTML = userManagementHtml(us, currentRole);
    document.querySelectorAll("[data-id]").forEach((button) => {
        button.onclick = async () => {
            try {
                await api(`/users/${button.dataset.id}/status`, {
                    method: "PATCH",
                    body: JSON.stringify({ status: button.dataset.status }),
                });
                dashboard();
            } catch (x) {
                alert(x.message);
            }
        };
    });
}

function bindNgos() {
    document.querySelectorAll("[data-ngo-id]").forEach((button) => {
        button.onclick = async () => {
            try {
                await api(`/ngos/${button.dataset.ngoId}/status`, { method: "PATCH", body: JSON.stringify({ status: button.dataset.ngoStatus }) });
                dashboard();
            } catch (x) { alert(x.message); }
        };
    });
}

function ngoManagementHtml(ngoList) {
    return `<div class="main-header"><div><h1>NGOs</h1><p>Platform organizations and their operational status.</p></div></div><div class="panel">${ngoList.length ? `<table><thead><tr><th>Name</th><th>Email</th><th>Location</th><th>Status</th><th></th></tr></thead><tbody>${ngoList.map((ngo) => `<tr><td>${esc(ngo.name)}</td><td>${esc(ngo.email || '—')}</td><td>${esc(ngo.location || '—')}</td><td><span class="badge ${ngo.status === 'active' ? 'badge-active' : 'badge-inactive'}">${esc(ngo.status)}</span></td><td><button class="row-btn ${ngo.status === 'active' ? 'danger' : ''}" data-ngo-id="${ngo.id}" data-ngo-status="${ngo.status === 'active' ? 'inactive' : 'active'}">${ngo.status === 'active' ? 'Deactivate' : 'Activate'}</button></td></tr>`).join("")}</tbody></table>` : '<div class="empty-state"><div class="serif">No NGOs yet.</div></div>'}</div>`;
}

function donorHtml(donorList) {
    return `<div class="main-header"><div><h1>Donors</h1><p>Donors associated with campaigns in your permitted scope.</p></div></div><div class="panel">${donorList.length ? `<table><thead><tr><th>Name</th><th>Email</th><th>Phone</th></tr></thead><tbody>${donorList.map((donor) => `<tr><td>${esc(donor.name)}</td><td>${esc(donor.email)}</td><td>${esc(donor.phone || '—')}</td></tr>`).join("")}</tbody></table>` : '<div class="empty-state"><div class="serif">No donors in scope yet.</div><div>Donors appear after contributing to an accessible campaign.</div></div>'}</div>`;
}
