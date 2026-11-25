import { describe, it, expect } from "vitest";
import {
  base32Decode,
  base32Encode,
  buildOtpAuthUri,
  decryptTotpSecret,
  encryptTotpSecret,
  generateBackupCodes,
  generateTotpCode,
  generateTotpSecret,
  hashBackupCodes,
  matchBackupCodeIndex,
  verifyTotpCode,
} from "../totp";
import {
  DEFAULT_SECURITY_POLICY,
  SECURITY_PERMISSIONS,
  checkRateLimit,
  clearRateLimit,
  detectMobileFromHeaders,
  evaluateAccessPolicy,
  is2FARequiredForUser,
  isIpAllowed,
  isValidIpOrCidrEntry,
  normalizeIp,
  recordFailedAttempt,
  shouldRequireDeviceApproval,
  shouldSkip2faOnApprovedDevice,
  shouldSkip2faOnOfficeIp,
  summarizeUserAgent,
} from "../security";

describe("TOTP 2FA & Secret Encryption", () => {
  it("round-trips Base32 encode/decode cleanly", () => {
    const raw = Buffer.from("HelloIMSGroupERP!", "utf8");
    const encoded = base32Encode(raw);
    expect(base32Decode(encoded).toString("utf8")).toBe("HelloIMSGroupERP!");
  });

  it("matches RFC 6238 SHA-1 test vector and verifies within ±1 step clock skew", () => {
    // RFC 6238 test secret ("12345678901234567890" -> GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ)
    const rfcSecret = base32Encode(Buffer.from("12345678901234567890", "ascii"));
    // T = 59s -> 94287082 -> 6-digit = 287082
    expect(generateTotpCode(rfcSecret, 59 * 1000)).toBe("287082");

    const now = 1_700_000_000_000;
    const secret = generateTotpSecret();
    const currentCode = generateTotpCode(secret, now);
    const prevCode = generateTotpCode(secret, now - 30_000);
    const oldCode = generateTotpCode(secret, now - 120_000);

    expect(verifyTotpCode(secret, currentCode, now)).toBe(true);
    expect(verifyTotpCode(secret, prevCode, now)).toBe(true);
    expect(verifyTotpCode(secret, oldCode, now)).toBe(false);
    expect(verifyTotpCode(secret, "abcdef", now)).toBe(false);
  });

  it("encrypts and decrypts TOTP secret with AES-256-GCM", () => {
    const secret = generateTotpSecret();
    const keySource = "test-session-secret-at-least-32-chars-long";
    const encrypted = encryptTotpSecret(secret, keySource);
    expect(encrypted).not.toContain(secret);
    expect(decryptTotpSecret(encrypted, keySource)).toBe(secret);
  });

  it("builds valid otpauth URI and verifies single-use backup recovery codes", async () => {
    const secret = generateTotpSecret();
    const uri = buildOtpAuthUri({
      issuer: "IMS GROUP ERP",
      accountName: "md@ims.com.bd",
      secret,
    });
    expect(uri).toContain("otpauth://totp/");
    expect(uri).toContain(`secret=${secret}`);

    const codes = generateBackupCodes(4);
    expect(codes).toHaveLength(4);
    expect(codes[0]).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);

    const hashes = await hashBackupCodes(codes);
    const idx = await matchBackupCodeIndex(codes[2].toLowerCase().replace("-", ""), hashes);
    expect(idx).toBe(2);
    expect(await matchBackupCodeIndex("WRONG-CODE", hashes)).toBe(-1);
  });
});

