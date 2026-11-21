# Contributing to Spinning News

Thanks for helping! The project is deliberately small: a vanilla-JS front end with no build step and a Python server that uses only the standard library.

## Run it

```bash
python server.py 8080
```

Open http://localhost:8080. The server listens on this computer only (`127.0.0.1`); see the Security section of the README before exposing it.

You can also open `index.html` directly: everything works with the bundled demo stories, but live ingestion (API, SSE, RSS) needs the server, and three.js, globe.gl, the fonts and the flag images still load from CDNs.

## Where things live

| File | What it does |
| :--- | :--- |
| `index.html` | Page markup: header, panels, story drawer, dialogs |
| `app.js` | Globe, labels, filters, news feed, story drawer, live stream |
| `styles.css` | All styling |
| `news-data.js` | Bundled demo stories (fictional) and country profiles |
| `flags.js`, `audio.js` | Flag images, sound effects |
| `countries-data.js`, `countries.geojson` | Country borders (Natural Earth) |
| `server.py` | Static files, ingest API, SSE stream, RSS poller |
| `pipeline/` | Example clients that post events |

There is no build step: edit a file and reload the page. When you change `styles.css` or a script, bump the `?v=` query on its tag in `index.html` so browsers fetch the new version.

## Checking a change

- Open the app and try the filters, open a story, and resize the window to phone width (below 1024 px the panels become bottom sheets).
- With the server running, send a test event from the developer panel (`···` menu → `개발자 API · 실시간 수집`) or run `python pipeline/feeder_example.py`.
- Keep the browser console free of errors.

## Pull requests

- Keep changes small and focused, with a short description (and a screenshot for anything visual).
- UI text is Korean; code comments are English.
- The server must stay standard-library only, and the front end must keep working without a build step.

## Security issues

Please do not open a public issue. Report the problem privately through **Report a vulnerability** on the repository's Security tab (GitHub Security Advisories).
