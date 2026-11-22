
const $ = id => document.getElementById(id);
const db = window.hexaSupabase;

let matchedOrder = null;

$("track-form").onsubmit = async e => {
  e.preventDefault();

  $("track-message").textContent = "Checking...";
  $("order-result").innerHTML = "";
  $("feedback-panel").hidden = true;
  matchedOrder = null;

  try {
    const { data, error } = await db.rpc("track_customer_order_v2", {
      p_order_id: $("order-id").value.trim(),
      p_customer_phone: $("track-phone").value.trim()
    });

    if (error) throw error;

    if (!data?.length) {
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
    status.textContent =
      "Status: " + String(matchedOrder.status || "pending").toUpperCase();

    box.append(title, status);

    if (matchedOrder.status === "delivered") {

      if (matchedOrder.admin_note) {
        const noteTitle = document.createElement("h3");
        noteTitle.textContent = "NOTE";

        const note = document.createElement("p");
        note.textContent = matchedOrder.admin_note;

        box.append(noteTitle, note);
      }

      if (matchedOrder.delivery_key) {
        const keyTitle = document.createElement("h3");
        keyTitle.textContent = "YOUR KEY";

        const key = document.createElement("p");
        key.textContent = matchedOrder.delivery_key;
        key.style.fontWeight = "bold";
        key.style.wordBreak = "break-word";

        const copyButton = document.createElement("button");
        copyButton.type = "button";
        copyButton.className = "btn secondary";
        copyButton.textContent = "COPY KEY";

        copyButton.onclick = async () => {
          try {
            await navigator.clipboard.writeText(matchedOrder.delivery_key);
            copyButton.textContent = "COPIED!";
          } catch {
            alert("Please copy the key manually.");
          }
        };

        box.append(keyTitle, key, copyButton);
      }

      if (matchedOrder.delivery_url) {
        const downloadTitle = document.createElement("h3");
        downloadTitle.textContent = "YOUR DOWNLOAD";

        const download = document.createElement("a");
        download.href = matchedOrder.delivery_url;
        download.target = "_blank";
        download.rel = "noopener noreferrer";
        download.className = "btn";
        download.textContent = "DOWNLOAD FILE";
        download.style.display = "inline-block";
        download.style.textDecoration = "none";

        box.append(downloadTitle, download);
      }

    } else {
      const waiting = document.createElement("p");
      waiting.textContent =
        "Your order is being processed. Delivery will appear here once completed.";

      box.append(waiting);
    }

    $("order-result").append(box);
    $("feedback-panel").hidden = false;
    $("track-message").textContent = "";

  } catch (err) {
    console.error("Tracking error:", err);
    $("track-message").textContent =
      "Something went wrong: " + (err.message || "Please try again.");
  }
};

// CUSTOMER FEEDBACK
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
    console.error("Feedback error:", err);
    $("feedback-message").textContent =
      "Could not submit feedback.";
  }
};
