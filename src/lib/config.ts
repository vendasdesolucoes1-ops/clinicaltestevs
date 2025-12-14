// Application configuration

// n8n Webhook URL for facial mesh agent
// TESTE: trocar para /webhook/ (sem -test) quando for para produção
export const N8N_WEBHOOK_URL = 'https://medico.app.n8n.cloud/webhook-test/facial-mesh-agent';

// Polling interval for checking job status (in milliseconds)
export const POLLING_INTERVAL_MS = 3000;

// Maximum polling attempts before timing out
export const MAX_POLLING_ATTEMPTS = 100;
