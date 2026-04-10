package main

// ── Edit these two lines before you build and send the app ───────────────────

// HelperName is your name — shown on the helpee's consent screen.
const HelperName = "your name"

// NotifyURL is the endpoint that gets a POST when the helpee clicks Allow.
// The message body is the upterm join command the helper needs to run.
//
// Examples:
//   ntfy (self-hosted):  "http://your-server:2586/tether"
//   ntfy (public):       "https://ntfy.sh/your-topic"
//   Gotify:              "http://your-server:8080/message?token=TOKEN"
//   Any HTTP endpoint:   "http://your-server/tether-notify"
//
// Leave empty to skip — the join URL still appears on screen.
const NotifyURL = ""

// UptermServer is the upterm relay server. The public one works fine for M2.
// Replace with your own sish server URL when you set one up in M1.
const UptermServer = "wss://uptermd.io"
