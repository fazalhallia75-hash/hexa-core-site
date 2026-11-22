
const $ = id => document.getElementById(id);
const db = window.hexaSupabase;

let currentOrders = [];

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
}[c]));

async function refresh() {
  // SERVICES
  const { data: svcs, error: serviceError } = await db
    .from("services")
    .select("*")
    .order("created_at", { ascending: false });

  if (serviceError) {
    $("admin-services").textContent =
      "Services Error: " + serviceError.message;
  } else {
    $("admin-services").innerHTML = (svcs || []).map(s => `
      <div class="admin-row">
        <div>
          <b>${esc(s.name)}</b>
          <div class="muted">
            Rs. ${Number(s.price).toLocaleString("en-PK")} · ${esc(s.duration)}
          </div>
          <div class="muted">${esc(s.description)}</div>
        </div>
        <div>
          <button class="btn secondary" data-edit="${s.id}">Edit</button>
          <button class="btn danger"
            data-toggle="${s.id}"
            data-active="${s.is_active}">
            ${s.is_active ? "Hide" : "Activate"}
          </button>
        </div>
      </div>
    `).join("") || "No services yet.";

    $("admin-services").querySelectorAll("[data-edit]").forEach(b => {
      b.onclick = () => {
        const s = svcs.find(x => x.id === b.dataset.edit);

        $("edit-service-id").value = s.id;
        $("new-service-name").value = s.name;
        $("new-service-desc").value = s.description || "";
        $("new-service-price").value = s.price;
        $("new-service-duration").value = s.duration || "";

        window.scrollTo({ top: 0, behavior: "smooth" });
      };
    });

    $("admin-services").querySelectorAll("[data-toggle]").forEach(b => {
      b.onclick = async () => {
        const { error } = await db.from("services")
          .update({ is_active: b.dataset.active !== "true" })
          .eq("id", b.dataset.toggle);

        if (error) alert("Service Error: " + error.message);
        else refresh();
      };
    });
  }

  // CUSTOMER ORDERS
  const { data: orders, error } = await db
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    $("orders-list").textContent =
      "Orders Error: " + error.message;
  } else {
    currentOrders = orders || [];

    $("orders-list").innerHTML = currentOrders.map(o => `
      <article class="order-card">
        <div class="section-head">
          <b>${esc(o.service_name)} · Rs. ${Number(o.price).toLocaleString("en-PK")}</b>
          <span class="status">${esc(o.status)}</span>
        </div>

        <p>Order: <code>${esc(o.id)}</code></p>
        <p>Customer: ${esc(o.customer_name)} · ${esc(o.customer_phone)}</p>
        <p>Sender: ${esc(o.sender_name)} · ${esc(o.sender_phone)}</p>
        <p>Transaction: ${esc(o.transaction_id)}</p>
        <p>Created: ${new Date(o.created_at).toLocaleString()}</p>

        <div class="admin-actions">
          <button class="btn secondary" data-receipt="${o.id}">
            View receipt
          </button>

          <select data-status="${o.id}">
            <option>pending</option>
            <option>approved</option>
            <option>rejected</option>
            <option>delivered</option>
          </select>

          <input data-note="${o.id}"
            placeholder="Admin note / delivery note"
            value="${esc(o.admin_note || "")}">

          <label class="file-label">
            Delivery file
            <input type="file" data-delivery="${o.id}">
          </label>

          <button class="btn" data-save="${o.id}">
            Save order
          </button>
        </div>
      </article>
    `).join("") || "No orders yet.";

    $("orders-list").querySelectorAll("[data-status]").forEach(el => {
      const o = currentOrders.find(x => x.id === el.dataset.status);
      el.value = o.status;
    });

    // VIEW RECEIPT
    $("orders-list").querySelectorAll("[data-receipt]").forEach(b => {
      b.onclick = async () => {
        const o = currentOrders.find(x => x.id === b.dataset.receipt);

        if (!o.receipt_path) {
          alert("No receipt attached.");
          return;
        }

        const { data, error } = await db.storage
          .from("payment-receipts")
          .createSignedUrl(o.receipt_path, 120);

        if (error) alert("Receipt Error: " + error.message);
        else window.open(data.signedUrl, "_blank", "noopener");
      };
    });

    // SAVE ORDER
    $("orders-list").querySelectorAll("[data-save]").forEach(b => {
      b.onclick = async () => {
        const id = b.dataset.save;
        const status = $(`[data-status="${id}"]`).value;
        const note = $(`[data-note="${id}"]`).value;
        const file = $(`[data-delivery="${id}"]`).files[0];

        let delivery_url =
          currentOrders.find(x => x.id === id).delivery_url;

        if (file) {
          if (file.size > 20 * 1024 * 1024) {
            alert("Delivery file must be 20 MB or smaller.");
            return;
          }

          const ext = (file.name.split(".").pop() || "bin")
            .replace(/[^a-z0-9]/gi, "");

          const path = `${id}/${crypto.randomUUID()}.${ext}`;

          const up = await db.storage
            .from("delivery-files")
            .upload(path, file, { upsert: false });

          if (up.error) {
            alert("Delivery Upload Error: " + up.error.message);
            return;
          }

          const signed = await db.storage
            .from("delivery-files")
            .createSignedUrl(path, 604800);

          if (signed.error) {
            alert("Delivery Link Error: " + signed.error.message);
            return;
          }

          delivery_url = signed.data.signedUrl;
        }

        const { error } = await db.from("orders")
          .update({
            status,
            admin_note: note,
            delivery_url
          })
          .eq("id", id);

        if (error) {
          alert("Order Update Error: " + error.message);
        } else {
          alert("Order updated.");
          refresh();
        }
      };
    });
  }

  // CUSTOMER FEEDBACK
  const { data: fb, error: fe } = await db
    .from("feedback")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  if (fe) {
    $("feedback-list").textContent =
      "Feedback Error: " + fe.message;
  } else {
    $("feedback-list").innerHTML = (fb || []).map(f => `
      <div class="admin-row">
        <div>
          <b>${esc(f.customer_name)} · ${esc(f.rating)}/5</b>
          <p>${esc(f.message)}</p>
          <small class="muted">
            ${new Date(f.created_at).toLocaleString()}
          </small>
        </div>
      </div>
    `).join("") || "No feedback yet.";
  }
}

// LOGIN
$("login-form").onsubmit = async e => {
  e.preventDefault();

  $("login-message").textContent = "Signing in…";

  const { error } = await db.auth.signInWithPassword({
    email: $("email").value,
    password: $("password").value
  });

  if (error) {
    $("login-message").textContent = error.message;
    return;
  }

  await checkSession();
};

// CHECK SESSION
async function checkSession() {
  const { data: { user }, error } = await db.auth.getUser();

  if (error || !user) return;

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

  $("service-message").textContent =
    result.error ? result.error.message : "Service saved.";

  if (!result.error) {
    $("service-form").reset();
    $("edit-service-id").value = "";
    refresh();
  }
};

// CLEAR SERVICE FORM
$("clear-service").onclick = () => {
  $("service-form").reset();
  $("edit-service-id").value = "";
};

// INITIAL SESSION CHECK
checkSession();
