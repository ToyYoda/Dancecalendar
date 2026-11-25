// Sending an email: the email login's links (src/email-login.ts) and the Admin's daily email
// (src/admin-email.ts). Through Brevo's HTTP API when BREVO_API_KEY is set (ADR 0006: free, EU, reaches
// any address), else through a Cloudflare send_email binding, which on the Workers Free plan reaches only
// verified addresses, so it suits the Admin's own email only. Both need EMAIL_FROM on a domain the service
// has verified.

export type Mail = { to: string; subject: string; text: string };

export const mailReady = (env: Env) => Boolean(env.EMAIL_FROM && (env.BREVO_API_KEY || env.EMAIL));

// "sent", "unconfigured" when no service is set up, "failed" when the service refused or was unreachable.
export async function sendMail(env: Env, mail: Mail): Promise<"sent" | "unconfigured" | "failed"> {
  if (!mailReady(env)) return "unconfigured";
  const from = { name: "Stepdate", email: env.EMAIL_FROM! };
  try {
    if (env.BREVO_API_KEY) {
      const res = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "api-key": env.BREVO_API_KEY, "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ sender: from, to: [{ email: mail.to }], subject: mail.subject, textContent: mail.text }),
      });
      if (res.ok) return "sent";
      console.error("Brevo refused an email", res.status, (await res.text()).slice(0, 300));
      return "failed";
    }
    await env.EMAIL!.send({ from, to: mail.to, subject: mail.subject, text: mail.text });
    return "sent";
  } catch (e) {
    console.error("email not sent", e);
    return "failed";
  }
}
