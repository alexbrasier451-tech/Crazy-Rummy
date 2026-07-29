# GitHub Pages Online Beta

**Status:** GitHub source and deployment workflow prepared; restricted beta
provider key and live-phone evidence remain external gates  
**Target:** <https://alexbrasier451-tech.github.io/Crazy-Rummy/>

## Source and deployment boundary

The complete application is published through a review branch that retains the
existing Phase 0 probe history. The Pages workflow builds Vite output for the
project path `/Crazy-Rummy/`, verifies the scoped PWA artifact, uploads only
`dist/`, and deploys through GitHub's `github-pages` environment.

The deployment workflow never accepts an administrative key, payment
credential, private key, or long-lived TURN credential. The browser-visible
Metered key is deliberately publishable but must still be independently
revocable and restricted to the beta:

- exact origin `https://alexbrasier451-tech.github.io`;
- minimum Publish, Subscribe, Presence, and Send actions;
- only the `crazy-rummy/v1/*` application channels;
- provider-injected short-lived TURN configuration;
- hard-capped free plan, no overage, and no auto-recharge.

Do not reuse the retired Phase 0 disposable-probe key. Create a beta-specific
restricted key in Metered, then add it to the GitHub repository variable
`METERED_BETA_PUBLISHABLE_KEY`. Set the repository variable
`CRAZY_RUMMY_ONLINE_ENABLED` to the exact string `true`. Until both variables
are present, the Pages job skips rather than deploying a misleading online
build.

## GitHub configuration

1. In **Settings → Pages**, keep the source set to **GitHub Actions**.
2. In **Settings → Secrets and variables → Actions → Variables**, add:
   - `METERED_BETA_PUBLISHABLE_KEY`;
   - `CRAZY_RUMMY_ONLINE_ENABLED=true`.
3. In **Settings → Environments → github-pages**, permit the beta branch while
   testing. Restrict it back to `main` for a release.
4. Rerun **Deploy online beta to GitHub Pages** after the variables are saved.

The publishable key is embedded in downloaded JavaScript by design; storing it
as an Actions secret would not make it confidential. Dashboard restrictions
and independent revocation are the security boundary.

## Emergency stop

For an immediate stop, revoke or disable the beta publishable key in Metered.
Then set `CRAZY_RUMMY_ONLINE_ENABLED=false`, rebuild, and redeploy. Provider
revocation is immediate for existing cached clients; the rebuilt kill switch
takes effect after the installed PWA accepts its update.

## Beta entry check

Before inviting phone testers:

1. Confirm CI and Pages artifact verification are green.
2. Open the target URL and install/reload the PWA.
3. Confirm Open discovery, Closed invite privacy, expiry, and cleanup in two
   isolated browsers.
4. Confirm a separate-network direct connection and a forced-relay connection.
5. Proceed to the three-phone Stage 8 fixture only after those checks pass.

Retain only redacted outcomes, candidate types, browser/device versions, and
timestamps. Never retain invite codes, room or seat secrets, SDP, ICE
candidates, TURN credentials, deck order, or private hands.
