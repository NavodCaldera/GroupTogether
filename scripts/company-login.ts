// Gives a signed-up user a company's dashboard, or takes it away:
//   npm run company:login -- person@example.com hemas
//   npm run company:login -- person@example.com --remove
import { db } from "../src/server/db";

const [email, slug] = process.argv.slice(2);
if (!email || !slug) {
  console.error("Usage: npm run company:login -- <email> <company-slug | --remove>");
  process.exit(1);
}
const company =
  slug === "--remove"
    ? null
    : await db.company.findUnique({ where: { slug }, select: { id: true } });
if (slug !== "--remove" && !company) {
  console.error(`No company "${slug}".`);
  process.exit(1);
}
const { count } = await db.user.updateMany({
  where: { email },
  data: { companyId: company?.id ?? null },
});
console.log(
  count
    ? `${email} ${company ? `now manages ${slug}` : "no longer manages a company"}.`
    : `No user ${email}.`,
);
await db.$disconnect();
