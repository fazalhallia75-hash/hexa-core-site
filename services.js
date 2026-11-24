
const $ = id => document.getElementById(id);

const db = window.hexaSupabase;

const list = $("all-service-list");
const message = $("services-message");

// USD CONVERSION RATE
const USD_PKR_RATE = 280;

const esc = value =>
  String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);

const money = value =>
  Number(value || 0).toLocaleString("en-PK");

// FORMAT USD PRICE
function getUsdPrice(pkrPrice) {
  const amount = Number(pkrPrice);

  if (!Number.isFinite(amount) || amount < 0) {
    return "USD unavailable";
  }

  return "≈ $" + (amount / USD_PKR_RATE).toFixed(2) + " USD";
}

function getImageUrl(path) {
  if (!path) return "";

  const { data } = db.storage
    .from("service-images")
    .getPublicUrl(path);

  return data?.publicUrl || "";
}

function renderService(service) {
  const imageUrl = getImageUrl(service.image_path);

  const image = imageUrl
    ? `<img
         src="${esc(imageUrl)}"
         alt="${esc(service.name)}"
         loading="lazy"
         class="service-image"
       >`
    : "";

  const description = service.description
    ? `<p>${esc(service.description)}</p>`
    : "";

  const duration = service.duration
    ? `<p class="muted">${esc(service.duration)}</p>`
    : "";

  const query = new URLSearchParams({
    service: service.id
  });

  return `
    <article class="service-card">

      ${image}

      <div class="service-content">

        <h3>${esc(service.name)}</h3>

        ${description}

        ${duration}

        <strong class="service-price">
          Rs. ${money(service.price)}
        </strong>

        <small style="
          display:block;
          color:#16A34A;
          font-size:11px;
          font-weight:700;
          margin-top:3px;
          margin-bottom:10px;
        ">
          ${getUsdPrice(service.price)}
        </small>

        <a
          class="btn"
          href="index.html?${query.toString()}#order-panel"
        >
          ORDER NOW
        </a>

      </div>

    </article>
  `;
}

async function loadAllServices() {
  if (!list) return;

  if (!db) {
    list.textContent = "Database configuration not found.";
    return;
  }

  list.innerHTML = '<p class="muted">Loading services...</p>';

  try {
    const { data, error } = await db
      .from("services")
      .select("id,name,description,price,duration,image_path")
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (error) throw error;

    if (!data || data.length === 0) {
      list.innerHTML =
        '<p class="muted">No services are currently available.</p>';
      return;
    }

    // SHOW ALL ACTIVE SERVICES
    list.innerHTML = data.map(renderService).join("");

  } catch (error) {
    console.error("Services loading error:", error);

    list.innerHTML =
      '<p class="muted">Unable to load services. Please refresh the page.</p>';

    if (message) {
      message.textContent = error.message || "Something went wrong.";
    }
  }
}

loadAllServices();
