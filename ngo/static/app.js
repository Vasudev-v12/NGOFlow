const API = "/api",
    tokenKey = "ngoflow_access_token",
    getToken = () => localStorage.getItem(tokenKey),
    setToken = t => localStorage.setItem(tokenKey, t);
const api = async (p, o = {}) => {
    const h = {
        "Content-Type": "application/json",
        ...(o.headers || {})
    };
    if (getToken()) h.Authorization = `Bearer ${getToken()}`;
    const r = await fetch(API + p, {
            ...o,
            headers: h
        }),
        b = r.status === 204 ? null : await r.json().catch(() => ({}));
    if (!r.ok) throw Error(b?.detail || "Something went wrong. Please try again.");
    return b
};
const esc = v => String(v ?? "").replace(/[&<>'"]/g, c => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;"
    } [c])),
    initials = n => n.split(" ").filter(Boolean).map(x => x[0]).join("").slice(0, 2).toUpperCase(),
    roleName = r => r === "staff" ? "NGO staff" : r[0].toUpperCase() + r.slice(1),
    error = (id, m) => {
        const e = document.getElementById(id);
        if (e) {
            e.textContent = m;
            e.classList.add("show")
        }
    };
const el = id => document.getElementById(id),
    loginEmail = el("login-email"),
    loginPassword = el("login-password"),
    regName = el("reg-name"),
    regEmail = el("reg-email"),
    regPassword = el("reg-password"),
    regConfirm = el("reg-confirm"),
    staffNote = el("staff-note"),
    userStamp = el("user-stamp"),
    sidebarName = el("sidebar-name"),
    sidebarRole = el("sidebar-role"),
    logoutButton = el("logout-button"),
    navGroup = el("nav-group"),
    overview = el("overview"),
    giving = el("giving"),
    profile = el("profile"),
    users = el("users");
document.addEventListener("DOMContentLoaded", () => {
    if (document.getElementById("login-form")) login();
    if (document.getElementById("register-form")) register();
    if (document.getElementById("dashboard")) dashboard()
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
                    password: loginPassword.value
                })
            });
            setToken(d.access_token);
            location.assign("/dashboard")
        } catch (x) {
            error("login-error", x.message)
        }
    })
}

function register() {
    let role = "donor";
    document.querySelectorAll("[data-reg-role]").forEach(b => b.onclick = () => {
        role = b.dataset.regRole;
        document.querySelectorAll("[data-reg-role]").forEach(x => x.classList.toggle("active", x === b));
        staffNote.classList.toggle("hidden", role !== "staff")
    });
    document.getElementById("register-form").addEventListener("submit", async e => {
        e.preventDefault();
        if (regPassword.value !== regConfirm.value) return error("register-error", "Passwords don’t match.");
        try {
            const d = await api("/auth/register", {
                method: "POST",
                body: JSON.stringify({
                    name: regName.value.trim(),
                    email: regEmail.value.trim(),
                    password: regPassword.value,
                    role
                })
            });
            if (d.access_token) {
                setToken(d.access_token);
                location.assign("/dashboard")
            } else {
                alert(d.message);
                location.assign("/")
            }
        } catch (x) {
            error("register-error", x.message)
        }
    })
}
async function dashboard() {
    let u, d;
    try {
        u = await api("/auth/me");
        d = await api("/dashboard/" + u.role)
    } catch (x) {
        localStorage.removeItem(tokenKey);
        return location.replace("/")
    }
    document.getElementById("dashboard").classList.remove("hidden");
    userStamp.textContent = initials(u.name);
    sidebarName.textContent = u.name;
    sidebarRole.textContent = roleName(u.role);
    document.querySelector(".sidebar").style.setProperty("--stamp-color", u.role === "admin" ? "#B8873A" : u.role === "staff" ? "#4C8A6E" : "#B15C3A");
    logoutButton.onclick = () => {
        localStorage.removeItem(tokenKey);
        location.assign("/")
    };
    render(u, d)
}

function render(u, d) {
    const tabs = u.role === "admin" ? [
        ["overview", "Overview"],
        ["users", "User management"],
        ["profile", "Profile"]
    ] : u.role === "donor" ? [
        ["overview", "Overview"],
        ["giving", "Giving history"],
        ["profile", "Profile"]
    ] : [
        ["overview", "Overview"],
        ["profile", "Profile"]
    ];
    navGroup.innerHTML = tabs.map(([x, n], i) => `<button class="nav-btn ${i?"":"active"}" data-tab="${x}"><span class="dash"></span>${n}</button>`).join("");
    document.querySelectorAll(".nav-btn").forEach(b => b.onclick = () => tab(b.dataset.tab));
    overview.innerHTML = overviewHtml(u.role, d);
    giving.innerHTML = givingHtml(d.giving_history || []);
    profile.innerHTML = profileHtml(u);
    bindProfile();
    if (u.role === "admin") bindUsers(d.users)
}

function tab(x) {
    document.querySelectorAll(".nav-btn").forEach(b => b.classList.toggle("active", b.dataset.tab === x));
    document.querySelectorAll(".tab-panel").forEach(p => p.classList.toggle("hidden", p.id !== x))
}

