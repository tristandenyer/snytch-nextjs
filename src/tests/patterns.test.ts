import { describe, it, expect, beforeEach } from 'vitest';
import { PATTERNS } from '../patterns.js';

// Reset lastIndex before each test since all patterns use /g flag
beforeEach(() => {
  for (const p of PATTERNS) {
    p.pattern.lastIndex = 0;
  }
});

function findPattern(name: string) {
  const p = PATTERNS.find((p) => p.name === name);
  if (!p) throw new Error(`Pattern not found: ${name}`);
  return p;
}

function matches(patternName: string, input: string): boolean {
  const p = findPattern(patternName);
  p.pattern.lastIndex = 0;
  return p.pattern.test(input);
}

// ── AWS ──────────────────────────────────────────────────────────────────────

describe('AWS Access Key ID (AKIA)', () => {
  it('matches a valid AKIA key', () => {
    expect(matches('AWS Access Key ID (AKIA)', 'AKIAIOSFODNN7EXAMPLE')).toBe(true);
  });
  it('does not match short key', () => {
    expect(matches('AWS Access Key ID (AKIA)', 'AKIA12345')).toBe(false);
  });
});

describe('AWS Access Key ID (ASIA)', () => {
  it('matches a valid ASIA key', () => {
    expect(matches('AWS Access Key ID (ASIA)', 'ASIAIOSFODNN7EXAMPLE')).toBe(true);
  });
  it('does not match AKIA prefix', () => {
    expect(matches('AWS Access Key ID (ASIA)', 'AKIAIOSFODNN7EXAMPLE')).toBe(false);
  });
});

describe('AWS Secret Access Key', () => {
  it('matches key=value assignment', () => {
    expect(matches('AWS Secret Access Key', 'aws_secret_access_key=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY')).toBe(true);
  });
  it('matches with quotes', () => {
    expect(matches('AWS Secret Access Key', 'aws_secret_access_key="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"')).toBe(true);
  });
  it('does not match short value', () => {
    expect(matches('AWS Secret Access Key', 'aws_secret_access_key=short')).toBe(false);
  });
});

describe('AWS Account ID', () => {
  it('matches aws account_id assignment', () => {
    expect(matches('AWS Account ID', 'aws_account_id=' + '123456789012')).toBe(true);
  });
  it('matches ARN context', () => {
    expect(matches('AWS Account ID', 'arn:aws:iam::' + '123456789012' + ':role/test')).toBe(true);
  });
  it('does not match bare 12-digit number', () => {
    expect(matches('AWS Account ID', 'phone=123456789012')).toBe(false);
  });
  it('does not match 11-digit number in AWS context', () => {
    expect(matches('AWS Account ID', 'aws_account_id=12345678901')).toBe(false);
  });
});

// ── Stripe ───────────────────────────────────────────────────────────────────

describe('Stripe Live Secret Key', () => {
  it('matches sk_live_ prefix with 20+ chars', () => {
    expect(matches('Stripe Live Secret Key', 'sk_live_abcdefghijklmnopqrstu')).toBe(true);
  });
  it('does not match test key', () => {
    expect(matches('Stripe Live Secret Key', 'sk_test_abcdefghijklmnopqrstu')).toBe(false);
  });
  it('does not match too short', () => {
    expect(matches('Stripe Live Secret Key', 'sk_live_short')).toBe(false);
  });
});

describe('Stripe Test Secret Key', () => {
  it('matches sk_test_ prefix', () => {
    expect(matches('Stripe Test Secret Key', 'sk_test_abcdefghijklmnopqrstu')).toBe(true);
  });
  it('does not match short value', () => {
    expect(matches('Stripe Test Secret Key', 'sk_test_short')).toBe(false);
  });
});

describe('Stripe Webhook Signing Secret', () => {
  it('matches whsec_ prefix', () => {
    expect(matches('Stripe Webhook Signing Secret', 'whsec_abcdefghijklmnopqrstu12345')).toBe(true);
  });
  it('does not match short value', () => {
    expect(matches('Stripe Webhook Signing Secret', 'whsec_short')).toBe(false);
  });
});

// ── Private Keys ─────────────────────────────────────────────────────────────

describe('RSA Private Key', () => {
  it('matches PEM header', () => {
    expect(matches('RSA Private Key', '-----BEGIN RSA PRIVATE KEY-----')).toBe(true);
  });
  it('does not match EC key header', () => {
    expect(matches('RSA Private Key', '-----BEGIN EC PRIVATE KEY-----')).toBe(false);
  });
});

describe('Generic Private Key', () => {
  it('matches generic PEM header', () => {
    expect(matches('Generic Private Key', '-----BEGIN PRIVATE KEY-----')).toBe(true);
  });
});

describe('OpenSSH Private Key', () => {
  it('matches OpenSSH header', () => {
    expect(matches('OpenSSH Private Key', '-----BEGIN OPENSSH PRIVATE KEY-----')).toBe(true);
  });
});

// ── JWT ──────────────────────────────────────────────────────────────────────

