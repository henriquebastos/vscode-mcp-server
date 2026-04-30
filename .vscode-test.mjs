import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
	files: 'out/test/**/*.test.js',
	coverage: {
		includeAll: true,
		include: ['out/**/*.js'],
		exclude: ['out/test/**'],
		output: './coverage',
		reporter: ['text-summary', 'html', 'json'],
	},
});
