# MomentumSociety Run Club – kompletný web

Web s registráciou, platbou kartou (Stripe), chatom, diskusiami s fotkami, behmi a administráciou textov.
Po zaplatení sa členstvo odomkne **automaticky**. Obsah pre členov je chránený v databáze, nie len na stránke.

| Časť | Služba | Cena na začiatok |
|---|---|---|
| Web + serverové funkcie | Vercel | zadarmo |
| Účty, databáza, fotky, chat | Supabase | zadarmo |
| Platby kartou | Stripe | bez mesačného poplatku, províziu si berie z každej platby |

## Čo je v balíku

```
public/            web (index.html, style.css, app.js, config.js, img/)
api/               serverové funkcie: create-checkout.js, portal.js, webhook.js
supabase/schema.sql  databáza a pravidlá prístupu
.env.example       zoznam tajných kľúčov
```

## Ukážka bez nastavovania

Otvor `public/index.html` v prehliadači. Kým je `config.js` prázdny, web beží v **ukážkovom režime**
(nič sa neukladá, platba sa len simuluje). Dole v pätičke je „Ukážka: admin“, ktorým vyskúšaš úpravy textov.

## Nasadenie krok za krokom

### 1. Supabase (databáza a účty)
1. Na supabase.com vytvor účet a **New project** (zapamätaj si heslo databázy, región vyber Frankfurt).
2. Choď do **SQL Editor → New query**, vlož celý súbor `supabase/schema.sql` a klikni **Run**. Malo by to skončiť bez chyby.
3. **Project Settings → API**: skopíruj **Project URL** a **anon public key**. Vlož ich do `public/config.js`.
   Skopíruj aj **service_role key**, ten je TAJNÝ a pôjde len do Vercelu (krok 4).
4. **Authentication → URL Configuration**: do *Site URL* daj adresu svojho webu (napr. `https://momentumsociety.sk`),
   do *Redirect URLs* pridaj tú istú adresu.
5. **Authentication → Providers → Email**: nechaj zapnuté. Potvrdzovanie e-mailom odporúčame nechať zapnuté.
   Pre ostrú prevádzku nastav vlastný SMTP (Authentication → SMTP), inak je počet e-mailov obmedzený.

### 2. Stripe (platby)
1. Na stripe.com vytvor účet. Najprv pracuj v **Test mode** (prepínač vpravo hore).
2. **Product catalog → Add product**: vytvor tri produkty (Basic 7 €, Standard 14 €, Premium 21 €),
   každý ako **Recurring – Monthly**. U každého skopíruj **Price ID** (začína `price_`).
3. **Settings → Billing → Customer portal**: zapni portál (zmena balíčka, zrušenie, karta, faktúry).
   V časti Products pridaj všetky tri balíčky, aby sa dalo meniť medzi nimi.
4. **Developers → API keys**: skopíruj **Secret key** (`sk_test_…`).
5. Webhook vytvoríš až po nasadení (krok 4).
6. Pre ostré platby treba v Stripe vyplniť údaje o firme alebo živnosti a bankový účet, kam budú chodiť peniaze.

### 3. GitHub a Vercel (hosting)
1. Vytvor účet na github.com a nový **súkromný** repozitár. Nahraj doň celý obsah tohto priečinka.
2. Na vercel.com sa prihlás cez GitHub, **Add New → Project**, vyber repozitár a klikni **Deploy**
   (nič ďalšie nemeň, `vercel.json` je pripravený).
3. **Settings → Environment Variables**: pridaj všetky premenné z `.env.example`:
   `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_PRICE_BASIC`,
   `STRIPE_PRICE_STANDARD`, `STRIPE_PRICE_PREMIUM`, `SITE_URL` (adresa webu bez lomky na konci).
   `STRIPE_WEBHOOK_SECRET` pridáš v nasledujúcom kroku.
4. **Deployments → … → Redeploy**, aby sa premenné načítali.

### 4. Webhook (vďaka nemu sa po platbe odomkne členstvo)
1. Stripe → **Developers → Webhooks → Add endpoint**.
2. URL: `https://tvoja-adresa/api/webhook`
3. Udalosti: `checkout.session.completed`, `customer.subscription.created`,
   `customer.subscription.updated`, `customer.subscription.deleted`.
4. Po vytvorení skopíruj **Signing secret** (`whsec_…`), vlož ho do Vercelu ako `STRIPE_WEBHOOK_SECRET` a spravte Redeploy.

### 5. Vlastná doména
Vercel → **Settings → Domains** → pridaj doménu a nastav DNS podľa pokynov. Potom uprav `SITE_URL` a Redirect URLs v Supabase.

### 6. Prvý administrátor
Zaregistruj sa na webe. Potom v Supabase **SQL Editor** spusti (e-mail nahraď svojím):
```sql
update public.profiles set role = 'admin'
  where id = (select id from auth.users where email = 'tvoj@email.sk');
```
Admin vidí všetko, maže príspevky, správy a komentáre kohokoľvek, pridáva behy a v pätičke má tlačidlo
**Upraviť texty**. Po zapnutí klikneš na ľubovoľný text a prepíšeš ho (uloží sa po kliknutí mimo), obrázky v úvodných
sekciách zmeníš tlačidlom „Zmeniť obrázok“.

### 7. Testovanie pred ostrým spustením
1. Zaregistruj sa novým e-mailom a potvrď ho.
2. Vyber balíček, na platobnej stránke použi testovaciu kartu `4242 4242 4242 4242`, ľubovoľný budúci dátum a CVC.
3. Po návrate na web sa do niekoľkých sekúnd objaví „Člen ✓“ a odomkne sa Komunita, Chat a Fotky.
4. Na stránke Účet vyskúšaj **Spravovať predplatné** a zrušenie. Po zrušení sa prístup zamkne.
5. Až potom v Stripe prepni na **Live mode**, vytvor ostré produkty, vymeň kľúče, ceny a webhook vo Vercele a spravte Redeploy.

## Čo ešte treba doplniť pred spustením

- **Obchodné podmienky a ochrana osobných údajov**: stránky existujú (`#/podmienky`, `#/ochrana`),
  ale text je zástupný. Doplň ho (najlepšie s právnikom). Admin ho upraví priamo na stránke.
- **GDPR**: umožni používateľom požiadať o zmazanie účtu (napr. e-mailom). Zmazanie používateľa v Supabase
  (Authentication → Users) zmaže aj jeho profil, príspevky a správy.
- **Moderácia**: admin vie mazať obsah. Zváž pravidlá komunity a nahlasovanie obsahu.
- **Faktúry a DPH**: poradi sa s účtovníkom. Stripe vie zbierať daňové údaje a vystavovať doklady.
- **Fotky** sú v „public“ úložisku s nehádateľnými adresami. Ak potrebuješ prísne súkromie, prepni na privátny bucket a podpisované odkazy.
- **Chat** je jedna spoločná miestnosť. Ďalšie miestnosti sa dajú pridať stĺpcom `room` v tabuľke `messages`.

## Bezpečnosť

- Tajné kľúče (`SERVICE_ROLE`, `STRIPE_SECRET`, `WEBHOOK_SECRET`) patria **len** do Vercelu, nikdy do `public/`.
- `anon key` v `config.js` je verejný a nie je tajný. Dáta chránia pravidlá v `schema.sql` (Row Level Security).
- Používateľ si nemôže sám nastaviť členstvo ani rolu admina: tieto stĺpce mení iba server cez webhook.
