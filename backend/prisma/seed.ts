import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

/**
 * Bootstraps exactly what can't come from self-signup: the University row
 * itself, and its first UNIVERSITY_ADMIN account. Everything downstream
 * (faculties, departments, courses, offerings, lecturer verification) is
 * then done through the /admin routes by that admin -- this script is only
 * ever needed once per university, not per semester.
 *
 * Run with: npx ts-node prisma/seed.ts
 * (or wire into package.json as "prisma": { "seed": "ts-node prisma/seed.ts" })
 */
async function main() {
  const domain = process.env.SEED_UNIVERSITY_DOMAIN || 'example-university.edu';
  const adminEmail = process.env.SEED_ADMIN_EMAIL || `admin@${domain}`;
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'changeme123';

  const university = await prisma.university.upsert({
    where: { domain },
    update: {},
    create: { name: process.env.SEED_UNIVERSITY_NAME || 'Example University', domain },
  });

  const passwordHash = await bcrypt.hash(adminPassword, 10);

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      name: 'Initial University Admin',
      email: adminEmail,
      passwordHash,
      role: Role.UNIVERSITY_ADMIN,
      universityId: university.id,
      verified: true,
    },
  });

  console.log('Seeded university:', university.name, university.domain);
  console.log('Seeded admin login:', admin.email, '(password:', adminPassword, ')');
  console.log('IMPORTANT: change this password immediately after first login.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
