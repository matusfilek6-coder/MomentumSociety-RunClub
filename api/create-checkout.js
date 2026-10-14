// Vytvorí Stripe Checkout (platobná stránka) pre prihláseného používateľa.
const { stripe, admin, PRICES, userFrom, site } = require("./_lib");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const user = await userFrom(req);
    if (!user) return res.status(401).json({ error: "Najprv sa prihlás." });

    const plan = (req.body && req.body.plan) || "";
    const price = PRICES[plan];
    if (!price) return res.status(400).json({ error: "Neznámy balíček." });

    const { data: prof } = await admin
      .from("profiles")
      .select("stripe_customer_id,is_member")
      .eq("id", user.id)
      .single();
    if (prof && prof.is_member) {
      return res.status(409).json({ error: "Už máš aktívne členstvo. Balíček zmeníš v správe predplatného na stránke Účet." });
    }

    let customer = prof && prof.stripe_customer_id;
    if (!customer) {
      const c = await stripe.customers.create({ email: user.email, metadata: { user_id: user.id } });
      customer = c.id;
      await admin.from("profiles").update({ stripe_customer_id: customer }).eq("id", user.id);
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer,
      client_reference_id: user.id,
      line_items: [{ price, quantity: 1 }],
      allow_promotion_codes: true,
      success_url: site() + "/#/ucet?paid=1",
      cancel_url: site() + "/#/predplatne",
      metadata: { user_id: user.id, plan },
      subscription_data: { metadata: { user_id: user.id, plan } },
    });
    res.status(200).json({ url: session.url });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Platbu sa nepodarilo spustiť." });
  }
};
