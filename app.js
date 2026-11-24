
const $ = (id) => document.getElementById(id);

const cfg = window.HEXA_CONFIG;
const db = window.hexaSupabase;

// START WEBSITE
async function startApp() {
  const root = $("service-list");

  if (!cfg || !db) {
    if (root) {
      root.textContent =
        "Configuration Error: Supabase is not initialized. Check config.js.";
    }
    return;
  }

  if ($("pay-name")) {
    $("pay-name").textContent = cfg.JAZZCASH_ACCOUNT_NAME;
  }

  if ($("pay-number")) {
    $("pay-number").textContent = cfg.JAZZCASH_NUMBER;
  }

  if ($("support-link")) {
    $("support-link").href =
      `https://wa.me/${cfg.WHATSAPP_NUMBER}`;

    $("support-link").textContent = "WhatsApp Support";
  }

  await loadAnnouncementRibbon();
  await loadServices();
  await selectServiceFromURL();
}

// LOAD ANNOUNCEMENT RIBBON
async function loadAnnouncementRibbon() {
  const ribbon = $("announcement-ribbon");
  const ribbonText = $("announcement-ribbon-text");

  if (!ribbon || !ribbonText || !db) return;

  try {
    const { data, error } = await db
      .from("site_announcement")
      .select("message, enabled")
      .eq("id", 1)
      .single();

    if (error) throw error;

    const message = String(data?.message || "").trim();

    if (data?.enabled && message) {
      ribbonText.textContent = message;
      ribbon.hidden = false;
    } else {
      ribbon.hidden = true;
      ribbonText.textContent = "";
    }

  } catch (error) {
    console.error("Announcement Ribbon Error:", error);
    ribbon.hidden = true;
  }
}

// GET SERVICE IMAGE
function getServiceImageUrl(path) {
  if (!path) return "";

  if (/^https?:\/\//i.test(path)) return path;

  const { data } = db.storage
    .from("service-images")
    .getPublicUrl(path);

  return data?.publicUrl || "";
}

// LOAD HOME PAGE SERVICES
async function loadServices() {
  const root = $("service-list");

  if (!root) return;

  root.textContent = "Loading services...";

  try {
    const { data, error } = await db
      .from("services")
      .select("id,name,description,price,duration,image_path")
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Supabase Services Error:", error);
      root.textContent = "Supabase Error: " + error.message;
      return;
    }

    if (!data || data.length === 0) {
      root.textContent = "No active services found.";
      return;
    }

    // ONLY 4 SERVICES ON HOME PAGE
    const homeServices = data.slice(0, 4);

    root.innerHTML = "";

    homeServices.forEach((service) => {
      const card = document.createElement("article");
      card.className = "service-card";

      if (service.image_path) {
        const image = document.createElement("img");

        image.src = getServiceImageUrl(service.image_path);
        image.alt = service.name;
        image.loading = "lazy";
        image.className = "service-image";

        image.onerror = () => {
          image.style.display = "none";
        };

        card.appendChild(image);
      }

      const content = document.createElement("div");
      content.className = "service-content";

      const heading = document.createElement("h3");
      heading.textContent = service.name;

      const description = document.createElement("p");
      description.className = "muted";
      description.textContent = service.description || "";

      const price = document.createElement("strong");
      price.className = "price";
      price.textContent =
        "Rs. " + Number(service.price).toLocaleString("en-PK");

      const duration = document.createElement("p");
      duration.className = "muted";
      duration.textContent = service.duration || "";

      const button = document.createElement("button");
      button.className = "btn choose";
      button.type = "button";
      button.textContent = "Select Service";

      button.addEventListener("click", () => {
        fillSelectedService(service);

        const panel = $("order-panel");

        if (panel) {
          panel.scrollIntoView({
            behavior: "smooth"
          });
        }
      });

      content.append(
        heading,
        description,
        price,
        duration,
        button
      );

      card.appendChild(content);
      root.appendChild(card);
    });

  } catch (error) {
    console.error("Services Loading Exception:", error);

    root.textContent =
      "Loading Error: " + error.message;
  }
}

