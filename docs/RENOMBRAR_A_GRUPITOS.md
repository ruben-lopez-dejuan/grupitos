# Renaming to Grupitos: GitHub, Vercel, IONOS and the WCA

New name: **Grupitos**. New address: **https://grupitos.lopezruben.org** (before: https://groups.lopezruben.com).

The code is already renamed. What is left is outside the repository. Do the steps in this order: the login only works once steps 2, 3 and 4 are all done.

## 1. GitHub

The repository is renamed to `ruben-lopez-dejuan/grupitos` (done with `gh repo rename`). GitHub redirects the old name, and the local `origin` remote already points to the new one.

Optional, in the repository page → ⚙ (About):
- Description: "Grupitos: groups and tasks for WCA competitions".
- Website: `https://grupitos.lopezruben.org`.

On another computer with an old clone:

```bash
git remote set-url origin https://github.com/ruben-lopez-dejuan/grupitos.git
```

## 2. Vercel (project `rulo7/wca-easy-groups`)

1. **Settings → General → Project Name**: `grupitos`. This only changes the `*.vercel.app` address; the Git connection keeps working after the GitHub rename.
2. **Settings → Domains → Add**: `grupitos.lopezruben.org`.
   - Vercel then shows the DNS record to create, normally a `CNAME` from `grupitos` to `cname.vercel-dns.com`. Copy the exact value it shows.
3. **The old domain** `groups.lopezruben.com`: in the same page, **Edit → Redirect to** `grupitos.lopezruben.org` (308, permanent). That way old links and bookmarks keep working.
4. **Settings → Environment Variables**: change `NEXTAUTH_URL` to `https://grupitos.lopezruben.org` (Production). Leave the others as they are.
5. **Deployments → ⋯ on the latest → Redeploy**, so the new `NEXTAUTH_URL` is used.

With the Vercel CLI instead, from the project folder:

```bash
npx vercel domains add grupitos.lopezruben.org
```

```bash
npx vercel env rm NEXTAUTH_URL production
```

```bash
npx vercel env add NEXTAUTH_URL production
```

```bash
npx vercel --prod
```

The `env add` command asks for the value: `https://grupitos.lopezruben.org`.

## 3. IONOS (DNS of `lopezruben.org`)

The current domain is `lopezruben.com`. If `lopezruben.org` is not yours yet, buy it first (IONOS → Domains).

1. IONOS → **Domains & SSL** → `lopezruben.org` → **DNS**.
2. **Add record** → **CNAME**:
   - Host name: `grupitos`;
   - Points to: the value Vercel showed (normally `cname.vercel-dns.com`);
   - TTL: 1 hour.
3. Save. Within minutes to an hour, Vercel shows **Valid Configuration** for the domain, and issues the HTTPS certificate by itself.

If IONOS refuses because a record already uses `grupitos`, delete that one first.

## 4. WCA OAuth application

1. https://www.worldcubeassociation.org/oauth/applications → your app → **Edit**.
2. **Name**: `Grupitos`. The name is shown to people when they sign in.
3. **Redirect URI**: add a line with `https://grupitos.lopezruben.org/api/auth/callback/wca`.
   - Keep the old `https://groups.lopezruben.com/api/auth/callback/wca` until the old domain only redirects.
   - Keep `http://localhost:3000/api/auth/callback/wca` for development.
4. Scopes stay `public manage_competitions`. The client ID and secret do not change, so nothing changes in Vercel for them.

## 5. Bring your work to the new address

The browser keeps drafts per address, so `grupitos.lopezruben.org` starts empty. For each competition you are working on, on the old address:

- **Publish → Save settings only** (or publish groups and settings), then open the competition on the new address: the settings and the published groups load from the WCA;
- or **Publish → Download WCIF**, then on the new address **Import exported WCIF** (competition list or Zone step).

## 6. Checklist

- [ ] https://grupitos.lopezruben.org opens the home page with HTTPS.
- [ ] "Sign in with the WCA" works and comes back to the new address.
- [ ] https://groups.lopezruben.com redirects to the new address.
- [ ] Publishing to the WCA works from the new address.

## Not renamed on purpose

Browser storage keys (`wca-easy-groups:…`), the template format (`wca-easy-groups/pro-template`) and the WCIF extensions (`wcaEasyGroups.Settings`, `wcaEasyGroups.Draft`) keep the old name. Changing them would make saved drafts, settings already published to the WCA and downloaded files unreadable. Nobody sees them.
