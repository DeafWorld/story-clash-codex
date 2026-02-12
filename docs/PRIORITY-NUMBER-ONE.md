# Priority: #1 App

Ordered list of what to do first so Story Clash becomes the **#1** choice in its category.

---

## 1. One promise, everywhere (DONE)

- **Claim:** “The best 15-minute horror co-op in the browser.”
- **Where:** Landing hero, default meta, share recap meta, OG recap image.
- **Next:** Keep this the only headline. Don’t dilute with extra value props above the fold.

---

## 2. Land and convert in one tap

- **Primary CTA:** “Create Room” is the main action; “Join Room” is secondary. No signup before play.
- **Quick Demo:** Prominent “Quick Demo” so first-time visitors can try without a friend.
- **Mobile:** Ensure Create / Join / Demo are thumb-friendly and load fast. Test on 3G.

---

## 3. Zero-friction invite → join

- **Join link:** One tap from share (Copy link, WhatsApp, X) must open `/join?code=XXXX` and prefill code. (Done.)
- **Track:** Use `invite_opened`, `invite_copied`, `invite_shared`, `recap_shared` with `method` to see which channel wins. Double down on the top channel.

---

## 4. Reliable and observable

- **Uptime:** Healthcheck and Vercel (or host) so the app is always reachable.
- **Errors:** Sentry with `SENTRY_DSN` in production so every crash is seen and fixed.
- **Realtime:** Lobby/game show reconnection toasts; fix any “stuck” room or turn.

---

## 5. The moment people share

- **Recap:** “You survived (or didn’t). Share the story.” + Copy link, Share to X, WhatsApp. (Done.)
- **OG image:** Strong recap card with tagline so shares look good in feeds.
- **One-line hook:** Every share (invite + recap) should make the recipient want to click. Use the tagline.

---

## 6. Feel like the best

- **Your turn:** Impossible to miss. (Done: banner + pulse.)
- **Recap:** Timeline + MVP moment feel earned. Keep load fast; avoid layout shift.
- **Sound/motion:** Optional. If you add, keep it minimal and toggleable.

---

## 7. Prove it

- **Social proof:** Add when you have it: “Join 10k+ players” or “Rated #1 in [category] on [site]” near the CTA. Don’t fake it.
- **Testimonials or press:** One line on the landing page once you have a quote or award.

---

## 8. Retention and habit

- **Play again:** “Play Again with Same Crew” and “Back to Home” keep the next session one click away.
- **New content:** New story or genre (even one) gives a reason to return. Announce it in-app or on the landing page.

---

## 9. Distribution

- **SEO:** Title + description with the tagline and “Story Clash” (done). Add a simple `/play` or canonical URL if you want a short link.
- **Channels:** Invest in the share channel that brings the most joins (from step 3). Consider a small referral or “invite 3 friends” hook later.

---

## 10. Say no

- **Don’t:** Add signup before first play, long onboarding, or a second headline that competes with the one promise.
- **Do:** Ship one thing at a time. Measure: create → join → recap → share. Optimize the step that drops.

---

**Summary:** Be the best 15-minute horror co-op (one claim). Get people in one tap (Create / Demo). Make invite and recap shareable and track which channel wins. Keep the app reliable and the “your turn” and recap moments sharp. Add proof and retention when you have the data. This order keeps the product focused on becoming #1.
