// Application configuration

// n8n Webhook URL for facial mesh agent (Workbench analysis)
export const N8N_WEBHOOK_URL = 'https://vssolutions-n8n.fjsxhg.easypanel.host/webhook/facial-mesh-agent';

// n8n Webhook URL for facial analysis on case creation
export const N8N_FACIAL_ANALYSIS_WEBHOOK = 'https://vssolutions-n8n.fjsxhg.easypanel.host/webhook/facial-analysis';

// Polling interval for checking job status (in milliseconds)
export const POLLING_INTERVAL_MS = 3000;

// Maximum polling attempts before timing out (60 attempts * 3s = 3 minutes)
export const MAX_POLLING_ATTEMPTS = 60;
