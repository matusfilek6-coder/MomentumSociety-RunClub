// Stripe volá tento endpoint po platbe / zmene / zrušení predplatného.
// Tu (a len tu) sa nastavuje, či je používateľ člen.
const { stripe, admin, planOf } = require("./_lib");

const raw = (req) =>
  new Promise((ok, no) => {
    const c = [];
    req.on("data", (d) => c.push(d));
    req.on("end", () => ok(Buffer.concat(c)));
    req.on("error", no);
  });

async function sync(sub, userId) {
  // past_due = Stripe ešte skúša stiahnuť platbu, prístup necháme
  const active = ["active", "trialing", "past_due"].includes(sub.status);
  const item = sub.items && sub.items.data[0];
  const plan = planOf(item && item.price && item.price.id);
  let q = admin
    .from("profiles")
    .update({ is_member: active, plan: active ? plan : null, stripe_customer_id: sub.customer });
  q = userId ? q.eq("id", userId) : q.eq("stripe_customer_id", sub.customer);
  const { error } = await q;
  if (error) throw error;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).end();
  let ev;
  try {
    ev = stripe.webhooks.constructEvent(
      await raw(req),
      req.headers["stripe-signature"],
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (e) {
    return res.status(400).send("Bad signature");
  }
  try {
    if (ev.type === "checkout.session.completed") {
      const s = ev.data.object;
      if (s.mode === "subscription" && s.subscription) {
        const sub = await stripe.subscriptions.retrieve(s.subscription);
        await sync(sub, s.client_reference_id);
      }
    } else if (
      ["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"].includes(ev.type)
    ) {
      const sub = ev.data.object;
      await sync(sub, sub.metadata && sub.metadata.user_id);
    }
    res.status(200).json({ received: true });
  } catch (e) {
    console.error(e);
    res.status(500).send("Handler error");
  }
};
module.exports.config = { api: { bodyParser: false } };
