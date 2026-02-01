create table if not exists idempotency_keys (
  userId text not null,
  idempotencyKey text not null,
  method text not null,
  path text not null,
  status integer,
  responseJson text,
  createdAt integer not null,
  updatedAt integer not null,
  expiresAt integer not null,
  primary key (userId, idempotencyKey, method, path)
);

create index if not exists idempotency_keys_expires_idx on idempotency_keys (expiresAt);
