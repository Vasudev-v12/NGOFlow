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
    roleName = r => r === "staff" ? "NGO staff" : r === "admin" ? "NGO admin" : "Donor",
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
    campaigns = el("campaigns"),
    beneficiaries = el("beneficiaries"),
    funds = el("funds"),
    reports = el("reports");

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
            ngoField.classList.toggle("hidden", role !== "admin");
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

        if (role === "admin") payload.ngoName = regNgo.value.trim();

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
    sidebarRole.textContent = roleName(u.role);
    document.querySelector(".sidebar").style.setProperty("--stamp-color", u.role === "admin" ? "#B8873A" : u.role === "staff" ? "#4C8A6E" : "#B15C3A");
    logoutButton.onclick = () => {
        localStorage.removeItem(tokenKey);
        location.assign("/");
    };
    render(u, d);
}

function render(u, d) {
    const tabs = u.role === "admin"
        ? [["overview", "Overview"], ["users", "User management"], ["campaigns", "Campaigns"], ["beneficiaries", "Beneficiaries"], ["funds", "Funds"], ["reports", "Reports"], ["profile", "Profile"]]
        : u.role === "staff"
            ? [["overview", "Overview"], ["campaigns", "Campaigns"], ["beneficiaries", "Beneficiaries"], ["funds", "Funds"], ["reports", "Reports"], ["profile", "Profile"]]
            : [["overview", "Overview"], ["funds", "Giving history"], ["profile", "Profile"]];

    navGroup.innerHTML = tabs.map(([tabName, label], idx) => `<button class="nav-btn ${idx === 0 ? "active" : ""}" data-tab="${tabName}"><span class="dash"></span>${label}</button>`).join("");
    document.querySelectorAll(".nav-btn").forEach((button) => {
        button.onclick = () => tab(button.dataset.tab);
    });

    overview.innerHTML = overviewHtml(u.role, d);
    users.innerHTML = u.role === "admin" ? userManagementHtml(d.users || []) : "";
    campaigns.innerHTML = campaignHtml(d.campaigns || []);
    beneficiaries.innerHTML = beneficiaryHtml(d.beneficiaries || []);
    funds.innerHTML = givingHtml(d.giving_history || d.donations || []);
    reports.innerHTML = reportHtml(d);
    profile.innerHTML = profileHtml(u);
    bindProfile();

    if (u.role === "admin") bindUsers(d.users || []);
}

function tab(x) {
    document.querySelectorAll(".nav-btn").forEach((button) => button.classList.toggle("active", button.dataset.tab === x));
    document.querySelectorAll(".tab-panel").forEach((panel) => panel.classList.toggle("hidden", panel.id !== x));
}

