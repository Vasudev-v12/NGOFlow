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
    activities = el("activities");

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
            : [["overview", "Overview"], ["funds", "Giving history"], ["profile", "Profile"]];

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
    funds.innerHTML = givingHtml(u.role === "donor" ? (d.giving_history || []) : (d.funds || []));
    reports.innerHTML = reportHtml(d);
    activities.innerHTML = activityHtml(d.activities || []);
    profile.innerHTML = profileHtml(u);
    bindProfile();

    if (u.role === "super_admin" || u.role === "ngo_admin" || u.role === "admin") bindUsers(d.users || [], u.role);
    if (u.role === "super_admin") bindNgos();
}

function tab(x) {
    document.querySelectorAll(".nav-btn").forEach((button) => button.classList.toggle("active", button.dataset.tab === x));
    document.querySelectorAll(".tab-panel").forEach((panel) => panel.classList.toggle("hidden", panel.id !== x));
}

function overviewHtml(role, d) {
    if (role === "super_admin" || role === "ngo_admin" || role === "admin") {
        return `<div class="main-header"><div><h1>Overview</h1><p>What’s happening across NGOFlow today.</p></div></div><div class="stat-cards">${[["Total users", d.total_users || 0], ["NGO staff", d.staff_count || 0], ["Donors", d.donor_count || 0], ["Funds raised", `₹${Number(d.total_raised || 0).toLocaleString('en-IN')}`]].map((entry) => `<div class="stat-card"><div class="label">${entry[0]}</div><div class="value">${entry[1]}</div></div>`).join("")}</div><div class="panel"><div class="panel-head"><h3>Accounts awaiting activation</h3></div><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th></th></tr></thead><tbody>${pending(d.pending_users || d.users || [])}</tbody></table></div>`;
    }

    if (role === "staff") {
        const totalRaised = Number((d.donations || []).reduce((sum, item) => sum + Number(item.amount || 0), 0));
        return `<div class="main-header"><div><h1>Overview</h1><p>Your assigned campaigns and community impact.</p></div></div><div class="stat-cards">${[["Active campaigns", (d.campaigns || []).length], ["Beneficiaries served", d.beneficiaries_served || 0], ["Funds tracked", `₹${totalRaised.toLocaleString('en-IN')}`]].map((entry) => `<div class="stat-card"><div class="label">${entry[0]}</div><div class="value">${entry[1]}</div></div>`).join("")}</div><div class="panel"><div class="panel-head"><h3>Staff workflow</h3></div><div class="empty-state"><div class="serif">Operations ready.</div><div>Campaign, donor, and beneficiary-count information is tracked here.</div></div></div>`;
    }

    const totalGiven = Number((d.giving_history || []).reduce((sum, item) => sum + Number(String(item.amount || '').replace(/[^\d]/g, '') || 0), 0));
    return `<div class="main-header"><div><h1>Overview</h1><p>Track every contribution and campaign you support.</p></div></div><div class="stat-cards">${[["Total given", `₹${totalGiven.toLocaleString('en-IN')}`], ["Campaigns supported", (d.campaigns || []).length], ["Last gift", (d.giving_history || [])[0] ? d.giving_history[0].amount : '—']].map((entry) => `<div class="stat-card"><div class="label">${entry[0]}</div><div class="value">${entry[1]}</div></div>`).join("")}</div><div class="panel"><div class="panel-head"><h3>Campaigns you can support</h3></div><div class="empty-state"><div class="serif">Browse active programs.</div><div>Use the campaigns and funds tabs to donate and track your contributions.</div></div></div>`;
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

function givingHtml(items) {
    const list = items || [];
    return `<div class="main-header"><div><h1>Funds</h1><p>Donations and utilization records, scoped to the NGO and optionally a campaign.</p></div></div><div class="panel">${list.length ? `<table><thead><tr><th>Date</th><th>Type</th><th>Description</th><th>Amount</th></tr></thead><tbody>${list.map((item) => `<tr><td>${esc(item.createdAt || item.date || '—')}</td><td>${esc(item.type || 'fund')}</td><td>${esc(item.description || item.message || item.program || 'Campaign contribution')}</td><td>₹${Number(item.amount || 0).toLocaleString('en-IN')}</td></tr>`).join("")}</tbody></table>` : '<div class="empty-state"><div class="serif">No funds recorded yet.</div><div>Donations and fund utilization will appear here.</div></div>'}</div>`;
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
