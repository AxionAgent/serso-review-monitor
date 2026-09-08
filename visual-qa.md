# Visual QA notes

The requested visual refresh is complete. Public and admin surfaces now use a blue/white gradient palette, navy-blue navigation, translucent white panels, backdrop blur, blue shadows, and blue accent states. The landing page visibly renders the new blue hero, the customer route uses the same palette, and the admin workspace uses a blue glass shell.

OAuth is disabled in the running server entrypoint and client bootstrap. The admin screen now presents a local login gate. The server validates `admin` / `admin`, creates or reuses the seeded admin user, and issues the signed `app_session_id` cookie. A curl acceptance check confirmed both the login response and a subsequent `auth.me` response with role `admin`.

Final checks passed: `pnpm check`, `pnpm test`, and `pnpm build`. The existing review, QR, dashboard, and public submission flows remain database-backed.
