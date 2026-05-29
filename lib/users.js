import { prisma } from "./db.js";

const testingEmail = "test@rectoboost.com";

export async function getCurrentUser() {
  const user = await prisma.user.findUnique({
    where: { email: testingEmail },
    include: { wallet: true }
  });

  if (!user) {
    throw new Error("Testing user is not seeded yet. Run npm run db:seed first.");
  }

  return user;
}
