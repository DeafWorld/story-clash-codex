create extension if not exists pgcrypto;

create table if not exists users (
  user_id text primary key,
  created_at timestamptz default now(),
  is_admin boolean default false
);

create table if not exists confessions (
  id uuid primary key default gen_random_uuid(),
  anonymous_id text not null,
  content text not null,
  created_at timestamptz default now(),
  flag_count int default 0,
  hidden boolean default false,
  boosted_until timestamptz,
  vote_score int default 0
);

create table if not exists confession_votes (
  user_id text references users(user_id) on delete cascade,
  confession_id uuid references confessions(id) on delete cascade,
  vote_value int not null check (vote_value in (-1, 1)),
  created_at timestamptz default now(),
  primary key (user_id, confession_id)
);

create table if not exists binary_questions (
  id uuid primary key default gen_random_uuid(),
  question_text text not null,
  option_a text not null,
  option_b text not null,
  votes_a int default 0,
  votes_b int default 0,
  flag_count int default 0,
  hidden boolean default false,
  status text default 'pending' check (status in ('pending', 'active', 'archived')),
  sponsored boolean default false,
  sponsored_order_id uuid,
  featured_until timestamptz,
  created_at timestamptz default now()
);

create table if not exists binary_votes (
  user_id text references users(user_id) on delete cascade,
  question_id uuid references binary_questions(id) on delete cascade,
  choice text not null check (choice in ('a', 'b')),
  created_at timestamptz default now(),
  primary key (user_id, question_id)
);

create table if not exists ask_questions (
  id uuid primary key default gen_random_uuid(),
  question_text text not null,
  votes int default 0,
  flag_count int default 0,
  hidden boolean default false,
  status text default 'pending' check (status in ('pending', 'active', 'archived')),
  created_at timestamptz default now()
);

create table if not exists ask_votes (
  user_id text references users(user_id) on delete cascade,
  ask_question_id uuid references ask_questions(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (user_id, ask_question_id)
);

create table if not exists ask_answers (
  id uuid primary key default gen_random_uuid(),
  ask_question_id uuid references ask_questions(id) on delete cascade,
  user_id text references users(user_id) on delete cascade,
  answer_text text not null,
  votes int default 0,
  flag_count int default 0,
  hidden boolean default false,
  created_at timestamptz default now(),
  unique (user_id, ask_question_id)
);

create table if not exists answer_votes (
  user_id text references users(user_id) on delete cascade,
  answer_id uuid references ask_answers(id) on delete cascade,
  vote_value int not null check (vote_value in (-1, 1)),
  created_at timestamptz default now(),
  primary key (user_id, answer_id)
);

create table if not exists flags (
  user_id text references users(user_id) on delete cascade,
  content_type text not null,
  content_id uuid not null,
  created_at timestamptz default now(),
  primary key (user_id, content_type, content_id)
);

create table if not exists rate_limits (
  user_id text references users(user_id) on delete cascade,
  scope text not null,
  window_start timestamptz not null,
  count int default 0,
  primary key (user_id, scope)
);

create table if not exists sponsored_orders (
  id uuid primary key default gen_random_uuid(),
  user_id text references users(user_id) on delete cascade,
  question_text text not null,
  option_a text not null,
  option_b text not null,
  tier int not null,
  status text default 'pending',
  stripe_session_id text,
  binary_question_id uuid references binary_questions(id),
  created_at timestamptz default now()
);

create table if not exists subscriptions (
  user_id text references users(user_id) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text,
  status text,
  current_period_end timestamptz,
  created_at timestamptz default now(),
  primary key (user_id)
);

create table if not exists confession_prompts (
  id uuid primary key default gen_random_uuid(),
  prompt_text text not null,
  status text default 'active' check (status in ('active', 'archived')),
  created_at timestamptz default now()
);

create table if not exists moderation_actions (
  id uuid primary key default gen_random_uuid(),
  admin_user_id text references users(user_id) on delete cascade,
  content_type text not null,
  content_id uuid not null,
  action text not null,
  created_at timestamptz default now()
);

alter table binary_questions
  add constraint binary_questions_sponsored_order_id_fkey
  foreign key (sponsored_order_id) references sponsored_orders(id);

alter table sponsored_orders
  add constraint sponsored_orders_binary_question_id_fkey
  foreign key (binary_question_id) references binary_questions(id);
