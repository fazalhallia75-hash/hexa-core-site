
const $ = id => document.getElementById(id);
const db = window.hexaSupabase;

let currentOrders = [];
let currentServices = [];
let currentFeedback = [];
let knownOrderIds = new Set();
let firstOrderLoad = true;
let audioContext = null;

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;",
  '"': "&quot;", "'": "&#39;"
}[c]));

const money = n => Number(n || 0).toLocaleString("en-PK");

function showMessage(id, message) {
  const el = $(id);
  if (el) el.textContent = message;
}

// ADMIN SOUND
function playOrderSound() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    audioContext = audioContext || new AudioCtx();

    if (audioContext.state === "suspended") {
      audioContext.resume();
    }

    [0, 0.25, 0.5].forEach((delay, i) => {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();

      oscillator.type = "sine";
      oscillator.frequency.value = i === 1 ? 880 : 660;

      gain.gain.setValueAtTime(0.001, audioContext.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(
        0.18, audioContext.currentTime + delay + 0.03
      );
      gain.gain.exponentialRampToValueAtTime(
        0.001, audioContext.currentTime + delay + 0.18
      );

      oscillator.connect(gain);
      gain.connect(audioContext.destination);

      oscillator.start(audioContext.currentTime + delay);
      oscillator.stop(audioContext.currentTime + delay + 0.2);
    });
  } catch (err) {
    console.log("Sound unavailable");
  }
}

async function notifyNewOrder(order) {
  playOrderSound();

  if ("Notification" in window &&
      Notification.permission === "granted") {
    new Notification("HEXA CORE — New Order", {
      body: `${order.service_name} · ${order.customer_name}`,
      tag: order.id
    });
  }
}

async function enableNotifications() {
  if (!("Notification" in window)) {
    alert("Browser notifications are not supported.");
    return;
  }

  const permission = await Notification.requestPermission();

  if (permission === "granted") {
    if (audioContext?.state === "suspended") {
      await audioContext.resume();
    }
    alert("Notifications enabled.");
  } else {
    alert("Please allow notifications in browser settings.");
  }
}

// REFRESH
async function refresh() {
  await Promise.all([
    loadServices(),
    loadOrders(),
    loadFeedback()
  ]);
}

// SERVICES
async function loadServices() {
  const { data, error } = await db
    .from("services")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    $("admin-services").textContent = "Services Error: " + error.message;
    return;
  }

  currentServices = data || [];

  $("admin-services").innerHTML = currentServices.map(s => `
    <div class="admin-row">
      <div>
        <b>${esc(s.name)}</b>
        <div class="muted">
          Rs. ${money(s.price)} · ${esc(s.duration)}
        </div>
        <div class="muted">${esc(s.description)}</div>
      </div>
      <div>
        <button class="btn secondary" data-edit="${esc(s.id)}">Edit</button>
        <button class="btn danger"
          data-toggle="${esc(s.id)}"
          data-active="${s.is_active}">
          ${s.is_active ? "Hide" : "Activate"}
        </button>
      </div>
    </div>
  `).join("") || "No services yet.";

  $("admin-services").querySelectorAll("[data-edit]").forEach(b => {
    b.onclick = () => {
      const s = currentServices.find(x => x.id === b.dataset.edit);
      if (!s) return;

      $("edit-service-id").value = s.id;
      $("new-service-name").value = s.name || "";
      $("new-service-desc").value = s.description || "";
      $("new-service-price").value = s.price;
      $("new-service-duration").value = s.duration || "";

      window.scrollTo({ top: 0, behavior: "smooth" });
    };
  });

  $("admin-services").querySelectorAll("[data-toggle]").forEach(b => {
    b.onclick = async () => {
      b.disabled = true;

      const { error } = await db.from("services")
        .update({ is_active: b.dataset.active !== "true" })
        .eq("id", b.dataset.toggle);

      if (error) alert("Service Error: " + error.message);
      else await loadServices();

      b.disabled = false;
    };
  });
}

