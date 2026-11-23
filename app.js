
const $ = (id) => document.getElementById(id);

const cfg = window.HEXA_CONFIG;
const db = window.hexaSupabase;

// CHECK CONFIGURATION
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

  await loadServices();

  // AUTO SELECT SERVICE FROM SERVICES PAGE
  await selectServiceFromURL();
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

// LOAD SERVICES
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

    root.innerHTML = "";

    data.forEach((service) => {
      const card = document.createElement("article");
      card.className = "service-card";

      if (service.image_path) {
        const image = document.createElement("img");

        image.src = getServiceImageUrl(service.image_path);
        image.alt = service.name;
        image.loading = "lazy";

        image.style.width = "100%";
        image.style.height = "190px";
        image.style.objectFit = "cover";
        image.style.borderRadius = "14px";
        image.style.marginBottom = "12px";

        image.onerror = () => {
          image.style.display = "none";
        };

        card.appendChild(image);
      }

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

        $("order-panel").scrollIntoView({
          behavior: "smooth"
        });
      });

      card.append(
        heading,
        description,
        price,
        duration,
        button
      );

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
  $("service-id").value = service.id;
  $("service-name").value = service.name;
  $("service-price").value = service.price;

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
        msg.textContent =
          "Receipt Link Error: " + attachError.message;
        return;
      }

      msg.textContent =
        "Order submitted. Reference: " + orderId;

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
