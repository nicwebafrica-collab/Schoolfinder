# Security

School Finder doesn't collect personal information. There are no accounts or tracking, and a parent's location stays on their own device.

## Reporting a problem
If you find a security problem, please **don't open a public issue**. Use GitHub's private report instead: open the **Security** tab of this repository and click **Report a vulnerability**. We'll reply as soon as we can.

## Rules for anyone working on this code
- Run `node tools/security-check.js` before every release. If it fails, the website is not updated.
- Never put keys, passwords or signing files in this repository.
- Never put school data on the page as HTML. Use text only.
- Anything new that stores data on the phone, talks to another website or asks for a phone permission needs a security review first.
