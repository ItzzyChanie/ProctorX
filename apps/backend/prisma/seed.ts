import bcrypt from 'bcrypt'
import { PrismaClient, Role } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const email = process.env.SEED_DEAN_EMAIL
  const password = process.env.SEED_DEAN_PASSWORD
  const fullName = process.env.SEED_DEAN_FULLNAME
  if (!email || !password || !fullName) throw new Error('SEED_DEAN_EMAIL, SEED_DEAN_PASSWORD, and SEED_DEAN_FULLNAME are required')
  await prisma.user.upsert({
    where: { loginId: email.toLowerCase() },
    update: { email: email.toLowerCase(), fullName, role: Role.DEAN, passwordHash: await bcrypt.hash(password, 12), mustChangePassword: true, isActive: true },
    create: { loginId: email.toLowerCase(), email: email.toLowerCase(), fullName, role: Role.DEAN, passwordHash: await bcrypt.hash(password, 12), mustChangePassword: true },
  })
}
main().then(() => prisma.$disconnect()).catch(async (error) => { console.error(error); await prisma.$disconnect(); process.exit(1) })
