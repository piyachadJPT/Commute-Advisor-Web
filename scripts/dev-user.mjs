// Creates (or confirms) a user on the LOCAL Supabase stack so you can sign in with an emailed code.
// Public sign-up is disabled, so users are created through the admin API.
//
//   npm run dev:user -- you@example.com
//
// The code arrives in Mailpit: http://127.0.0.1:54324
import { execFileSync } from "node:child_process";

const email = process.argv[2]?.trim().toLowerCase();
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error("Usage: npm run dev:user -- <email>");
  process.exit(1);
}

const out = execFileSync("supabase", ["status", "--output", "json"], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "ignore"],
});
const status = JSON.parse(out.slice(out.indexOf("{")));
const { API_URL, SECRET_KEY } = status;

// Never run this against a hosted project: it uses the secret key.
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(API_URL)) {
  console.error(`Refusing to run: ${API_URL} is not a local stack.`);
  process.exit(1);
}

const res = await fetch(`${API_URL}/auth/v1/admin/users`, {
  method: "POST",
  headers: {
    apikey: SECRET_KEY,
    authorization: `Bearer ${SECRET_KEY}`,
    "content-type": "application/json",
  },
  body: JSON.stringify({ email, email_confirm: true }),
});

if (res.ok) {
  console.log(
    `Created ${email}. Sign in at http://localhost:3000/login; the code arrives in Mailpit (http://127.0.0.1:54324).`,
  );
} else {
  const body = await res.json().catch(() => ({}));
  if (body.error_code === "email_exists") {
    console.log(
      `${email} already exists. Sign in at http://localhost:3000/login.`,
    );
  } else {
    console.error(
      `Failed (${res.status}): ${body.msg ?? body.message ?? "unknown error"}`,
    );
    process.exit(1);
  }
}
