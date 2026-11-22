
const $ = id => document.getElementById(id);
const db = window.hexaSupabase;

let currentOrders = [];
let currentServices = [];
let currentFeedback = [];

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

function toggleDeliveryFields(id) {
  const status = $(`status-${id}`);
  const fields = $(`delivery-fields-${id}`);

  if (status && fields) {
    fields.hidden = !["approved", "delivered"].includes(status.value);
  }
}

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
        <button class="btn secondary" data-edit="${esc(s.id)}">
          Edit
        </button>
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

        <label>
          Order Status
          <select id="status-${esc(o.id)}" data-status="${esc(o.id)}">
            <option value="pending">PENDING</option>
            <option value="approved">APPROVED</option>
            <option value="delivered">DELIVERED</option>
            <option value="rejected">REJECTED</option>
          </select>
        </label>

        <div id="delivery-fields-${esc(o.id)}"
             hidden>

          <label>
            KEY
            <input
              id="key-${esc(o.id)}"
              data-key="${esc(o.id)}"
              value="${esc(o.delivery_key || "")}"
              placeholder="Enter customer delivery key">
          </label>

          <label class="file-label">
            Delivery File
            <input
              type="file"
              data-delivery="${esc(o.id)}">
          </label>

          ${o.delivery_path ? `
            <p class="muted">A delivery file is already uploaded.</p>
          ` : ""}
        </div>

        <label>
          Admin Note
          <input
            data-note="${esc(o.id)}"
            value="${esc(o.admin_note || "")}"
            placeholder="Optional note">
        </label>

        <button class="btn" data-save="${esc(o.id)}">
          SAVE ORDER
        </button>

        <button class="btn danger" data-delete-order="${esc(o.id)}">
          DELETE ORDER
        </button>

      </div>
    </article>
  `).join("") || "No orders yet.";

  currentOrders.forEach(o => {
    const status = $(`status-${o.id}`);
    if (status) status.value = o.status || "pending";
    toggleDeliveryFields(o.id);
  });

  // STATUS CHANGE
  $("orders-list").querySelectorAll("[data-status]").forEach(el => {
    el.onchange = async () => {
      const id = el.dataset.status;

      if (el.value === "rejected") {
        const confirmed = confirm(
          "Reject this order and permanently delete it?"
        );

        if (!confirmed) {
          const order = currentOrders.find(x => x.id === id);
          el.value = order?.status || "pending";
          return;
        }

        await deleteOrder(id);
        return;
      }

      toggleDeliveryFields(id);
    };
  });

  // RECEIPT VIEW
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

  // SAVE ORDER
  $("orders-list").querySelectorAll("[data-save]").forEach(b => {
    b.onclick = async () => {
      const id = b.dataset.save;
      const order = currentOrders.find(x => x.id === id);
      if (!order) return;

      const status = $(`status-${id}`).value;
      const note = $(`[data-note="${id}"]`).value.trim();
      const keyInput = $(`[data-key="${id}"]`);
      const fileInput = $(`[data-delivery="${id}"]`);
      const file = fileInput?.files?.[0];

      if (status === "rejected") {
        alert("Rejected orders are deleted automatically.");
        return;
      }

      let deliveryKey = order.delivery_key || null;
      let deliveryPath = order.delivery_path || null;

      if (["approved", "delivered"].includes(status)) {
        deliveryKey = keyInput?.value.trim() || "";

        if (!deliveryKey) {
          alert("Please enter the customer's KEY.");
          return;
        }

        if (file) {
          if (file.size > 20 * 1024 * 1024) {
            alert("Delivery file must be 20 MB or smaller.");
            return;
          }

          const ext = (file.name.split(".").pop() || "bin")
            .replace(/[^a-z0-9]/gi, "") || "bin";

          const path = `${id}/${crypto.randomUUID()}.${ext}`;

          b.disabled = true;
          b.textContent = "Uploading...";

          const upload = await db.storage
            .from("delivery-files")
            .upload(path, file, { upsert: false });

          if (upload.error) {
            alert("Delivery Upload Error: " + upload.error.message);
            b.disabled = false;
            b.textContent = "SAVE ORDER";
            return;
          }

          deliveryPath = path;
        }

        if (!deliveryPath) {
          alert("Please upload the delivery file first.");
          return;
        }
      }

      if (status === "delivered" &&
          (!deliveryKey || !deliveryPath)) {
        alert("KEY and delivery file are required before delivery.");
        return;
      }

      b.disabled = true;
      b.textContent = "Saving...";

      try {
        const { error } = await db.from("orders")
          .update({
            status,
            admin_note: note,
            delivery_key: deliveryKey,
            delivery_path: deliveryPath
          })
          .eq("id", id);

        if (error) {
          alert("Order Update Error: " + error.message);
        } else {
          alert("Order updated successfully.");
          await refresh();
        }
      } catch (err) {
        alert("Error: " + err.message);
      } finally {
        b.disabled = false;
        b.textContent = "SAVE ORDER";
      }
    };
  });

  // DELETE ORDER
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

  if (error || !data?.user) return;

  $("login-panel").hidden = true;
  $("dashboard").hidden = false;

  await refresh();
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
