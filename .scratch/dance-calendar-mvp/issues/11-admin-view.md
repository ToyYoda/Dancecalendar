# Admin view

Type: grilling
Labels: wayfinder:grilling

## Question

What does the Admin view hold and how does the Admin work through it? Settle:
- the Tip review queue: approve/reject, correct the extracted Events, confirm Tip Series rules
- free-text Series rules waiting for a check
- the Organizer list: auto-approved newcomers, remove/block, what happens to a removed Organizer's Events
- Series about to run out
- finding, editing, removing and reassigning any Event (including handing a Tip Event to an Organizer)
- takedown requests for Flyers
- what the daily Admin email lists and links to

Built on "Stack and hosting choice" (`/admin` behind Cloudflare Access, pages rendered on the server) and "Organizer confirmation flow" (a confirmed duplicate Tip is deleted automatically; applications are auto-approved).
