const campaignMoney = new Intl.NumberFormat("en-IN", {style:"currency", currency:"INR", maximumFractionDigits:0});
const campaignSafe = value => String(value ?? "").replace(/[&<>'"]/g, character => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[character]));
const campaignToken = () => localStorage.getItem("ngoflow_access_token");
function renderSiteNav() {
  const nav = document.getElementById("site-nav-links");
  if (!nav) return;
  const currentPath = window.location.pathname;
  const isLoggedIn = Boolean(campaignToken());
  nav.innerHTML = [
    `<a class="${currentPath === "/" || currentPath === "/home" ? "active" : ""}" href="/">Home</a>`,
    `<a class="${currentPath === "/post-campaign" ? "active" : ""}" href="/post-campaign">Post campaign</a>`,
    isLoggedIn
      ? `<a class="${currentPath === "/dashboard" ? "active" : ""}" href="/dashboard">Dashboard</a>`
      : `<a href="/login">Sign in</a>`
  ].join("");
}
async function loadCampaigns() {
  const grid = document.getElementById("campaign-grid");
  try {
    const response = await fetch("/api/campaigns");
    if (!response.ok) throw new Error("Campaigns are unavailable.");
    const campaigns = await response.json();
    document.getElementById("campaign-count").textContent = campaigns.length + " campaigns";
    grid.innerHTML = campaigns.map(campaign => {
      const progress = Math.min(100, Math.round(campaign.raised_amount / campaign.goal_amount * 100));
      return '<article class="campaign-card"><div class="campaign-card-top"><span class="campaign-category">' + campaignSafe(campaign.category) + '</span><span class="campaign-days">' + campaign.days_left + ' days left</span></div><p class="campaign-ngo">' + campaignSafe(campaign.ngo_name) + '</p><h3>' + campaignSafe(campaign.title) + '</h3><p class="campaign-summary">' + campaignSafe(campaign.summary) + '</p><p class="campaign-location">' + campaignSafe(campaign.location) + '</p><div class="campaign-progress"><span style="width:' + progress + '%"></span></div><div class="campaign-funding"><strong>' + campaignMoney.format(campaign.raised_amount) + '</strong><span>of ' + campaignMoney.format(campaign.goal_amount) + '</span></div><div class="campaign-meta"><span>' + campaign.supporters + ' supporters</span><button class="row-btn" type="button" data-donate-id="' + campaign.id + '">Support campaign</button></div></article>';
    }).join("");
    grid.querySelectorAll("[data-donate-id]").forEach(button => {
      button.addEventListener("click", () => donate(button.dataset.donateId));
    });
  } catch (error) {
    document.getElementById("campaign-count").textContent = "Campaigns unavailable";
    grid.innerHTML = '<div class="campaign-error">' + campaignSafe(error.message) + '</div>';
  }
}

async function donate(campaignId) {
  if (!campaignToken()) { window.location.assign("/"); return; }
  const amount = Number(window.prompt("Donation amount (₹)"));
  if (!Number.isFinite(amount) || amount <= 0) return;
  try {
    const response = await fetch("/api/donations", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + campaignToken() },
      body: JSON.stringify({ campaignId, amount }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.detail || "Donation could not be recorded.");
    window.alert("Thank you — your donation has been recorded.");
    loadCampaigns();
  } catch (error) { window.alert(error.message); }
}
renderSiteNav();
loadCampaigns();