describe('JWT Token', () => {
  it('matches a real JWT structure', () => {
    expect(
      matches(
        'JWT Token',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
      ),
    ).toBe(true);
  });
  it('does not match a plain string', () => {
    expect(matches('JWT Token', 'not-a-jwt-token')).toBe(false);
  });
  it('does not match single base64 segment', () => {
    expect(matches('JWT Token', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9')).toBe(false);
  });
});

// ── Database URLs ─────────────────────────────────────────────────────────────

describe('PostgreSQL Connection String', () => {
  it('matches postgres:// with credentials', () => {
    expect(
      matches('PostgreSQL Connection String', 'postgres://user:password@host:5432/db'),
    ).toBe(true);
  });
  it('matches postgresql:// variant', () => {
    expect(
      matches('PostgreSQL Connection String', 'postgresql://user:pass@host/db'),
    ).toBe(true);
  });
  it('does not match URL without password', () => {
    // No colon between user and @
    expect(matches('PostgreSQL Connection String', 'postgres://user@host/db')).toBe(false);
  });
});

describe('MongoDB Connection String', () => {
  it('matches mongodb:// with credentials', () => {
    expect(
      matches('MongoDB Connection String', 'mongodb://admin:secret123@cluster.host/dbname'),
    ).toBe(true);
  });
});

describe('MongoDB SRV Connection String', () => {
  it('matches mongodb+srv://', () => {
    expect(
      matches('MongoDB SRV Connection String', 'mongodb+srv://user:pass@cluster.mongodb.net/db'),
    ).toBe(true);
  });
});

describe('Redis Connection String', () => {
  it('matches redis:// URL', () => {
    expect(matches('Redis Connection String', 'redis://localhost:6379')).toBe(true);
  });
  it('matches redis with password', () => {
    expect(matches('Redis Connection String', 'redis://:mypassword@redis.host:6379')).toBe(true);
  });
});

// ── GitHub Tokens ─────────────────────────────────────────────────────────────

describe('GitHub Personal Access Token (ghp_)', () => {
  it('matches ghp_ with 36 chars', () => {
    expect(matches('GitHub Personal Access Token (ghp_)', 'ghp_' + 'A'.repeat(36))).toBe(true);
  });
  it('does not match too short', () => {
    expect(matches('GitHub Personal Access Token (ghp_)', 'ghp_shorttoken')).toBe(false);
  });
});

describe('GitHub OAuth Token (gho_)', () => {
  it('matches gho_ with 36 chars', () => {
    expect(matches('GitHub OAuth Token (gho_)', 'gho_' + 'B'.repeat(36))).toBe(true);
  });
});

describe('GitHub App Installation Token (ghs_)', () => {
  it('matches ghs_ with 36 chars', () => {
    expect(matches('GitHub App Installation Token (ghs_)', 'ghs_' + 'C'.repeat(36))).toBe(true);
  });
});

describe('GitHub Pat Token', () => {
  it('matches github_pat_ prefix', () => {
    expect(matches('GitHub Pat Token', 'github_pat_' + 'a'.repeat(22))).toBe(true);
  });
  it('does not match too short', () => {
    expect(matches('GitHub Pat Token', 'github_pat_short')).toBe(false);
  });
});

// ── Slack ─────────────────────────────────────────────────────────────────────

describe('Slack Bot Token', () => {
  it('matches xoxb- format', () => {
    // Split to avoid GitHub push-protection false-positive on the xoxb- prefix
    expect(matches('Slack Bot Token', 'xoxb' + '-12345678901-12345678901-abcdefghijklmnopqrstuvwx')).toBe(true);
  });
  it('does not match xoxp- format', () => {
    expect(matches('Slack Bot Token', 'xoxp-12345678901-12345678901-12345678901-abcdefghijklmnopqrstuvwxyz012345')).toBe(false);
  });
});

describe('Slack Incoming Webhook', () => {
  it('matches hooks.slack.com URL', () => {
    expect(
      matches(
        'Slack Incoming Webhook',
        'https://hooks.slack.com/services/TXXXXXXXX/BXXXXXXXX/abcdefghijklmnop',
      ),
    ).toBe(true);
  });
});

// ── SendGrid ──────────────────────────────────────────────────────────────────

describe('SendGrid API Key', () => {
  it('matches SG. prefix', () => {
    expect(matches('SendGrid API Key', 'SG.abcdefghijklmnopqrstuv.wxyzABCDEFGHIJKLMNOPQRSTUV')).toBe(true);
  });
  it('does not match short value', () => {
    expect(matches('SendGrid API Key', 'SG.short')).toBe(false);
  });
});

// ── NPM ───────────────────────────────────────────────────────────────────────

describe('NPM Token', () => {
  it('matches npm_ with 36 chars', () => {
    expect(matches('NPM Token', 'npm_' + 'a'.repeat(36))).toBe(true);
  });
  it('does not match too short', () => {
    expect(matches('NPM Token', 'npm_shorttoken')).toBe(false);
  });
});

// ── AI Service Keys ───────────────────────────────────────────────────────────

describe('OpenAI API Key (sk-)', () => {
  it('matches sk- with 20+ chars', () => {
    expect(matches('OpenAI API Key (sk-)', 'sk-abcdefghijklmnopqrstuvwxyz123456')).toBe(true);
  });
});

describe('Anthropic API Key', () => {
  it('matches sk-ant- prefix', () => {
    expect(matches('Anthropic API Key', 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz')).toBe(true);
  });
  it('does not match sk- without ant', () => {
    // sk- alone hits OpenAI pattern, not Anthropic
    expect(matches('Anthropic API Key', 'sk-abcdefghijklmnopqrstuvwxyz')).toBe(false);
  });
});

describe('Hugging Face API Token', () => {
  it('matches hf_ prefix', () => {
    expect(matches('Hugging Face API Token', 'hf_abcdefghijklmnopqrstuvwxyz')).toBe(true);
  });
});

describe('Replicate API Key', () => {
  it('matches r8_ prefix', () => {
    expect(matches('Replicate API Key', 'r8_abcdefghijklmnopqrstuvwxyz')).toBe(true);
  });
});

// ── Cloud tokens ──────────────────────────────────────────────────────────────

describe('DigitalOcean Personal Access Token', () => {
  it('matches dop_v1_ prefix', () => {
    expect(matches('DigitalOcean Personal Access Token', 'dop_v1_' + 'a'.repeat(64))).toBe(true);
  });
  it('does not match too short', () => {
    expect(matches('DigitalOcean Personal Access Token', 'dop_v1_short')).toBe(false);
  });
});

describe('HashiCorp Vault Token (hvs.)', () => {
  it('matches hvs. prefix', () => {
    expect(matches('Vault Token', 'hvs.' + 'a'.repeat(20))).toBe(true);
  });
});

describe('PlanetScale API Token', () => {
  it('matches pscale_ prefix with 32 chars', () => {
    expect(matches('PlanetScale API Token', 'pscale_' + 'a'.repeat(32))).toBe(true);
  });
  it('does not match wrong length', () => {
    expect(matches('PlanetScale API Token', 'pscale_short')).toBe(false);
  });
});

describe('Resend API Key', () => {
  it('matches re_ prefix with 32 chars', () => {
    expect(matches('Resend API Key', 're_' + 'a'.repeat(32))).toBe(true);
  });
});

describe('Linear API Key', () => {
  it('matches lin_api_ prefix', () => {
    expect(matches('Linear API Key', 'lin_api_' + 'a'.repeat(32))).toBe(true);
  });
});

// ── Payment ───────────────────────────────────────────────────────────────────

describe('Shopify Admin API Access Token', () => {
  it('matches shpat_ prefix', () => {
    expect(matches('Shopify Admin API Access Token', 'shpat_' + 'a'.repeat(32))).toBe(true);
  });
});

describe('Square Access Token', () => {
  it('matches sq0atp- prefix', () => {
    expect(matches('Square Access Token', 'sq0atp-abcdefghijklmnopqrstuv123')).toBe(true);
  });
});

describe('Plaid Access Token', () => {
  it('matches access-production format', () => {
    expect(
      matches('Plaid Access Token', 'access-production-' + 'a'.repeat(32)),
    ).toBe(true);
  });
  it('matches access-sandbox format', () => {
    expect(
      matches('Plaid Access Token', 'access-sandbox-' + 'a'.repeat(32)),
    ).toBe(true);
  });
});

// ── GCP / Google ──────────────────────────────────────────────────────────────

describe('Google API Key', () => {
  it('matches AIza prefix', () => {
    expect(matches('Google API Key', 'AIza' + 'a'.repeat(35))).toBe(true);
  });
  it('does not match too short', () => {
    expect(matches('Google API Key', 'AIzaShort')).toBe(false);
  });
});

describe('GCP Service Account JSON', () => {
  it('matches type: service_account marker', () => {
    expect(matches('GCP Service Account JSON', '"type": "service_account"')).toBe(true);
  });
  it('does not match type: user_account', () => {
    expect(matches('GCP Service Account JSON', '"type": "user_account"')).toBe(false);
  });
});

// ── GitLab / DevOps ───────────────────────────────────────────────────────────

describe('GitLab Personal Access Token', () => {
  it('matches glpat- prefix', () => {
    expect(matches('GitLab Personal Access Token', 'glpat-abcdefghijklmnopqrstu')).toBe(true);
  });
});

describe('Telegram Bot Token', () => {
  it('matches digit:AA format', () => {
    expect(matches('Telegram Bot Token', '123456789:AAabcdefghijklmnopqrstuvwxyz01')).toBe(true);
  });
  it('does not match without AA prefix after colon', () => {
    expect(matches('Telegram Bot Token', '123456789:BBabcdefghijklmnopqrstuvwxyz')).toBe(false);
  });
});

// ── Clerk ────────────────────────────────────────────────────────────────────

describe('Clerk Secret Key (Live)', () => {
  it('matches a valid live secret key', () => {
    expect(matches('Clerk Secret Key (Live)', 'sk_live_' + 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0')).toBe(true);
  });
  it('matches with surrounding context', () => {
    expect(matches('Clerk Secret Key (Live)', 'CLERK_SECRET_KEY=sk_live_' + 'abcdefghijklmnopqrstuvwxyz01234567890ABC')).toBe(true);
  });
  it('does not match test prefix', () => {
    expect(matches('Clerk Secret Key (Live)', 'sk_test_' + 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0')).toBe(false);
  });
  it('does not match short value', () => {
    expect(matches('Clerk Secret Key (Live)', 'sk_live_tooshort')).toBe(false);
  });
});

describe('Clerk Secret Key (Test)', () => {
  it('matches a valid test secret key', () => {
    expect(matches('Clerk Secret Key (Test)', 'sk_test_' + 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0')).toBe(true);
  });
  it('matches longer key', () => {
    expect(matches('Clerk Secret Key (Test)', 'sk_test_' + 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdefgh')).toBe(true);
  });
  it('does not match live prefix', () => {
    expect(matches('Clerk Secret Key (Test)', 'sk_live_' + 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0')).toBe(false);
  });
  it('does not match short value', () => {
    expect(matches('Clerk Secret Key (Test)', 'sk_test_short')).toBe(false);
  });
});

describe('Clerk Publishable Key', () => {
  it('matches live publishable key', () => {
    expect(matches('Clerk Publishable Key', 'pk_live_' + 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0')).toBe(true);
  });
  it('matches test publishable key', () => {
    expect(matches('Clerk Publishable Key', 'pk_test_' + 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0')).toBe(true);
  });
  it('does not match sk_ prefix', () => {
    expect(matches('Clerk Publishable Key', 'sk_live_' + 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0')).toBe(false);
  });
  it('does not match short value', () => {
    expect(matches('Clerk Publishable Key', 'pk_live_short')).toBe(false);
  });
});

// ── Supabase (expanded) ─────────────────────────────────────────────────────

describe('Supabase Service Role Key Assignment', () => {
  it('matches env var assignment', () => {
    expect(matches('Supabase Service Role Key Assignment', 'SUPABASE_SERVICE_ROLE_KEY=' + 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpX')).toBe(true);
  });
  it('matches quoted assignment', () => {
    expect(matches('Supabase Service Role Key Assignment', 'supabase_service_role_key="' + 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpX' + '"')).toBe(true);
  });
  it('does not match without key name', () => {
    expect(matches('Supabase Service Role Key Assignment', 'SERVICE_KEY=' + 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpX')).toBe(false);
  });
  it('does not match short value', () => {
    expect(matches('Supabase Service Role Key Assignment', 'SUPABASE_SERVICE_ROLE_KEY=short')).toBe(false);
  });
});

// ── Convex ───────────────────────────────────────────────────────────────────

describe('Convex Deploy Key', () => {
  it('matches env var assignment', () => {
    expect(matches('Convex Deploy Key', 'CONVEX_DEPLOY_KEY=' + 'prod_abc123def456ghi789jk')).toBe(true);
  });
  it('matches quoted assignment', () => {
    expect(matches('Convex Deploy Key', 'CONVEX_DEPLOY_KEY="' + 'prod_abc123def456ghi789jk' + '"')).toBe(true);
  });
  it('does not match without env var name', () => {
    expect(matches('Convex Deploy Key', 'DEPLOY_KEY=' + 'prod_abc123def456ghi789jk')).toBe(false);
  });
  it('does not match short value', () => {
    expect(matches('Convex Deploy Key', 'CONVEX_DEPLOY_KEY=short')).toBe(false);
  });
});

// ── Neon ─────────────────────────────────────────────────────────────────────

describe('Neon Database Connection String', () => {
  it('matches postgres URL with neon.tech host', () => {
    expect(matches('Neon Database Connection String', 'postgres://user:' + 'pa55word@ep-cool-name-123456.us-east-2.aws.neon.tech/neondb')).toBe(true);
  });
  it('matches postgresql protocol variant', () => {
    expect(matches('Neon Database Connection String', 'postgresql://neondb_owner:' + 'abc123@ep-example.neon.tech/neondb?sslmode=require')).toBe(true);
  });
  it('does not match non-neon postgres URL', () => {
    expect(matches('Neon Database Connection String', 'postgres://user:' + 'pass@localhost:5432/mydb')).toBe(false);
  });
  it('does not match plain neon.tech URL', () => {
    expect(matches('Neon Database Connection String', 'https://neon.tech/docs')).toBe(false);
  });
});

// ── Turso ────────────────────────────────────────────────────────────────────

describe('Turso Database URL', () => {
  it('matches libsql URL', () => {
    expect(matches('Turso Database URL', 'libsql://my-db-myorg.turso.io')).toBe(true);
  });
  it('matches libsql URL with path', () => {
    expect(matches('Turso Database URL', 'libsql://localhost:8080')).toBe(true);
  });
  it('does not match http URL', () => {
    expect(matches('Turso Database URL', 'http://my-db.turso.io')).toBe(false);
  });
  it('does not match bare libsql without host', () => {
    expect(matches('Turso Database URL', 'libsql://')).toBe(false);
  });
});

describe('Turso Auth Token', () => {
  it('matches env var assignment', () => {
    expect(matches('Turso Auth Token', 'TURSO_AUTH_TOKEN=' + 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.abc123def456')).toBe(true);
  });
  it('matches quoted assignment', () => {
    expect(matches('Turso Auth Token', 'TURSO_AUTH_TOKEN="' + 'abcdef1234567890abcdef' + '"')).toBe(true);
  });
  it('does not match without env var name', () => {
    expect(matches('Turso Auth Token', 'AUTH_TOKEN=' + 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.abc123def456')).toBe(false);
  });
  it('does not match short value', () => {
    expect(matches('Turso Auth Token', 'TURSO_AUTH_TOKEN=short')).toBe(false);
  });
});

// ── Upstash ──────────────────────────────────────────────────────────────────

describe('Upstash Redis REST Token', () => {
  it('matches env var assignment', () => {
    expect(matches('Upstash Redis REST Token', 'UPSTASH_REDIS_REST_TOKEN=' + 'AX8zASQgODRhNzVjMTMtY2U2')).toBe(true);
  });
  it('matches quoted assignment', () => {
    expect(matches('Upstash Redis REST Token', 'UPSTASH_REDIS_REST_TOKEN="' + 'AX8zASQgODRhNzVjMTMtY2U2' + '"')).toBe(true);
  });
  it('does not match without env var name', () => {
    expect(matches('Upstash Redis REST Token', 'REDIS_TOKEN=' + 'AX8zASQgODRhNzVjMTMtY2U2')).toBe(false);
  });
  it('does not match short value', () => {
    expect(matches('Upstash Redis REST Token', 'UPSTASH_REDIS_REST_TOKEN=abc')).toBe(false);
  });
});

describe('Upstash Kafka REST Token', () => {
  it('matches env var assignment', () => {
    expect(matches('Upstash Kafka REST Token', 'UPSTASH_KAFKA_REST_TOKEN=' + 'AX8zASQgODRhNzVjMTMtY2U2')).toBe(true);
  });
  it('matches quoted assignment', () => {
    expect(matches('Upstash Kafka REST Token', 'UPSTASH_KAFKA_REST_TOKEN="' + 'kafkatoken1234567890abc' + '"')).toBe(true);
  });
  it('does not match without env var name', () => {
    expect(matches('Upstash Kafka REST Token', 'KAFKA_TOKEN=' + 'AX8zASQgODRhNzVjMTMtY2U2')).toBe(false);
  });
  it('does not match short value', () => {
    expect(matches('Upstash Kafka REST Token', 'UPSTASH_KAFKA_REST_TOKEN=abc')).toBe(false);
  });
});

// ── CI/CD & Deployment Platforms (Phase 2) ────────────────────────────────────

describe('CircleCI API Token', () => {
  it('matches CIRCLECI_TOKEN assignment', () => {
    expect(matches('CircleCI API Token', 'CIRCLECI_TOKEN=' + 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2')).toBe(true);
  });
  it('matches CIRCLE_TOKEN assignment', () => {
    expect(matches('CircleCI API Token', 'CIRCLE_TOKEN="' + 'deadbeef01234567890abcdef01234567890abcd' + '"')).toBe(true);
  });
  it('does not match without env var name', () => {
    expect(matches('CircleCI API Token', 'MY_TOKEN=' + 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2')).toBe(false);
  });
  it('does not match short value', () => {
    expect(matches('CircleCI API Token', 'CIRCLECI_TOKEN=abc123')).toBe(false);
  });
});

describe('Travis CI API Token', () => {
  it('matches TRAVIS_TOKEN assignment', () => {
    expect(matches('Travis CI API Token', 'TRAVIS_TOKEN=' + 'travisci_token_value_abc')).toBe(true);
  });
  it('matches TRAVIS_API_TOKEN assignment', () => {
    expect(matches('Travis CI API Token', 'TRAVIS_API_TOKEN="' + 'myTravisApiTokenValue123' + '"')).toBe(true);
  });
  it('does not match without env var name', () => {
    expect(matches('Travis CI API Token', 'CI_TOKEN=' + 'travisci_token_value_abc')).toBe(false);
  });
  it('does not match short value', () => {
    expect(matches('Travis CI API Token', 'TRAVIS_TOKEN=short')).toBe(false);
  });
});

describe('Buildkite Agent Token', () => {
  it('matches bkp_ prefix token', () => {
    expect(matches('Buildkite Agent Token', 'bkp_' + 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0')).toBe(true);
  });
  it('matches longer bkp_ token', () => {
    expect(matches('Buildkite Agent Token', 'token=bkp_' + 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefaa')).toBe(true);
  });
  it('does not match without bkp_ prefix', () => {
    expect(matches('Buildkite Agent Token', 'bk_' + 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0')).toBe(false);
  });
  it('does not match short value', () => {
    expect(matches('Buildkite Agent Token', 'bkp_abc123')).toBe(false);
  });
});

describe('Buildkite API Token', () => {
  it('matches BUILDKITE_API_TOKEN assignment', () => {
    expect(matches('Buildkite API Token', 'BUILDKITE_API_TOKEN=' + 'bk_agent_token_value_1234')).toBe(true);
  });
  it('matches BUILDKITE_AGENT_TOKEN assignment', () => {
    expect(matches('Buildkite API Token', 'BUILDKITE_AGENT_TOKEN="' + 'agent_token_abcdef123456' + '"')).toBe(true);
  });
  it('does not match without env var name', () => {
    expect(matches('Buildkite API Token', 'BK_TOKEN=' + 'bk_agent_token_value_1234')).toBe(false);
  });
  it('does not match short value', () => {
    expect(matches('Buildkite API Token', 'BUILDKITE_API_TOKEN=abc')).toBe(false);
  });
});

describe('Railway API Token', () => {
  it('matches RAILWAY_TOKEN with UUID-like value', () => {
    expect(matches('Railway API Token', 'RAILWAY_TOKEN=' + 'a1b2c3d4-e5f6-7890-abcd-ef0123456789')).toBe(true);
  });
  it('matches quoted RAILWAY_TOKEN', () => {
    expect(matches('Railway API Token', 'RAILWAY_TOKEN="' + 'deadbeef-1234-5678-9abc-def012345678' + '"')).toBe(true);
  });
  it('does not match without env var name', () => {
    expect(matches('Railway API Token', 'DEPLOY_TOKEN=' + 'a1b2c3d4-e5f6-7890-abcd-ef0123456789')).toBe(false);
  });
  it('does not match short value', () => {
    expect(matches('Railway API Token', 'RAILWAY_TOKEN=abc-123')).toBe(false);
  });
});

describe('Render API Key', () => {
  it('matches rnd_ prefix key', () => {
    expect(matches('Render API Key', 'rnd_' + 'AbCdEfGhIjKlMnOpQrStUvWxYz012345')).toBe(true);
  });
  it('matches in assignment context', () => {
    expect(matches('Render API Key', 'key=rnd_' + 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6')).toBe(true);
  });
  it('does not match without rnd_ prefix', () => {
    expect(matches('Render API Key', 'rnx_' + 'AbCdEfGhIjKlMnOpQrStUvWxYz012345')).toBe(false);
  });
  it('does not match short value', () => {
    expect(matches('Render API Key', 'rnd_abc123')).toBe(false);
  });
});

describe('Render API Key Assignment', () => {
  it('matches RENDER_API_KEY assignment', () => {
    expect(matches('Render API Key Assignment', 'RENDER_API_KEY=' + 'render_key_value_abcdef12')).toBe(true);
  });
  it('matches quoted assignment', () => {
    expect(matches('Render API Key Assignment', 'RENDER_API_KEY="' + 'rnd_someRenderKeyValue1234' + '"')).toBe(true);
  });
  it('does not match without env var name', () => {
    expect(matches('Render API Key Assignment', 'API_KEY=' + 'render_key_value_abcdef12')).toBe(false);
  });
  it('does not match short value', () => {
    expect(matches('Render API Key Assignment', 'RENDER_API_KEY=short')).toBe(false);
  });
});

describe('Fly.io API Token', () => {
  it('matches FlyV1 token', () => {
    expect(matches('Fly.io API Token', 'FlyV1 ' + 'fm2_lJPECDNEIME0M1TAKA')).toBe(true);
  });
  it('matches FlyV1 with longer token', () => {
    expect(matches('Fly.io API Token', 'Authorization: FlyV1 ' + 'abcdef1234567890_token-v')).toBe(true);
  });
  it('does not match without FlyV1 prefix', () => {
    expect(matches('Fly.io API Token', 'FlyV2 ' + 'fm2_lJPECDNEIME0M1TAKA')).toBe(false);
  });
  it('does not match short value', () => {
    expect(matches('Fly.io API Token', 'FlyV1 abc')).toBe(false);
  });
});

describe('Fly.io Auth Token Assignment', () => {
  it('matches FLY_API_TOKEN assignment', () => {
    expect(matches('Fly.io Auth Token Assignment', 'FLY_API_TOKEN=' + 'fo1_xyzABCDEFGHIJKLMNOPQRS')).toBe(true);
  });
  it('matches quoted assignment', () => {
    expect(matches('Fly.io Auth Token Assignment', 'FLY_API_TOKEN="' + 'fly_token_value_1234567890' + '"')).toBe(true);
  });
  it('does not match without env var name', () => {
    expect(matches('Fly.io Auth Token Assignment', 'API_TOKEN=' + 'fo1_xyzABCDEFGHIJKLMNOPQRS')).toBe(false);
  });
  it('does not match short value', () => {
    expect(matches('Fly.io Auth Token Assignment', 'FLY_API_TOKEN=abc')).toBe(false);
  });
});

describe('Pulumi Access Token', () => {
  it('matches pul- prefix token', () => {
    expect(matches('Pulumi Access Token', 'pul-' + 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0')).toBe(true);
  });
  it('matches in assignment context', () => {
    expect(matches('Pulumi Access Token', 'PULUMI_ACCESS_TOKEN=pul-' + 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefaa')).toBe(true);
  });
  it('does not match without pul- prefix', () => {
    expect(matches('Pulumi Access Token', 'pu-' + 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0')).toBe(false);
  });
  it('does not match short value', () => {
    expect(matches('Pulumi Access Token', 'pul-abc123')).toBe(false);
  });
});

// ── Payments & Fintech (Phase 3) ──────────────────────────────────────────────

describe('Razorpay Live Key ID', () => {
  it('matches rzp_live_ prefix', () => {
    expect(matches('Razorpay Live Key ID', 'rzp_live_' + 'ILgsfZCgtR14Qa')).toBe(true);
  });
  it('matches longer key', () => {
    expect(matches('Razorpay Live Key ID', 'key=rzp_live_' + 'AbCdEfGhIjKlMn01')).toBe(true);
  });
  it('does not match test prefix', () => {
    expect(findPattern('Razorpay Live Key ID').pattern.test('rzp_test_ILgsfZCgtR14Qa')).toBe(false);
  });
  it('does not match short value', () => {
    expect(matches('Razorpay Live Key ID', 'rzp_live_abc')).toBe(false);
  });
});

describe('Razorpay Test Key ID', () => {
  it('matches rzp_test_ prefix', () => {
    expect(matches('Razorpay Test Key ID', 'rzp_test_' + 'ILgsfZCgtR14Qa')).toBe(true);
  });
  it('matches longer key', () => {
    expect(matches('Razorpay Test Key ID', 'rzp_test_' + 'AbCdEfGh1234567890')).toBe(true);
  });
  it('does not match live prefix', () => {
    expect(findPattern('Razorpay Test Key ID').pattern.test('rzp_live_ILgsfZCgtR14Qa')).toBe(false);
  });
  it('does not match short value', () => {
    expect(matches('Razorpay Test Key ID', 'rzp_test_abc')).toBe(false);
  });
});

describe('Razorpay Key Secret', () => {
  it('matches env var assignment', () => {
    expect(matches('Razorpay Key Secret', 'RAZORPAY_KEY_SECRET=' + 'D4mXtPq7nR2sWzYk')).toBe(true);
  });
  it('matches quoted assignment', () => {
    expect(matches('Razorpay Key Secret', 'RAZORPAY_KEY_SECRET="' + 'aB3cD4eF5gH6iJ7k' + '"')).toBe(true);
  });
  it('does not match without env var name', () => {
    expect(matches('Razorpay Key Secret', 'KEY_SECRET=' + 'D4mXtPq7nR2sWzYk')).toBe(false);
  });
  it('does not match short value', () => {
    expect(matches('Razorpay Key Secret', 'RAZORPAY_KEY_SECRET=abc')).toBe(false);
  });
});

describe('Adyen API Key', () => {
  it('matches env var assignment', () => {
    expect(matches('Adyen API Key', 'ADYEN_API_KEY=' + 'AQEyhmfxK4PJahZCw0m12jE8aeFdH3pV' + 'a1b2c3d4')).toBe(true);
  });
  it('matches quoted assignment', () => {
    expect(matches('Adyen API Key', 'ADYEN_API_KEY="' + 'deadbeef01234567890abcdef012345678' + '"')).toBe(true);
  });
  it('does not match without env var name', () => {
    expect(matches('Adyen API Key', 'API_KEY=' + 'AQEyhmfxK4PJahZCw0m12jE8aeFdH3pV' + 'a1b2c3d4')).toBe(false);
  });
  it('does not match short value', () => {
    expect(matches('Adyen API Key', 'ADYEN_API_KEY=abc123')).toBe(false);
  });
});

describe('Adyen Client Key', () => {
  it('matches Adyen context with test_ prefix', () => {
    expect(matches('Adyen Client Key', 'ADYEN="test_' + 'aBcDeFgHiJkLmNoPqRsTuVwXyZ0123' + '"')).toBe(true);
  });
  it('matches Adyen context with live_ prefix', () => {
    expect(matches('Adyen Client Key', 'adyen=live_' + 'xYz0123456789AbCdEfGhIjKlMnOpQr' + 'st')).toBe(true);
  });
  it('does not match without Adyen context', () => {
    expect(matches('Adyen Client Key', 'KEY=test_' + 'aBcDeFgHiJkLmNoPqRsTuVwXyZ0123')).toBe(false);
  });
  it('does not match short value after prefix', () => {
    expect(matches('Adyen Client Key', 'ADYEN=test_short')).toBe(false);
  });
});

describe('Lemon Squeezy API Key', () => {
  it('matches LEMON_SQUEEZY_API_KEY assignment', () => {
    expect(matches('Lemon Squeezy API Key', 'LEMON_SQUEEZY_API_KEY=' + 'eyJ0eXAiOiJKV1QiLCJhbGc')).toBe(true);
  });
  it('matches LEMONSQUEEZY_API_KEY assignment', () => {
    expect(matches('Lemon Squeezy API Key', 'LEMONSQUEEZY_API_KEY="' + 'ls_api_key_value_1234567890' + '"')).toBe(true);
  });
  it('does not match without env var name', () => {
    expect(matches('Lemon Squeezy API Key', 'SQUEEZY_KEY=' + 'eyJ0eXAiOiJKV1QiLCJhbGc')).toBe(false);
  });
  it('does not match short value', () => {
    expect(matches('Lemon Squeezy API Key', 'LEMON_SQUEEZY_API_KEY=abc')).toBe(false);
  });
});

describe('Lemon Squeezy Signing Secret', () => {
  it('matches LEMON_SQUEEZY_SIGNING_SECRET assignment', () => {
    expect(matches('Lemon Squeezy Signing Secret', 'LEMON_SQUEEZY_SIGNING_SECRET=' + 'sqz_sig_abcdefghij12345678')).toBe(true);
  });
  it('matches LEMONSQUEEZY_SIGNING_SECRET assignment', () => {
    expect(matches('Lemon Squeezy Signing Secret', 'LEMONSQUEEZY_SIGNING_SECRET="' + 'whsec_abcdefghij1234567890' + '"')).toBe(true);
  });
  it('does not match without env var name', () => {
    expect(matches('Lemon Squeezy Signing Secret', 'SIGNING_SECRET=' + 'sqz_sig_abcdefghij12345678')).toBe(false);
  });
  it('does not match short value', () => {
    expect(matches('Lemon Squeezy Signing Secret', 'LEMON_SQUEEZY_SIGNING_SECRET=abc')).toBe(false);
  });
});

describe('Paddle API Key', () => {
  it('matches env var assignment', () => {
    expect(matches('Paddle API Key', 'PADDLE_API_KEY=' + 'pdl_live_apikey_abcdef123')).toBe(true);
  });
  it('matches quoted assignment', () => {
    expect(matches('Paddle API Key', 'PADDLE_API_KEY="' + 'pdl_sandbox_key_1234567890' + '"')).toBe(true);
  });
  it('does not match without env var name', () => {
    expect(matches('Paddle API Key', 'API_KEY=' + 'pdl_live_apikey_abcdef123')).toBe(false);
  });
  it('does not match short value', () => {
    expect(matches('Paddle API Key', 'PADDLE_API_KEY=abc')).toBe(false);
  });
});

describe('Paddle Webhook Secret', () => {
  it('matches env var assignment', () => {
    expect(matches('Paddle Webhook Secret', 'PADDLE_WEBHOOK_SECRET=' + 'pdl_ntfn_abcdefghij12345')).toBe(true);
  });
  it('matches quoted assignment', () => {
    expect(matches('Paddle Webhook Secret', 'PADDLE_WEBHOOK_SECRET="' + 'whsec_paddle_1234567890abc' + '"')).toBe(true);
  });
  it('does not match without env var name', () => {
    expect(matches('Paddle Webhook Secret', 'WEBHOOK_SECRET=' + 'pdl_ntfn_abcdefghij12345')).toBe(false);
  });
  it('does not match short value', () => {
    expect(matches('Paddle Webhook Secret', 'PADDLE_WEBHOOK_SECRET=abc')).toBe(false);
  });
});

describe('Recurly API Key', () => {
  it('matches env var assignment', () => {
    expect(matches('Recurly API Key', 'RECURLY_API_KEY=' + 'recurly_private_key_abcdef')).toBe(true);
  });
  it('matches quoted assignment', () => {
    expect(matches('Recurly API Key', 'RECURLY_API_KEY="' + 'abcdef1234567890abcdef12' + '"')).toBe(true);
  });
  it('does not match without env var name', () => {
    expect(matches('Recurly API Key', 'API_KEY=' + 'recurly_private_key_abcdef')).toBe(false);
  });
  it('does not match short value', () => {
    expect(matches('Recurly API Key', 'RECURLY_API_KEY=abc')).toBe(false);
  });
});

// ── Communication & Notifications (Phase 4) ──────────────────────────────────

describe('Pusher App Secret', () => {
  it('matches PUSHER_APP_SECRET assignment', () => {
    expect(matches('Pusher App Secret', 'PUSHER_APP_SECRET=' + 'a1b2c3d4e5f6g7h8i9j0k1l2')).toBe(true);
  });
  it('matches PUSHER_SECRET assignment', () => {
    expect(matches('Pusher App Secret', 'PUSHER_SECRET="' + 'myPusherSecretValue12345' + '"')).toBe(true);
  });
  it('does not match without env var name', () => {
    expect(matches('Pusher App Secret', 'APP_SECRET=' + 'a1b2c3d4e5f6g7h8i9j0k1l2')).toBe(false);
  });
  it('does not match short value', () => {
    expect(matches('Pusher App Secret', 'PUSHER_APP_SECRET=abc')).toBe(false);
  });
});

describe('Ably API Key', () => {
  it('matches app-id.key-id:key-secret format', () => {
    expect(matches('Ably API Key', 'xVLyHw' + '.BXLJkQ:HCStquklRbL-g9FRfQLxR_MNqj4')).toBe(true);
  });
  it('matches another valid format', () => {
    expect(matches('Ably API Key', 'a1b2c3' + '.d4e5f6:xyzABCDEFGHIJKLMNOPQRST')).toBe(true);
  });
  it('does not match without colon separator', () => {
    expect(matches('Ably API Key', 'xVLyHw.BXLJkQ-HCStquklRbLg9FRfQLxR')).toBe(false);
  });
  it('does not match short secret portion', () => {
    expect(matches('Ably API Key', 'xVLyHw.BXLJkQ:short')).toBe(false);
  });
});

describe('Ably API Key Assignment', () => {
  it('matches ABLY_API_KEY assignment', () => {
    expect(matches('Ably API Key Assignment', 'ABLY_API_KEY=' + 'xVLyHw.BXLJkQ:HCStquklRbL')).toBe(true);
  });
  it('matches quoted assignment', () => {
    expect(matches('Ably API Key Assignment', 'ABLY_API_KEY="' + 'a1b2c3.d4e5f6:xyzABCDEFGH' + '"')).toBe(true);
  });
  it('does not match without env var name', () => {
    expect(matches('Ably API Key Assignment', 'API_KEY=' + 'xVLyHw.BXLJkQ:HCStquklRbL')).toBe(false);
  });
  it('does not match short value', () => {
    expect(matches('Ably API Key Assignment', 'ABLY_API_KEY=abc')).toBe(false);
  });
});

describe('OneSignal REST API Key', () => {
  it('matches ONESIGNAL_REST_API_KEY assignment', () => {
    expect(matches('OneSignal REST API Key', 'ONESIGNAL_REST_API_KEY=' + 'NjE4ZDI2MWEtOTkzYi00ZT')).toBe(true);
  });
  it('matches ONESIGNAL_API_KEY assignment', () => {
    expect(matches('OneSignal REST API Key', 'ONESIGNAL_API_KEY="' + 'onesignal_key_value_12345' + '"')).toBe(true);
  });
  it('does not match without env var name', () => {
    expect(matches('OneSignal REST API Key', 'REST_API_KEY=' + 'NjE4ZDI2MWEtOTkzYi00ZT')).toBe(false);
  });
  it('does not match short value', () => {
    expect(matches('OneSignal REST API Key', 'ONESIGNAL_REST_API_KEY=abc')).toBe(false);
  });
});

describe('Customer.io API Key', () => {
  it('matches CUSTOMERIO_API_KEY assignment', () => {
    expect(matches('Customer.io API Key', 'CUSTOMERIO_API_KEY=' + 'cio_api_key_abcdef1234567')).toBe(true);
  });
  it('matches CIO_API_KEY assignment', () => {
    expect(matches('Customer.io API Key', 'CIO_API_KEY="' + 'abcdefghijklmnopqrst1234' + '"')).toBe(true);
  });
  it('does not match without env var name', () => {
    expect(matches('Customer.io API Key', 'API_KEY=' + 'cio_api_key_abcdef1234567')).toBe(false);
  });
  it('does not match short value', () => {
    expect(matches('Customer.io API Key', 'CUSTOMERIO_API_KEY=abc')).toBe(false);
  });
});

describe('Svix API Key', () => {
  it('matches SVIX_API_KEY assignment', () => {
    expect(matches('Svix API Key', 'SVIX_API_KEY=' + 'sk_svix_abcdefghij1234567')).toBe(true);
  });
  it('matches quoted assignment', () => {
    expect(matches('Svix API Key', 'SVIX_API_KEY="' + 'testsk_svix_1234567890abc' + '"')).toBe(true);
  });
  it('does not match without env var name', () => {
    expect(matches('Svix API Key', 'WEBHOOK_KEY=' + 'sk_svix_abcdefghij1234567')).toBe(false);
  });
  it('does not match short value', () => {
    expect(matches('Svix API Key', 'SVIX_API_KEY=abc')).toBe(false);
  });
});

describe('Knock API Key', () => {
  it('matches KNOCK_API_KEY assignment', () => {
    expect(matches('Knock API Key', 'KNOCK_API_KEY=' + 'sk_knock_abcdefghij123456')).toBe(true);
  });
  it('matches KNOCK_SECRET_API_KEY assignment', () => {
    expect(matches('Knock API Key', 'KNOCK_SECRET_API_KEY="' + 'knock_secret_value_abcdef' + '"')).toBe(true);
  });
  it('does not match without env var name', () => {
    expect(matches('Knock API Key', 'API_KEY=' + 'sk_knock_abcdefghij123456')).toBe(false);
  });
  it('does not match short value', () => {
    expect(matches('Knock API Key', 'KNOCK_API_KEY=abc')).toBe(false);
  });
});

describe('Novu API Key', () => {
  it('matches NOVU_API_KEY assignment', () => {
    expect(matches('Novu API Key', 'NOVU_API_KEY=' + 'novu_api_key_abcdef123456')).toBe(true);
  });
  it('matches NOVU_SECRET_KEY assignment', () => {
    expect(matches('Novu API Key', 'NOVU_SECRET_KEY="' + 'novu_secret_value_abcdef1' + '"')).toBe(true);
  });
  it('does not match without env var name', () => {
    expect(matches('Novu API Key', 'API_KEY=' + 'novu_api_key_abcdef123456')).toBe(false);
  });
  it('does not match short value', () => {
    expect(matches('Novu API Key', 'NOVU_API_KEY=abc')).toBe(false);
  });
});

// ── AI/ML Services (Phase 5) ──────────────────────────────────────────────────

describe('Mistral AI API Key', () => {
  it('matches MISTRAL_API_KEY assignment', () => {
    expect(matches('Mistral AI API Key', 'MISTRAL_API_KEY=' + 'abcdef1234567890abcdef12')).toBe(true);
  });
  it('matches quoted assignment', () => {
    expect(matches('Mistral AI API Key', 'MISTRAL_API_KEY="' + 'MistralKeyValue1234567890' + '"')).toBe(true);
  });
  it('does not match without env var name', () => {
    expect(matches('Mistral AI API Key', 'API_KEY=' + 'abcdef1234567890abcdef12')).toBe(false);
  });
  it('does not match short value', () => {
    expect(matches('Mistral AI API Key', 'MISTRAL_API_KEY=abc')).toBe(false);
  });
});

describe('Groq API Key', () => {
  it('matches gsk_ prefix token', () => {
    expect(matches('Groq API Key', 'gsk_' + 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4')).toBe(true);
  });
  it('matches in assignment context', () => {
    expect(matches('Groq API Key', 'key=gsk_' + 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789abcdefghijkl')).toBe(true);
  });
  it('does not match without gsk_ prefix', () => {
    expect(matches('Groq API Key', 'gk_' + 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4')).toBe(false);
  });
  it('does not match short value', () => {
    expect(matches('Groq API Key', 'gsk_abc123')).toBe(false);
  });
});

describe('Groq API Key Assignment', () => {
  it('matches GROQ_API_KEY assignment', () => {
    expect(matches('Groq API Key Assignment', 'GROQ_API_KEY=' + 'gsk_groq_key_value_abcdef')).toBe(true);
  });
  it('matches quoted assignment', () => {
    expect(matches('Groq API Key Assignment', 'GROQ_API_KEY="' + 'groq_api_token_1234567890' + '"')).toBe(true);
  });
  it('does not match without env var name', () => {
    expect(matches('Groq API Key Assignment', 'API_KEY=' + 'gsk_groq_key_value_abcdef')).toBe(false);
  });
  it('does not match short value', () => {
    expect(matches('Groq API Key Assignment', 'GROQ_API_KEY=abc')).toBe(false);
  });
});

describe('Perplexity API Key', () => {
  it('matches pplx- prefix token', () => {
    expect(matches('Perplexity API Key', 'pplx-' + 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4')).toBe(true);
  });
  it('matches in assignment context', () => {
    expect(matches('Perplexity API Key', 'key=pplx-' + 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefaa')).toBe(true);
  });
  it('does not match without pplx- prefix', () => {
    expect(matches('Perplexity API Key', 'ppx-' + 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4')).toBe(false);
  });
  it('does not match short value', () => {
    expect(matches('Perplexity API Key', 'pplx-abc123')).toBe(false);
  });
});

describe('Together AI API Key', () => {
  it('matches TOGETHER_API_KEY assignment', () => {
    expect(matches('Together AI API Key', 'TOGETHER_API_KEY=' + 'together_key_abcdef123456')).toBe(true);
  });
  it('matches quoted assignment', () => {
    expect(matches('Together AI API Key', 'TOGETHER_API_KEY="' + 'tok_together_1234567890abc' + '"')).toBe(true);
  });
  it('does not match without env var name', () => {
    expect(matches('Together AI API Key', 'API_KEY=' + 'together_key_abcdef123456')).toBe(false);
  });
  it('does not match short value', () => {
    expect(matches('Together AI API Key', 'TOGETHER_API_KEY=abc')).toBe(false);
  });
});

describe('Fireworks AI API Key', () => {
  it('matches fw_ prefix token', () => {
    expect(matches('Fireworks AI API Key', 'fw_' + 'a1b2c3d4e5f6g7h8i9j0k1l2')).toBe(true);
  });
  it('matches in assignment context', () => {
    expect(matches('Fireworks AI API Key', 'key=fw_' + 'AbCdEfGhIjKlMnOpQrStUvWx')).toBe(true);
  });
  it('does not match without fw_ prefix', () => {
    expect(matches('Fireworks AI API Key', 'f_' + 'a1b2c3d4e5f6g7h8i9j0k1l2')).toBe(false);
  });
  it('does not match short value', () => {
    expect(matches('Fireworks AI API Key', 'fw_abc')).toBe(false);
  });
});

describe('Fireworks AI API Key Assignment', () => {
  it('matches FIREWORKS_API_KEY assignment', () => {
    expect(matches('Fireworks AI API Key Assignment', 'FIREWORKS_API_KEY=' + 'fw_fireworks_key_abcdef12')).toBe(true);
  });
  it('matches quoted assignment', () => {
    expect(matches('Fireworks AI API Key Assignment', 'FIREWORKS_API_KEY="' + 'fireworks_token_1234567890' + '"')).toBe(true);
  });
  it('does not match without env var name', () => {
    expect(matches('Fireworks AI API Key Assignment', 'API_KEY=' + 'fw_fireworks_key_abcdef12')).toBe(false);
  });
  it('does not match short value', () => {
    expect(matches('Fireworks AI API Key Assignment', 'FIREWORKS_API_KEY=abc')).toBe(false);
  });
});

describe('Stability AI API Key', () => {
  it('matches STABILITY_API_KEY assignment', () => {
    expect(matches('Stability AI API Key', 'STABILITY_API_KEY=' + 'sk_stability_abcdef123456')).toBe(true);
  });
  it('matches quoted assignment', () => {
    expect(matches('Stability AI API Key', 'STABILITY_API_KEY="' + 'stability_key_1234567890ab' + '"')).toBe(true);
  });
  it('does not match without env var name', () => {
    expect(matches('Stability AI API Key', 'API_KEY=' + 'sk_stability_abcdef123456')).toBe(false);
  });
  it('does not match short value', () => {
    expect(matches('Stability AI API Key', 'STABILITY_API_KEY=abc')).toBe(false);
  });
});

describe('ElevenLabs API Key', () => {
  it('matches ELEVENLABS_API_KEY assignment', () => {
    expect(matches('ElevenLabs API Key', 'ELEVENLABS_API_KEY=' + 'el_api_key_abcdef12345678')).toBe(true);
  });
  it('matches ELEVEN_API_KEY assignment', () => {
    expect(matches('ElevenLabs API Key', 'ELEVEN_API_KEY="' + 'elevenlabs_token_12345678' + '"')).toBe(true);
  });
  it('does not match without env var name', () => {
    expect(matches('ElevenLabs API Key', 'API_KEY=' + 'el_api_key_abcdef12345678')).toBe(false);
  });
  it('does not match short value', () => {
    expect(matches('ElevenLabs API Key', 'ELEVENLABS_API_KEY=abc')).toBe(false);
  });
});

describe('Deepgram API Key', () => {
  it('matches DEEPGRAM_API_KEY assignment', () => {
    expect(matches('Deepgram API Key', 'DEEPGRAM_API_KEY=' + 'dg_api_key_abcdef12345678')).toBe(true);
  });
  it('matches quoted assignment', () => {
    expect(matches('Deepgram API Key', 'DEEPGRAM_API_KEY="' + 'deepgram_token_1234567890' + '"')).toBe(true);
  });
  it('does not match without env var name', () => {
    expect(matches('Deepgram API Key', 'API_KEY=' + 'dg_api_key_abcdef12345678')).toBe(false);
  });
  it('does not match short value', () => {
    expect(matches('Deepgram API Key', 'DEEPGRAM_API_KEY=abc')).toBe(false);
  });
});

describe('AssemblyAI API Key', () => {
  it('matches ASSEMBLYAI_API_KEY assignment', () => {
    expect(matches('AssemblyAI API Key', 'ASSEMBLYAI_API_KEY=' + 'asm_api_key_abcdef1234567')).toBe(true);
  });
  it('matches quoted assignment', () => {
    expect(matches('AssemblyAI API Key', 'ASSEMBLYAI_API_KEY="' + 'assemblyai_token_12345678' + '"')).toBe(true);
  });
  it('does not match without env var name', () => {
    expect(matches('AssemblyAI API Key', 'API_KEY=' + 'asm_api_key_abcdef1234567')).toBe(false);
  });
  it('does not match short value', () => {
    expect(matches('AssemblyAI API Key', 'ASSEMBLYAI_API_KEY=abc')).toBe(false);
  });
});

// ── Phase 6: Secret Formats & Vault Providers ────────────────────────────────

describe('Age Secret Key', () => {
  it('matches AGE-SECRET-KEY-1 prefix', () => {
    expect(matches('Age Secret Key', 'AGE-SECRET-KEY-1' + 'QWERTY1234ABCDEF5678QWERTY1234ABCDEF5678QWERTY1234ABCDEF56781A')).toBe(true);
  });
  it('matches another age secret key', () => {
    expect(matches('Age Secret Key', 'key: AGE-SECRET-KEY-1' + 'abcdefghijklmnopqrstuvwxyz1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ')).toBe(true);
  });
  it('does not match short value', () => {
    expect(matches('Age Secret Key', 'AGE-SECRET-KEY-1abc')).toBe(false);
  });
  it('does not match public key prefix', () => {
    expect(matches('Age Secret Key', 'age1qwerty1234abcdef5678')).toBe(false);
  });
});

describe('PFX Password', () => {
  it('matches PFX_PASSWORD assignment', () => {
    expect(matches('PFX Password', 'PFX_PASSWORD=' + 'MySecureP@ss1234')).toBe(true);
  });
  it('matches PKCS12_PASSWORD quoted', () => {
    expect(matches('PFX Password', 'PKCS12_PASSWORD="' + 'CertPass!2026' + '"')).toBe(true);
  });
  it('does not match without env var name', () => {
    expect(matches('PFX Password', 'PASSWORD=' + 'MySecureP@ss1234')).toBe(false);
  });
  it('does not match short value', () => {
    expect(matches('PFX Password', 'PFX_PASSWORD=abc')).toBe(false);
  });
});

describe('Doppler Service Token', () => {
  it('matches dp.st. prefix', () => {
    expect(matches('Doppler Service Token', 'dp.st.' + 'abcdef1234567890ABCDEF')).toBe(true);
  });
  it('matches in assignment context', () => {
    expect(matches('Doppler Service Token', 'DOPPLER_TOKEN=dp.st.' + 'xyzXYZ1234567890abcdef')).toBe(true);
  });
  it('does not match dp.ct. prefix', () => {
    expect(matches('Doppler Service Token', 'dp.ct.' + 'abcdef1234567890ABCDEF')).toBe(false);
  });
  it('does not match short value', () => {
    expect(matches('Doppler Service Token', 'dp.st.abc')).toBe(false);
  });
});

describe('Doppler CLI Token', () => {
  it('matches dp.ct. prefix', () => {
    expect(matches('Doppler CLI Token', 'dp.ct.' + 'abcdef1234567890ABCDEF')).toBe(true);
  });
  it('matches in config context', () => {
    expect(matches('Doppler CLI Token', 'token: dp.ct.' + 'longTokenValue1234567890')).toBe(true);
  });
  it('does not match dp.st. prefix', () => {
    expect(matches('Doppler CLI Token', 'dp.st.' + 'abcdef1234567890ABCDEF')).toBe(false);
  });
  it('does not match short value', () => {
    expect(matches('Doppler CLI Token', 'dp.ct.abc')).toBe(false);
  });
});

describe('Doppler Project Token', () => {
  it('matches dp.pt. prefix', () => {
    expect(matches('Doppler Project Token', 'dp.pt.' + 'abcdef1234567890ABCDEF')).toBe(true);
  });
  it('matches in quoted context', () => {
    expect(matches('Doppler Project Token', '"dp.pt.' + 'ProjectToken12345678ab"')).toBe(true);
  });
  it('does not match dp.st. prefix', () => {
    expect(matches('Doppler Project Token', 'dp.st.' + 'abcdef1234567890ABCDEF')).toBe(false);
  });
  it('does not match short value', () => {
    expect(matches('Doppler Project Token', 'dp.pt.abc')).toBe(false);
  });
});

describe('1Password Service Account Token', () => {
  it('matches ops_ prefix with base64', () => {
    expect(matches('1Password Service Account Token', 'ops_' + 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnop==')).toBe(true);
  });
  it('matches in assignment', () => {
    expect(matches('1Password Service Account Token', 'TOKEN=ops_' + 'xyzXYZ1234567890abcdefGHIJKLMNOPQRSTUVWXYZ+/')).toBe(true);
  });
  it('does not match short value', () => {
    expect(matches('1Password Service Account Token', 'ops_abc123')).toBe(false);
  });
  it('does not match without ops_ prefix', () => {
    expect(matches('1Password Service Account Token', 'op_' + 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnop==')).toBe(false);
  });
});

describe('1Password Connect Token', () => {
  it('matches OP_CONNECT_TOKEN assignment', () => {
    expect(matches('1Password Connect Token', 'OP_CONNECT_TOKEN=' + 'eyJhbGciOiJFUzI1NiIsInR5c')).toBe(true);
  });
  it('matches quoted assignment', () => {
    expect(matches('1Password Connect Token', 'OP_CONNECT_TOKEN="' + 'connect_token_value_12345' + '"')).toBe(true);
  });
  it('does not match without env var name', () => {
    expect(matches('1Password Connect Token', 'CONNECT_TOKEN=' + 'eyJhbGciOiJFUzI1NiIsInR5c')).toBe(false);
  });
  it('does not match short value', () => {
    expect(matches('1Password Connect Token', 'OP_CONNECT_TOKEN=abc')).toBe(false);
  });
});

describe('Infisical Service Token', () => {
  it('matches with INFISICAL context', () => {
    expect(matches('Infisical Service Token', 'INFISICAL=st.' + 'abcdef1234567890ABCDEF' + '.secretPart12')).toBe(true);
  });
  it('matches with infisical context (case-insensitive)', () => {
    expect(matches('Infisical Service Token', 'infisical=st.' + 'xyzXYZ1234567890abcdef' + '.anotherSegment')).toBe(true);
  });
  it('does not match without infisical context', () => {
    expect(matches('Infisical Service Token', 'TOKEN=st.' + 'abcdef1234567890ABCDEF' + '.secretPart12')).toBe(false);
  });
  it('does not match short first segment', () => {
    expect(matches('Infisical Service Token', 'INFISICAL=st.abc.secretPart12')).toBe(false);
  });
});

describe('Infisical API Key', () => {
  it('matches INFISICAL_API_KEY assignment', () => {
    expect(matches('Infisical API Key', 'INFISICAL_API_KEY=' + 'inf_apikey_abcdef12345678')).toBe(true);
  });
  it('matches INFISICAL_TOKEN assignment', () => {
    expect(matches('Infisical API Key', 'INFISICAL_TOKEN="' + 'infisical_token_1234567890' + '"')).toBe(true);
  });
  it('does not match without env var name', () => {
    expect(matches('Infisical API Key', 'API_KEY=' + 'inf_apikey_abcdef12345678')).toBe(false);
  });
  it('does not match short value', () => {
    expect(matches('Infisical API Key', 'INFISICAL_API_KEY=abc')).toBe(false);
  });
});

describe('Vault Batch Token', () => {
  it('matches hvb. prefix', () => {
    expect(matches('Vault Batch Token', 'hvb.' + 'ABCDEF1234567890abcdef')).toBe(true);
  });
  it('matches in assignment', () => {
    expect(matches('Vault Batch Token', 'VAULT_TOKEN=hvb.' + 'batchTokenValue1234567890')).toBe(true);
  });
  it('does not match hvs. prefix', () => {
    expect(matches('Vault Batch Token', 'hvs.' + 'ABCDEF1234567890abcdef')).toBe(false);
  });
  it('does not match short value', () => {
    expect(matches('Vault Batch Token', 'hvb.abc')).toBe(false);
  });
});

describe('Vault Recovery Token', () => {
  it('matches hvr. prefix', () => {
    expect(matches('Vault Recovery Token', 'hvr.' + 'ABCDEF1234567890abcdef')).toBe(true);
  });
  it('matches in config context', () => {
    expect(matches('Vault Recovery Token', 'recovery: hvr.' + 'recoveryTokenValue12345678')).toBe(true);
  });
  it('does not match hvs. prefix', () => {
    expect(matches('Vault Recovery Token', 'hvs.' + 'ABCDEF1234567890abcdef')).toBe(false);
  });
  it('does not match short value', () => {
    expect(matches('Vault Recovery Token', 'hvr.abc')).toBe(false);
  });
});

describe('Vault Token Assignment', () => {
  it('matches VAULT_TOKEN assignment', () => {
    expect(matches('Vault Token Assignment', 'VAULT_TOKEN=' + 'hvs.CAESIMii29MBZNpqR')).toBe(true);
  });
  it('matches quoted assignment', () => {
    expect(matches('Vault Token Assignment', 'VAULT_TOKEN="' + 's.abcdef1234567890ABCDEF' + '"')).toBe(true);
  });
  it('does not match without VAULT_TOKEN name', () => {
    expect(matches('Vault Token Assignment', 'TOKEN=' + 'hvs.CAESIMii29MBZNpqR')).toBe(false);
  });
  it('does not match short value', () => {
    expect(matches('Vault Token Assignment', 'VAULT_TOKEN=abc')).toBe(false);
  });
});


// ── Pattern count sanity check ────────────────────────────────────────────────

describe('Airtable API Key', () => {
  it('matches standalone Airtable key', () => {
    expect(matches('Airtable API Key', '"key' + 'AbCdEfGhIjKlMnOpQ' + '"')).toBe(true);
  });
  it('matches key after delimiter', () => {
    expect(matches('Airtable API Key', '=key' + 'AbCdEfGhIjKlMnOpQ' + '\n')).toBe(true);
  });
  it('does not match camelCase JS identifiers like keySystemNoSession', () => {
    expect(matches('Airtable API Key', 'keySystemNoSession')).toBe(false);
  });
  it('does not match longer JS identifiers like keyIdToKeySessionPromise', () => {
    expect(matches('Airtable API Key', 'keyIdToKeySessionP')).toBe(false);
  });
  it('does not match key embedded in longer identifier', () => {
    expect(matches('Airtable API Key', 'mykey' + 'AbCdEfGhIjKlMnOpQ')).toBe(false);
  });
});

describe('PATTERNS array', () => {
  it('contains at least 50 patterns', () => {
    expect(PATTERNS.length).toBeGreaterThanOrEqual(50);
  });
  it('every pattern has required fields', () => {
    for (const p of PATTERNS) {
      expect(p.name).toBeTruthy();
      expect(p.pattern).toBeInstanceOf(RegExp);
      expect(['critical', 'warning', 'info']).toContain(p.severity);
      expect(p.description).toBeTruthy();
    }
  });
  it('all patterns have global flag', () => {
    for (const p of PATTERNS) {
      expect(p.pattern.global).toBe(true);
    }
  });
});