function overviewHtml(role, d) {
    if (role === "admin") return `<div class="main-header"><div><h1>Overview</h1><p>What&rsquo;s happening across NGOFlow today.</p></div></div><div class="stat-cards">${[["Total users",d.total_users],["NGO staff",d.staff_count],["Donors",d.donor_count],["Inactive accounts",d.inactive_count]].map(x=>`<div class="stat-card"><div class="label">${x[0]}</div><div class="value">${x[1]}</div></div>`).join("")}</div><div class="panel"><div class="panel-head"><h3>Accounts awaiting activation</h3></div><table><thead><tr><th>Name</th><th>Email</th><th>Requested role</th><th>Requested</th><th></th></tr></thead><tbody id="pending-users">${pending(d.users)}</tbody></table></div>`;
    const staff = role === "staff";
    return `<div class="main-header"><div><h1>Overview</h1><p>${staff?"Your assignments and the programs you support.":"The impact of what you&rsquo;ve given, in one place."}</p></div></div><div class="stat-cards">${staff?[["Active projects","0"],["Beneficiaries reached","0"],["Open tasks","0"]]:[["Total given","$0"],["Programs supported","0"],["Last gift","—"]].map(x=>`<div class="stat-card"><div class="label">${x[0]}</div><div class="value">${x[1]}</div></div>`).join("")}</div><div class="panel"><div class="panel-head"><h3>${staff?"Your projects":"Programs you support"}</h3></div><div class="empty-state"><div class="serif">No ${staff?"projects assigned":"giving activity"} yet.</div><div>Your records will appear here when added to NGOFlow.</div></div></div>`
}

function givingHtml(h) {
    return `<div class="main-header"><div><h1>Giving history</h1><p>Every gift, with the program it went to.</p></div></div><div class="panel">${h.length?`<table><tbody>${h.map(x=>`<tr><td>${esc(x.date)}</td><td>${esc(x.program)}</td><td>${esc(x.amount)}</td></tr>`).join("")}</tbody></table>`:'<div class="empty-state"><div class="serif">No gifts recorded yet.</div><div>Your receipts will appear here after your first contribution.</div></div>'}</div>`
}

function profileHtml(u) {
    return `<div class="main-header"><div><h1>Profile</h1><p>Manage the details tied to your account.</p></div></div><div class="profile-grid"><div class="avatar-card"><div class="avatar-circle">${initials(u.name)}</div><h4>${esc(u.name)}</h4><div class="role-tag">${roleName(u.role)}</div></div><div><form class="profile-form" id="profile-form"><div class="field-row"><div class="field"><label>Full name</label><input id="p-name" value="${esc(u.name)}" required></div><div class="field"><label>Email</label><input id="p-email" type="email" value="${esc(u.email)}" required></div></div><div class="field"><label>Phone</label><input id="p-phone" value="${esc(u.phone)}" placeholder="+91 98xxx xxxxx"></div><div class="field"><label>About</label><textarea id="p-bio">${esc(u.bio)}</textarea></div><div class="save-row"><span class="saved-msg" id="profile-saved">Profile saved.</span><button class="btn-outline" type="button" id="profile-cancel">Cancel</button><button class="btn-solid">Save changes</button></div></form><form class="profile-form" id="password-form" style="margin-top:28px"><div class="field"><label>Current password</label><input id="p-current" type="password" required></div><div class="field-row"><div class="field"><label>New password</label><input id="p-new" type="password" minlength="8" required></div><div class="field"><label>Confirm</label><input id="p-confirm" type="password" minlength="8" required></div></div><div class="save-row"><span class="saved-msg" id="password-saved">Password changed.</span><button class="btn-solid">Change password</button></div></form></div></div>`
}

function flash(id) {
    document.getElementById(id).classList.add("show");
    setTimeout(() => document.getElementById(id).classList.remove("show"), 2200)
}

function bindProfile() {
    el("profile-cancel").onclick = () => el("profile-form").reset();
    el("profile-form").onsubmit = async e => {
        e.preventDefault();
        try {
            const u = await api("/profile", {
                method: "PATCH",
                body: JSON.stringify({
                    name: el("p-name").value.trim(),
                    email: el("p-email").value.trim(),
                    phone: el("p-phone").value.trim(),
                    bio: el("p-bio").value.trim()
                })
            });
            sidebarName.textContent = u.name;
            userStamp.textContent = initials(u.name);
            flash("profile-saved")
        } catch (x) {
            alert(x.message)
        }
    };
    el("password-form").onsubmit = async e => {
        e.preventDefault();
        if (el("p-new").value !== el("p-confirm").value) return alert("New passwords don’t match.");
        try {
            await api("/profile/change-password", {
                method: "POST",
                body: JSON.stringify({
                    current_password: el("p-current").value,
                    new_password: el("p-new").value
                })
            });
            e.target.reset();
            flash("password-saved")
        } catch (x) {
            alert(x.message)
        }
    }
}

function pending(us) {
    const p = us.filter(u => u.status === "pending");
    return p.length ? p.map(u => `<tr><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td><span class="badge badge-staff">NGO staff</span></td><td>Awaiting review</td><td><button class="row-btn" data-id="${u.id}" data-status="active">Activate</button></td></tr>`).join("") : '<tr><td colspan="5">No accounts awaiting activation.</td></tr>'
}

function bindUsers(us) {
    users.innerHTML = `<div class="main-header"><div><h1>User management</h1><p>Every account on the platform, and its current status.</p></div></div><div class="panel"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th></th></tr></thead><tbody>${us.map(u=>`<tr><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td><span class="badge badge-${u.role}">${roleName(u.role)}</span></td><td><span class="badge ${u.status==="active"?"badge-active":"badge-inactive"}">${u.status}</span></td><td>${u.role==="admin"?"&mdash;":`<button class="row-btn ${u.status==="active"?"danger":""}" data-id="${u.id}" data-status="${u.status==="active"?"inactive":"active"}">${u.status==="active"?"Deactivate":"Activate"}</button>`}</td></tr>`).join("")}</tbody></table></div>`;
    document.querySelectorAll("[data-id]").forEach(b => b.onclick = async () => {
        try {
            await api(`/users/${b.dataset.id}/status`, {
                method: "PATCH",
                body: JSON.stringify({
                    status: b.dataset.status
                })
            });
            dashboard()
        } catch (x) {
            alert(x.message)
        }
    })
}