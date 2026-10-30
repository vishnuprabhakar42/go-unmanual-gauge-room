import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth, { CredentialsSignin, type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Nodemailer from "next-auth/providers/nodemailer";
import { z } from "zod";
import { prisma } from "@/server/db";
import { emailProvider } from "@/server/notify/email";
import { renderTemplate } from "@/server/notify/templates";
import { verifyPassword } from "@/server/passwords";
import { AUTH_LIMITS, rateLimit } from "@/server/rate-limit";
import { ipFromHeaders } from "@/server/request";

declare module "next-auth" {
  interface Session {
    user: { id: string } & DefaultSession["user"];
  }
}

class RateLimitedSignin extends CredentialsSignin {
  code = "rate_limited";
}

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma as unknown as Parameters<typeof PrismaAdapter>[0]),
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  trustHost: true,
  pages: { signIn: "/login", verifyRequest: "/login/check-email", error: "/login" },
  providers: [
    Credentials({
      credentials: { email: { label: "Email" }, password: { label: "Password", type: "password" } },
      async authorize(raw, request) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;
        const ip = ipFromHeaders(request.headers) ?? "unknown";
        const { limit, windowMs } = AUTH_LIMITS.login;
        if (!rateLimit(`login:${ip}:${email}`, limit, windowMs).ok) throw new RateLimitedSignin();

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user?.passwordHash || user.archivedAt) return null;
        if (!(await verifyPassword(password, user.passwordHash))) return null;
        return { id: user.id, email: user.email, name: user.name };
      },
    }),
    Nodemailer({
      // Delivery goes through our EmailProvider (SMTP/Mailpit, or console in dev).
      server: { host: "localhost", port: 1025 },
      from: process.env.EMAIL_FROM,
      maxAge: 24 * 60 * 60,
      async sendVerificationRequest({ identifier, url }) {
        const rendered = renderTemplate("auth.magicLink", { url, host: new URL(url).host });
        await emailProvider().send({ to: identifier, ...rendered.email! });
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account, email }) {
      if (account?.provider !== "nodemailer") return true;
      const address = (user.email ?? "").toLowerCase();
      if (email?.verificationRequest) {
        const { limit, windowMs } = AUTH_LIMITS.magicLink;
        if (!rateLimit(`magic:${address}`, limit, windowMs).ok) return "/login?error=rate_limited";
      }
      // Magic links never create accounts: only existing, active users may sign in this way.
      const existing = await prisma.user.findUnique({ where: { email: address } });
      return !!existing && !existing.archivedAt;
    },
    async jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      return token;
    },
    async session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
});
