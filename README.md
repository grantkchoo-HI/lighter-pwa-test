# Lighter

Lighter is a private, mobile-first debt payoff companion. Version 0.1 runs entirely in the browser with no account, server, bank connection, framework, or build step.

## Run locally

From this folder, start a static web server:

```sh
python3 -m http.server 8080 --bind 127.0.0.1
```

Open `http://localhost:8080`. Opening `index.html` directly will not enable the service worker.

For intentional testing from an iPhone or iPad on the same trusted network, use `--bind 0.0.0.0` and the Mac's LAN address. This temporarily exposes the development server to other devices on that network. Stop the server after testing and do not expose it to the public internet. iOS PWA installation still requires HTTPS.

## Tests

With Node 18 or newer:

```sh
npm test
```

## Install the PWA

- Desktop Chrome or Edge: open the local site and use the install button in the address bar.
- iPhone or iPad: serve the app from an HTTPS address, open it in Safari, tap Share, then **Add to Home Screen**. A plain HTTP address from another device on the local network is not considered secure by Safari.
- Android Chrome: open the HTTPS site, open the browser menu, and choose **Install app** or **Add to Home screen**.

After the first successful online load, the core application is cached for offline use. User data is stored in IndexedDB. Export backups regularly, especially before clearing browser data or changing devices.

See `PROJECT_NOTES.md` for architecture, financial assumptions, scope, and deferred work.
See `SECURITY_AUDIT.md` for the local-only privacy and security audit.