// ORDERS
async function loadOrders() {
  const { data, error } = await db
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    $("orders-list").textContent = "Orders Error: " + error.message;
    return;
  }

  currentOrders = data || [];

  const newOrders = currentOrders.filter(o =>
    o.status === "pending" && !knownOrderIds.has(o.id)
  );

  if (firstOrderLoad) {
    firstOrderLoad = false;
  } else {
    for (const order of newOrders) {
      await notifyNewOrder(order);
    }
  }

  currentOrders.forEach(o => knownOrderIds.add(o.id));

  $("orders-list").innerHTML = currentOrders.map(o => `
    <article class="order-card">
      <div class="section-head">
        <b>${esc(o.service_name)} · Rs. ${money(o.price)}</b>
        <span class="status">${esc(o.status)}</span>
      </div>

      <p>Order: <code>${esc(o.id)}</code></p>
      <p>Customer: ${esc(o.customer_name)} · ${esc(o.customer_phone)}</p>
      <p>Sender: ${esc(o.sender_name)} · ${esc(o.sender_phone)}</p>
      <p>Transaction: ${esc(o.transaction_id)}</p>
      <p>Created: ${new Date(o.created_at).toLocaleString()}</p>

      <div class="admin-actions">
        <button class="btn secondary" data-receipt="${esc(o.id)}">
          View Receipt
        </button>

        ${o.status === "pending" ? `
          <button class="btn" data-accept="${esc(o.id)}">
            ACCEPT ORDER
          </button>
          <button class="btn danger" data-decline="${esc(o.id)}">
            DECLINE
          </button>
        ` : ""}

        ${o.status === "approved" ? `
          <div class="delivery-fields">
            <label>NOTE
              <textarea data-note="${esc(o.id)}"
                placeholder="Enter customer note">${esc(o.admin_note || "")}</textarea>
            </label>

            <label>KEY
              <input data-key="${esc(o.id)}"
                value="${esc(o.delivery_key || "")}"
                placeholder="Enter delivery key">
            </label>

            <label>FILE DOWNLOAD LINK
              <input type="url" data-link="${esc(o.id)}"
                value="${esc(o.delivery_url || "")}"
                placeholder="Paste MediaFire download link">
            </label>

            <button class="btn" data-deliver="${esc(o.id)}">
              DELIVER TO CUSTOMER
            </button>
          </div>
        ` : ""}

        ${o.status === "delivered" ? `
          <p class="muted">Delivery completed.</p>
          <p>KEY: ${esc(o.delivery_key || "")}</p>
          <p>NOTE: ${esc(o.admin_note || "")}</p>
          <p>LINK: ${esc(o.delivery_url || "")}</p>
        ` : ""}

        <button class="btn danger" data-delete-order="${esc(o.id)}">
          DELETE ORDER
        </button>
      </div>
    </article>
  `).join("") || "No orders yet.";

  // ACCEPT
  $("orders-list").querySelectorAll("[data-accept]").forEach(b => {
    b.onclick = async () => {
      if (!confirm("Accept this order?")) return;

      b.disabled = true;

      const { error } = await db.from("orders")
        .update({ status: "approved" })
        .eq("id", b.dataset.accept)
        .eq("status", "pending");

      if (error) {
        alert("Accept Error: " + error.message);
        b.disabled = false;
      } else {
        await refresh();
      }
    };
  });

  // DECLINE
  $("orders-list").querySelectorAll("[data-decline]").forEach(b => {
    b.onclick = async () => {
      if (!confirm("Decline and delete this order?")) return;
      await deleteOrder(b.dataset.decline);
    };
  });

  // RECEIPT
  $("orders-list").querySelectorAll("[data-receipt]").forEach(b => {
    b.onclick = async () => {
      const order = currentOrders.find(x => x.id === b.dataset.receipt);

      if (!order?.receipt_path) {
        alert("No receipt attached.");
        return;
      }

      const { data, error } = await db.storage
        .from("payment-receipts")
        .createSignedUrl(order.receipt_path, 120);

      if (error) alert("Receipt Error: " + error.message);
      else window.open(data.signedUrl, "_blank", "noopener");
    };
  });

  // DELIVER
  $("orders-list").querySelectorAll("[data-deliver]").forEach(b => {
    b.onclick = async () => {
      const id = b.dataset.deliver;
      const note = $(`[data-note="${id}"]`).value.trim();
      const key = $(`[data-key="${id}"]`).value.trim();
      const link = $(`[data-link="${id}"]`).value.trim();

      if (!key || !link) {
        alert("Please enter both KEY and MediaFire download link.");
        return;
      }

      try {
        const parsed = new URL(link);
        if (parsed.protocol !== "https:") {
          alert("Please enter a valid HTTPS download link.");
          return;
        }
      } catch {
        alert("Please enter a valid download link.");
        return;
      }

      if (!confirm("Deliver this order to the customer now?")) return;

      b.disabled = true;
      b.textContent = "DELIVERING...";

      const { error } = await db.from("orders")
        .update({
          status: "delivered",
          admin_note: note,
          delivery_key: key,
          delivery_url: link,
          delivery_path: null
        })
        .eq("id", id)
        .eq("status", "approved");

      if (error) {
        alert("Delivery Error: " + error.message);
        b.disabled = false;
        b.textContent = "DELIVER TO CUSTOMER";
      } else {
        alert("Order delivered successfully.");
        await refresh();
      }
    };
  });

  // DELETE
  $("orders-list").querySelectorAll("[data-delete-order]").forEach(b => {
    b.onclick = async () => {
      if (!confirm("Permanently delete this order?")) return;
      await deleteOrder(b.dataset.deleteOrder);
    };
  });
}

