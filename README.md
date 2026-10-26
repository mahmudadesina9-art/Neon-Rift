# Neon Rift

Neon Rift is a fast-paced, mobile-friendly arena survival game built with vanilla HTML, CSS, and JavaScript. Dodge incoming fire, collect energy, upgrade your ship, and take on an increasingly dangerous final boss at each level.

## Play

Open `index.html` in a modern browser, or publish the project as a static website using GitHub Pages.

## Features

- Responsive canvas arena with keyboard and touch controls
- Automatic targeting and firing
- Escalating enemy waves and level-based boss encounters
- Boss escorts, hostile projectiles, hull damage, and repair pickups
- Pilot upgrades, dash ability, score, survival time, and elimination tracking
- Browser-local pilot profiles, progress, and leaderboard

> Pilot profiles and leaderboard entries are stored in the current browser only. They are not shared between visitors or secured by a server.

## Controls

| Action | Controls |
| --- | --- |
| Move | `W` `A` `S` `D` or arrow keys |
| Dash | `Space` or the on-screen dash button |
| Pause / resume | `Esc` or the pause button |
| Continue to the next level | Click the level-complete button or press `Enter` |

The blaster automatically fires at the nearest enemy.

## Run locally

No build tools or dependencies are required. Clone or download the repository and open `index.html` in a browser.

## Publish with GitHub Pages

1. Push this project to a GitHub repository.
2. Open the repository's **Settings → Pages**.
3. Under **Build and deployment**, set the source to **GitHub Actions**.
4. Open the **Actions** tab and allow workflows if GitHub prompts you.
5. The included Pages workflow deploys automatically after a push to `main`. When it completes, the published URL appears in the Pages settings.

## Project files

- `index.html` — game layout and interface
- `styles.css` — visual design and responsive layouts
- `game.js` — gameplay, enemies, progression, and browser-local profiles

## License

No license is currently specified. Add a license before inviting others to reuse or redistribute the project.
