const campaignMoney = new Intl.NumberFormat("en-IN", {style:"currency", currency:"INR", maximumFractionDigits:0});
const campaignSafe = value => String(value ?? "").replace(/[&<>'"]/g, character => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[character]));
async function loadCampaigns() {
  const grid = document.getElementById("campaign-grid");
  try {
    const response = await fetch("/api/campaigns");
    if (!response.ok) throw new Error("Campaigns are unavailable.");
    const campaigns = await response.json();
    document.getElementById("campaign-count").textContent = campaigns.length + " campaigns";
    grid.innerHTML = campaigns.map(campaign => {
      const progress = Math.min(100, Math.round(campaign.raised_amount / campaign.goal_amount * 100));
      return '<article class="campaign-card"><div class="campaign-card-top"><span class="campaign-category">' + campaignSafe(campaign.category) + '</span><span class="campaign-days">' + campaign.days_left + ' days left</span></div><p class="campaign-ngo">' + campaignSafe(campaign.ngo_name) + '</p><h3>' + campaignSafe(campaign.title) + '</h3><p class="campaign-summary">' + campaignSafe(campaign.summary) + '</p><p class="campaign-location">' + campaignSafe(campaign.location) + '</p><div class="campaign-progress"><span style="width:' + progress + '%"></span></div><div class="campaign-funding"><strong>' + campaignMoney.format(campaign.raised_amount) + '</strong><span>of ' + campaignMoney.format(campaign.goal_amount) + '</span></div><div class="campaign-meta"><span>' + campaign.supporters + ' supporters</span><button class="row-btn" type="button">View campaign</button></div></article>';
    }).join("");
  } catch (error) {
    document.getElementById("campaign-count").textContent = "Campaigns unavailable";
    grid.innerHTML = '<div class="campaign-error">' + campaignSafe(error.message) + '</div>';
  }
}
loadCampaigns();
