# seb
The Safe Exam Browser settings for the event's `.seb` file (ADR-013, ADR-029, ADR-033). The client builds the file in
the **SEB Config Tool on Windows** (SEB for Windows 3.10.x) and shares it with participants before the event; the
`.seb` file itself is not kept in git.

## Contents
| Path | What it does |
|---|---|
| (none) | only this README: the settings below and how the Config Key reaches the server; the .seb file stays out of git |

## Settings (labels as in the SEB Config Tool for Windows)
| Tab | Setting | Value | Why |
|---|---|---|---|
| General | Start URL | `https://codehaunt.jojocode.in/login` | participants land on the login form (ADR-029) |
| General | Quit/unlock password | organisers' password, never shared with participants | no leaving SEB mid-contest |
| Exam | Use Browser Exam Key and Config Key | on | the server checks the Config Key hash on every participant request (ADR-013) |
| Security | Clipboard Policy | **Block** if the tool offers it, otherwise **SEB Only** | no paste from outside SEB (ADR-033); the app also blocks paste/copy inside |
| Hooked Keys | Enable Right Mouse | off | no context menu (paste, inspect) |
| User Interface | Allow spell checking | off | needs the right mouse; no suggestions in the editor |
| User Interface | Show developer tools in window menu | off | |
| Network → Filter | Activate URL filtering | on, allow only `codehaunt.jojocode.in` | no other sites |
| Down/Uploads | Allow downloading and uploading files | off | |
| Applications | permitted third-party applications | none | |

The clipboard setting's exact label and values are unconfirmed (the user manual lists only the Mac clipboard
option; a public SEB for Windows 3.7 issue shows a Clipboard Policy with "Allow" and "SEB Only"). Check them in the
Config Tool, and test pasting in SEB on a Windows laptop before the event (WP-08).

## Affects / depends on
- The **Config Key** shown in the Exam tab goes into the server `.env` as `SEB_CONFIG_KEY`, together with
  `PUBLIC_ORIGIN=https://codehaunt.jojocode.in` (`packages/auth/src/seb.ts`). Any change to the settings changes the
  Config Key: update `.env` and redeploy, or every participant gets 403 `seb_required`.
- `deploy/release/predeploy-check.sh` fails until both are set.

## Entry points & how to test
Open the `.seb` on Windows: login works; a normal browser gets 403 on `/contest`; a `.seb` with any setting changed
gets 403. These are WP-06 acceptance checks.

## Gotchas
- SEB clears the clipboard when it starts and quits; that does not replace the Clipboard Policy.
- SEB for Windows ≤ 3.5.0 let clipboard data cross between SEB and the system (CVE-2024-37742): participants must
  install 3.10.x.
