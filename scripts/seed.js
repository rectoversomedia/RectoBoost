import { prisma } from "../lib/db.js";
import { hashPassword } from "../lib/password.js";

const email = "test@rectoboost.com";

async function main() {
  const user = await prisma.user.upsert({
    where: { email },
    update: {
      fullName: "Fajar Pahlawan H.",
      isActive: true
    },
    create: {
      email,
      passwordHash: hashPassword("rectoboost"),
      fullName: "Fajar Pahlawan H.",
      username: "fajarpahlawan",
      role: "MEMBER",
      isActive: true
    }
  });

  await prisma.wallet.upsert({
    where: { userId: user.id },
    update: {},
    create: {
      userId: user.id,
      balance: 2475000,
      currency: "IDR"
    }
  });

  await prisma.notification.deleteMany({
    where: {
      userId: user.id,
      title: {
        in: ["Welcome to RectoBoost", "Service sync"]
      }
    }
  });

  await prisma.notification.createMany({
    data: [
      {
        userId: user.id,
        title: "Welcome to RectoBoost",
        message: "Your testing account is ready.",
        type: "info"
      },
      {
        userId: user.id,
        title: "Service sync",
        message: "Connect SMMWIZ services from the dashboard API.",
        type: "service"
      }
    ],
    skipDuplicates: true
  });

  console.log(`Seeded testing user: ${email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
