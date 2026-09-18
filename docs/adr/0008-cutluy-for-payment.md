# CutLuy for payment, not Stripe or a direct ABA PayWay integration

Stripe does not support merchants in Cambodia; incorporating elsewhere to get it is a legal project before a line of code. Direct ABA PayWay integration is possible but a significant one to own outright. CutLuy is a Cambodia-specific QR gateway already covering ABA, Wing and 50+ local banks, with a one-day API integration and a webhook signature scheme (`t=…,v1=…`, HMAC-SHA256 over the timestamp and raw body) that mirrors the Telegram webhook already in this codebase.

The trade CutLuy carries: it has no recurring billing or saved payment methods, only one-off QR payments. Chomreab therefore owns the entire Subscription and Invoice lifecycle itself — nothing renews unless a school scans a QR again — which is why Subscription carries a 7-day grace period rather than assuming timely renewal.
