(() => {
  "use strict";

  const CATEGORY_LABELS = {
    entertainment: "Entertainment",
    software: "Software",
    fitness: "Fitness",
    news: "News",
    cloud: "Cloud/Storage",
    other: "Other",
  };

  let state = { user: null, subs: [], summary: null };

  // ---------- helpers ----------
  const $ = (id) => document.getElementById(id);
  const money = (cents, currency) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD" }).format(
      (cents || 0) / 100
    );

  async function api(path, opts = {}) {
    const res = await fetch(path, {
      method: opts.method || "GET",
      headers: opts.body ? { "content-type": "application/json" } : undefined,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const err = new Error((data && data.message) || "Something went wrong");
      err.code = data && data.error;
      err.status = res.status;
      throw err;
    }
    return data;
  }

  // ---------- auth screen ----------
  let authMode = "login";
  function setAuthMode(mode) {
    authMode = mode;
    $("tab-login").classList.toggle("active", mode === "login");
    $("tab-register").classList.toggle("active", mode === "register");
    $("auth-submit").textContent = mode === "login" ? "Log in" : "Create account";
    $("auth-password").setAttribute("autocomplete", mode === "login" ? "current-password" : "new-password");
    $("auth-error").hidden = true;
  }
  $("tab-login").addEventListener("click", () => setAuthMode("login"));
  $("tab-register").addEventListener("click", () => setAuthMode("register"));

  $("auth-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = $("auth-email").value.trim();
    const password = $("auth-password").value;
    const btn = $("auth-submit");
    btn.disabled = true;
    try {
      const user = await api(`/api/auth/${authMode === "login" ? "login" : "register"}`, {
        method: "POST",
        body: { email, password },
      });
      state.user = user;
      showApp();
    } catch (err) {
      $("auth-error").textContent = err.message;
      $("auth-error").hidden = false;
    } finally {
      btn.disabled = false;
    }
  });

  $("logout-btn").addEventListener("click", async () => {
    await api("/api/auth/logout", { method: "POST" });
    state.user = null;
    location.reload();
  });

  // ---------- app screen ----------
  async function showApp() {
    $("auth-screen").hidden = true;
    $("app-screen").hidden = false;
    await refresh();
  }

  async function refresh() {
    const [subs, summary] = await Promise.all([
      api("/api/subscriptions"),
      api("/api/subscriptions/summary"),
    ]);
    state.subs = subs;
    state.summary = summary;
    render();
  }

  function render() {
    const { user, subs, summary } = state;

    $("plan-badge").textContent = user.is_premium ? "Premium" : "Free plan";
    $("plan-badge").style.background = user.is_premium ? "var(--accent)" : "var(--accent-soft)";
    $("plan-badge").style.color = user.is_premium ? "var(--accent-ink)" : "var(--accent)";
    $("upgrade-panel").hidden = !!user.is_premium;

    $("stat-monthly").textContent = money(summary.monthly_cents);
    $("stat-yearly").textContent = money(summary.yearly_cents);
    $("stat-count").textContent = `${summary.total_tracked} tracked${
      user.is_premium ? "" : ` (of 5 free)`
    }`;
    $("stat-flagged").innerHTML = `${money(summary.flagged_monthly_savings_cents)}<span style="font-size:14px;">/mo</span>`;
    $("stat-flagged-count").textContent = `${summary.flagged_count} flagged`;

    // renewal banner
    const banner = $("renewal-banner");
    if (summary.upcoming_renewals.length) {
      const soon = summary.upcoming_renewals.slice(0, 3);
      const parts = soon.map(
        (r) => `<strong>${escapeHtml(r.name)}</strong> ${money(r.cost_cents, r.currency)} in ${r.days_away}d`
      );
      banner.innerHTML = `⚠️ Renewing soon: ${parts.join(" · ")}`;
      banner.hidden = false;
    } else {
      banner.hidden = true;
    }

    renderSubList(subs, summary.upcoming_renewals);
    renderCategoryBreakdown(summary.by_category_cents, summary.monthly_cents);
  }

  function renderSubList(subs, upcoming) {
    const list = $("sub-list");
    if (!subs.length) {
      list.innerHTML = `<div class="empty-state">No subscriptions yet. Add your first one to see your monthly spend.</div>`;
      return;
    }
    const soonIds = new Set(upcoming.filter((r) => r.days_away <= 7).map((r) => r.id));
    list.innerHTML = subs
      .map((s) => {
        const soon = soonIds.has(s.id);
        return `
        <div class="sub-row" data-id="${s.id}">
          <div>
            <div class="sub-name">${escapeHtml(s.name)}</div>
            <div class="sub-meta">${CATEGORY_LABELS[s.category] || "Other"} · next renewal ${s.next_renewal_date}</div>
          </div>
          <div>
            <div class="sub-cost num">${money(s.cost_cents, s.currency)}</div>
            <div class="sub-cycle">${s.billing_cycle}</div>
          </div>
          <div>
            ${soon ? `<span class="pill soon">Renews soon</span>` : `<span class="pill ${s.status}">${s.status}</span>`}
          </div>
          <div class="row-actions">
            ${
              s.status === "flagged"
                ? `<button class="small ghost" data-action="draft-email" title="Draft cancellation email">✉️ Draft</button>`
                : ""
            }
            <button class="small ghost" data-action="flag">${s.status === "flagged" ? "Unflag" : "Flag to cancel"}</button>
          </div>
          <div class="row-actions">
            <button class="icon" data-action="edit" title="Edit">✎</button>
            <button class="icon" data-action="delete" title="Delete">✕</button>
          </div>
        </div>`;
      })
      .join("");
  }

  function renderCategoryBreakdown(byCategory, totalMonthly) {
    const el = $("category-breakdown");
    const entries = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
    if (!entries.length) {
      el.innerHTML = `<div class="empty-state">Nothing tracked yet.</div>`;
      return;
    }
    el.innerHTML = entries
      .map(([cat, cents]) => {
        const pct = totalMonthly ? Math.round((cents / totalMonthly) * 100) : 0;
        return `
        <div class="category-bar-row">
          <div class="category-bar-label">
            <span>${CATEGORY_LABELS[cat] || "Other"}</span>
            <span class="num">${money(cents)}</span>
          </div>
          <div class="category-bar-track"><div class="category-bar-fill" style="width:${pct}%"></div></div>
        </div>`;
      })
      .join("");
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // ---------- subscription list actions ----------
  $("sub-list").addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const row = e.target.closest(".sub-row");
    const id = Number(row.dataset.id);
    const sub = state.subs.find((s) => s.id === id);
    const action = btn.dataset.action;

    if (action === "flag") {
      await api(`/api/subscriptions/${id}/flag`, { method: "PATCH" });
      await refresh();
    } else if (action === "delete") {
      if (confirm(`Remove ${sub.name} from tracking?`)) {
        await api(`/api/subscriptions/${id}`, { method: "DELETE" });
        await refresh();
      }
    } else if (action === "edit") {
      openSubModal(sub);
    } else if (action === "draft-email") {
      await openEmailModal(sub);
    }
  });

  // ---------- add/edit subscription modal ----------
  function openSubModal(sub) {
    $("sub-modal-error").hidden = true;
    $("sub-modal-title").textContent = sub ? "Edit subscription" : "Add subscription";
    $("sub-id").value = sub ? sub.id : "";
    $("sub-name").value = sub ? sub.name : "";
    $("sub-cost").value = sub ? (sub.cost_cents / 100).toFixed(2) : "";
    $("sub-cycle").value = sub ? sub.billing_cycle : "monthly";
    $("sub-category").value = sub ? sub.category : "entertainment";
    $("sub-date").value = sub ? sub.next_renewal_date : "";
    $("sub-notes").value = sub ? sub.notes || "" : "";
    $("sub-modal-backdrop").hidden = false;
  }
  function closeSubModal() {
    $("sub-modal-backdrop").hidden = true;
  }

  $("add-sub-btn").addEventListener("click", () => openSubModal(null));
  $("sub-cancel-btn").addEventListener("click", closeSubModal);
  $("sub-modal-backdrop").addEventListener("click", (e) => {
    if (e.target.id === "sub-modal-backdrop") closeSubModal();
  });

  $("sub-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = $("sub-id").value;
    const payload = {
      name: $("sub-name").value,
      cost: Number($("sub-cost").value),
      billing_cycle: $("sub-cycle").value,
      category: $("sub-category").value,
      next_renewal_date: $("sub-date").value,
      notes: $("sub-notes").value,
    };
    const btn = $("sub-save-btn");
    btn.disabled = true;
    try {
      if (id) {
        await api(`/api/subscriptions/${id}`, { method: "PUT", body: payload });
      } else {
        await api("/api/subscriptions", { method: "POST", body: payload });
      }
      closeSubModal();
      await refresh();
    } catch (err) {
      $("sub-modal-error").textContent = err.message;
      $("sub-modal-error").hidden = false;
      if (err.code === "limit_reached") {
        setTimeout(() => {
          closeSubModal();
          window.scrollTo({ top: 0, behavior: "smooth" });
        }, 1400);
      }
    } finally {
      btn.disabled = false;
    }
  });

  // ---------- AI cancellation email modal ----------
  async function openEmailModal(sub) {
    $("email-modal-backdrop").hidden = false;
    $("email-body").textContent = "Drafting…";
    try {
      const res = await api("/api/ai/cancel-email", { method: "POST", body: { subscriptionId: sub.id } });
      $("email-body").textContent = res.email + (res.note ? `\n\n(${res.note})` : "");
    } catch (err) {
      $("email-body").textContent =
        err.code === "premium_required"
          ? "Upgrade to Premium to get an AI-drafted cancellation email for this subscription."
          : `Couldn't draft an email: ${err.message}`;
    }
  }
  $("email-close-btn").addEventListener("click", () => ($("email-modal-backdrop").hidden = true));
  $("email-copy-btn").addEventListener("click", async () => {
    await navigator.clipboard.writeText($("email-body").textContent);
    $("email-copy-btn").textContent = "Copied!";
    setTimeout(() => ($("email-copy-btn").textContent = "Copy"), 1200);
  });

  // ---------- upgrade (manual PayPal + unlock code) ----------
  async function loadBillingConfig() {
    try {
      const cfg = await api("/api/billing/config");
      const link = $("coffee-link");
      if (cfg.paypal_link) {
        link.href = cfg.paypal_link;
      } else {
        link.href = "#";
        link.textContent = "Support link coming soon";
      }
    } catch (err) {
      // Non-fatal — the upgrade panel just won't have a working coffee link.
    }
  }

  $("redeem-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const code = $("redeem-code").value.trim();
    const btn = $("redeem-btn");
    $("redeem-error").hidden = true;
    if (!code) return;
    btn.disabled = true;
    try {
      await api("/api/billing/redeem", { method: "POST", body: { code } });
      $("redeem-code").value = "";
      const me = await api("/api/auth/me");
      state.user = me;
      await refresh();
    } catch (err) {
      $("redeem-error").textContent = err.message;
      $("redeem-error").hidden = false;
    } finally {
      btn.disabled = false;
    }
  });

  // ---------- installable app prompt ----------
  let deferredInstallPrompt = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    $("install-btn").hidden = false;
  });
  $("install-btn").addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    $("install-btn").hidden = true;
    await deferredInstallPrompt.prompt();
    deferredInstallPrompt = null;
  });
  window.addEventListener("appinstalled", () => {
    $("install-btn").hidden = true;
  });

  // ---------- boot ----------
  (async () => {
    const user = await api("/api/auth/me");
    if (user) {
      state.user = user;
      await showApp();
    }
    loadBillingConfig();
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  })();
})();
