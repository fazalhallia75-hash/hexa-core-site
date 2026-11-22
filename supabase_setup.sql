-- HEXA CORE: secure setup / migration. Run in Supabase SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  price numeric(10,2) not null check(price >= 0),
  duration text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  service_id uuid references public.services(id),
  service_name text not null,
  price numeric(10,2) not null check(price >= 0),
  customer_name text not null,
  customer_phone text not null,
  sender_name text not null,
  sender_phone text not null,
  transaction_id text not null,
  receipt_path text,
  status text not null default 'pending' check(status in ('pending','approved','rejected','delivered')),
  delivery_url text,
  admin_note text,
  created_at timestamptz not null default now()
);
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  customer_name text not null,
  message text not null,
  rating integer not null check(rating between 1 and 5),
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;
alter table public.services enable row level security;
alter table public.orders enable row level security;
alter table public.feedback enable row level security;

-- Compatibility for projects where the earlier starter schema was already created.
alter table public.orders add column if not exists delivery_url text;
alter table public.orders add column if not exists receipt_path text;
alter table public.orders add column if not exists admin_note text;

create or replace function public.is_hexa_admin()
returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from public.admin_users where user_id=(select auth.uid())); $$;

drop policy if exists "Public can view active services" on public.services;
drop policy if exists "Admins manage services" on public.services;
drop policy if exists "Admins view admin list" on public.admin_users;
drop policy if exists "Customers submit pending orders" on public.orders;
drop policy if exists "Admins view orders" on public.orders;
drop policy if exists "Admins update orders" on public.orders;
drop policy if exists "Customers submit feedback" on public.feedback;
drop policy if exists "Admins view feedback" on public.feedback;
drop policy if exists "Customers upload payment receipts" on storage.objects;
drop policy if exists "Admins view payment receipts" on storage.objects;
drop policy if exists "Admins manage delivery files" on storage.objects;

create policy "Public can view active services" on public.services for select to anon,authenticated using(is_active or public.is_hexa_admin());
create policy "Admins manage services" on public.services for all to authenticated using(public.is_hexa_admin()) with check(public.is_hexa_admin());
create policy "Admins view admin list" on public.admin_users for select to authenticated using(public.is_hexa_admin());

create policy "Admins view orders" on public.orders for select to authenticated using(public.is_hexa_admin());
create policy "Admins update orders" on public.orders for update to authenticated using(public.is_hexa_admin()) with check(public.is_hexa_admin());
create policy "Admins view feedback" on public.feedback for select to authenticated using(public.is_hexa_admin());

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('payment-receipts','payment-receipts',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=5242880,allowed_mime_types=array['image/jpeg','image/png','image/webp'];
insert into storage.buckets(id,name,public,file_size_limit)
values('delivery-files','delivery-files',false,20971520)
on conflict(id) do update set public=false,file_size_limit=20971520;

create or replace function public.can_upload_receipt(p_order_id text)
returns boolean language sql stable security definer set search_path=''
as $$
 select exists(select 1 from public.orders o where o.id::text=p_order_id and o.status='pending' and o.receipt_path is null);
$$;
grant execute on function public.can_upload_receipt(text) to anon,authenticated;

create policy "Customer uploads receipt for existing order" on storage.objects for insert to anon,authenticated
with check(bucket_id='payment-receipts' and public.can_upload_receipt(split_part(name,'/',1)));
create policy "Admins read receipts" on storage.objects for select to authenticated
using(bucket_id='payment-receipts' and public.is_hexa_admin());
create policy "Admins manage delivery files" on storage.objects for all to authenticated
using(bucket_id='delivery-files' and public.is_hexa_admin()) with check(bucket_id='delivery-files' and public.is_hexa_admin());

create or replace function public.create_customer_order(
 p_service_id uuid,p_customer_name text,p_customer_phone text,
 p_sender_name text,p_sender_phone text,p_transaction_id text
)
returns uuid language plpgsql security definer set search_path=''
as $$
declare s public.services%rowtype; new_id uuid;
begin
 select * into s from public.services where id=p_service_id and is_active=true;
 if not found then raise exception 'Service is unavailable'; end if;
 if length(trim(p_customer_name))=0 or length(trim(p_customer_phone))=0
    or length(trim(p_sender_name))=0 or length(trim(p_sender_phone))=0
    or length(trim(p_transaction_id))=0 then raise exception 'All order fields are required'; end if;
 insert into public.orders(service_id,service_name,price,customer_name,customer_phone,sender_name,sender_phone,transaction_id,status)
 values(s.id,s.name,s.price,trim(p_customer_name),trim(p_customer_phone),trim(p_sender_name),trim(p_sender_phone),trim(p_transaction_id),'pending')
 returning id into new_id;
 return new_id;
end; $$;
grant execute on function public.create_customer_order(uuid,text,text,text,text,text) to anon,authenticated;

create or replace function public.attach_payment_receipt(p_order_id uuid,p_customer_phone text,p_receipt_path text)
returns boolean language plpgsql security definer set search_path=''
as $$
begin
 update public.orders set receipt_path=p_receipt_path
 where id=p_order_id and customer_phone=p_customer_phone and status='pending'
 and p_receipt_path like p_order_id::text||'/%';
 return found;
end; $$;
grant execute on function public.attach_payment_receipt(uuid,text,text) to anon,authenticated;

create or replace function public.track_customer_order(p_order_id uuid,p_customer_phone text)
returns table(id uuid,service_name text,status text,admin_note text,delivery_url text)
language sql security definer set search_path=''
as $$
 select o.id,o.service_name,o.status,o.admin_note,o.delivery_url
 from public.orders o where o.id=p_order_id and o.customer_phone=p_customer_phone and o.receipt_path is not null;
$$;
grant execute on function public.track_customer_order(uuid,text) to anon,authenticated;

create or replace function public.submit_customer_feedback(p_order_id uuid,p_customer_phone text,p_message text,p_rating integer)
returns boolean language plpgsql security definer set search_path=''
as $$
declare customer text;
begin
 select customer_name into customer from public.orders
 where id=p_order_id and customer_phone=p_customer_phone and receipt_path is not null;
 if customer is null then return false; end if;
 insert into public.feedback(order_id,customer_name,message,rating)
 values(p_order_id,customer,p_message,p_rating);
 return true;
end; $$;
grant execute on function public.submit_customer_feedback(uuid,text,text,integer) to anon,authenticated;

-- Add your own Auth user's UUID here after creating the Supabase Auth user:
-- insert into public.admin_users(user_id) values('YOUR-AUTH-USER-UUID') on conflict do nothing;