describe("IP Lock, CIDR Matching & Mobile Detection", () => {
  it("normalizes IPv4-mapped IPv6 and ports", () => {
    expect(normalizeIp("::ffff:103.112.54.10")).toBe("103.112.54.10");
    expect(normalizeIp("103.112.54.10:51234")).toBe("103.112.54.10");
    expect(normalizeIp("202.4.96.5, 10.0.0.1")).toBe("202.4.96.5");
  });

  it("validates exact IPs and IPv4 CIDR ranges", () => {
    expect(isValidIpOrCidrEntry("103.112.54.10")).toBe(true);
    expect(isValidIpOrCidrEntry("103.112.54.0/29")).toBe(true);
    expect(isValidIpOrCidrEntry("999.1.1.1")).toBe(false);
    expect(isValidIpOrCidrEntry("103.112.54.0/33")).toBe(false);
    expect(isValidIpOrCidrEntry("not-an-ip")).toBe(false);
  });

  it("matches exact IP and IPv4 CIDR subnets accurately", () => {
    const allow = ["103.112.54.10", "202.4.96.0/29"];
    expect(isIpAllowed("103.112.54.10", allow, { allowLocalhostInDev: false })).toBe(true);
    expect(isIpAllowed("::ffff:202.4.96.5", allow, { allowLocalhostInDev: false })).toBe(true);
    expect(isIpAllowed("202.4.96.9", allow, { allowLocalhostInDev: false })).toBe(false);
    expect(isIpAllowed("198.51.100.1", allow, { allowLocalhostInDev: false })).toBe(false);
  });

  it("detects mobile devices from headers and summarizes user agents", () => {
    const iphoneUa =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1";
    const winChromeUa =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36";

    expect(detectMobileFromHeaders(iphoneUa, null)).toBe(true);
    expect(detectMobileFromHeaders(winChromeUa, "?1")).toBe(true);
    expect(detectMobileFromHeaders(winChromeUa, "?0")).toBe(false);
    expect(summarizeUserAgent(iphoneUa)).toBe("Safari on iPhone");
    expect(summarizeUserAgent(winChromeUa)).toBe("Chrome on Windows");
  });
});

