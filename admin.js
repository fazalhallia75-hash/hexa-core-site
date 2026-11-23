
const $ = id => document.getElementById(id);
const db = window.hexaSupabase;

let currentOrders = [];
let currentServices = [];
let currentFeedback = [];
let knownOrderIds = new Set();
let firstOrderLoad = true;
let audioContext = null;
let orderPollingStarted = false;
let editingImagePath = "";
let previewObjectUrl = null;

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
}[c]));

const money = n => Number(n || 0).toLocaleString("en-PK");

function showMessage(id, message) {
  const el = $(id);
  if (el) el.textContent = message;
}

// SERVICE IMAGE HELPERS
function getServiceImageUrl(path) {
  if (!path) return "";

  if (/^https?:\/\//i.test(path)) return path;

  const { data } = db.storage
    .from("service-images")
    .getPublicUrl(path);

  return data?.publicUrl || "";
}

function showImagePreview(url) {
  const preview = $("service-image-preview");
  if (!preview) return;

  if (!url) {
    preview.innerHTML = "";
    return;
  }

  preview.innerHTML = `
    <div style="margin:12px 0">
      <img
        src="${esc(url)}"
        alt="Service image preview"
        style="
          width:150px;
          max-width:100%;
          height:110px;
          object-fit:cover;
          border:1px solid #222;
          border-radius:12px;
        ">
    </div>
  `;
}

async function uploadServiceImage(file) {
  if (!file) return null;

  const allowedTypes = [
    "image/jpeg",
    "image/png",
    "image/webp"
  ];

  if (!allowedTypes.includes(file.type)) {
    throw new Error("Only JPG, PNG and WEBP images are allowed.");
  }

  if (file.size > 5 * 1024 * 1024) {
    throw new Error("Image size must be 5 MB or less.");
  }

  const extension = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp"
  }[file.type];

  const uniqueName =
    `${Date.now()}-${crypto.randomUUID()}.${extension}`;

  const filePath = `services/${uniqueName}`;

  const { data, error } = await db.storage
    .from("service-images")
    .upload(filePath, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type
    });

  if (error) throw error;

  return data.path;
}

// SOUND
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
    console.error("Sound error:", err);
  }
}

function notifyNewOrder(order) {
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
    playOrderSound();
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
    $("admin-services").textContent =
      "Services Error: " + error.message;
    return;
  }

  currentServices = data || [];

  $("admin-services").innerHTML = currentServices.map(s => {
    const imageUrl = getServiceImageUrl(s.image_path);

    return `
      <div class="admin-row">
        <div>
          ${imageUrl ? `
            <img
              src="${esc(imageUrl)}"
              alt="${esc(s.name)}"
              loading="lazy"
              style="
                width:90px;
                height:70px;
                object-fit:cover;
                border-radius:10px;
                margin-bottom:8px;
                border:1px solid #ddd;
              ">
          ` : ""}

          <b>${esc(s.name)}</b>

          <div class="muted">
            Rs. ${money(s.price)} · ${esc(s.duration)}
          </div>

          <div class="muted">${esc(s.description)}</div>

          <div class="muted">
            ${s.is_active ? "ACTIVE" : "HIDDEN"}
          </div>
        </div>

        <div>
          <button class="btn secondary" data-edit="${esc(s.id)}">
            Edit
          </button>

          <button
            class="btn danger"
            data-toggle="${esc(s.id)}"
            data-active="${s.is_active}">
            ${s.is_active ? "Hide" : "Activate"}
          </button>
        </div>
      </div>
    `;
  }).join("") || "No services yet.";

  $("admin-services").querySelectorAll("[data-edit]").forEach(b => {
    b.onclick = () => {
      const s = currentServices.find(x => x.id === b.dataset.edit);
      if (!s) return;

      $("edit-service-id").value = s.id;
      $("new-service-name").value = s.name || "";
      $("new-service-desc").value = s.description || "";
      $("new-service-price").value = s.price;
      $("new-service-duration").value = s.duration || "";

      editingImagePath = s.image_path || "";

      if ($("service-image")) {
        $("service-image").value = "";
      }

      if (previewObjectUrl) {
        URL.revokeObjectURL(previewObjectUrl);
        previewObjectUrl = null;
      }

      showImagePreview(
        editingImagePath
          ? getServiceImageUrl(editingImagePath)
          : ""
      );

      showMessage("service-message", "Editing: " + s.name);
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
  });

  $("admin-services").querySelectorAll("[data-toggle]").forEach(b => {
    b.onclick = async () => {
      b.disabled = true;

      try {
        const { error } = await db.from("services")
          .update({ is_active: b.dataset.active !== "true" })
          .eq("id", b.dataset.toggle);

        if (error) throw error;

        await loadServices();
      } catch (err) {
        alert("Service Error: " + err.message);
        b.disabled = false;
      }
    };
  });
}

