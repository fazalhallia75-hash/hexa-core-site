const $ = (id) => document.getElementById(id);
const db = window.hexaSupabase;
const cfg = window.HEXA_CONFIG;
$("pay-name").textContent = cfg.JAZZCASH_ACCOUNT_NAME;
$("pay-number").textContent = cfg.JAZZCASH_NUMBER;
$("support-link").href = `https://wa.me/${cfg.WHATSAPP_NUMBER}`;
$("support-link").textContent = "WhatsApp Support";

async function loadServices(){
  const {data,error}=await db.from("services").select("id,name,description,price,duration").eq("is_active",true).order("created_at",{ascending:false});
  const root=$("service-list");
  if(error){root.textContent="Could not load services. Please try again later.";return;}
  if(!data.length){root.innerHTML='<p class="muted">No services are listed yet. Please check again later.</p>';return;}
  root.innerHTML="";
  data.forEach(s=>{
    const card=document.createElement("article");card.className="service-card";
    card.innerHTML=`<h3></h3><p class="muted"></p><strong class="price"></strong><p class="muted duration"></p><button class="btn choose">Select Service</button>`;
    card.querySelector("h3").textContent=s.name;
    card.querySelector("p").textContent=s.description||"";
    card.querySelector(".price").textContent=`Rs. ${Number(s.price).toLocaleString("en-PK")}`;
    card.querySelector(".duration").textContent=s.duration||"";
    card.querySelector("button").addEventListener("click",()=>{
      $("service-id").value=s.id;$("service-name").value=s.name;$("service-price").value=s.price;
      $("order-panel").scrollIntoView({behavior:"smooth"});
    });
    root.appendChild(card);
  });
}
$("order-form").addEventListener("submit",async e=>{
  e.preventDefault();const msg=$("order-message");msg.textContent="Submitting…";
  const serviceId=$("service-id").value, file=$("receipt").files[0];
  if(!serviceId){msg.textContent="Please select a service first.";return;}
  if(!file || file.size>5*1024*1024){msg.textContent="Choose a payment image up to 5 MB.";return;}
  if(!["image/jpeg","image/png","image/webp"].includes(file.type)){msg.textContent="Use JPG, PNG or WEBP.";return;}
  const {data:svc,error:svcErr}=await db.from("services").select("id,name,price").eq("id",serviceId).eq("is_active",true).single();
  if(svcErr||!svc){msg.textContent="This service is no longer available. Refresh the page.";return;}
  const order={service_id:svc.id,service_name:svc.name,price:svc.price,customer_name:$("customer-name").value.trim(),customer_phone:$("customer-phone").value.trim(),sender_name:$("sender-name").value.trim(),sender_phone:$("sender-phone").value.trim(),transaction_id:$("transaction-id").value.trim()};
  const {data:created,error}=await db.rpc("create_customer_order",{
    p_service_id:order.service_id,p_customer_name:order.customer_name,p_customer_phone:order.customer_phone,
    p_sender_name:order.sender_name,p_sender_phone:order.sender_phone,p_transaction_id:order.transaction_id
  });
  if(error||!created){msg.textContent="Order could not be created: "+(error?.message||"Please try again.");return;}
  const orderId=created;
  const ext=file.type==="image/png"?"png":file.type==="image/webp"?"webp":"jpg";
  const path=`${orderId}/${crypto.randomUUID()}.${ext}`;
  const up=await db.storage.from("payment-receipts").upload(path,file,{contentType:file.type,upsert:false});
  if(up.error){msg.textContent=`Order reference: ${orderId}. Receipt upload failed; contact support with this reference.`;return;}
  const attach=await db.rpc("attach_payment_receipt",{p_order_id:orderId,p_customer_phone:order.customer_phone,p_receipt_path:path});
  if(attach.error){msg.textContent=`Order reference: ${orderId}. Receipt was uploaded but could not be linked. Contact support.`;return;}
  msg.innerHTML="";
  const p=document.createElement("p");p.textContent="Order submitted. Save this order reference to track your order: ";
  const code=document.createElement("strong");code.textContent=orderId;p.append(p,code);msg.appendChild(p);
  $("order-form").reset();$("service-id").value="";$("service-name").value="";$("service-price").value="";
});
loadServices();