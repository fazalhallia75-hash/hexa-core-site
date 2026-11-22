
const $ = id => document.getElementById(id);
const db = window.hexaSupabase;
const cfg = window.HEXA_CONFIG;

let matchedOrder = null;

$("track-form").onsubmit = async e => {
  e.preventDefault();

  $("track-message").textContent = "Checking...";
  $("order-result").innerHTML = "";
  $("feedback-panel").hidden = true;
  matchedOrder = null;

  try {
    const { data, error } = await db.rpc("track_customer_order", {
      p_order_id: $("order-id").value.trim(),
      p_customer_phone: $("track-phone").value.trim()
    });

    if (error || !data?.length) {
      $("track-message").textContent =
        "Order not found. Check the reference and phone number.";
      return;
    }

    matchedOrder = data[0];

    const box = document.createElement("div");
    box.className = "order-card";

    const title = document.createElement("h3");
    title.textContent = matchedOrder.service_name;

    const status = document.createElement("p");
    status.textContent = "Status: " + matchedOrder.status;

    const note = document.createElement("p");
    note.textContent = matchedOrder.admin_note || "";

    box.append(title, status, note);

    if (matchedOrder.delivery_path) {
      const download = document.createElement("button");
      download.type = "button";
      download.className = "btn";
      download.textContent = "Download Your File";

      download.onclick = async () => {
        download.disabled = true;
        download.textContent = "Preparing download...";

        try {
          const response = await fetch(cfg.CUSTOMER_DELIVERY_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "apikey": cfg.SUPABASE_PUBLISHABLE_KEY
            },
            body: JSON.stringify({
              order_id: matchedOrder.id,
              customer_phone: $("track-phone").value.trim()
            })
          });

          const result = await response.json();

          if (!response.ok || !result.download_url) {
            throw new Error(result.error || "Download unavailable");
          }

          const link = document.createElement("a");
          link.href = result.download_url;
          link.target = "_blank";
          link.rel = "noopener";
          link.textContent = "Open delivery file";
          box.append(link);

          download.textContent = "Link Ready";

        } catch (err) {
          download.disabled = false;
          download.textContent = "Try Download Again";
          alert(err.message);
        }
      };

      box.append(download);
    }

    $("order-result").append(box);
    $("feedback-panel").hidden = false;
    $("track-message").textContent = "";

  } catch (err) {
    $("track-message").textContent = "Something went wrong. Please try again.";
  }
};

$("feedback-form").onsubmit = async e => {
  e.preventDefault();
  if (!matchedOrder) return;

  $("feedback-message").textContent = "Submitting...";

  try {
    const { error } = await db.rpc("submit_customer_feedback", {
      p_order_id: matchedOrder.id,
      p_customer_phone: $("track-phone").value.trim(),
      p_message: $("feedback-text").value.trim(),
      p_rating: Number($("rating").value)
    });

    $("feedback-message").textContent = error
      ? error.message
      : "Thank you. Your feedback was submitted.";

    if (!error) $("feedback-form").reset();

  } catch (err) {
    $("feedback-message").textContent = "Could not submit feedback.";
  }
};
