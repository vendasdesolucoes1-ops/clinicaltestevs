// Application configuration

// n8n Webhook URL for facial analysis
// Replace <WEBHOOK_ID> with your actual webhook ID from n8n
export const N8N_WEBHOOK_URL = 'https://medico.app.n8n.cloud/webhook/facial-analysis';

// Polling interval for checking job status (in milliseconds)
export const POLLING_INTERVAL_MS = 3000;

// Maximum polling attempts before timing out
export const MAX_POLLING_ATTEMPTS = 100;
