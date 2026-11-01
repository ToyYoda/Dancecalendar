# Admin requests reach the Admin

Type: task
Labels: wayfinder:task

## Question

When someone writes "Admin" to the bot, it answers "Ich gebe dem Admin Bescheid – er meldet sich bei dir." and stores a row in `admin_request` (`src/whatsapp/bot.ts`), but nothing shows those rows: not `/admin`, not the daily email. The privacy policy and the WhatsApp policy's human-escalation rule both assume the Admin hears about them.

Show open requests on the `/admin` home and in the daily email, with the number to reply to and a way to mark one handled. The Admin must answer within WhatsApp's 24 h window (or by another channel), since the bot never writes first.

## Done when

- Tests green and deployed.
- Demo: write "Admin" to the bot → the request appears on `/admin` and in the next daily email.
