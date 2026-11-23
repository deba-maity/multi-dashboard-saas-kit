import { defineConfig } from "@playwright/test";

const external = process.env.DEMO_BASE_URL;
const baseURL = external || "http://127.0.0.1:4189/multi-dashboard-saas-kit/";
export default defineConfig({
  testDir: "./tests/browser",
  timeout: 45000,
  workers: 2,
  use: { baseURL, trace: "retain-on-failure" },
  webServer: external ? undefined : {
    command: "npm run build:demo && npm run preview --workspace @saas-kit/frontend -- --base /multi-dashboard-saas-kit/ --host 127.0.0.1 --port 4189 --strictPort",
    url: baseURL, reuseExistingServer: !process.env.CI, timeout: 120000
  }
});
