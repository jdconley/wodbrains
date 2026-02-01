interface ImportMeta {
	glob<T = unknown>(
		pattern: string,
		options?: {
			eager?: boolean;
			as?: string;
			query?: string;
			import?: string;
		},
	): Record<string, T>;
}
