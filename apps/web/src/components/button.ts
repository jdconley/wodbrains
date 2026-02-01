export type LabelButtonTone = 'primary' | 'secondary' | 'ghost' | 'danger';

export type LabelButtonOptions = {
  tone?: LabelButtonTone;
  icon?: boolean;
  extra?: string;
};

const toneClassMap: Record<LabelButtonTone, string> = {
  primary: 'PrimaryBtn',
  secondary: 'SecondaryBtn',
  ghost: 'GhostBtn',
  danger: 'DangerBtn',
};

export function labelButtonClasses(options: LabelButtonOptions = {}): string {
  const tone = options.tone ?? 'primary';
  const classes = [toneClassMap[tone]];
  if (options.icon) classes.push('IconBtn');
  if (options.extra) classes.push(options.extra);
  return classes.join(' ');
}