describe("Role-Based Security Policy & Rate Limiting", () => {
  const strictPolicy = {
    ...DEFAULT_SECURITY_POLICY,
    ipLockEnabled: true,
    allowedIps: ["103.112.54.10"],
    mobileLockEnabled: true,
    enforce2faSensitive: true,
    allowSuperAdminBypass: true,
  };

  it("requires 2FA for Super Admin, MD, Directors, Accounts, and all Financial Report users (e.g. Polok, Rakib, scoped KAMs)", () => {
    const superAdmin = { id: "1", priorityLevel: 5, role: { key: "super_admin", permissions: ["admin.users"] } };
    const md = { id: "2", priorityLevel: 4, role: { key: "md", permissions: ["req.md"] } };
    const director = { id: "3", priorityLevel: 4, role: { key: "director", permissions: ["req.director"] } };
    const accounts = { id: "4", priorityLevel: 3, role: { key: "accounts_executive", permissions: ["req.execute"] } };
    const srManager = { id: "6", priorityLevel: 4, role: { key: "sr_manager", isManager: true, permissions: ["req.approve"] } };
    const kamWithReports = { id: "7", priorityLevel: 3, role: { key: "executive", permissions: ["req.create"] }, extraPermissions: ["report.view"] };
    const managerNoReports = { id: "8", priorityLevel: 3, role: { key: "manager", isManager: true, permissions: ["req.approve"] }, extraPermissions: ["report.none"] };
    const staff = { id: "5", priorityLevel: 2, role: { key: "executive", permissions: ["req.create"] } };
    const flaggedStaff = { ...staff, extraPermissions: [SECURITY_PERMISSIONS.REQUIRE_2FA] };

    expect(is2FARequiredForUser(superAdmin, strictPolicy)).toBe(true);
    expect(is2FARequiredForUser(md, strictPolicy)).toBe(true);
    expect(is2FARequiredForUser(director, strictPolicy)).toBe(true);
    expect(is2FARequiredForUser(accounts, strictPolicy)).toBe(true);
    expect(is2FARequiredForUser(srManager, strictPolicy)).toBe(true);
    expect(is2FARequiredForUser(kamWithReports, strictPolicy)).toBe(true);
    expect(is2FARequiredForUser(managerNoReports, strictPolicy)).toBe(false);
    expect(is2FARequiredForUser(staff, strictPolicy)).toBe(false);
    expect(is2FARequiredForUser(flaggedStaff, strictPolicy)).toBe(true);
  });

  it("blocks remote IP and mobile for Accounts/Staff while allowing MD/Directors/Super Admin & per-user overrides", () => {
    const md = { id: "2", priorityLevel: 4, role: { key: "md", permissions: ["req.md"] } };
    const accounts = { id: "4", priorityLevel: 3, role: { key: "accounts_executive", permissions: ["req.execute"] } };
    const exemptedAccounts = {
      ...accounts,
      extraPermissions: [SECURITY_PERMISSIONS.ALLOW_REMOTE_IP, SECURITY_PERMISSIONS.ALLOW_MOBILE],
    };

    // MD can approve remotely on mobile
    expect(
      evaluateAccessPolicy({
        user: md,
        policy: strictPolicy,
        ip: "185.10.20.30",
        isMobile: true,
        allowLocalhostInDev: false,
      })
    ).toEqual({ allowed: true });

    // Accounts blocked on mobile
    const mobBlock = evaluateAccessPolicy({
      user: accounts,
      policy: strictPolicy,
      ip: "103.112.54.10",
      isMobile: true,
      allowLocalhostInDev: false,
    });
    expect(mobBlock.allowed).toBe(false);
    if (!mobBlock.allowed) expect(mobBlock.code).toBe("MOBILE_BLOCKED");

    // Accounts blocked off-office IP on desktop
    const ipBlock = evaluateAccessPolicy({
      user: accounts,
      policy: strictPolicy,
      ip: "185.10.20.30",
      isMobile: false,
      allowLocalhostInDev: false,
    });
    expect(ipBlock.allowed).toBe(false);
    if (!ipBlock.allowed) expect(ipBlock.code).toBe("IP_BLOCKED");

    // Accounts allowed on office IP desktop
    expect(
      evaluateAccessPolicy({
        user: accounts,
        policy: strictPolicy,
        ip: "103.112.54.10",
        isMobile: false,
        allowLocalhostInDev: false,
      })
    ).toEqual({ allowed: true });

    // Exempted user allowed anywhere
    expect(
      evaluateAccessPolicy({
        user: exemptedAccounts,
        policy: strictPolicy,
        ip: "185.10.20.30",
        isMobile: true,
        allowLocalhostInDev: false,
      })
    ).toEqual({ allowed: true });
  });

  it("enforces sliding-window brute-force rate limit and clears cleanly", () => {
    const key = "test:rate:key";
    clearRateLimit(key);
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit(key, 5, 60_000, 1000).allowed).toBe(true);
      recordFailedAttempt(key, 60_000, 1000);
    }
    const blocked = checkRateLimit(key, 5, 60_000, 2000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);

    clearRateLimit(key);
    expect(checkRateLimit(key, 5, 60_000, 2000).allowed).toBe(true);
  });

  it("enforces Trusted Device Approval for MD/Directors/Staff while allowing smooth 2FA skip on approved devices", () => {
    const devicePolicy = {
      ...DEFAULT_SECURITY_POLICY,
      deviceApprovalEnabled: true,
      approvedDeviceSkips2fa: true,
      allowSuperAdminBypass: true,
    };
    const superAdmin = { id: "1", priorityLevel: 5, role: { key: "super_admin", permissions: ["admin.users"] } };
    const md = { id: "2", priorityLevel: 4, role: { key: "md", permissions: ["req.md"] } };
    const bypassedUser = {
      id: "9",
      priorityLevel: 3,
      role: { key: "manager", permissions: [] },
      extraPermissions: [SECURITY_PERMISSIONS.BYPASS_DEVICE_APPROVAL],
    };

    expect(shouldRequireDeviceApproval(superAdmin, devicePolicy)).toBe(false);
    expect(shouldRequireDeviceApproval(md, devicePolicy)).toBe(true);
    expect(shouldRequireDeviceApproval(bypassedUser, devicePolicy)).toBe(false);
    expect(shouldRequireDeviceApproval(md, DEFAULT_SECURITY_POLICY)).toBe(false);

    expect(shouldSkip2faOnApprovedDevice(devicePolicy, "APPROVED")).toBe(true);
    expect(shouldSkip2faOnApprovedDevice(devicePolicy, "PENDING")).toBe(false);
    expect(
      shouldSkip2faOnApprovedDevice({ ...devicePolicy, approvedDeviceSkips2fa: false }, "APPROVED")
    ).toBe(false);

    const officeSkipPolicy = {
      ...devicePolicy,
      allowedIps: ["103.112.54.10"],
      skip2faOnOfficeIp: true,
    };
    expect(shouldSkip2faOnOfficeIp(officeSkipPolicy, "103.112.54.10")).toBe(true);
    expect(shouldSkip2faOnOfficeIp(officeSkipPolicy, "185.10.20.30")).toBe(false);
    expect(shouldSkip2faOnOfficeIp({ ...officeSkipPolicy, allowedIps: [] }, "127.0.0.1")).toBe(false);
  });
});
