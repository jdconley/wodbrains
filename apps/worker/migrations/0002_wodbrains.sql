create table if not exists timer_definitions (
  definitionId text primary key,
  ownerUserId text not null,
  sourceKind text,
  sourcePreview text,
  workoutDefinitionJson text not null,
  timerPlanJson text not null,
  createdAt integer not null,
  updatedAt integer not null
);

create index if not exists timer_definitions_owner_idx on timer_definitions (ownerUserId);

create table if not exists timer_runs (
  runId text primary key,
  definitionId text,
  ownerUserId text not null,
  createdAt integer not null,
  updatedAt integer not null
);

create index if not exists timer_runs_owner_idx on timer_runs (ownerUserId);
create index if not exists timer_runs_definition_idx on timer_runs (definitionId);

