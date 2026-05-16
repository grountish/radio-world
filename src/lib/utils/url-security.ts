export function preferSecureUrl(value: string): string {
	const input = value.trim();

	if (!input) {
		return '';
	}

	try {
		const url = new URL(input);
		if (url.protocol === 'http:') {
			url.protocol = 'https:';
		}
		return url.toString();
	} catch {
		return input;
	}
}