// IMAGE PREVIEW
if ($("service-image")) {
  $("service-image").addEventListener("change", () => {
    const file = $("service-image").files?.[0];

    if (previewObjectUrl) {
      URL.revokeObjectURL(previewObjectUrl);
      previewObjectUrl = null;
    }

    if (!file) {
      showImagePreview(
        editingImagePath
          ? getServiceImageUrl(editingImagePath)
          : ""
      );
      return;
    }

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      showMessage("service-message", "Only JPG, PNG and WEBP images are allowed.");
      $("service-image").value = "";
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      showMessage("service-message", "Image size must be 5 MB or less.");
      $("service-image").value = "";
      return;
    }

    previewObjectUrl = URL.createObjectURL(file);
    showImagePreview(previewObjectUrl);
    showMessage("service-message", "");
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
    console.error("Orders error:", error);
    return;
  }

  currentOrders = data || [];

  const newOrders = currentOrders.filter(o =>
    o.status === "pending" && !knownOrderIds.has(o.id)
  );

  if (!firstOrderLoad) {
    newOrders.forEach(notifyNewOrder);
  }

  firstOrderLoad = false;
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
      <p>Transaction ID: ${esc(o.transaction_id)}</p>
      <p>Created: ${new Date(o.created_at).toLocaleString()}</p>

      <div class="admin-actions">
        <button class="btn secondary" data-receipt="${esc(o.id)}">
          VIEW RECEIPT
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

            <button type="button" class="btn" data-deliver="${esc(o.id)}">
              DELIVER TO CUSTOMER
            </button>

            <p data-delivery-message="${esc(o.id)}" class="muted"></p>
          </div>
        ` : ""}

        ${o.status === "delivered" ? `
          <p class="muted">DELIVERY COMPLETED</p>
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

      try {
        const { data, error } = await db.from("orders")
          .update({ status: "approved" })
          .eq("id", b.dataset.accept)
          .eq("status", "pending")
          .select("id");

        if (error) throw error;

        if (!data?.length) {
          throw new Error("Order was not updated. Refresh and check its status.");
        }

        alert("Order accepted.");
        await refresh();
      } catch (err) {
        alert("Accept Error: " + err.message);
        b.disabled = false;
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

      if (error) {
        alert("Receipt Error: " + error.message);
      } else {
        window.open(data.signedUrl, "_blank", "noopener");
      }
    };
  });

  // DELIVER
  $("orders-list").querySelectorAll("[data-deliver]").forEach(b => {
    b.onclick = async () => {
      const id = b.dataset.deliver;
      const card = b.closest(".order-card");

      const message = card?.querySelector("[data-delivery-message]");
      const note = card?.querySelector("[data-note]")?.value.trim() || "";
      const key = card?.querySelector("[data-key]")?.value.trim() || "";
      const link = card?.querySelector("[data-link]")?.value.trim() || "";

      try {
        if (!key || !link) {
          throw new Error("Please enter both KEY and MediaFire link.");
        }

        let parsed;
        try {
          parsed = new URL(link);
        } catch {
          throw new Error("Invalid download link.");
        }

        const validHost =
          parsed.hostname === "mediafire.com" ||
          parsed.hostname.endsWith(".mediafire.com");

        if (parsed.protocol !== "https:" || !validHost) {
          throw new Error("Please enter a valid HTTPS MediaFire link.");
        }

        if (!confirm("Deliver this order to the customer now?")) return;

        b.disabled = true;
        b.textContent = "DELIVERING...";

        if (message) message.textContent = "Saving delivery...";

        const { data, error } = await db.from("orders")
          .update({
            status: "delivered",
            admin_note: note,
            delivery_key: key,
            delivery_url: link
          })
          .eq("id", id)
          .eq("status", "approved")
          .select("id,status,delivery_key,delivery_url");

        if (error) throw error;

        if (!data || data.length === 0) {
          throw new Error(
            "No order updated. Check that the order is approved and admin permissions are correct."
          );
        }

        if (data[0].status !== "delivered") {
          throw new Error("Delivery status could not be confirmed.");
        }

        if (message) message.textContent = "Delivery saved successfully.";

        alert("Order delivered successfully. Customer can now track it.");

        await refresh();

      } catch (err) {
        console.error("Delivery error:", err);

        if (message) {
          message.textContent = "Delivery Error: " + err.message;
        }

        alert("Delivery Error: " + err.message);

        b.disabled = false;
        b.textContent = "DELIVER TO CUSTOMER";
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

// DELETE ORDER
async function deleteOrder(id) {
  const { error } = await db.from("orders")
    .delete()
    .eq("id", id);

  if (error) {
    alert("Delete Order Error: " + error.message);
  } else {
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

      if (error) {
        alert("Feedback Delete Error: " + error.message);
      } else {
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

  if (error || !data?.user) {
    $("login-panel").hidden = false;
    $("dashboard").hidden = true;
    return;
  }

  $("login-panel").hidden = true;
  $("dashboard").hidden = false;

  if (!document.getElementById("notification-enable")) {
    const button = document.createElement("button");
    button.id = "notification-enable";
    button.className = "btn secondary";
    button.textContent = "ENABLE NOTIFICATIONS + RINGTONE";
    $("dashboard").prepend(button);
  }

  $("notification-enable").onclick = enableNotifications;

  await refresh();

  if (!orderPollingStarted) {
    orderPollingStarted = true;
    setInterval(loadOrders, 15000);
  }
}

// LOGOUT
$("logout").onclick = async () => {
  await db.auth.signOut();
  location.reload();
};

// ADD / EDIT SERVICE
$("service-form").onsubmit = async e => {
  e.preventDefault();

  const submitButton = $("service-form").querySelector(
    'button[type="submit"]'
  );

  const id = $("edit-service-id").value;
  const imageFile = $("service-image")?.files?.[0];

  submitButton.disabled = true;
  submitButton.textContent = "SAVING...";

  try {
    const payload = {
      name: $("new-service-name").value.trim(),
      description: $("new-service-desc").value.trim(),
      price: Number($("new-service-price").value),
      duration: $("new-service-duration").value.trim(),
      is_active: true
    };

    if (!payload.name) {
      throw new Error("Please enter a service name.");
    }

    if (!Number.isFinite(payload.price) || payload.price < 0) {
      throw new Error("Please enter a valid price.");
    }

    if (imageFile) {
      showMessage("service-message", "Uploading image...");
      payload.image_path = await uploadServiceImage(imageFile);
    } else if (!id) {
      payload.image_path = null;
    }

    showMessage("service-message", "Saving service...");

    const result = id
      ? await db.from("services").update(payload).eq("id", id)
      : await db.from("services").insert(payload);

    if (result.error) throw result.error;

    showMessage("service-message", "Service saved successfully.");

    resetServiceForm();
    await refresh();

  } catch (err) {
    console.error("Service save error:", err);
    showMessage("service-message", "Service Error: " + err.message);

  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "SAVE SERVICE";
  }
};

// RESET SERVICE FORM
function resetServiceForm() {
  $("service-form").reset();
  $("edit-service-id").value = "";
  editingImagePath = "";

  if (previewObjectUrl) {
    URL.revokeObjectURL(previewObjectUrl);
    previewObjectUrl = null;
  }

  showImagePreview("");
}

// CLEAR SERVICE
$("clear-service").onclick = () => {
  resetServiceForm();
  showMessage("service-message", "");
};

// INITIAL SESSION CHECK
checkSession();