// FILL ORDER FORM
function fillSelectedService(service) {
  if ($("service-id")) {
    $("service-id").value = service.id;
  }

  if ($("service-name")) {
    $("service-name").value = service.name;
  }

  if ($("service-price")) {
    $("service-price").value = service.price;
  }

  if ($("order-message")) {
    $("order-message").textContent = "";
  }
}

// AUTO SELECT FROM URL
async function selectServiceFromURL() {
  const params = new URLSearchParams(window.location.search);
  const serviceId = params.get("service");

  if (!serviceId) return;

  try {
    const { data: service, error } = await db
      .from("services")
      .select("id,name,price")
      .eq("id", serviceId)
      .eq("is_active", true)
      .single();

    if (error || !service) {
      console.error("Selected Service Error:", error);

      if ($("order-message")) {
        $("order-message").textContent =
          "Selected service is unavailable.";
      }
      return;
    }

    fillSelectedService(service);

    const panel = $("order-panel");

    if (panel) {
      panel.scrollIntoView({
        behavior: "smooth"
      });
    }

  } catch (error) {
    console.error("Auto Selection Error:", error);
  }
}

// COPY ORDER REFERENCE
async function copyOrderReference(reference, button) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(String(reference));
    } else {
      const textarea = document.createElement("textarea");

      textarea.value = String(reference);
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";

      document.body.appendChild(textarea);
      textarea.select();

      const copied = document.execCommand("copy");

      textarea.remove();

      if (!copied) {
        throw new Error("Copy was not successful.");
      }
    }

    button.textContent = "COPIED ✓";
    button.style.background = "#FFFFFF";
    button.style.border = "1px solid #000000";
    button.style.color = "#DC2626";

  } catch (error) {
    console.error("Copy Error:", error);

    button.textContent = "COPY FAILED";
    button.style.background = "#FFFFFF";
    button.style.border = "1px solid #000000";
    button.style.color = "#DC2626";
  }
}

// SHOW SUCCESSFUL ORDER REFERENCE
function showOrderSuccess(reference) {
  const msg = $("order-message");

  if (!msg) return;

  msg.replaceChildren();

  const card = document.createElement("div");

  card.style.cssText = `
    width: 100%;
    box-sizing: border-box;
    background: #FFFFFF;
    border: 2px solid #000000;
    border-radius: 14px;
    padding: 17px;
    margin-top: 14px;
    color: #111111;
    text-align: left;
    box-shadow: 0 4px 14px rgba(0,0,0,0.08);
  `;

  const heading = document.createElement("div");

  heading.textContent =
    "⚠️ IMPORTANT: SAVE YOUR ORDER ID";

  heading.style.cssText = `
    color: #DC2626;
    font-size: 17px;
    font-weight: 700;
    line-height: 1.5;
    margin-bottom: 14px;
  `;

  const divider = document.createElement("div");

  divider.style.cssText = `
    height: 1px;
    background: #000000;
    margin-bottom: 14px;
  `;

  const label = document.createElement("div");

  label.textContent = "YOUR ORDER REFERENCE";

  label.style.cssText = `
    color: #111111;
    font-size: 12px;
    font-weight: 700;
    margin-bottom: 9px;
    letter-spacing: 1px;
  `;

  const referenceRow = document.createElement("div");

  referenceRow.style.cssText = `
    display: flex;
    align-items: stretch;
    gap: 9px;
    flex-wrap: wrap;
  `;

  const referenceBox = document.createElement("div");

  referenceBox.textContent = String(reference);

  referenceBox.style.cssText = `
    flex: 1 1 170px;
    min-width: 0;
    box-sizing: border-box;
    background: #F3F3F3;
    border: 1px solid #000000;
    border-radius: 9px;
    padding: 15px 12px;
    color: #111111;
    font-size: clamp(18px, 5vw, 25px);
    font-weight: 700;
    line-height: 1.4;
    overflow-wrap: anywhere;
    word-break: break-word;
    text-align: center;
  `;

  const copyButton = document.createElement("button");

  copyButton.type = "button";
  copyButton.textContent = "COPY";

  copyButton.style.cssText = `
    flex: 0 0 auto;
    min-width: 85px;
    border: 1px solid #000000;
    border-radius: 9px;
    padding: 12px 15px;
    background: #FFFFFF;
    color: #DC2626;
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
  `;

  copyButton.addEventListener("click", () => {
    copyOrderReference(reference, copyButton);
  });

  const note = document.createElement("p");

  note.textContent =
    "Save this code to track your order later.";

  note.style.cssText = `
    color: #333333;
    font-size: 13px;
    line-height: 1.6;
    margin: 14px 0 0;
  `;

  card.append(
    heading,
    divider,
    label
  );

  referenceRow.append(
    referenceBox,
    copyButton
  );

  card.append(
    referenceRow,
    note
  );

  msg.appendChild(card);

  msg.scrollIntoView({
    behavior: "smooth",
    block: "center"
  });
}

