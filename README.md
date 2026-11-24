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
- Previous Arrears: money a member already owes, recorded on the member and added to their dues
- Fines: an admin gives one member a fine with a reason (e.g. lateness), stored on the member and added to their dues
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

## Payment proof
A member cannot mark a contribution as paid without pasting the confirmation message they
received. "I have paid" on a monthly payment or on a special contribution opens a dialog asking
for the message — the M-Pesa "Confirmed" SMS, the bank/USSD alert, or the confirmation screen from
a banking app.

The dialog reads the message as it is typed and shows the member what was found (provider, amount,
reference code, date, account) before they send it, and warns them if the amount does not match
what is due. The full message is stored verbatim; the parsed values are only a summary to help the
admin, so a message the parser cannot read is still accepted.

Admins see a **Proof** button on every monthly payment and contribution payment that has a message
attached. It opens the same details side by side with the amount due and flags any mismatch before
approving. Rejecting a monthly request clears the stored message so the member can send a fresh one,
and members can replace a message while it is still awaiting approval.

## Meeting minutes
After each group meeting an admin can publish the minutes from **Minutes** in the sidebar. The
upload asks for a title, the date the meeting was held, optional notes, and the minutes document
itself (`.pdf`, `.doc` or `.docx`, up to 15 MB). Every active member can then view the archive,
open a PDF inline, or download any document. Admins can delete a set of minutes from the same page.

Uploaded files are stored under `server/uploads/minutes/` (ignored by git), and the meeting date,
title, notes and file details are kept in the `minutes` table in `server/group.db`.

## Previous Arrears, Fines, and outstanding totals

Some members owe money from before the current payment records. An admin can record it on the member from the Admin dashboard (or when creating the member). The amount is stored on the member, shown separately as **Previous Arrears**, and added in full to their outstanding total on the dashboard, profile, and payments page. Set it back to `0` once it has been settled.

A **Fine** works the same way but is for a specific reason, such as lateness. An admin assigns it to one member from the Admin dashboard, the member directory drawer, or the **Payment approvals** tab. The amount and reason are stored on that member, shown separately as **Fine**, and added in full to their outstanding total. Set the amount to `0` to clear a settled fine.

A member's **Outstanding** total is the full amount they still owe, made up of:

- unpaid monthly contributions,
- their **Previous Arrears**,
- their **Fine**, and
- **open contributions** — special contributions that are active and not yet approved for that member (unpaid or awaiting admin approval).

Each part is also shown on its own so members can see what makes up the total. A contribution drops out of Outstanding once the admin approves its payment. Admin accounts do not carry balances, fines, or contributions.

## Roles
- `member` – can view directory, edit own profile
- `admin` – everything above plus the admin dashboard and **Payment approvals** tab (approve/reject proof, assign member fines, approve special contributions, set Previous Arrears)

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
