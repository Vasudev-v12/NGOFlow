const campaignTokenKey = "ngoflow_access_token";
const getCampaignToken = () => localStorage.getItem(campaignTokenKey);
const postApi = async (path, options = {}) => {
  const response = await fetch("/api" + path, 
    { ...options, headers: { "Content-Type": "application/json", 
      "Authorization": "Bearer " + getCampaignToken(), ...(options.headers || {})
    }});
  const body = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.detail || "Something went wrong. Please try again.");
  return body;
};
const postEl = id => document.getElementById(id);

async function initialisePostCampaign() {
  const form = postEl("campaign-form"), message = postEl("staff-only-message");
  if (!getCampaignToken()) { window.location.replace("/"); return; }
  try {
    const user = await postApi("/auth/me");
    if (user.role !== "staff") throw new Error("Only active NGO staff can post campaigns.");
    form.classList.remove("hidden");
    postEl("campaign-ngo").value = user.name;
  } catch (error) {
    message.textContent = error.message;
    message.classList.remove("hidden");
    return;
  }
  form.addEventListener("submit", async event => {
    event.preventDefault();
    try {
      await postApi("/campaigns", { method: "POST", body: JSON.stringify({
        ngo_name: postEl("campaign-ngo").value.trim(), title: postEl("campaign-title").value.trim(),
        summary: postEl("campaign-summary").value.trim(), category: postEl("campaign-category").value.trim(),
        location: postEl("campaign-location").value.trim(), goal_amount: Number(postEl("campaign-goal").value),
        days_left: Number(postEl("campaign-days").value)
      }) });
      postEl("campaign-saved").classList.add("show");
      form.reset();
      window.setTimeout(() => window.location.assign("/home"), 900);
    } catch (error) { message.textContent = error.message; message.classList.remove("hidden"); }
  });
}
initialisePostCampaign();
