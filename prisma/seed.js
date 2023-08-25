import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const randomExam = () => ({
        name: `Exam-${Math.floor(Math.random() * 10000)}`,
        description: `Description for Exam-${Math.floor(Math.random() * 10000)}`,
        venue: `Venue-${Math.floor(Math.random() * 100)}`,
        time: new Date(),
        duration: Math.floor(Math.random() * 4) + 1 // random duration between 1 to 4
    });

    const exams = Array.from({ length: 50 }).map(randomExam);

    await prisma.exam.createMany({
        data: exams,
        skipDuplicates: true,  // This option requires Prisma 2.16.0 or later
    });
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });