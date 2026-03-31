#!/usr/bin/env node
// Initialize dashboard stats
import('../packages/backend/dist/modules/dashboard/dashboardService.js')
  .then((module) => module.refreshDashboardStats())
  .then(() => {
    console.log('✅ Dashboard stats initialized successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Failed to initialize dashboard stats:', error);
    process.exit(1);
  });