function overviewHtml(role, d) {
    if (role === "admin") {
        return `<div class="main-header"><div><h1>Overview</h1><p>What’s happening across NGOFlow today.</p></div></div><div class="stat-cards">${[["Total users", d.total_users || 0], ["NGO staff", d.staff_count || 0], ["Donors", d.donor_count || 0], ["Funds raised", `₹${Number(d.total_raised || 0).toLocaleString('en-IN')}`]].map((entry) => `<div class="stat-card"><div class="label">${entry[0]}</div><div class="value">${entry[1]}</div></div>`).join("")}</div><div class="panel"><div class="panel-head"><h3>Accounts awaiting activation</h3></div><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th></th></tr></thead><tbody>${pending(d.pending_users || d.users || [])}</tbody></table></div>`;
    }

    if (role === "staff") {
        const totalRaised = Number((d.donations || []).reduce((sum, item) => sum + Number(item.amount || 0), 0));
        return `<div class="main-header"><div><h1>Overview</h1><p>Your assigned campaigns and community impact.</p></div></div><div class="stat-cards">${[["Active campaigns", (d.campaigns || []).length], ["Beneficiaries", (d.beneficiaries || []).length], ["Funds tracked", `₹${totalRaised.toLocaleString('en-IN')}`]].map((entry) => `<div class="stat-card"><div class="label">${entry[0]}</div><div class="value">${entry[1]}</div></div>`).join("")}</div><div class="panel"><div class="panel-head"><h3>Staff workflow</h3></div><div class="empty-state"><div class="serif">Operations ready.</div><div>Donors, beneficiaries, campaigns, donations and reports are tracked here.</div></div></div>`;
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

function userManagementHtml(usersList) {
    return `<div class="main-header"><div><h1>User management</h1><p>Every account on the platform, and its current status.</p></div></div><div class="panel"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th></th></tr></thead><tbody>${(usersList || []).map((user) => `<tr><td>${esc(user.name)}</td><td>${esc(user.email)}</td><td><span class="badge badge-${user.role}">${roleName(user.role)}</span></td><td><span class="badge ${user.status === "active" ? "badge-active" : "badge-inactive"}">${user.status}</span></td><td>${user.role === "admin" ? "&mdash;" : `<button class="row-btn ${user.status === "active" ? "danger" : ""}" data-id="${user.id}" data-status="${user.status === "active" ? "inactive" : "active"}">${user.status === "active" ? "Deactivate" : "Activate"}</button>`}</td></tr>`).join("")}</tbody></table></div>`;
}

function campaignHtml(items) {
    const campaignsList = items || [];
    return `<div class="main-header"><div><h1>Campaigns</h1><p>Open programs across the NGO portfolio.</p></div></div><div class="panel">${campaignsList.length ? `<table><thead><tr><th>Title</th><th>Category</th><th>Goal</th><th>Raised</th><th>Status</th></tr></thead><tbody>${campaignsList.map((item) => `<tr><td>${esc(item.title)}</td><td>${esc(item.category)}</td><td>₹${Number(item.goal_amount || item.goalAmount || 0).toLocaleString('en-IN')}</td><td>₹${Number(item.raised_amount || item.raisedAmount || 0).toLocaleString('en-IN')}</td><td>${esc(item.status || 'active')}</td></tr>`).join("")}</tbody></table>` : '<div class="empty-state"><div class="serif">No campaigns yet.</div><div>Campaigns created by your NGO staff will appear here.</div></div>'}</div>`;
}

function beneficiaryHtml(items) {
    const list = items || [];
    return `<div class="main-header"><div><h1>Beneficiaries</h1><p>People and groups supported by the NGO.</p></div></div><div class="panel">${list.length ? `<table><thead><tr><th>Name</th><th>Category</th><th>Location</th><th>Status</th></tr></thead><tbody>${list.map((item) => `<tr><td>${esc(item.name)}</td><td>${esc(item.category || 'General')}</td><td>${esc(item.location || '—')}</td><td>${esc(item.status || 'active')}</td></tr>`).join("")}</tbody></table>` : '<div class="empty-state"><div class="serif">No beneficiaries recorded yet.</div><div>Add them from the staff workflow to track support needs.</div></div>'}</div>`;
}

function givingHtml(items) {
    const list = items || [];
    return `<div class="main-header"><div><h1>${(document.getElementById('dashboard') && document.getElementById('dashboard').dataset?.role) ? 'Funds' : 'Funds'}</h1><p>Donation records and funding progress.</p></div></div><div class="panel">${list.length ? `<table><thead><tr><th>Date</th><th>Program</th><th>Amount</th></tr></thead><tbody>${list.map((item) => `<tr><td>${esc(item.createdAt || item.date || '—')}</td><td>${esc(item.message || item.program || 'Campaign contribution')}</td><td>₹${Number(item.amount || 0).toLocaleString('en-IN')}</td></tr>`).join("")}</tbody></table>` : '<div class="empty-state"><div class="serif">No funds recorded yet.</div><div>Donations will appear as they are made through the donor workflow.</div></div>'}</div>`;
}

function reportHtml(d) {
    const totalRaised = Number((d.donations || []).reduce((sum, item) => sum + Number(item.amount || 0), 0));
    return `<div class="main-header"><div><h1>Reports</h1><p>Operational analytics for the NGO lifecycle.</p></div></div><div class="stat-cards">${[["Total raised", `₹${totalRaised.toLocaleString('en-IN')}`], ["Campaigns", (d.campaigns || []).length], ["Beneficiaries", (d.beneficiaries || []).length], ["Donors", (d.users || []).filter((entry) => entry.role === 'donor').length]].map((entry) => `<div class="stat-card"><div class="label">${entry[0]}</div><div class="value">${entry[1]}</div></div>`).join("")}</div><div class="panel"><div class="panel-head"><h3>Donation overview</h3></div><div class="empty-state"><div class="serif">Ready for reporting.</div><div>Use this area to review campaign performance, beneficiary support, and donation totals.</div></div></div>`;
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

function bindUsers(us) {
    if (!users) return;
    users.innerHTML = userManagementHtml(us);
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