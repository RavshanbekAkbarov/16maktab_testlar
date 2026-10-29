-- Supabase > SQL Editor ga to'liq nusxalab, "Run" ni bosing (bir marta).

create table students (
  id         text primary key,          -- 6 xonali ID (login)
  first_name text not null,
  last_name  text not null,
  cls        text not null,             -- sinf, masalan 7-A
  password   text not null
);

create table tests (
  id         text primary key,
  title      text not null,
  cls        text not null default '',  -- bo'sh = barcha sinflar
  type       text not null,             -- 'questions' yoki 'pdf'
  pdf        text not null default '',
  questions  jsonb not null,            -- savollar va to'g'ri javoblar
  pick       int not null default 0,    -- har o'quvchiga nechta savol (0 = hammasi)
  active     boolean not null default false,
  created_at timestamptz not null default now()
);

create table results (
  id         text primary key,
  test_id    text not null references tests(id) on delete cascade,
  student_id text not null references students(id) on delete cascade,
  answers    jsonb not null,
  correct    int not null,
  total      int not null,
  percent    int not null,
  created_at timestamptz not null default now(),
  unique (test_id, student_id)          -- har bir test faqat 1 marta
);

-- Jadvallarga tashqaridan to'g'ridan-to'g'ri kirib bo'lmasin.
-- Faqat bizning server (maxfiy kalit bilan) ishlay oladi.
alter table students enable row level security;
alter table tests    enable row level security;
alter table results  enable row level security;
grant all on students, tests, results to service_role;

-- Rasm va PDF lar uchun ochiq papka (bucket)
insert into storage.buckets (id, name, public) values ('files', 'files', true)
on conflict (id) do nothing;
