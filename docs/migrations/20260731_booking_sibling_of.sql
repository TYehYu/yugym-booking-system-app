/* 一堂佔多台機器（2026-07-31 使用者定案）——
   跑步機是「一個場地兩台」，一對二的客人兩個人一起來，一張票就能用兩台。
   venue_unit 一筆只存得下一台，所以第二台用一筆「同行使用」的預約佔住，
   靠 sibling_of 指回主預約，畫面才知道哪幾台是同一組人的。
   同行那筆不綁票、不扣點（使用者定案：一點兩台）。
   前端：venueUnitDots／bkToggleVenueUnit（預約明細的場地燈號開關）。 */
alter table public.bookings add column if not exists sibling_of text;
create index if not exists bookings_sibling_of_idx on public.bookings(sibling_of) where sibling_of is not null;