async function deleteOrder(id) {
  const { error } = await db.from("orders")
    .delete()
    .eq("id", id);

  if (error) alert("Delete Order Error: " + error.message);
  else {
    alert("Order deleted.");
    await refresh();
  }
}

// FEEDBACK
async function loadFeedback() {
  const { data, error } = await db
    .from("feedback")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    $("feedback-list").textContent = "Feedback Error: " + error.message;
    return;
  }

  currentFeedback = data || [];

  $("feedback-list").innerHTML = currentFeedback.map(f => `
    <div class="admin-row">
      <div>
        <b>${esc(f.customer_name)} · ${esc(f.rating ?? "N/A")}/5</b>
        <p>${esc(f.message)}</p>
        <small class="muted">
          ${new Date(f.created_at).toLocaleString()}
        </small>
      </div>
      <button class="btn danger" data-delete-feedback="${esc(f.id)}">
        DELETE
      </button>
    </div>
  `).join("") || "No feedback yet.";

  $("feedback-list").querySelectorAll("[data-delete-feedback]").forEach(b => {
    b.onclick = async () => {
      if (!confirm("Permanently delete this feedback?")) return;

      const { error } = await db.from("feedback")
        .delete()
        .eq("id", b.dataset.deleteFeedback);

      if (error) alert("Feedback Delete Error: " + error.message);
      else {
        alert("Feedback deleted.");
        await loadFeedback();
      }
    };
  });
}

// LOGIN
$("login-form").onsubmit = async e => {
  e.preventDefault();

  showMessage("login-message", "Signing in...");

  const { error } = await db.auth.signInWithPassword({
    email: $("email").value.trim(),
    password: $("password").value
  });

  if (error) {
    showMessage("login-message", error.message);
    return;
  }

  await checkSession();
};

// SESSION
async function checkSession() {
  const { data, error } = await db.auth.getUser();
  if (error || !data?.user) return;

  $("login-panel").hidden = true;
  $("dashboard").hidden = false;

  if (!document.getElementById("notification-enable")) {
    const button = document.createElement("button");
    button.id = "notification-enable";
    button.className = "btn secondary";
    button.textContent = "ENABLE NOTIFICATIONS + RINGTONE";
    button.onclick = enableNotifications;
    $("dashboard").prepend(button);
  }

  // User interaction unlocks sound playback on supported browsers.
  $("notification-enable").onclick = async () => {
    await enableNotifications();
    playOrderSound();
  };

  await refresh();

  // Poll for new orders while admin panel is open.
  setInterval(loadOrders, 15000);
}

// LOGOUT
$("logout").onclick = async () => {
  await db.auth.signOut();
  location.reload();
};

// ADD / EDIT SERVICE
$("service-form").onsubmit = async e => {
  e.preventDefault();

  const id = $("edit-service-id").value;

  const payload = {
    name: $("new-service-name").value.trim(),
    description: $("new-service-desc").value.trim(),
    price: Number($("new-service-price").value),
    duration: $("new-service-duration").value.trim(),
    is_active: true
  };

  const result = id
    ? await db.from("services").update(payload).eq("id", id)
    : await db.from("services").insert(payload);

  showMessage(
    "service-message",
    result.error ? result.error.message : "Service saved."
  );

  if (!result.error) {
    $("service-form").reset();
    $("edit-service-id").value = "";
    await refresh();
  }
};

// CLEAR SERVICE
$("clear-service").onclick = () => {
  $("service-form").reset();
  $("edit-service-id").value = "";
};

// INITIAL SESSION CHECK
checkSession();
