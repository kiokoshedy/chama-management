# Group Hub

A small full-stack app for a group with member accounts, roles, and an admin dashboard.

## Stack
- **Frontend:** React 18 + Vite + react-router
- **Backend:** Node 22.5+ + Express, SQLite (`node:sqlite`)
- **Auth:** username + password (bcrypt-hashed), JWT sessions

## Features
- Admin creates member accounts (username + password + role)
- Members sign in with their credentials and see the member directory
- Member directory: members see each other's profiles
- Admin dashboard: create members, promote/demote roles, remove members
- Profile editing (display name, bio)
- Monthly and special contributions with pasted payment proof (M-Pesa or Bank confirmation)
- One **Pay now** flow that can settle any mix of monthly dues, Previous Arrears, special
  contributions and fines — all at once or in part
- Previous Arrears: money a member already owes, recorded on the member and added to their dues
- Independent fines: an admin gives a member a fine with its own reason (e.g. "arrived late" or
  "missed a meeting"). Each fine is its own record, not attached to any contribution, and can be
  paid in full or in part.
- Meeting minutes: admins upload the minutes of each meeting (PDF or Word) and members view or
  download them from the Minutes page

## Run it

Two terminals:

```bash
# Terminal 1: backend on http://localhost:4000
cd server
npm install
npm run dev

# Terminal 2: frontend on http://localhost:5173
cd client
npm install
npm run dev
```

Open http://localhost:5173

A default admin account is seeded on first run:
- username: `admin`
- password: `admin123`

Change the password by editing your profile, or set `JWT_SECRET` and `PORT` in a `server/.env`.

## Paying what you owe
A member cannot record a payment without pasting the confirmation message they received. The
**Pay now** button on **My payments** opens a single dialog listing every outstanding amount:
monthly contributions, Previous Arrears, special contributions and independent fines. The member
selects any or all of them, enters the amount actually sent, and pastes the M-Pesa "Confirmed" SMS,
the bank/USSD alert, or the confirmation screen from a banking app.

The dialog reads the message as it is typed and shows the member what was found (provider, amount,
reference code, date, account) before sending. The full message is stored verbatim; the parsed
values are only a summary to help the admin, so a message the parser cannot read is still accepted.

The amount can be less than the selected balance. While the request is waiting, it appears in
**Awaiting approval** on the member and admin dashboards and in Recent activity. When the admin
approves the request, only that amount is allocated to the selected items: a fully covered item
becomes paid, and a part-paid item stays outstanding with its balance reduced. Items already
covered by a request waiting for approval are locked so they cannot be paid twice. Members can view
or change their message while a request is pending, or cancel it.

Admins review these combined requests at the top of **Payment approvals**. Each request shows the
member, the exact items and amounts selected, the proof message, and an Approve/Reject action.
Approving applies the allocation to every item; rejecting releases the lock so the member can pay
again. Older monthly "I have paid" requests and special-contribution payments are still reviewed in
their existing sections.

## Meeting minutes
After each group meeting an admin can publish the minutes from **Minutes** in the sidebar. The
upload asks for a title, the date the meeting was held, optional notes, and the minutes document
itself (`.pdf`, `.doc` or `.docx`, up to 15 MB). Every active member can then view the archive,
open a PDF inline, or download any document. Admins can delete a set of minutes from the same page.

Uploaded files are stored under `server/uploads/minutes/` (ignored by git), and the meeting date,
title, notes and file details are kept in the `minutes` table in `server/group.db`.

## Previous Arrears, Fines, and outstanding totals

Some members owe money from before the current payment records. An admin can record it on the member from the Admin dashboard. It is shown separately as **Previous Arrears** and added in full to their outstanding total on the dashboard, profile, and payments page. Set it back to `0` once it has been settled.

**Fines are independent records.** An admin adds a fine from the **Independent fines** card on the
Admin dashboard, the member directory drawer, or the **Payment approvals** tab. Each fine stores its
own amount, reason, and payment progress — for example "arrived late" and "missed a meeting" can be
two separate fines for the same member. No contribution or monthly payment is involved. Fines can be
removed while unpaid; a part-paid fine is kept so the payment history stays accurate.

A member's **Outstanding** total is the full amount they still owe, made up of:

- the remaining balance on unpaid or part-paid monthly contributions,
- their **Previous Arrears**,
- the unpaid balances of all their **Fines**, and
- **open contributions** — special contributions that are active and not yet approved (or only
  part paid) for that member.

Each part is shown separately so members can see what makes up the total. Only approved allocations
reduce a balance; a pending request does not change totals. Admin accounts do not carry balances,
fines, or contributions.

**Combined requests and part payments.** **Pay now** is the only way to submit a payment. It lets a
member select any mix of monthly dues, special contributions, fines, and arrears, enter the amount
actually sent, and paste one proof message. When the admin approves, the money is applied to the
**oldest selected dues first** and only up to that entered amount. The remainder stays on the
specific newer dues it belongs to — for example, KSh 7,500 sent for five items totaling KSh 11,000
clears the oldest items and leaves KSh 3,500 visible on the later ones. Both **Payment requests**
(admin) and **My payment requests** (member) show each item as **Paid**, **Part paid / balance
left**, or still unpaid.

A one-time startup repair rebuilds older requests that stored the full selected balance as the
requested amount: it trusts the amount parsed from the proof message, corrects the request total,
and reallocates approved money oldest-first. Older databases also get paid monthly and contribution
records synchronized so rows marked **paid** no longer show a balance.

## Roles
- `member` – can view the directory, edit their profile, and pay any or all of their outstanding amounts
- `admin` – everything above plus the admin dashboard and **Payment approvals** tab (review combined payment requests, approve/reject proof, add independent fines, approve special contributions, set Previous Arrears)

## Data
Data is stored in `server/group.db` (SQLite). Delete the file to reset.
## Deploy to Fly.io

The repo ships a `Dockerfile` (builds the client, serves it from Express) and a `fly.toml`
(1 GB volume mounted at `/data`, region `jnb`).

```bash
curl -L https://fly.io/install.sh | sh
fly auth signup            # or: fly auth login

fly apps create group-app  # must match `app` in fly.toml
fly volumes create group_data --region jnb --size 1
fly secrets set JWT_SECRET="$(openssl rand -hex 32)"
fly deploy
fly open
```

The SQLite database lives at `/data/group.db` and uploads at `/data/uploads`, so both survive
redeploys. Change the seeded `admin` / `admin123` password right after the first deploy.

Useful commands:

```bash
fly logs                  # tail server logs
fly status                # machine + volume status
fly ssh console           # shell inside the machine
fly apps restart group-app
```
