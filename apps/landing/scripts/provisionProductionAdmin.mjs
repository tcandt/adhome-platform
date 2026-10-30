import fs from 'node:fs';
import { PrismaClient } from '@prisma/client';
import {
  generateStrongPassword,
  hashPassword,
  validatePasswordPolicy,
} from '../server/passwordHash.ts';
import { loadAdhomeEnv } from '../server/envLoader.js';

loadAdhomeEnv();

/**
 * Provision / maintain the production Console administrator.
 *
 * Security properties:
 *  - NEVER deletes or queries LeadInquiry rows (zero heuristic purge).
 *  - NEVER flips isActive unless --force-activate or --deactivate is given.
 *  - Password is per-account, hashed with scrypt; there is no default password.
 *  - Password is NEVER printed to stdout/stderr or written into evidence files.
 *  - Setting a new password increments sessionVersion → every existing JWT for
 *    this account is invalidated immediately.
 *
 * Usage (on the production host):
 *   # Option A — supply password via environment variable (recommended, e.g. from a secret manager)
 *   $env:ADHOME_ADMIN_NEW_PASSWORD = '<strong password>'
 *   node apps/landing/scripts/provisionProductionAdmin.mjs --set-password-from-env
 *
 *   # Option B — generate a random password and write it to a file readable only by the operator
 *   node apps/landing/scripts/provisionProductionAdmin.mjs --generate-password --output-file=C:\secure\adhome-admin.txt
 *
 *   Other flags: --email=<addr>  --force-activate  --deactivate
 */

const prisma = new PrismaClient({
  datasources: {
    db: {
      url:
        process.env.DATABASE_URL ||
        'postgresql://postgres:postgres@127.0.0.1:5432/adhome_v2?schema=public',
    },
  },
});

export const PROD_ADMIN_ID = 'usr-admin-prod';
export const DEFAULT_PROD_ADMIN_EMAIL = 'admin@adhome.ductinh.one';
export const DEV_SAMPLE_ACTOR_IDS = [
  'usr-admin-01',
  'usr-mgr-lk01',
  'usr-viewer-01',
  'usr-other-org-01',
];

const PROD_ADMIN_PROFILE = {
  orgId: 'org-adhome-anphu',
  role: 'ADMIN',
  permissions: ['rooms.publish.write', 'rooms.read', 'leads.read', 'system.admin'],
  buildingScopes: ['*'],
};

/**
 * @param {{ email?: string, newPassword?: string | null, forceActivate?: boolean, deactivate?: boolean }} options
 */
