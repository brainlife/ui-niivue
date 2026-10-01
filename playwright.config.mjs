import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests', workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:8767', viewport: { width: 1100, height: 800 },
    launchOptions: {
      ...(process.env.PW_BROWSER_PATH ? { executablePath: process.env.PW_BROWSER_PATH } : {}),
      args: ['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    },
  },
  webServer: { command: 'python3 -m http.server 8767 --bind 127.0.0.1', url: 'http://127.0.0.1:8767', reuseExistingServer: !process.env.CI },
});