// CUSTOMER ORDER SUBMISSION
const orderForm = $("order-form");

if (orderForm) {
  orderForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const msg = $("order-message");

    msg.textContent = "Submitting...";

    try {
      const serviceId = $("service-id").value;
      const file = $("receipt").files[0];

      if (!serviceId) {
        msg.textContent = "Please select a service first.";
        return;
      }

      if (!file || file.size > 5 * 1024 * 1024) {
        msg.textContent = "Choose an image up to 5 MB.";
        return;
      }

      if (
        !["image/jpeg", "image/png", "image/webp"].includes(file.type)
      ) {
        msg.textContent = "Use JPG, PNG or WEBP.";
        return;
      }

      const customer = {
        name: $("customer-name").value.trim(),
        phone: $("customer-phone").value.trim(),
        senderName: $("sender-name").value.trim(),
        senderPhone: $("sender-phone").value.trim(),
        transactionId: $("transaction-id").value.trim()
      };

      const { data: service, error: serviceError } = await db
        .from("services")
        .select("id,name,price")
        .eq("id", serviceId)
        .eq("is_active", true)
        .single();

      if (serviceError || !service) {
        msg.textContent =
          "Service Error: " +
          (serviceError?.message || "Service unavailable.");
        return;
      }

      const { data: orderId, error: orderError } = await db.rpc(
        "create_customer_order",
        {
          p_service_id: service.id,
          p_customer_name: customer.name,
          p_customer_phone: customer.phone,
          p_sender_name: customer.senderName,
          p_sender_phone: customer.senderPhone,
          p_transaction_id: customer.transactionId
        }
      );

      if (orderError || !orderId) {
        msg.textContent =
          "Order Error: " +
          (orderError?.message || "Order could not be created.");
        return;
      }

      const extension =
        file.type === "image/png" ? "png" :
        file.type === "image/webp" ? "webp" : "jpg";

      const path =
        `${orderId}/${crypto.randomUUID()}.${extension}`;

      const { error: uploadError } = await db.storage
        .from("payment-receipts")
        .upload(path, file, {
          contentType: file.type,
          upsert: false
        });

      if (uploadError) {
        msg.textContent =
          "Receipt Upload Error: " + uploadError.message;
        return;
      }

      const { error: attachError } = await db.rpc(
        "attach_payment_receipt",
        {
          p_order_id: orderId,
          p_customer_phone: customer.phone,
          p_receipt_path: path
        }
      );

      if (attachError) {
        msg.textContent = "Receipt Link Error: " + attachError.message;
        return;
      }

      showOrderSuccess(orderId);

      orderForm.reset();

      $("service-id").value = "";
      $("service-name").value = "";
      $("service-price").value = "";

    } catch (error) {
      console.error("Order Submission Exception:", error);

      msg.textContent = "Error: " + error.message;
    }
  });
}

// START WEBSITE
startApp();
