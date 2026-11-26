# One Day for iPhone, iPad and Mac

Why an app: **iCloud**. Apple lets a website use iCloud (CloudKit) only as the web version of an App Store app with the same name and equivalent features. This is that app. Once it is on the App Store, it syncs through the user's own iCloud, and so can the website.

## How it works

- **The site, carried by the app.** A SwiftUI shell, one code base for iPhone, iPad and Mac, around One Day's own page. The app copies the site (`public/`) into itself at build time and serves it to a web view at `oneday://localhost/`: nothing is loaded from the web, and it works offline. WebKit treats that origin as a secure context (a localhost host, a scheme the app answers), so the lock's Web Crypto works as on the web. Every feature of the site is in the app, from the same code, and each release of the site goes into the next build.
- **What the page saves stays saved.** The page keeps its tasks in `localStorage` (`oneday.v1`, `oneday.vault` with the lock on, the timer and the theme: the only keys the app keeps, never a cloud's sign-in answer). A web view's storage is not the app's: iOS may empty it when the device runs short of space. So every change also goes to a file of the app's own, `Application Support/One Day/saved.json`. [`Shared/bridge.js`](Shared/bridge.js) runs before the page's code. It numbers each change and posts it to the app ([`Bridge.swift`](Shared/Bridge.swift) → [`SavedState.swift`](Shared/SavedState.swift), written when changes pause and when the app steps back). When a page opens, the newer copy wins: the app's file if the web view lost its storage, the web view's if the app missed its last changes (they all go to the app then).
- **iCloud.** Sync with your cloud offers iCloud alone in the app (Google Drive, Dropbox and OneDrive need a sign-in page that sends you back to a web address, which the app has not). The page seals, opens and merges the copy as it does for the other clouds; [`CloudBridge.swift`](Shared/CloudBridge.swift) answers its questions (account, fetch, save, delete) and [`CloudStore.swift`](Shared/CloudStore.swift) does them with CloudKit: one record `one-day` of type `OneDayCopy` in the private database of `iCloud.com.bemorin.oneday` (default zone), the sealed copy as UTF-8 text in its Bytes field `data` (1 MB at most), each write refused over a copy changed meanwhile (`.ifServerRecordUnchanged`). The device's account is the one: no sign-in page, no token; a sync checks that it is still the account sync started with. A build without the container in its entitlements (`ONEDAY_ICLOUD=NO`, the unsigned builds on GitHub) never touches CloudKit, which would stop the app.
- **Tips, "Buy me an 🍎".** The footer's "Buy me a ☕" goes to Ko-fi, a payment outside the App Store, which an app may not offer: in the app, bridge.js turns it into "Buy me an 🍎", which opens the app's tip sheet ([`TipJar.swift`](Shared/TipJar.swift), [`TipView.swift`](Shared/TipView.swift)). Each tip is a consumable In-App Purchase that unlocks nothing (One Day is free and stays free), checked by StoreKit 2 on the device and finished there, with no server. The ids are in TipJar (`com.bemorin.oneday.tip.apple`, `.basket`, `.pie`, `.tree`, `.orchard`); their names and prices are set in App Store Connect. The tests stand in for the App Store (StoreKit's own test store doesn't run on GitHub's Macs); [`Tips.storekit`](Shared/Tips.storekit) holds the five tips for a run in Xcode on a Mac, as the scheme's StoreKit configuration. The website keeps Ko-fi.
- **Native so far.** Links to the web open in the browser. Export backup goes to the share sheet (iPhone) or a save panel (Mac), and Import backup uses the Mac's open panel. A page whose process iOS ended opens again from the saved copy. The app has no service worker and no passkeys: bridge.js removes both, since the files are in the app already and a passkey belongs to a website.

## Layout

| Path | What it is |
| --- | --- |
| `project.yml` | The Xcode project, for [XcodeGen](https://github.com/yonaskolb/XcodeGen) (the `.xcodeproj` itself is not kept in git) |
| `Shared/OneDayApp.swift` | The app: one window, the day edge to edge; the copy is written when the app steps back or quits |
| `Shared/DayWebView.swift` | The web view in SwiftUI, and where its pages may go (links, downloads, file pickers) |
| `Shared/WebHost.swift` | The web view's setup: the site's scheme, the bridge, the script each page runs first |
| `Shared/Site.swift` | Serves the site from the app's bundle (`oneday://localhost/…`), never a path outside it |
| `Shared/SavedState.swift` | The app's own copy of what the page keeps |
| `Shared/Bridge.swift`, `Shared/bridge.js` | The page's side and the app's side of that copy |
| `Shared/CloudBridge.swift`, `Shared/CloudStore.swift` | iCloud: the page's questions, answered with CloudKit |
| `Shared/TipJar.swift`, `Shared/TipView.swift`, `Shared/Tips.storekit` | Tips through the App Store, and their test store |
| `Shared/External.swift` | What leaves the app: links, exported files |
| `iOS/`, `macOS/` | Info.plist and entitlements (iCloud container `iCloud.com.bemorin.oneday`; the Mac's sandbox) |
| `Tests/` | Swift Testing: the site's files, the saved copy, the page in a real web view |
| `ci/iphone.sh` | Picks an iPhone simulator for the build on GitHub |

Bundle ID `com.bemorin.oneday` for both platforms: one App Store record, one purchase. The app's icons come from the site's icon: `node scripts/icons.mjs --apple`.

## Building

- **On GitHub** (no Mac needed): [`.github/workflows/apple.yml`](../.github/workflows/apple.yml) runs, on two kinds of Mac at once (GitHub is sometimes short of one), on each push to `apple-app` or `main` that touches `apple/`, `public/` or the workflow. It generates the project, builds and tests the app in an iPhone simulator and on the Mac, and takes pictures of the app in light and dark mode (artifact `apple-<run>`). It also tests bridge.js in Chromium. Nothing is signed or sent to Apple.
- **On a Mac**: `brew install xcodegen`, then `cd apple && xcodegen generate && open OneDay.xcodeproj`. To run it on a device, set the team (`DEVELOPMENT_TEAM`, the Team ID) in Xcode or in `project.yml`.
- **The bridge alone**, anywhere: `npx playwright test tests/apple-bridge.spec.mjs`.

## Still to do, in order

1. **Apple's side** (the account holder): register the App ID `com.bemorin.oneday` with iCloud (CloudKit) and the container; create the App Store Connect record for iOS and macOS.
2. **Signed builds to TestFlight from GitHub**: an App Store Connect API key in the repository's secrets, and a job that archives, signs and uploads.
3. **iCloud, live**: the code is here (see above), tested against a stand-in for CloudKit, never yet against iCloud itself. It needs a signed build (step 2), the record type `OneDayCopy` with its Bytes field `data` made in the CloudKit Console and deployed to production (TestFlight and App Store builds use production), and a device signed in to iCloud.
4. **Native touches**, because App Review 4.2 asks for more than a repackaged website, and because they are better: Face ID or Touch ID for the lock, the share sheet for Send, a window that stays on top on the Mac, a notification when the timer ends.
5. **Before App Review**: no Sponsor link in the app (payments outside the App Store), the app's privacy section on bemorin.com (what the app keeps, iCloud), the answers on encryption (export compliance; in France, a declaration to ANSSI), the EU trader status, the App Store page, and an independent review of storage and security.
6. **Then the website**: iCloud through CloudKit Web Services, with the same container and record.
