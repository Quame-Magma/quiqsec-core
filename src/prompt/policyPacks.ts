import type { VerificationControl } from "../types.js";

export interface PromptPolicyPack {
  id: string;
  label: string;
  keywords: RegExp[];
  policies: string[];
  controls: VerificationControl[];
}

export const basePolicies = [
  "Treat all external input as untrusted.",
  "Validate and sanitize inputs at trust boundaries.",
  "Use least privilege for data access and service permissions.",
  "Remove or mask secrets before logging. Do not hardcode secrets, tokens, credentials, or private keys.",
  "Prefer secure defaults and fail closed when security state is ambiguous.",
  "Use clear error handling that does not leak sensitive implementation details."
];

export const policyPacks: PromptPolicyPack[] = [
  {
    id: "auth",
    label: "Authentication and sessions",
    keywords: [
      /\bauth\b/i,
      /\blogin\b/i,
      /\bsign\s?in\b/i,
      /\bsign\s?up\b/i,
      /\bregister\b/i,
      /\bsession\b/i,
      /\bpassword\b/i,
      /\bjwt\b/i,
      /\boauth\b/i
    ],
    policies: [
      "Hash passwords with a modern password hashing algorithm before storage.",
      "Validate credentials using safe password hashing and parameterized queries or safe ORM calls.",
      "Use secure, HttpOnly, SameSite cookies for browser sessions.",
      "Apply rate limiting and brute-force protection to credential endpoints.",
      "Avoid user enumeration in authentication responses."
    ],
    controls: [
      {
        id: "auth-password-hashing",
        category: "auth",
        description: "Password handling should use a modern hashing function.",
        evidencePatterns: ["bcrypt", "argon2", "scrypt", "pbkdf2"],
        fix: "Hash passwords with bcrypt, argon2, scrypt, or PBKDF2 before storage."
      },
      {
        id: "auth-rate-limit",
        category: "auth",
        description: "Authentication endpoints should include rate limiting.",
        evidencePatterns: ["rateLimit", "express-rate-limit", "limiter", "throttle"],
        fix: "Add rate limiting to login, signup, password reset, and token endpoints."
      },
      {
        id: "auth-secure-cookie",
        category: "auth",
        description: "Session cookies should be Secure and HttpOnly.",
        evidencePatterns: ["httpOnly\\s*:\\s*true", "secure\\s*:\\s*true", "sameSite"],
        fix: "Set session cookies with httpOnly, secure in production, and SameSite."
      }
    ]
  },
  {
    id: "database",
    label: "Database access",
    keywords: [
      /\bsql\b/i,
      /\bdatabase\b/i,
      /\bpostgres\b/i,
      /\bmysql\b/i,
      /\bsupabase\b/i,
      /\bquery\b/i,
      /\bprisma\b/i,
      /\bdrizzle\b/i,
      /\borm\b/i
    ],
    policies: [
      "Use parameterized queries, prepared statements, or safe ORM methods.",
      "Never concatenate untrusted input into SQL or query strings.",
      "Enforce authorization checks before returning user-owned records.",
      "Avoid returning sensitive columns unless explicitly required."
    ],
    controls: [
      {
        id: "db-parameterized-query",
        category: "database",
        description: "Database access should use parameterized queries or safe ORM methods.",
        evidencePatterns: ["\\$1", "\\?", "where\\s*:", "prisma\\.", "drizzle", "sql`"],
        fix: "Use parameterized queries, prepared statements, or a safe ORM query builder."
      },
      {
        id: "db-authorization-scope",
        category: "database",
        description: "Queries for user-owned data should include authorization scoping.",
        evidencePatterns: ["userId", "ownerId", "tenantId", "auth\\.user", "session\\.user", "getUser"],
        fix: "Scope queries by authenticated user, tenant, or explicit authorization checks."
      }
    ]
  },
  {
    id: "api",
    label: "HTTP API",
    keywords: [
      /\bapi\b/i,
      /\bendpoint\b/i,
      /\broute\b/i,
      /\bexpress\b/i,
      /\bfastify\b/i,
      /\bnext\.?js\b/i,
      /\bhandler\b/i,
      /\bcontroller\b/i
    ],
    policies: [
      "Validate request body, params, and query data with a schema or equivalent checks.",
      "Apply authorization checks before sensitive operations.",
      "Use safe status codes and avoid leaking internal errors.",
      "Set security headers for browser-facing APIs."
    ],
    controls: [
      {
        id: "api-input-validation",
        category: "api",
        description: "API endpoints should validate body, params, or query data.",
        evidencePatterns: ["zod", "joi", "yup", "valibot", "safeParse", "parse\\(", "validate"],
        fix: "Validate request data with a schema before using it."
      }
    ]
  },
  {
    id: "payments",
    label: "Payments and billing",
    keywords: [
      /\bstripe\b/i,
      /\bpayment\b/i,
      /\bcheckout\b/i,
      /\bbilling\b/i,
      /\bwebhook\b/i,
      /\binvoice\b/i,
      /\bsubscription\b/i
    ],
    policies: [
      "Never trust client-provided price, quantity, customer, or entitlement data.",
      "Verify webhook signatures before processing payment events.",
      "Use idempotency for payment-side effects.",
      "Do not log payment secrets, webhook secrets, or full customer payment data."
    ],
    controls: [
      {
        id: "payment-webhook-signature",
        category: "payments",
        description: "Payment webhooks should verify provider signatures.",
        evidencePatterns: ["constructEvent", "webhook\\.secret", "stripe-signature", "verifySignature"],
        fix: "Verify payment provider webhook signatures before processing events."
      },
      {
        id: "payment-idempotency",
        category: "payments",
        description: "Payment side effects should use idempotency or duplicate-event protection.",
        evidencePatterns: ["idempotency", "event\\.id", "processedEvents", "unique"],
        fix: "Store processed event IDs or use idempotency keys for payment side effects."
      }
    ]
  },
  {
    id: "file-upload",
    label: "File upload and storage",
    keywords: [
      /\bupload\b/i,
      /\bfile\b/i,
      /\bimage\b/i,
      /\bstorage\b/i,
      /\bs3\b/i,
      /\bbucket\b/i,
      /\bmulter\b/i
    ],
    policies: [
      "Validate file size, type, and extension before storage.",
      "Do not use user-controlled paths directly.",
      "Store uploads outside executable/static code paths unless explicitly safe.",
      "Scan or restrict risky file types."
    ],
    controls: [
      {
        id: "file-size-limit",
        category: "file-upload",
        description: "Uploads should enforce a size limit.",
        evidencePatterns: ["fileSize", "limits", "MAX_FILE", "maxSize"],
        fix: "Add explicit upload size limits."
      },
      {
        id: "file-type-validation",
        category: "file-upload",
        description: "Uploads should validate MIME type or extension.",
        evidencePatterns: ["mime", "mimetype", "fileType", "allowedTypes", "extension"],
        fix: "Validate uploaded file types and reject unexpected formats."
      }
    ]
  },
  {
    id: "secrets",
    label: "Secrets and environment variables",
    keywords: [
      /\bsecret\b/i,
      /\bapi\s?key\b/i,
      /\btoken\b/i,
      /\bcredential\b/i,
      /\benv\b/i,
      /\bprivate key\b/i
    ],
    policies: [
      "Read secrets from environment variables or a secret manager.",
      "Never include real secrets in generated code, logs, tests, or examples.",
      "Mask sensitive values in errors and telemetry."
    ],
    controls: [
      {
        id: "secret-env-usage",
        category: "secrets",
        description: "Secrets should be loaded from environment variables or a secret manager.",
        evidencePatterns: ["process\\.env", "Deno\\.env", "import\\.meta\\.env", "secretManager", "vault"],
        fix: "Load secrets from environment variables or a secret manager."
      },
      {
        id: "secret-not-logged",
        category: "secrets",
        description: "Secrets should not be logged.",
        evidencePatterns: ["mask", "redact", "sanitize"],
        fix: "Mask or redact secrets before logging or returning errors."
      }
    ]
  },
  {
    id: "frontend",
    label: "Frontend and browser rendering",
    keywords: [
      /\breact\b/i,
      /\bvue\b/i,
      /\bfrontend\b/i,
      /\bcomponent\b/i,
      /\bhtml\b/i,
      /\bdom\b/i,
      /\binnerhtml\b/i
    ],
    policies: [
      "Avoid unsafe HTML injection APIs unless input is sanitized.",
      "Encode or escape user-controlled content before rendering.",
      "Do not expose secrets or private environment values to browser code."
    ],
    controls: [
      {
        id: "frontend-safe-rendering",
        category: "frontend",
        description: "User-controlled content should be rendered safely.",
        evidencePatterns: ["textContent", "escape", "sanitize", "DOMPurify"],
        fix: "Render user content with textContent/escaped output or sanitize trusted HTML."
      }
    ]
  }
];
