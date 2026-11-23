
const $ = id => document.getElementById(id);

const db = window.hexaSupabase;

const list = $("all-service-list");
const message = $("services-message");

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

    // Show only the latest 4 active services
    const visibleServices = data.slice(0, 4);

    list.innerHTML =
      visibleServices.map(renderService).join("") +

      `
        <div class="see-more-wrap" style="grid-column: 1 / -1;">
          <a class="btn" href="index.html">
            SEE MORE
          </a>
        </div>
      `;

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
