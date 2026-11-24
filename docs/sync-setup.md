# Sync: registering One Day with each cloud

Sync talks to Google Drive, Dropbox and OneDrive as an app registered with each of them. There is no server: the browser signs in on the cloud's own page and comes back to `oauth/` on One Day's own address, then talks to the cloud's API directly. Each registration gives a **public id**, which goes in `CLOUD_IDS` in [`public/app.js`](../public/app.js), in place of One Day's own (they only work on One Day's addresses). None of them is a secret, and no client secret is used anywhere: leave any secret a console shows unused.

Until a cloud has an id, its row in the sync dialog says it isn't set up yet.

## What every registration needs

- **Redirect address**, exactly: `https://<your address>/oauth/` (with the slash). Add one per address you serve One Day from: the site, each preview you want to try sync on (for this repository's previews, `https://<branch>.one-day-2eb.pages.dev/oauth/`), and `http://localhost:8000/oauth/` for `npm start`.
- **The narrowest access**, so no paid security review applies:

| Cloud        | Access                                                                | Where the file lands                       | How long a sign-in lasts      |
| ------------ | --------------------------------------------------------------------- | ------------------------------------------ | ----------------------------- |
| Google Drive | `https://www.googleapis.com/auth/drive.appdata` (non-sensitive)        | a hidden app data folder                   | an hour (Google's token flow) |
| Dropbox      | App folder, with `files.metadata.read`, `files.content.read`, `files.content.write` | `Apps/<App folder name>`     | until sync stops (PKCE, refresh token) |
| OneDrive     | `Files.ReadWrite.AppFolder` and `offline_access`, personal accounts   | `Apps/<app name>`                          | a day (PKCE, refresh tokens for a single-page app) |

## Google Drive (Google Cloud console)

1. Create a project, then enable the **Google Drive API** (_APIs & Services → Library_).
2. _Google Auth platform → Branding → Get Started_: app name, support email, audience **External**, contact email. On the _Branding_ page, add the home page, the privacy policy and your top domain under _Authorized domains_.
3. _Data Access → Add or Remove Scopes_: add `https://www.googleapis.com/auth/drive.appdata` (also through _Manually add scopes_), then save.
4. _Clients → Create Client_, type **Web application**. _Authorized JavaScript origins_: each address without a path (`https://day.example.com`). _Authorized redirect URIs_: each `…/oauth/`. Copy the **Client ID** into `CLOUD_IDS.google`.
5. _Audience_: in **Testing**, only test users can connect, for seven days at a time; **Publish app** opens it to everyone. With `drive.appdata` alone, Google asks for no scope review; brand verification (free) only makes the consent screen show your app's name and logo instead of its domain.

Google gives a page without a server no refresh token: after an hour, One Day asks for a click to sign in again.

## Dropbox (App Console)

1. _Create app_ → **Scoped access** → **App folder** → a name (it can't contain "Dropbox" or start with "drop").
2. _Settings_: set the **App folder name**, add each redirect address under _OAuth 2 → Redirect URIs_, and turn **Allow public clients** on (PKCE without a secret). Copy the **App key** into `CLOUD_IDS.dropbox`.
3. _Permissions_: tick `files.metadata.read`, `files.content.read` and `files.content.write`, then save.
4. _Development users → Enable additional users_, so others than you can connect. A development app takes up to 500 users and shows a warning at each connection; after 50, apply for production within two weeks (_Apply for production_).

## OneDrive (Microsoft Entra admin center)

1. A Microsoft Entra directory is needed (a free Azure account makes one): since 2024 a personal Microsoft account alone can't register apps.
2. _Entra ID → App registrations → New registration_: the name becomes the folder's (`Apps/<name>`), so pick it before anyone connects. _Supported account types_: **Personal accounts only** (One Day signs in through the `consumers` endpoint). _Redirect URI_: platform **Single-page application (SPA)**, and the first `…/oauth/` address.
3. _Authentication_ → _Redirect URI configuration_ → _Add Redirect URI_ → **Single-page application** for each other address (a _Web_ one would make the browser's code exchange fail).
4. _API permissions → Add a permission → Microsoft Graph → Delegated permissions_ → `Files.ReadWrite.AppFolder`; `User.Read`, added by default, isn't needed. Copy the **Application (client) ID** (on _Overview_) into `CLOUD_IDS.onedrive`.

OneDrive's files are read from their download address (`*.files.1drv.com`, or `my.microsoftpersonalcontent.com`), which is why the Content Security Policy lets those two in.

## After the ids are in

- The Content Security Policy (`public/_headers` and the meta tag in `public/index.html`) already opens `connect-src` to the three APIs, and to nothing else.
- Bump `CACHE` in `public/sw.js`, so installed copies pick up the new `app.js`.
- Update your privacy policy: with sync on, the tasks also go, encrypted, to the cloud each person picks, under that provider's terms.
