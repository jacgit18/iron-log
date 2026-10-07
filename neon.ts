import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  // Iron Log uses Neon for Postgres only; the API is its own Express server.
  auth: false,
  dataApi: false,
  aiGateway: false,
  // Branch policy: per-branch tuning
  branch: (branch) => {
    if (branch.isDefault) {
      // Default branch: no overrides, uses project defaults
      return {};
    }
    if (!branch.exists) {
      // New non-default branches: auto-expire
      // Run `neon checkout <name>` to create a new branch with these settings
      return { ttl: "7d" };
    }
    // Existing branch: no changes
    return {};
  },
});
