alter table timer_definitions add column ogImageKey text;

create index if not exists timer_definitions_og_image_idx on timer_definitions (ogImageKey);
