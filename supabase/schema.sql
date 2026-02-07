create extension if not exists "pgcrypto";

create table if not exists rooms (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  genre text,
  active boolean not null default true
);

create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  name text not null,
  avatar text not null,
  score integer not null default 0,
  turn_order integer,
  created_at timestamptz not null default now()
);

create table if not exists stories (
  id uuid primary key default gen_random_uuid(),
  genre text unique not null,
  scenes jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  story_id uuid references stories(id),
  choices jsonb not null default '[]'::jsonb,
  ending text,
  created_at timestamptz not null default now()
);
