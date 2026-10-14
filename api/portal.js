// Stripe zákaznícky portál: zmena balíčka, karty, zrušenie, faktúry.
const { stripe, admin, userFrom, site } = require("./_lib");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const user = await userFrom(req);
    if (!user) return res.status(401).json({ error: "Najprv sa prihlás." });
    const { data: prof } = await admin.from("profiles").select("stripe_customer_id").eq("id", user.id).single();
    if (!prof || !prof.stripe_customer_id) return res.status(400).json({ error: "Zatiaľ nemáš žiadne predplatné." });
    const s = await stripe.billingPortal.sessions.create({
      customer: prof.stripe_customer_id,
      return_url: site() + "/#/ucet",
    });
    res.status(200).json({ url: s.url });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Správu predplatného sa nepodarilo otvoriť." });
  }
};
