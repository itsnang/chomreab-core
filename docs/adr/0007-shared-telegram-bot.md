# One shared Telegram bot, not one bot per school

Every School's parents talk to the same `@chomreabbot`, rather than each School creating its own bot in BotFather and pasting its token into Settings. This directly reverses work already built and merged — api#7 exists to register a webhook per school-owned bot token, and the whole `telegram_bot_token` field on school settings becomes dead weight once this lands.

The reversal is deliberate. BotFather is the single step in self-serve onboarding most likely to lose a tutoring-centre owner mid-signup, and a shared bot needs no per-school webhook routing at all — a Parent link's School comes from which Student the linking code names, not from which bot received the message. The cost is that attendance messages arrive from "Chomreab," not from the school's own name and photo; a school growing to care about that is a better problem to have than one that never signed up.

`telegram_bot_token` and the webhook-registration machinery in api#7 should be removed when multi-tenancy ships, not left dormant.
