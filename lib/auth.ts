import type { NextAuthOptions } from "next-auth";

const wcaBaseUrl = process.env.WCA_BASE_URL ?? "https://www.worldcubeassociation.org";

export const authOptions: NextAuthOptions = {
  providers: [{
    id: "wca",
    name: "WCA",
    type: "oauth",
    authorization: { url: `${wcaBaseUrl}/oauth/authorize`, params: { scope: "public manage_competitions" } },
    token: `${wcaBaseUrl}/oauth/token`,
    userinfo: `${wcaBaseUrl}/api/v0/me`,
    clientId: process.env.WCA_CLIENT_ID,
    clientSecret: process.env.WCA_CLIENT_SECRET,
    profile(rawProfile) {
      const profile = rawProfile.me ?? rawProfile;
      return {
        id: String(profile.id), name: profile.name, email: profile.email ?? null,
        image: profile.avatar?.thumb_url ?? profile.avatar?.url ?? null,
        wcaId: profile.wca_id ?? null
      };
    }
  }],
  session: { strategy: "jwt", maxAge: 60 * 60 * 2 },
  pages: { signIn: "/" },
  callbacks: {
    async jwt({ token, account, user }) {
      if (account?.access_token) token.accessToken = account.access_token;
      if (user?.wcaId !== undefined) token.wcaId = user.wcaId;
      return token;
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken;
      if (session.user) { session.user.id = token.sub ?? ""; session.user.wcaId = token.wcaId; }
      return session;
    }
  }
};
