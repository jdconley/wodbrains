create table if not exists parse_attempts (
  parseId text primary key,
  requestId text,
  userId text,
  createdAt integer not null,
  inputKind text not null,
  inputTextPreview text,
  inputTextLen integer,
  inputUrl text,
  inputUrlLen integer,
  inputImageKey text,
  inputImageMimeType text,
  inputImageFilename text,
  inputImageSize integer,
  payloadR2Key text not null,
  payloadSha256 text,
  outputTitlePreview text,
  errorCode text,
  errorMessage text
);

create index if not exists parse_attempts_user_idx on parse_attempts (userId);
create index if not exists parse_attempts_request_idx on parse_attempts (requestId);
create index if not exists parse_attempts_created_idx on parse_attempts (createdAt);

create table if not exists definition_origins (
  definitionId text primary key,
  parseId text not null,
  payloadR2Key text not null,
  payloadSha256 text,
  inputImageKey text,
  createdAt integer not null
);

create index if not exists definition_origins_parse_idx on definition_origins (parseId);

create table if not exists parse_feedback (
  feedbackId text primary key,
  createdAt integer not null,
  userId text,
  definitionId text,
  parseId text,
  category text,
  note text,
  currentWorkoutDefinitionJson text,
  currentTimerPlanJson text,
  userAgent text,
  pageUrl text
);

create index if not exists parse_feedback_created_idx on parse_feedback (createdAt);
create index if not exists parse_feedback_parse_idx on parse_feedback (parseId);
create index if not exists parse_feedback_definition_idx on parse_feedback (definitionId);
