function showPopup(message, actionsHtml) {
  const modal = document.getElementById("popup-modal");
  const msg = document.getElementById("popup-message");
  const actions = document.getElementById("popup-actions");
  msg.textContent = message;
  actions.innerHTML = actionsHtml;
  modal.style.display = "flex";
}

function hidePopup() {
  document.getElementById("popup-modal").style.display = "none";
}

function deleteAccount() {
  if (!userId) return;
  showPopup(
    "Are you sure you want to delete your account? This cannot be undone.",
    `<button onclick="confirmDeleteAccount()" style="background:#ef4444;color:#fff;padding:8px 16px;margin-right:8px;">Delete</button><button onclick="hidePopup()" style="padding:8px 16px;">Cancel</button>`
  );
}

function confirmDeleteAccount() {
  fetch("/api/auth/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: userId }),
  }).then(() => {
    userId = null;
    document.getElementById("user-section").style.display = "none";
    document.getElementById("auth-section").style.display = "block";
    showPopup(
      "Account deleted.",
      `<button onclick=\"hidePopup()\" style=\"padding:8px 16px;\">OK</button>`
    );
  });
}
function logout() {
  userId = null;
  document.getElementById("user-section").style.display = "none";
  document.getElementById("auth-section").style.display = "block";
}
let userId = null;

function showSignup() {
  document.getElementById("signup-form").style.display = "block";
  document.getElementById("signin-form").style.display = "none";
}
function showSignin() {
  document.getElementById("signin-form").style.display = "block";
  document.getElementById("signup-form").style.display = "none";
}
function hideAuthForms() {
  document.getElementById("signup-form").style.display = "none";
  document.getElementById("signin-form").style.display = "none";
}
function signup(e) {
  e.preventDefault();
  const f = e.target;
  fetch("/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: f.username.value,
      email: f.email.value,
      password: f.password.value,
    }),
  })
    .then(async (r) => {
      let res;
      try {
        res = await r.json();
      } catch {
        document.getElementById("signup-error").textContent =
          "Server error. Please try again.";
        return;
      }
      if (res && res.ok && res.user_id) {
        userId = res.user_id;
        showUserSection();
        hideAuthForms();
        document.getElementById("signup-error").textContent = "";
      } else {
        document.getElementById("signup-error").textContent =
          res && res.msg ? res.msg : "Signup failed";
      }
    })
    .catch(() => {
      document.getElementById("signup-error").textContent =
        "Network error. Please try again.";
    });
}
function signin(e) {
  e.preventDefault();
  const f = e.target;
  fetch("/api/auth/signin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: f.username.value,
      password: f.password.value,
    }),
  })
    .then(async (r) => {
      let res;
      try {
        res = await r.json();
      } catch {
        document.getElementById("signin-error").textContent =
          "Server error. Please try again.";
        return;
      }
      if (res && res.user_id) {
        userId = res.user_id;
        showUserSection();
        hideAuthForms();
        document.getElementById("signin-error").textContent = "";
      } else {
        document.getElementById("signin-error").textContent =
          res && res.msg ? res.msg : "Sign in failed";
      }
    })
    .catch(() => {
      document.getElementById("signin-error").textContent =
        "Network error. Please try again.";
    });
}
function showUserSection() {
  document.getElementById("auth-section").style.display = "none";
  document.getElementById("user-section").style.display = "block";
  document.getElementById("user-id").textContent = userId;
  listFilters();
}
function saveFilter(e) {
  e.preventDefault();
  const f = e.target;
  fetch("/api/filters/set", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: userId,
      filter: {
        name: f.filterName.value,
        year_from: f.year_from.value,
        year_to: f.year_to.value,
        auction_type: f.auction_type.value,
        inventory_type: f.inventory_type.value,
        min_bid: f.min_bid.value,
        max_bid: f.max_bid.value,
        odo_from: f.odo_from.value,
        odo_to: f.odo_to.value,
      },
    }),
  })
    .then((r) => r.json())
    .then((res) => {
      if (res && res.ok) {
        f.filterName.value = "";
        f.year_from.value = 2020;
        f.year_to.value = 2026;
        f.auction_type.value = "Buy Now";
        f.inventory_type.value = "Automobiles";
        f.min_bid.value = 0;
        f.max_bid.value = 1500;
        f.odo_from.value = 0;
        f.odo_to.value = 50000;
        listFilters();
        showPopup(
          "Filter saved!",
          `<button onclick=\"hidePopup()\" style=\"padding:8px 16px;\">OK</button>`
        );
      } else {
        showPopup(
          "Failed to save filter.",
          `<button onclick=\"hidePopup()\" style=\"padding:8px 16px;\">OK</button>`
        );
      }
    });
}
function listFilters() {
  fetch("/list-filters", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId }),
  })
    .then((r) => r.json())
    .then((res) => {
      const ul = document.getElementById("filters-list");
      ul.innerHTML = "";
      if (res && Array.isArray(res.filters) && res.filters.length > 0) {
        res.filters.forEach(([id, name, payload]) => {
          const li = document.createElement("li");
          li.className = "filter-item";
          li.innerHTML = `<strong>${name}</strong>
            <button class='small secondary' onclick='editFilter(${id})'>Edit</button>
            <button class='small' style='background:#ef4444;margin-left:4px' onclick='deleteFilter(${id})'>Delete</button>
            <pre>${payload}</pre>`;
          ul.appendChild(li);
        });
      } else {
        ul.innerHTML = "<li>No filters saved yet.</li>";
      }
    })
    .catch(() => {
      const ul = document.getElementById("filters-list");
      ul.innerHTML = "<li>Error loading filters.</li>";
    });
}
function editFilter(id) {
  // Implement modal or inline editing as needed
  showPopup(
    "Edit filter " + id + " (not implemented)",
    `<button onclick=\"hidePopup()\" style=\"padding:8px 16px;\">OK</button>`
  );
}
function deleteFilter(id) {
  if (!confirm("Delete this filter?")) return;
  fetch("/delete-filter", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  })
    .then((r) => r.json())
    .then(() => listFilters());
}
function runBotOnce() {
  document.getElementById("output").textContent = "Running bot...";
  fetch("/bot-run-once", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId }),
  })
    .then((r) => r.json())
    .then((res) => {
      document.getElementById("output").textContent =
        res.result || "Bot run complete";
    });
}
function startBot() {
  document.getElementById("output").textContent = "Starting bot monitoring...";
  fetch("/api/bot/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId }),
  })
    .then((r) => r.json())
    .then((res) => {
      document.getElementById("output").textContent =
        res.result || "Bot monitoring started";
    });
}
function stopBot() {
  document.getElementById("output").textContent = "Stopping bot monitoring...";
  fetch("/api/bot/stop", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId }),
  })
    .then((r) => r.json())
    .then((res) => {
      document.getElementById("output").textContent =
        res.result || "Bot monitoring stopped";
    });
}