export async function provisionProductionAdmin({
  email = DEFAULT_PROD_ADMIN_EMAIL,
  newPassword = null,
  forceActivate = false,
  deactivate = false,
} = {}) {
  if (forceActivate && deactivate) {
    throw new Error('--force-activate and --deactivate are mutually exclusive.');
  }

  let passwordHash = null;
  if (newPassword !== null) {
    const policy = validatePasswordPolicy(newPassword);
    if (!policy.ok) {
      throw new Error(`New password rejected by policy: ${policy.reason}`);
    }
    passwordHash = await hashPassword(newPassword);
  }

  const existing = await prisma.consoleActor.findUnique({ where: { id: PROD_ADMIN_ID } });

  let prodAdmin;
  if (!existing) {
    if (!passwordHash) {
      throw new Error(
        'Refusing to create the production admin without a password. Use --set-password-from-env or --generate-password.'
      );
    }
    prodAdmin = await prisma.consoleActor.create({
      data: {
        id: PROD_ADMIN_ID,
        email,
        ...PROD_ADMIN_PROFILE,
        sessionVersion: 1,
        isActive: !deactivate,
        passwordHash,
        passwordUpdatedAt: new Date(),
      },
    });
    console.log(`[Created] ${prodAdmin.id} (${prodAdmin.email}) | Active: ${prodAdmin.isActive} | Password: set`);
  } else {
    const nextActive = forceActivate ? true : deactivate ? false : existing.isActive;
    prodAdmin = await prisma.consoleActor.update({
      where: { id: PROD_ADMIN_ID },
      data: {
        email,
        ...PROD_ADMIN_PROFILE,
        isActive: nextActive,
        ...(passwordHash
          ? {
              passwordHash,
              passwordUpdatedAt: new Date(),
              // Password change invalidates every previously issued token for this account.
              sessionVersion: { increment: 1 },
            }
          : {}),
      },
    });
    console.log(
      `[Updated] ${prodAdmin.id} (${prodAdmin.email}) | Active: ${prodAdmin.isActive}` +
        ` (${forceActivate || deactivate ? 'explicitly changed' : 'preserved'})` +
        ` | Password: ${passwordHash ? 'rotated (sessions invalidated)' : prodAdmin.passwordHash ? 'unchanged' : 'NOT SET — login impossible'}`
    );
  }

  // Development sample actors stay deactivated (they have no password and can never log in anyway).
  const deactivation = await prisma.consoleActor.updateMany({
    where: { id: { in: DEV_SAMPLE_ACTOR_IDS }, isActive: true },
    data: { isActive: false },
  });

  const allActors = await prisma.consoleActor.findMany({ orderBy: { id: 'asc' } });
  console.log('\n--- Console actor security state ---');
  for (const a of allActors) {
    const tag = DEV_SAMPLE_ACTOR_IDS.includes(a.id) ? '[DEV SAMPLE]' : '[PRODUCTION]';
    console.log(
      `  ${tag} ${a.id} | ${a.email} | ${a.role} | active=${a.isActive} | password=${a.passwordHash ? 'set' : 'none'} | sessionVersion=${a.sessionVersion}`
    );
  }

  return {
    prodAdminId: prodAdmin.id,
    prodAdminActive: prodAdmin.isActive,
    prodAdminPasswordSet: Boolean(prodAdmin.passwordHash),
    sampleActorsDeactivatedNow: deactivation.count,
    sampleActorsAllInactive: allActors
      .filter((a) => DEV_SAMPLE_ACTOR_IDS.includes(a.id))
      .every((a) => !a.isActive),
  };
}

function readArg(name) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

if (process.argv[1] && process.argv[1].endsWith('provisionProductionAdmin.mjs')) {
  (async () => {
    const email = (readArg('email') || DEFAULT_PROD_ADMIN_EMAIL).trim().toLowerCase();
    const forceActivate = process.argv.includes('--force-activate');
    const deactivate = process.argv.includes('--deactivate');
    let newPassword = null;

    if (process.argv.includes('--set-password-from-env')) {
      newPassword = process.env.ADHOME_ADMIN_NEW_PASSWORD ?? '';
      if (!newPassword) {
        throw new Error('ADHOME_ADMIN_NEW_PASSWORD is empty. Refusing to continue.');
      }
    } else if (process.argv.includes('--generate-password')) {
      const outFile = readArg('output-file');
      if (!outFile) {
        throw new Error('--generate-password requires --output-file=<path>. The password is never printed.');
      }
      if (fs.existsSync(outFile)) {
        throw new Error(`Refusing to overwrite existing file: ${outFile}`);
      }
      newPassword = generateStrongPassword();
      fs.writeFileSync(outFile, `${newPassword}\n`, { encoding: 'utf-8', mode: 0o600, flag: 'wx' });
      console.log(`[Password] Generated and written to ${outFile} (move it to a password manager, then delete the file).`);
    }

    const result = await provisionProductionAdmin({ email, newPassword, forceActivate, deactivate });
    console.log('\nResult:', JSON.stringify(result));
    await prisma.$disconnect();
  })().catch(async (err) => {
    console.error(`[provisionProductionAdmin] ${err.message}`);
    await prisma.$disconnect();
    process.exit(1);
  });
}
