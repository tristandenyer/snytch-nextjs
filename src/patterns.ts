import { SecretPattern } from './types.js';

export const PATTERNS: SecretPattern[] = [
  // AWS - Access Keys (Category 1)
  {
    name: 'AWS Access Key ID (AKIA)',
    pattern: /AKIA[0-9A-Z]{16}/g,
    severity: 'critical',
    description: 'AWS Access Key ID starting with AKIA',
  },
  {
    name: 'AWS Access Key ID (ASIA)',
    pattern: /ASIA[0-9A-Z]{16}/g,
    severity: 'critical',
    description: 'AWS Temporary Security Credential Access Key',
  },
  {
    name: 'AWS Access Key ID (AROA)',
    pattern: /AROA[0-9A-Z]{16}/g,
    severity: 'critical',
    description: 'AWS Role ID',
  },
  {
    name: 'AWS Access Key ID (AIDA)',
    pattern: /AIDA[0-9A-Z]{16}/g,
    severity: 'critical',
    description: 'AWS IAM User ID',
  },
  {
    name: 'AWS Access Key ID (ANPA)',
    pattern: /ANPA[0-9A-Z]{16}/g,
    severity: 'critical',
    description: 'AWS Principal Policy ID',
  },
  {
    name: 'AWS Access Key ID (AAAA)',
    pattern: /AAAA[0-9A-Z]{16}/g,
    severity: 'critical',
    description: 'AWS Principal ID',
  },
  {
    name: 'AWS Access Key ID (AGPA)',
    pattern: /AGPA[0-9A-Z]{16}/g,
    severity: 'critical',
    description: 'AWS Group ID',
  },
  {
    name: 'AWS Secret Access Key',
    pattern: new RegExp("aws_secret_access_key['\"]?\\s*[:=]\\s*['\"]?([A-Za-z0-9/+=]{40})", 'gi'),
    severity: 'critical',
    description: 'AWS Secret Access Key in config',
  },
  {
    name: 'AWS Session Token',
    pattern: new RegExp("aws_session_token['\"]?\\s*[:=]\\s*['\"]?([A-Za-z0-9/+=]+)", "gi"),
    severity: 'critical',
    description: 'AWS Session Token',
  },
  {
    name: 'AWS Account ID',
    pattern: /\b([0-9]{12})\b/g,
    severity: 'warning',
    description: 'Potential AWS Account ID (12 digits)',
  },

  // Stripe (Category 2)
  {
    name: 'Stripe Live Secret Key',
    pattern: /sk_live_[0-9a-zA-Z]{20,}/g,
    severity: 'critical',
    description: 'Stripe Live Secret Key',
  },
  {
    name: 'Stripe Test Secret Key',
    pattern: /sk_test_[0-9a-zA-Z]{20,}/g,
    severity: 'warning',
    description: 'Stripe Test Secret Key',
  },
  {
    name: 'Stripe Live Publishable Key',
    pattern: /pk_live_[0-9a-zA-Z]{20,}/g,
    severity: 'warning',
    description: 'Stripe Live Publishable Key (should not be in server code)',
  },
  {
    name: 'Stripe Test Publishable Key',
    pattern: /pk_test_[0-9a-zA-Z]{20,}/g,
    severity: 'info',
    description: 'Stripe Test Publishable Key',
  },
  {
    name: 'Stripe Restricted API Key',
    pattern: /rk_live_[0-9a-zA-Z]{20,}/g,
    severity: 'critical',
    description: 'Stripe Restricted API Key (Live)',
  },
  {
    name: 'Stripe Webhook Signing Secret',
    pattern: /whsec_[0-9a-zA-Z]{20,}/g,
    severity: 'critical',
    description: 'Stripe Webhook Signing Secret',
  },

  // Private Keys (Category 3)
  {
    name: 'RSA Private Key',
    pattern: /-----BEGIN RSA PRIVATE KEY-----/g,
    severity: 'critical',
    description: 'RSA Private Key PEM header',
  },
  {
    name: 'EC Private Key',
    pattern: /-----BEGIN EC PRIVATE KEY-----/g,
    severity: 'critical',
    description: 'EC Private Key PEM header',
  },
  {
    name: 'DSA Private Key',
    pattern: /-----BEGIN DSA PRIVATE KEY-----/g,
    severity: 'critical',
    description: 'DSA Private Key PEM header',
  },
  {
    name: 'Generic Private Key',
    pattern: /-----BEGIN PRIVATE KEY-----/g,
    severity: 'critical',
    description: 'Generic Private Key PEM header',
  },
  {
    name: 'OpenSSH Private Key',
    pattern: /-----BEGIN OPENSSH PRIVATE KEY-----/g,
    severity: 'critical',
    description: 'OpenSSH Private Key PEM header',
  },
  {
    name: 'PGP Private Key',
    pattern: /-----BEGIN PGP PRIVATE KEY BLOCK-----/g,
    severity: 'critical',
    description: 'PGP Private Key',
  },

  // JWT Tokens (Category 4)
  {
    name: 'JWT Token',
    pattern: /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.(?:[A-Za-z0-9_-]+)?/g,
    severity: 'warning',
    description: 'JWT Token (three base64url segments)',
  },

  // Database URLs (Category 5)
  {
    name: 'PostgreSQL Connection String',
    pattern: /postgres(?:ql)?:\/\/(?:[a-zA-Z0-9_-]+):([a-zA-Z0-9_@.-]+)@[^\s)}"']+/g,
    severity: 'critical',
    description: 'PostgreSQL connection string with credentials',
  },
  {
    name: 'MySQL Connection String',
    pattern: /mysql:\/\/(?:[a-zA-Z0-9_-]+):([a-zA-Z0-9_@.-]+)@[^\s)}"']+/g,
    severity: 'critical',
    description: 'MySQL connection string with credentials',
  },
  {
    name: 'MongoDB Connection String',
    pattern: /mongodb:\/\/(?:[a-zA-Z0-9_-]+):([a-zA-Z0-9_@.-]+)@[^\s)}"']+/g,
    severity: 'critical',
    description: 'MongoDB connection string with credentials',
  },
  {
    name: 'MongoDB SRV Connection String',
    pattern: /mongodb\+srv:\/\/(?:[a-zA-Z0-9_-]+):([a-zA-Z0-9_@.-]+)@[^\s)}"']+/g,
    severity: 'critical',
    description: 'MongoDB SRV connection string with credentials',
  },
  {
    name: 'Redis Connection String',
    pattern: /redis:\/\/(?::[a-zA-Z0-9_-]+@)?[^\s)}"']+/g,
    severity: 'critical',
    description: 'Redis connection string',
  },
  {
    name: 'Secure Redis Connection String',
    pattern: /rediss:\/\/(?::[a-zA-Z0-9_-]+@)?[^\s)}"']+/g,
    severity: 'critical',
    description: 'Secure Redis connection string',
  },
  {
    name: 'MariaDB Connection String',
    pattern: /mariadb:\/\/(?:[a-zA-Z0-9_-]+):([a-zA-Z0-9_@.-]+)@[^\s)}"']+/g,
    severity: 'critical',
    description: 'MariaDB connection string with credentials',
  },
  {
    name: 'CockroachDB Connection String',
    pattern: /cockroachdb:\/\/(?:[a-zA-Z0-9_-]+):([a-zA-Z0-9_@.-]+)@[^\s)}"']+/g,
    severity: 'critical',
    description: 'CockroachDB connection string with credentials',
  },
  {
    name: 'PlanetScale Connection String',
    pattern: /mysql:\/\/[a-zA-Z0-9_.-]+@[a-zA-Z0-9.-]+\.psdb\.cloud[^\s)}"']*\?sslaccept=strict/g,
    severity: 'critical',
    description: 'PlanetScale database connection string',
  },

  // GitHub Tokens (Category 6)
  {
    name: 'GitHub Personal Access Token (ghp_)',
    pattern: /ghp_[0-9a-zA-Z]{36}/g,
    severity: 'critical',
    description: 'GitHub Personal Access Token (PAT)',
  },
  {
    name: 'GitHub OAuth Token (gho_)',
    pattern: /gho_[0-9a-zA-Z]{36}/g,
    severity: 'critical',
    description: 'GitHub OAuth Token',
  },
  {
    name: 'GitHub App Token (ghu_)',
    pattern: /ghu_[0-9a-zA-Z]{36}/g,
    severity: 'critical',
    description: 'GitHub User-to-Server Token',
  },
  {
    name: 'GitHub Refresh Token (ghr_)',
    pattern: /ghr_[0-9a-zA-Z]{36}/g,
    severity: 'critical',
    description: 'GitHub Refresh Token',
  },
  {
    name: 'GitHub App Installation Token (ghs_)',
    pattern: /ghs_[0-9a-zA-Z]{36}/g,
    severity: 'critical',
    description: 'GitHub Server-to-Server Token',
  },
  {
    name: 'GitHub Pat Token',
    pattern: /github_pat_[0-9a-zA-Z]{22,}/g,
    severity: 'critical',
    description: 'GitHub Fine-grained Personal Access Token',
  },
  {
    name: 'GitHub Classic Token',
    pattern: /[a-f0-9]{40}/g,
    severity: 'warning',
    description: 'GitHub Classic Token (40 hex chars - high false positive rate)',
  },

  // Slack Tokens (Category 7)
  {
    name: 'Slack Bot Token',
    pattern: /xoxb-[0-9]{11,13}-[0-9]{11,13}-[a-zA-Z0-9]{24,26}/g,
    severity: 'critical',
    description: 'Slack Bot Token',
  },
  {
    name: 'Slack User Token',
    pattern: /xoxp-[0-9]{11,13}-[0-9]{11,13}-[0-9]{11,13}-[a-zA-Z0-9]{32}/g,
    severity: 'critical',
    description: 'Slack User Token',
  },
  {
    name: 'Slack App Token',
    pattern: /xoxa-[0-9]{11,13}-[0-9]{11,13}-[a-zA-Z0-9]{32}/g,
    severity: 'critical',
    description: 'Slack App Token',
  },
  {
    name: 'Slack Incoming Webhook',
    pattern: /https:\/\/hooks\.slack\.com\/services\/T[A-Z0-9]+\/B[A-Z0-9]+\/[a-zA-Z0-9]+/g,
    severity: 'critical',
    description: 'Slack Incoming Webhook URL',
  },

  // Twilio (Category 8)
  {
    name: 'Twilio Account SID',
    pattern: /AC[a-zA-Z0-9]{32}/g,
    severity: 'critical',
    description: 'Twilio Account SID',
  },
  {
    name: 'Twilio Auth Token',
    pattern: new RegExp("twilio.*auth.*token['\"']?\\s*[:=]\\s*['\"']?([a-zA-Z0-9]{32})", "gi"),
    severity: 'critical',
    description: 'Twilio Auth Token',
  },
  {
    name: 'Twilio API Key',
    pattern: /SK[a-zA-Z0-9]{32}/g,
    severity: 'critical',
    description: 'Twilio API Key',
  },

  // SendGrid (Category 9)
  {
    name: 'SendGrid API Key',
    pattern: /SG\.[a-zA-Z0-9_-]{22,}/g,
    severity: 'critical',
    description: 'SendGrid API Key',
  },

  // Mailgun (Category 10)
  {
    name: 'Mailgun API Key',
    pattern: /key-[a-zA-Z0-9]{32}/g,
    severity: 'critical',
    description: 'Mailgun API Key',
  },
  {
    name: 'Mailgun Domain',
    pattern: /mg:[\da-z]{32,}/g,
    severity: 'warning',
    description: 'Mailgun Domain Key',
  },

  // Mailchimp (Category 11)
  {
    name: 'Mailchimp API Key',
    pattern: /[a-f0-9]{32}-us[0-9]{1,2}/g,
    severity: 'critical',
    description: 'Mailchimp API Key',
  },

  // Postmark (Category 12)
  {
    name: 'Postmark API Token',
    pattern: new RegExp("postmark.*token['\"']?\\s*[:=]\\s*['\"']?([a-f0-9]{32})", "gi"),
    severity: 'critical',
    description: 'Postmark API Token',
  },

  // Google (Categories 13-14)
  {
    name: 'Google API Key',
    pattern: /AIza[0-9A-Za-z\-_]{35}/g,
    severity: 'warning',
    description: 'Google API Key (restricted key)',
  },
  {
    name: 'Google OAuth Client Secret',
    pattern: /GOCSPX-[a-zA-Z0-9_-]{20,}/g,
    severity: 'critical',
    description: 'Google OAuth Client Secret',
  },

  // Firebase (Category 15)
  {
    name: 'Firebase Database URL',
    pattern: /https:\/\/[a-zA-Z0-9-]+\.firebaseio\.com/g,
    severity: 'warning',
    description: 'Firebase Realtime Database URL',
  },
  {
    name: 'Firebase Service Account Private Key',
    pattern: /firebase[_-]?private[_-]?key['"]?\s*[:=]\s*['"]?-----BEGIN PRIVATE KEY-----/g,
    severity: 'critical',
    description: 'Firebase service account private key',
  },

  // Heroku (Category 16)
  {
    name: 'Heroku API Key',
    pattern: /heroku[_-]?api[_-]?key['"]?\s*[:=]\s*['"]?([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/g,
    severity: 'critical',
    description: 'Heroku API Key',
  },

  // DigitalOcean (Category 17)
  {
    name: 'DigitalOcean Personal Access Token',
    pattern: /dop_v1_[a-f0-9]{64}/g,
    severity: 'critical',
    description: 'DigitalOcean Personal Access Token',
  },
  {
    name: 'DigitalOcean OAuth Token',
    pattern: /doo_v1_[a-f0-9]{64}/g,
    severity: 'critical',
    description: 'DigitalOcean OAuth Token',
  },
  {
    name: 'DigitalOcean Spaces Key',
    pattern: /dov1_[a-f0-9]{64}/g,
    severity: 'critical',
    description: 'DigitalOcean Spaces Key',
  },

  // Vercel (Category 18)
  {
    name: 'Vercel API Token',
    pattern: new RegExp("vercel.*token['\"']?\\s*[:=]\\s*['\"']?([a-zA-Z0-9_-]{24,})", "gi"),
    severity: 'critical',
    description: 'Vercel API Token',
  },

  // Netlify (Category 19)
  {
    name: 'Netlify API Token',
    pattern: new RegExp("netlify.*token['\"']?\\s*[:=]\\s*['\"']?([a-zA-Z0-9_-]{32,})", "gi"),
    severity: 'critical',
    description: 'Netlify API Token',
  },

  // Cloudflare (Category 20)
  {
    name: 'Cloudflare API Key',
    pattern: new RegExp("cloudflare.*api[_-]?key['\"']?\\s*[:=]\\s*['\"']?([a-f0-9]{37})", "gi"),
    severity: 'critical',
    description: 'Cloudflare API Key',
  },
  {
    name: 'Cloudflare API Token',
    pattern: new RegExp("cloudflare.*api[_-]?token['\"']?\\s*[:=]\\s*['\"']?([a-zA-Z0-9_-]{40,})", "gi"),
    severity: 'critical',
    description: 'Cloudflare API Token',
  },

  // NPM (Category 21)
  {
    name: 'NPM Token',
    pattern: /npm_[a-zA-Z0-9]{36}/g,
    severity: 'critical',
    description: 'NPM access token',
  },

  // PyPI (Category 22)
  {
    name: 'PyPI Token',
    pattern: /pypi-[a-zA-Z0-9_-]{40,}/g,
    severity: 'critical',
    description: 'PyPI API token',
  },

  // Docker Hub (Category 23)
  {
    name: 'Docker Hub Token',
    pattern: new RegExp("docker[_-]?hub[_-]?token['\"']?\\s*[:=]\\s*['\"']?([a-zA-Z0-9_-]{32,})", "gi"),
    severity: 'critical',
    description: 'Docker Hub authentication token',
  },

  // HashiCorp Vault (Category 24)
  {
    name: 'Vault Token',
    pattern: /hvs\.[a-zA-Z0-9_-]{20,}/g,
    severity: 'critical',
    description: 'HashiCorp Vault service token',
  },

  // Okta (Category 25)
  {
    name: 'Okta API Token',
    pattern: new RegExp("okta.*api[_-]?token['\"']?\\s*[:=]\\s*['\"']?([a-zA-Z0-9_-]{20,})", "gi"),
    severity: 'critical',
    description: 'Okta API Token',
  },

  // Auth0 (Category 26)
  {
    name: 'Auth0 Client Secret',
    pattern: new RegExp("auth0.*secret['\"']?\\s*[:=]\\s*['\"']?([a-zA-Z0-9_-]{32,})", "gi"),
    severity: 'critical',
    description: 'Auth0 Client Secret',
  },

  // Azure (Category 27)
  {
    name: 'Azure Storage Connection String',
    pattern: /DefaultEndpointsProtocol=https;AccountName=[^;]+;AccountKey=[a-zA-Z0-9+/=]{88};EndpointSuffix=core\.windows\.net/g,
    severity: 'critical',
    description: 'Azure Storage Account connection string',
  },
  {
    name: 'Azure Service Principal Client Secret',
    pattern: new RegExp("azure.*client[_-]?secret['\"']?\\s*[:=]\\s*['\"']?([a-zA-Z0-9~._-]{34,})", "gi"),
    severity: 'critical',
    description: 'Azure Service Principal Client Secret',
  },

  // GCP (Category 28)
  {
    name: 'GCP Service Account JSON',
    pattern: /"type"\s*:\s*"service_account"/g,
    severity: 'critical',
    description: 'GCP Service Account JSON marker',
  },

  // Kubernetes (Category 29)
  {
    name: 'Kubernetes Service Account Token',
    pattern: /eyJhbGciOiJSUzI1NiIsImtpZCI6/g,
    severity: 'critical',
    description: 'Kubernetes service account JWT token',
  },

  // OpenAI (Category 32)
  {
    name: 'OpenAI API Key (sk-)',
    pattern: /sk-[a-zA-Z0-9]{20,}/g,
    severity: 'critical',
    description: 'OpenAI API Key',
  },
  {
    name: 'OpenAI API Key (sk-proj-)',
    pattern: /sk-proj-[a-zA-Z0-9_-]{20,}/g,
    severity: 'critical',
    description: 'OpenAI Project API Key',
  },

  // Anthropic (Category 33)
  {
    name: 'Anthropic API Key',
    pattern: /sk-ant-[a-zA-Z0-9_-]{20,}/g,
    severity: 'critical',
    description: 'Anthropic API Key',
  },

  // Hugging Face (Category 34)
  {
    name: 'Hugging Face API Token',
    pattern: /hf_[a-zA-Z0-9_-]{20,}/g,
    severity: 'critical',
    description: 'Hugging Face API token',
  },

  // Replicate (Category 35)
  {
    name: 'Replicate API Key',
    pattern: /r8_[a-zA-Z0-9_-]{20,}/g,
    severity: 'critical',
    description: 'Replicate API key',
  },

  // Pinecone (Category 36)
  {
    name: 'Pinecone API Key',
    pattern: new RegExp("pinecone.*api[_-]?key['\"']?\\s*[:=]\\s*['\"']?([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})", "gi"),
    severity: 'critical',
    description: 'Pinecone API Key',
  },

  // Cohere (Category 37)
  {
    name: 'Cohere API Key',
    pattern: new RegExp("cohere.*api[_-]?key['\"']?\\s*[:=]\\s*['\"']?([a-zA-Z0-9_-]{32,})", "gi"),
    severity: 'critical',
    description: 'Cohere API Key',
  },

  // PlanetScale (Category 38)
  {
    name: 'PlanetScale API Token',
    pattern: /pscale_[a-zA-Z0-9_-]{32}/g,
    severity: 'critical',
    description: 'PlanetScale API token',
  },

  // Supabase (Category 39)
  {
    name: 'Supabase Service Role Key',
    pattern: /eyJ[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g,
    severity: 'critical',
    description: 'Supabase Service Role Key (JWT)',
  },

  // Resend (Category 40)
  {
    name: 'Resend API Key',
    pattern: /re_[a-zA-Z0-9_-]{32}/g,
    severity: 'critical',
    description: 'Resend API key',
  },

  // Linear (Category 42)
  {
    name: 'Linear API Key',
    pattern: /lin_api_[a-zA-Z0-9_-]{32}/g,
    severity: 'critical',
    description: 'Linear API key',
  },

  // Notion (Category 43)
  {
    name: 'Notion API Key',
    pattern: /secret_[a-zA-Z0-9_-]{32}/g,
    severity: 'critical',
    description: 'Notion API key',
  },

  // Airtable (Category 44)
  {
    name: 'Airtable API Key',
    pattern: /key[a-zA-Z0-9_-]{17}/g,
    severity: 'critical',
    description: 'Airtable API key',
  },

  // Zendesk (Category 45)
  {
    name: 'Zendesk API Token',
    pattern: new RegExp("zendesk.*api[_-]?token['\"']?\\s*[:=]\\s*['\"']?([a-zA-Z0-9_-]{32,})", "gi"),
    severity: 'critical',
    description: 'Zendesk API Token',
  },

  // Intercom (Category 46)
  {
    name: 'Intercom Access Token',
    pattern: new RegExp("intercom.*token['\"']?\\s*[:=]\\s*['\"']?([a-zA-Z0-9_-]{32,})", "gi"),
    severity: 'critical',
    description: 'Intercom Access Token',
  },

  // Segment (Category 47)
  {
    name: 'Segment Write Key',
    pattern: new RegExp("segment.*write[_-]?key['\"']?\\s*[:=]\\s*['\"']?([a-f0-9]{32})", "gi"),
    severity: 'critical',
    description: 'Segment Write Key',
  },

  // Mixpanel (Category 48)
  {
    name: 'Mixpanel Token',
    pattern: new RegExp("mixpanel.*token['\"']?\\s*[:=]\\s*['\"']?([a-f0-9]{32})", "gi"),
    severity: 'critical',
    description: 'Mixpanel API Token',
  },

  // Amplitude (Category 49)
  {
    name: 'Amplitude API Key',
    pattern: new RegExp("amplitude.*api[_-]?key['\"']?\\s*[:=]\\s*['\"']?([a-f0-9]{32})", "gi"),
    severity: 'critical',
    description: 'Amplitude API Key',
  },

  // Datadog (Category 50)
  {
    name: 'Datadog API Key',
    pattern: new RegExp("datadog.*api[_-]?key['\"']?\\s*[:=]\\s*['\"']?([a-f0-9]{32})", "gi"),
    severity: 'critical',
    description: 'Datadog API Key (32 hex chars)',
  },

  // New Relic (Category 51)
  {
    name: 'New Relic License Key',
    pattern: new RegExp("new[_-]?relic.*license[_-]?key['\"']?\\s*[:=]\\s*['\"']?([a-f0-9]{40})", "gi"),
    severity: 'critical',
    description: 'New Relic License Key',
  },

  // Sentry (Category 52)
  {
    name: 'Sentry DSN',
    pattern: /https?:\/\/[a-f0-9]{32}@[a-zA-Z0-9.-]+\.ingest\.sentry\.io\/[0-9]+/g,
    severity: 'warning',
    description: 'Sentry DSN URL',
  },

  // Splunk (Category 53)
  {
    name: 'Splunk HEC Token',
    pattern: new RegExp("splunk.*hec[_-]?token['\"']?\\s*[:=]\\s*['\"']?([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})", "gi"),
    severity: 'critical',
    description: 'Splunk HEC Token',
  },

  // Elastic (Category 54)
  {
    name: 'Elastic APM Secret Token',
    pattern: new RegExp("elastic.*apm.*secret[_-]?token['\"']?\\s*[:=]\\s*['\"']?([a-zA-Z0-9_-]{32,})", "gi"),
    severity: 'critical',
    description: 'Elastic APM Secret Token',
  },

  // PagerDuty (Category 55)
  {
    name: 'PagerDuty API Token',
    pattern: new RegExp("pagerduty.*api[_-]?token['\"']?\\s*[:=]\\s*['\"']?([a-zA-Z0-9_-]{20,})", "gi"),
    severity: 'critical',
    description: 'PagerDuty API Token',
  },

  // OpsGenie (Category 56)
  {
    name: 'OpsGenie API Key',
    pattern: new RegExp("opsgenie.*api[_-]?key['\"']?\\s*[:=]\\s*['\"']?([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})", "gi"),
    severity: 'critical',
    description: 'OpsGenie API Key',
  },

  // Grafana (Category 57)
  {
    name: 'Grafana API Key',
    pattern: new RegExp("grafana.*api[_-]?key['\"']?\\s*[:=]\\s*['\"']?([a-zA-Z0-9_-]{32,})", "gi"),
    severity: 'critical',
    description: 'Grafana API Key',
  },

  // Shopify (Category 59)
  {
    name: 'Shopify Admin API Access Token',
    pattern: /shpat_[a-f0-9]{32}/g,
    severity: 'critical',
    description: 'Shopify Admin API Access Token',
  },
  {
    name: 'Shopify Custom App Token',
    pattern: /shpca_[a-f0-9]{32}/g,
    severity: 'critical',
    description: 'Shopify Custom App Token',
  },
  {
    name: 'Shopify Storefront Token',
    pattern: /shpss_[a-f0-9]{32}/g,
    severity: 'critical',
    description: 'Shopify Storefront Token',
  },

  // Square (Category 60)
  {
    name: 'Square Access Token',
    pattern: /sq0atp-[0-9a-zA-Z_-]{22,}/g,
    severity: 'critical',
    description: 'Square Access Token',
  },

  // Braintree (Category 61)
  {
    name: 'Braintree Access Token',
    pattern: new RegExp("braintree.*access[_-]?token['\"']?\\s*[:=]\\s*['\"']?([a-zA-Z0-9_-]{32,})", "gi"),
    severity: 'critical',
    description: 'Braintree Access Token',
  },

  // PayPal (Category 62)
  {
    name: 'PayPal Client Secret',
    pattern: new RegExp("paypal.*client[_-]?secret['\"']?\\s*[:=]\\s*['\"']?([a-zA-Z0-9_-]{32,})", "gi"),
    severity: 'critical',
    description: 'PayPal Client Secret',
  },

  // Plaid (Category 63)
  {
    name: 'Plaid Client Secret',
    pattern: new RegExp("plaid.*client[_-]?secret['\"']?\\s*[:=]\\s*['\"']?([a-zA-Z0-9_-]{30,})", "gi"),
    severity: 'critical',
    description: 'Plaid Client Secret',
  },
  {
    name: 'Plaid Access Token',
    pattern: /access-(?:production|development|sandbox)-[a-zA-Z0-9_-]{32}/g,
    severity: 'critical',
    description: 'Plaid Access Token',
  },

  // Coinbase (Category 65)
  {
    name: 'Coinbase API Key',
    pattern: new RegExp("coinbase.*api[_-]?key['\"']?\\s*[:=]\\s*['\"']?([a-f0-9]{32})", "gi"),
    severity: 'critical',
    description: 'Coinbase API Key',
  },

  // Binance (Category 66)
  {
    name: 'Binance API Key',
    pattern: new RegExp("binance.*api[_-]?key['\"']?\\s*[:=]\\s*['\"']?([a-zA-Z0-9_-]{32,})", "gi"),
    severity: 'critical',
    description: 'Binance API Key',
  },

  // Generic high-entropy patterns (Category 67-68)
  {
    name: 'High-Entropy Bearer Token',
    pattern: new RegExp("bearer\\s+[a-zA-Z0-9_.-]{40,}", "gi"),
    severity: 'warning',
    description: 'High-entropy bearer token in auth header',
  },
  {
    name: 'Generic High-Entropy String (64+ chars base64)',
    pattern: /[A-Za-z0-9+/=]{64,}/g,
    severity: 'warning',
    description: 'Generic high-entropy string (64+ base64 chars)',
  },
  {
    name: 'High-Entropy Hex String (40+ chars)',
    pattern: /[a-f0-9]{40,}/g,
    severity: 'warning',
    description: 'High-entropy hex string (40+ chars)',
  },
  {
    name: 'Private Key Content',
    pattern: /MIIEpAIBAAKCAQEA[a-zA-Z0-9+/=]{100,}/g,
    severity: 'critical',
    description: 'Private key content (PKCS8 format)',
  },

  // Additional patterns for comprehensive coverage (69-150)
  {
    name: 'AWS Cognito User Pool ID',
    pattern: /[a-z]{2}-[a-z]+-[0-9]_[a-zA-Z0-9]{25}/g,
    severity: 'warning',
    description: 'AWS Cognito User Pool ID',
  },
  {
    name: 'AWS IAM Policy ARN',
    pattern: /arn:aws:iam::\d{12}:(?:user|role|policy)\/[a-zA-Z0-9_.-]+/g,
    severity: 'warning',
    description: 'AWS IAM Policy ARN',
  },
  {
    name: 'Stripe Connector Key',
    pattern: /connstr_live_[0-9a-zA-Z]{20,}/g,
    severity: 'critical',
    description: 'Stripe Connector String (Live)',
  },
  {
    name: 'Stripe Restricted Key',
    pattern: /rk_test_[0-9a-zA-Z]{20,}/g,
    severity: 'warning',
    description: 'Stripe Restricted API Key (Test)',
  },
  {
    name: 'Postgres Password in URL',
    pattern: /postgres:\/\/[a-zA-Z0-9_]+:([a-zA-Z0-9!@#$%^&*()_+\-=[\]{}|;:,.<>?/~`]{6,})@/g,
    severity: 'critical',
    description: 'PostgreSQL password in connection URL',
  },
  {
    name: 'MySQL Password in URL',
    pattern: /mysql:\/\/[a-zA-Z0-9_]+:([a-zA-Z0-9!@#$%^&*()_+\-=[\]{}|;:,.<>?/~`]{6,})@/g,
    severity: 'critical',
    description: 'MySQL password in connection URL',
  },
  {
    name: 'MongoDB Atlas API Key',
    pattern: new RegExp("mongodb.*atlas.*api[_-]?key['\"']?\\s*[:=]\\s*['\"']?([a-zA-Z0-9_-]{32,})", "gi"),
    severity: 'critical',
    description: 'MongoDB Atlas API Key',
  },
  {
    name: 'GitHub Token (Classic 40-char hex)',
    pattern: /ghp_[0-9a-zA-Z]{20}/g,
    severity: 'critical',
    description: 'GitHub Personal Access Token classic format',
  },
  {
    name: 'GitLab Personal Access Token',
    pattern: /glpat-[a-zA-Z0-9_-]{20,}/g,
    severity: 'critical',
    description: 'GitLab Personal Access Token',
  },
  {
    name: 'BitBucket Access Token',
    pattern: new RegExp("bitbucket.*access[_-]?token['\"']?\\s*[:=]\\s*['\"']?([a-zA-Z0-9_-]{32,})", "gi"),
    severity: 'critical',
    description: 'BitBucket Access Token',
  },
  {
    name: 'Slack API Token Legacy',
    pattern: /xoxp-[0-9]{11,13}-[0-9]{11,13}-[0-9]{11,13}-[a-f0-9]{32}/g,
    severity: 'critical',
    description: 'Slack User Token (legacy)',
  },
  {
    name: 'Discord Bot Token',
    pattern: new RegExp("discord.*token['\"']?\\s*[:=]\\s*['\"']?([MN][A-Za-z\\d_-]{23,25})", "gi"),
    severity: 'critical',
    description: 'Discord Bot Token',
  },
  {
    name: 'Telegram Bot Token',
    pattern: /\d+:AA[A-Za-z0-9_-]{25,}/g,
    severity: 'critical',
    description: 'Telegram Bot Token',
  },
  {
    name: 'Microsoft Teams Webhook',
    pattern: /https:\/\/outlook\.webhook\.office\.com\/webhookb2\/[a-f0-9-]+@[a-f0-9-]+\/IncomingWebhook\/[a-zA-Z0-9_-]+\/[a-f0-9-]+/g,
    severity: 'critical',
    description: 'Microsoft Teams Incoming Webhook',
  },
  {
    name: 'RapidAPI Key',
    pattern: new RegExp("rapidapi[_-]?key['\"']?\\s*[:=]\\s*['\"']?([a-zA-Z0-9_-]{32,})", "gi"),
    severity: 'critical',
    description: 'RapidAPI Key',
  },
  {
    name: 'BeautifulSoup API Key',
    pattern: new RegExp("beautifulsoup.*api[_-]?key['\"']?\\s*[:=]\\s*['\"']?([a-zA-Z0-9_-]{32,})", "gi"),
    severity: 'critical',
    description: 'BeautifulSoup API Key',
  },
  {
    name: 'Twilio Account SID (variant)',
    pattern: /twilio[_-]?account[_-]?sid['"]?\s*[:=]\s*['"]?(AC[a-zA-Z0-9]{32})/g,
    severity: 'critical',
    description: 'Twilio Account SID in config',
  },
  {
    name: 'Twilio Auth Token (variant)',
    pattern: /twilio[_-]?auth[_-]?token['"]?\s*[:=]\s*['"]?([a-zA-Z0-9]{32})/g,
    severity: 'critical',
    description: 'Twilio Auth Token in config',
  },
  {
    name: 'SendGrid API Key (variant)',
    pattern: /sendgrid[_-]?api[_-]?key['"]?\s*[:=]\s*['"]?(SG\.[a-zA-Z0-9_-]{22,})/g,
    severity: 'critical',
    description: 'SendGrid API Key in config',
  },
  {
    name: 'Mailgun API Key (variant)',
    pattern: /mailgun[_-]?api[_-]?key['"]?\s*[:=]\s*['"]?(key-[a-zA-Z0-9]{32})/g,
    severity: 'critical',
    description: 'Mailgun API Key in config',
  },
  {
    name: 'AWS KMS Key ID',
    pattern: /arn:aws:kms:[a-z0-9-]+:[0-9]{12}:key\/[a-f0-9-]{36}/g,
    severity: 'warning',
    description: 'AWS KMS Key ID ARN',
  },
  {
    name: 'AWS IAM User Access Key',
    pattern: /AKIA[0-9A-Z]{16}/g,
    severity: 'critical',
    description: 'AWS IAM User Access Key',
  },
  {
    name: 'Google Cloud Service Account Email',
    pattern: /[a-zA-Z0-9_-]+@[a-z0-9-]+\.iam\.gserviceaccount\.com/g,
    severity: 'warning',
    description: 'Google Cloud Service Account Email',
  },
  {
    name: 'Firebase Admin SDK Config',
    pattern: /firebaseConfig\s*[:=]\s*\{[\s\S]*?apiKey[\s\S]*?\}/g,
    severity: 'warning',
    description: 'Firebase configuration object detected',
  },
  {
    name: 'Supabase URL',
    pattern: /https:\/\/[a-z0-9]{20}\.supabase\.co/g,
    severity: 'warning',
    description: 'Supabase project URL',
  },
  {
    name: 'Vercel Project ID',
    pattern: new RegExp("vercel[_-]?project[_-]?id['\"']?\\s*[:=]\\s*['\"']?([a-zA-Z0-9]{20,})", "gi"),
    severity: 'warning',
    description: 'Vercel Project ID',
  },
  {
    name: 'Netlify Site ID',
    pattern: new RegExp("netlify[_-]?site[_-]?id['\"']?\\s*[:=]\\s*['\"']?([a-f0-9-]{36})", "gi"),
    severity: 'warning',
    description: 'Netlify Site ID',
  },
  {
    name: 'Auth0 Domain',
    pattern: /https:\/\/[a-z0-9-]+\.auth0\.com/g,
    severity: 'warning',
    description: 'Auth0 domain endpoint',
  },
  {
    name: 'Okta Domain',
    pattern: /https:\/\/[a-z0-9-]+\.okta\.com/g,
    severity: 'warning',
    description: 'Okta domain endpoint',
  },
  {
    name: 'DigitalOcean App ID',
    pattern: new RegExp("digitalocean[_-]?app[_-]?id['\"']?\\s*[:=]\\s*['\"']?([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})", "gi"),
    severity: 'warning',
    description: 'DigitalOcean App ID',
  },
  {
    name: 'Cloudflare Zone ID',
    pattern: new RegExp("cloudflare[_-]?zone[_-]?id['\"']?\\s*[:=]\\s*['\"']?([a-f0-9]{32})", "gi"),
    severity: 'warning',
    description: 'Cloudflare Zone ID',
  },
  {
    name: 'Stripe Account ID',
    pattern: /acct_[0-9A-Za-z]{16}/g,
    severity: 'warning',
    description: 'Stripe Account ID',
  },
  {
    name: 'Stripe Customer ID',
    pattern: /cus_[0-9A-Za-z]{14}/g,
    severity: 'info',
    description: 'Stripe Customer ID',
  },
  {
    name: 'JWT with HS256 signature',
    pattern: /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}/g,
    severity: 'warning',
    description: 'JWT token with symmetric signature',
  },
  {
    name: 'Bearer Token in Authorization Header',
    pattern: /Authorization['"]?\s*[:=]\s*['"]?Bearer\s+[a-zA-Z0-9_.-]+['"]?/g,
    severity: 'warning',
    description: 'Bearer token in Authorization header',
  },
  {
    name: 'API Key in X-API-Key Header',
    pattern: /X-API-Key['"]?\s*[:=]\s*['"]?[a-zA-Z0-9_-]{20,}['"]?/g,
    severity: 'warning',
    description: 'API key in X-API-Key header',
  },
  {
    name: 'Environment Variable with Secret Value',
    pattern: new RegExp("(?:password|secret|token|api_?key)\\s*=\\s*['\"]?[a-zA-Z0-9_!@#$%^&*().-]{12,}['\"]?", "gi"),
    severity: 'warning',
    description: 'Heuristic match on a secret-like assignment — may be a false positive from URL parsers or framework internals. Confirm no real credential is present.',
  },
  {
    name: 'OAuth Access Token Pattern',
    pattern: /access[_-]?token['"]?\s*[:=]\s*['"]?[a-zA-Z0-9_.-]{40,}['"]?/g,
    severity: 'warning',
    description: 'OAuth access token variable',
  },
  {
    name: 'OAuth Refresh Token Pattern',
    pattern: /refresh[_-]?token['"]?\s*[:=]\s*['"]?[a-zA-Z0-9_.-]{40,}['"]?/g,
    severity: 'warning',
    description: 'OAuth refresh token variable',
  },
  {
    name: 'Certificate Base64 Content',
    pattern: /-----BEGIN CERTIFICATE-----[a-zA-Z0-9+/=\n]{100,}-----END CERTIFICATE-----/g,
    severity: 'warning',
    description: 'Certificate in PEM format',
  },
  {
    name: 'RSA Public Key',
    pattern: /-----BEGIN PUBLIC KEY-----/g,
    severity: 'info',
    description: 'RSA Public Key PEM header',
  },
  {
    name: 'SSH Public Key',
    pattern: /ssh-rsa AAAA[a-zA-Z0-9+/=]+/g,
    severity: 'info',
    description: 'SSH RSA Public Key',
  },
  {
    name: 'AWS CloudFormation Stack ID',
    pattern: /arn:aws:cloudformation:[a-z0-9-]+:[0-9]{12}:stack\/[a-zA-Z0-9_.-]+\/[a-f0-9-]+/g,
    severity: 'warning',
    description: 'AWS CloudFormation Stack ARN',
  },
  {
    name: 'AWS Secrets Manager Secret ARN',
    pattern: /arn:aws:secretsmanager:[a-z0-9-]+:[0-9]{12}:secret:[a-zA-Z0-9_.-]+/g,
    severity: 'critical',
    description: 'AWS Secrets Manager Secret ARN',
  },
  {
    name: 'DataDog API URL',
    pattern: /https:\/\/api\.datadoghq\.com\/api\/v[0-9]+\//g,
    severity: 'info',
    description: 'DataDog API endpoint URL',
  },
  {
    name: 'PagerDuty Integration Key',
    pattern: new RegExp("pagerduty[_-]?integration[_-]?key['\"']?\\s*[:=]\\s*['\"']?([a-zA-Z0-9_-]{32})", "gi"),
    severity: 'critical',
    description: 'PagerDuty Integration Key',
  },
  {
    name: 'Snyk API Token',
    pattern: new RegExp("snyk[_-]?api[_-]?token['\"']?\\s*[:=]\\s*['\"']?([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})", "gi"),
    severity: 'critical',
    description: 'Snyk API Token',
  },
  {
    name: 'SonarQube Token',
    pattern: new RegExp("sonar[_-]?token['\"']?\\s*[:=]\\s*['\"']?([a-f0-9]{40})", "gi"),
    severity: 'critical',
    description: 'SonarQube authentication token',
  },
  {
    name: 'HashiCorp Terraform Cloud Token',
    pattern: new RegExp("terraform.*cloud.*token['\"']?\\s*[:=]\\s*['\"']?([\\w.~_-]{90,})", "gi"),
    severity: 'critical',
    description: 'Terraform Cloud API token',
  },
  {
    name: 'Kubernetes Config APIServer URL',
    pattern: /server:\s+https:\/\/[a-zA-Z0-9.-]+:[0-9]+/g,
    severity: 'warning',
    description: 'Kubernetes APIServer URL in kubeconfig',
  },
  {
    name: 'Kubernetes Client Certificate Data',
    pattern: /client-certificate-data:\s+[A-Za-z0-9+/=]{100,}/g,
    severity: 'critical',
    description: 'Kubernetes client certificate in base64',
  },
  {
    name: 'Kubernetes Client Key Data',
    pattern: /client-key-data:\s+[A-Za-z0-9+/=]{100,}/g,
    severity: 'critical',
    description: 'Kubernetes client key in base64',
  },
  {
    name: 'Kubernetes Bearer Token',
    pattern: /token:\s+[a-zA-Z0-9._-]{40,}/g,
    severity: 'critical',
    description: 'Kubernetes bearer token',
  },
  {
    name: 'Docker Registry Token',
    pattern: new RegExp("docker[_-]?registry[_-]?token['\"']?\\s*[:=]\\s*['\"']?([a-zA-Z0-9_.-]{32,})", "gi"),
    severity: 'critical',
    description: 'Docker Registry authentication token',
  },
  {
    name: 'Artifactory API Key',
    pattern: new RegExp("artifactory.*api[_-]?key['\"']?\\s*[:=]\\s*['\"']?([a-zA-Z0-9_-]{56,})", "gi"),
    severity: 'critical',
    description: 'Artifactory API Key',
  },
  {
    name: 'JFrog Xray Token',
    pattern: new RegExp("jfrog.*xray[_-]?token['\"']?\\s*[:=]\\s*['\"']?([a-zA-Z0-9_-]{32,})", "gi"),
    severity: 'critical',
    description: 'JFrog Xray authentication token',
  },
  {
    name: 'Nexus Repository Token',
    pattern: new RegExp("nexus[_-]?token['\"']?\\s*[:=]\\s*['\"']?([a-zA-Z0-9_-]{32,})", "gi"),
    severity: 'critical',
    description: 'Nexus Repository Manager token',
  },
  {
    name: 'GitHub Enterprise Token',
    pattern: /ghu_[0-9a-zA-Z]{36}/g,
    severity: 'critical',
    description: 'GitHub Enterprise user token',
  },
  {
    name: 'Confluence API Token',
    pattern: new RegExp("confluence.*api[_-]?token['\"']?\\s*[:=]\\s*['\"']?([a-zA-Z0-9_-]{32,})", "gi"),
    severity: 'critical',
    description: 'Confluence API Token',
  },
  {
    name: 'Jira API Token',
    pattern: new RegExp("jira.*api[_-]?token['\"']?\\s*[:=]\\s*['\"']?([a-zA-Z0-9_-]{24,})", "gi"),
    severity: 'critical',
    description: 'Jira API Token',
  },
  {
    name: 'Slack Workspace ID',
    pattern: /xoxe-[0-9]{1,13}-[0-9]{1,13}-[0-9a-zA-Z]{32,}/g,
    severity: 'critical',
    description: 'Slack Enterprise API token',
  },
  {
    name: 'Microsoft SharePoint Access Token',
    pattern: new RegExp("sharepoint.*access[_-]?token['\"']?\\s*[:=]\\s*['\"']?([a-zA-Z0-9_.-]{50,})", "gi"),
    severity: 'critical',
    description: 'Microsoft SharePoint Access Token',
  },
  {
    name: 'Microsoft Graph API Token',
    pattern: new RegExp("microsoft[_-]?graph.*token['\"']?\\s*[:=]\\s*['\"']?([a-zA-Z0-9._-]{50,})", "gi"),
    severity: 'critical',
    description: 'Microsoft Graph API token',
  },
  {
    name: 'AWS RDS Database Password',
    pattern: new RegExp("rds[_-]?password['\"]?\\s*[:=]\\s*['\"]?([a-zA-Z0-9!@#$%^&*()_+\\-=[\\]{}|;:,.<>?/~`]{8,})", "gi"),
    severity: 'critical',
    description: 'AWS RDS database password',
  },
  {
    name: 'AWS ElastiCache Auth Token',
    pattern: new RegExp("elasticache[_-]?auth[_-]?token['\"']?\\s*[:=]\\s*['\"']?([a-zA-Z0-9_-]{32,})", "gi"),
    severity: 'critical',
    description: 'AWS ElastiCache authentication token',
  },
  {
    name: 'Oracle Database Connection String',
    pattern: new RegExp("oracle:thin:@[a-zA-Z0-9.-]+:[0-9]+:[A-Z0-9]+", "gi"),
    severity: 'critical',
    description: 'Oracle Database connection string',
  },
  {
    name: 'Cassandra Connection String',
    pattern: /cassandra:\/\/[a-zA-Z0-9:,.-]+/g,
    severity: 'critical',
    description: 'Cassandra cluster connection string',
  },
  {
    name: 'Elasticsearch Connection String',
    pattern: /https?:\/\/[a-zA-Z0-9_-]+:[a-zA-Z0-9_-]+@[a-zA-Z0-9.-]+:9200/g,
    severity: 'critical',
    description: 'Elasticsearch cluster endpoint with credentials',
  },
  {
    name: 'Solr Connection String',
    pattern: /http:\/\/[a-zA-Z0-9.-]+:[0-9]{4,5}\/solr/g,
    severity: 'warning',
    description: 'Solr cluster endpoint URL',
  },

  // Clerk (Category 70)
  {
    name: 'Clerk Secret Key (Live)',
    pattern: /sk_live_[a-zA-Z0-9]{40,}/g,
    severity: 'critical',
    description: 'Clerk live secret key',
  },
  {
    name: 'Clerk Secret Key (Test)',
    pattern: /sk_test_[a-zA-Z0-9]{40,}/g,
    severity: 'warning',
    description: 'Clerk test secret key',
  },
  {
    name: 'Clerk Publishable Key',
    pattern: /pk_(?:live|test)_[a-zA-Z0-9]{40,}/g,
    severity: 'info',
    description: 'Clerk publishable key (public, but may indicate server key nearby)',
  },

  // Supabase — expanded (Category 71)
  {
    name: 'Supabase Service Role Key Assignment',
    pattern: new RegExp("supabase[_-]?service[_-]?role[_-]?key['\"]?\\s*[:=]\\s*['\"]?([a-zA-Z0-9._-]{30,})", "gi"),
    severity: 'critical',
    description: 'Supabase service role key in env/config assignment',
  },

  // Convex (Category 72)
  {
    name: 'Convex Deploy Key',
    pattern: new RegExp("CONVEX_DEPLOY_KEY['\"]?\\s*[:=]\\s*['\"]?([a-zA-Z0-9_-]{20,})", "gi"),
    severity: 'critical',
    description: 'Convex deployment key',
  },

  // Neon (Category 73)
  {
    name: 'Neon Database Connection String',
    pattern: /postgres(?:ql)?:\/\/[^\s)}"']*\.neon\.tech[^\s)}"']*/g,
    severity: 'critical',
    description: 'Neon serverless Postgres connection string',
  },

  // Turso (Category 74)
  {
    name: 'Turso Database URL',
    pattern: /libsql:\/\/[a-zA-Z0-9._-]+[^\s)}"']*/g,
    severity: 'warning',
    description: 'Turso/libSQL database URL',
  },
  {
    name: 'Turso Auth Token',
    pattern: new RegExp("TURSO_AUTH_TOKEN['\"]?\\s*[:=]\\s*['\"]?([a-zA-Z0-9._-]{20,})", "gi"),
    severity: 'critical',
    description: 'Turso database auth token',
  },

  // Upstash (Category 75)
  {
    name: 'Upstash Redis REST Token',
    pattern: new RegExp("UPSTASH_REDIS_REST_TOKEN['\"]?\\s*[:=]\\s*['\"]?([a-zA-Z0-9._-]{20,})", "gi"),
    severity: 'critical',
    description: 'Upstash Redis REST API token',
  },
  {
    name: 'Upstash Kafka REST Token',
    pattern: new RegExp("UPSTASH_KAFKA_REST_TOKEN['\"]?\\s*[:=]\\s*['\"]?([a-zA-Z0-9._-]{20,})", "gi"),
    severity: 'critical',
    description: 'Upstash Kafka REST API token',
  },

  // CircleCI (Category 76)
  {
    name: 'CircleCI API Token',
    pattern: new RegExp("CIRCLE(?:CI)?_TOKEN['\"]?\\s*[:=]\\s*['\"]?([a-f0-9]{40})", "gi"),
    severity: 'critical',
    description: 'CircleCI API token',
  },

  // Travis CI (Category 77)
  {
    name: 'Travis CI API Token',
    pattern: new RegExp("TRAVIS_(?:API_)?TOKEN['\"]?\\s*[:=]\\s*['\"]?([a-zA-Z0-9._-]{20,})", "gi"),
    severity: 'critical',
    description: 'Travis CI API token',
  },

  // Buildkite (Category 78)
  {
    name: 'Buildkite Agent Token',
    pattern: /bkp_[a-f0-9]{40,}/g,
    severity: 'critical',
    description: 'Buildkite pipeline or agent token',
  },
  {
    name: 'Buildkite API Token',
    pattern: new RegExp("BUILDKITE_(?:API_|AGENT_)?TOKEN['\"]?\\s*[:=]\\s*['\"]?([a-zA-Z0-9._-]{20,})", "gi"),
    severity: 'critical',
    description: 'Buildkite API or agent token in env/config assignment',
  },

  // Railway (Category 79)
  {
    name: 'Railway API Token',
    pattern: new RegExp("RAILWAY_TOKEN['\"]?\\s*[:=]\\s*['\"]?([a-f0-9-]{36,})", "gi"),
    severity: 'critical',
    description: 'Railway deployment token',
  },

  // Render (Category 80)
  {
    name: 'Render API Key',
    pattern: /rnd_[a-zA-Z0-9]{32,}/g,
    severity: 'critical',
    description: 'Render service API key',
  },
  {
    name: 'Render API Key Assignment',
    pattern: new RegExp("RENDER_API_KEY['\"]?\\s*[:=]\\s*['\"]?([a-zA-Z0-9._-]{20,})", "gi"),
    severity: 'critical',
    description: 'Render API key in env/config assignment',
  },

  // Fly.io (Category 81)
  {
    name: 'Fly.io API Token',
    pattern: /FlyV1\s+[a-zA-Z0-9_-]{20,}/g,
    severity: 'critical',
    description: 'Fly.io V1 API token',
  },
  {
    name: 'Fly.io Auth Token Assignment',
    pattern: new RegExp("FLY_API_TOKEN['\"]?\\s*[:=]\\s*['\"]?([a-zA-Z0-9._-]{20,})", "gi"),
    severity: 'critical',
    description: 'Fly.io auth token in env/config assignment',
  },

  // Pulumi (Category 82)
  {
    name: 'Pulumi Access Token',
    pattern: /pul-[a-f0-9]{40,}/g,
    severity: 'critical',
    description: 'Pulumi access token',
  },

  // Razorpay (Category 83)
  {
    name: 'Razorpay Live Key ID',
    pattern: /rzp_live_[a-zA-Z0-9]{14,}/g,
    severity: 'critical',
    description: 'Razorpay live key ID',
  },
  {
    name: 'Razorpay Test Key ID',
    pattern: /rzp_test_[a-zA-Z0-9]{14,}/g,
    severity: 'warning',
    description: 'Razorpay test key ID',
  },
  {
    name: 'Razorpay Key Secret',
    pattern: new RegExp("RAZORPAY_KEY_SECRET['\"]?\\s*[:=]\\s*['\"]?([a-zA-Z0-9]{14,})", "gi"),
    severity: 'critical',
    description: 'Razorpay key secret in env/config assignment',
  },

  // Adyen (Category 84)
  {
    name: 'Adyen API Key',
    pattern: new RegExp("ADYEN_API_KEY['\"]?\\s*[:=]\\s*['\"]?([a-zA-Z0-9]{32,})", "gi"),
    severity: 'critical',
    description: 'Adyen API key in env/config assignment',
  },
  {
    name: 'Adyen Client Key',
    pattern: /(?:test|live)_[a-zA-Z0-9]{28,}/g,
    severity: 'warning',
    description: 'Adyen client key (test or live prefix)',
  },

  // Lemon Squeezy (Category 85)
  {
    name: 'Lemon Squeezy API Key',
    pattern: new RegExp("LEMON_?SQUEEZY_API_KEY['\"]?\\s*[:=]\\s*['\"]?([a-zA-Z0-9._-]{20,})", "gi"),
    severity: 'critical',
    description: 'Lemon Squeezy API key in env/config assignment',
  },
  {
    name: 'Lemon Squeezy Signing Secret',
    pattern: new RegExp("LEMON_?SQUEEZY_SIGNING_SECRET['\"]?\\s*[:=]\\s*['\"]?([a-zA-Z0-9._-]{20,})", "gi"),
    severity: 'critical',
    description: 'Lemon Squeezy webhook signing secret',
  },

  // Paddle (Category 86)
  {
    name: 'Paddle API Key',
    pattern: new RegExp("PADDLE_API_KEY['\"]?\\s*[:=]\\s*['\"]?([a-zA-Z0-9._-]{20,})", "gi"),
    severity: 'critical',
    description: 'Paddle API key in env/config assignment',
  },
  {
    name: 'Paddle Webhook Secret',
    pattern: new RegExp("PADDLE_WEBHOOK_SECRET['\"]?\\s*[:=]\\s*['\"]?([a-zA-Z0-9._-]{20,})", "gi"),
    severity: 'critical',
    description: 'Paddle webhook secret in env/config assignment',
  },

  // Recurly (Category 87)
  {
    name: 'Recurly API Key',
    pattern: new RegExp("RECURLY_API_KEY['\"]?\\s*[:=]\\s*['\"]?([a-zA-Z0-9._-]{20,})", "gi"),
    severity: 'critical',
    description: 'Recurly API key in env/config assignment',
  },

  // Pusher (Category 88)
  {
    name: 'Pusher App Secret',
    pattern: new RegExp("PUSHER_(?:APP_)?SECRET['\"]?\\s*[:=]\\s*['\"]?([a-zA-Z0-9]{20,})", "gi"),
    severity: 'critical',
    description: 'Pusher app secret in env/config assignment',
  },

  // Ably (Category 89)
  {
    name: 'Ably API Key',
    pattern: /[a-zA-Z0-9_-]{6}\.[a-zA-Z0-9_-]{6}:[a-zA-Z0-9_+/=-]{20,}/g,
    severity: 'critical',
    description: 'Ably API key in app-id.key-id:key-secret format',
  },
  {
    name: 'Ably API Key Assignment',
    pattern: new RegExp("ABLY_API_KEY['\"]?\\s*[:=]\\s*['\"]?([a-zA-Z0-9._:/-]{20,})", "gi"),
    severity: 'critical',
    description: 'Ably API key in env/config assignment',
  },

  // OneSignal (Category 90)
  {
    name: 'OneSignal REST API Key',
    pattern: new RegExp("ONESIGNAL_(?:REST_)?API_KEY['\"]?\\s*[:=]\\s*['\"]?([a-zA-Z0-9._-]{20,})", "gi"),
    severity: 'critical',
    description: 'OneSignal REST API key in env/config assignment',
  },

  // Customer.io (Category 91)
  {
    name: 'Customer.io API Key',
    pattern: new RegExp("(?:CUSTOMERIO|CIO)_API_KEY['\"]?\\s*[:=]\\s*['\"]?([a-zA-Z0-9._-]{20,})", "gi"),
    severity: 'critical',
    description: 'Customer.io API key in env/config assignment',
  },

  // Svix (Category 92)
  {
    name: 'Svix API Key',
    pattern: new RegExp("SVIX_API_KEY['\"]?\\s*[:=]\\s*['\"]?([a-zA-Z0-9._-]{20,})", "gi"),
    severity: 'critical',
    description: 'Svix webhook API key in env/config assignment',
  },

  // Knock (Category 93)
  {
    name: 'Knock API Key',
    pattern: new RegExp("KNOCK_(?:SECRET_)?API_KEY['\"]?\\s*[:=]\\s*['\"]?([a-zA-Z0-9._-]{20,})", "gi"),
    severity: 'critical',
    description: 'Knock notification API key in env/config assignment',
  },

  // Novu (Category 94)
  {
    name: 'Novu API Key',
    pattern: new RegExp("NOVU_(?:API|SECRET)_KEY['\"]?\\s*[:=]\\s*['\"]?([a-zA-Z0-9._-]{20,})", "gi"),
    severity: 'critical',
    description: 'Novu notification API/secret key in env/config assignment',
  },

  // Mistral AI (Category 95)
  {
    name: 'Mistral AI API Key',
    pattern: new RegExp("MISTRAL_API_KEY['\"]?\\s*[:=]\\s*['\"]?([a-zA-Z0-9]{20,})", "gi"),
    severity: 'critical',
    description: 'Mistral AI API key in env/config assignment',
  },

  // Groq (Category 96)
  {
    name: 'Groq API Key',
    pattern: /gsk_[a-zA-Z0-9]{48,}/g,
    severity: 'critical',
    description: 'Groq API key with gsk_ prefix',
  },
  {
    name: 'Groq API Key Assignment',
    pattern: new RegExp("GROQ_API_KEY['\"]?\\s*[:=]\\s*['\"]?([a-zA-Z0-9._-]{20,})", "gi"),
    severity: 'critical',
    description: 'Groq API key in env/config assignment',
  },

  // Perplexity (Category 97)
  {
    name: 'Perplexity API Key',
    pattern: /pplx-[a-f0-9]{48,}/g,
    severity: 'critical',
    description: 'Perplexity API key with pplx- prefix',
  },

  // Together AI (Category 98)
  {
    name: 'Together AI API Key',
    pattern: new RegExp("TOGETHER_API_KEY['\"]?\\s*[:=]\\s*['\"]?([a-zA-Z0-9._-]{20,})", "gi"),
    severity: 'critical',
    description: 'Together AI API key in env/config assignment',
  },

  // Fireworks AI (Category 99)
  {
    name: 'Fireworks AI API Key',
    pattern: /fw_[a-zA-Z0-9]{20,}/g,
    severity: 'critical',
    description: 'Fireworks AI API key with fw_ prefix',
  },
  {
    name: 'Fireworks AI API Key Assignment',
    pattern: new RegExp("FIREWORKS_API_KEY['\"]?\\s*[:=]\\s*['\"]?([a-zA-Z0-9._-]{20,})", "gi"),
    severity: 'critical',
    description: 'Fireworks AI API key in env/config assignment',
  },

  // Stability AI (Category 100)
  {
    name: 'Stability AI API Key',
    pattern: new RegExp("STABILITY_API_KEY['\"]?\\s*[:=]\\s*['\"]?([a-zA-Z0-9._-]{20,})", "gi"),
    severity: 'critical',
    description: 'Stability AI API key in env/config assignment',
  },

  // ElevenLabs (Category 101)
  {
    name: 'ElevenLabs API Key',
    pattern: new RegExp("(?:ELEVENLABS|ELEVEN)_API_KEY['\"]?\\s*[:=]\\s*['\"]?([a-zA-Z0-9_-]{20,})", "gi"),
    severity: 'critical',
    description: 'ElevenLabs API key in env/config assignment',
  },

  // Deepgram (Category 102)
  {
    name: 'Deepgram API Key',
    pattern: new RegExp("DEEPGRAM_API_KEY['\"]?\\s*[:=]\\s*['\"]?([a-zA-Z0-9_-]{20,})", "gi"),
    severity: 'critical',
    description: 'Deepgram API key in env/config assignment',
  },

  // AssemblyAI (Category 103)
  {
    name: 'AssemblyAI API Key',
    pattern: new RegExp("ASSEMBLYAI_API_KEY['\"]?\\s*[:=]\\s*['\"]?([a-zA-Z0-9_-]{20,})", "gi"),
    severity: 'critical',
    description: 'AssemblyAI API key in env/config assignment',
  },
];

