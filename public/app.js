/* MomentumSociety Run Club – aplikácia
   Režimy: LIVE (Supabase + Stripe) alebo DEMO (bez ukladania, keď je config.js prázdny). */
(function () {
"use strict";

var CFG = window.CFG || {};
var LIVE = !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY && window.supabase);
var sb = LIVE ? window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY) : null;
var S = { user: null, profile: null, edit: false, content: {}, people: {} };
var CATS = ["Tréning", "Výživa", "Výbava", "Zdravie", "Preteky", "Otázka", "Inšpirácia"];
var cleanup = null;

/* ---------- pomocné funkcie ---------- */
function $(s, r) { return (r || document).querySelector(s); }
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}
function uuid() { return (crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + Math.random().toString(16).slice(2)); }
function ago(t) {
  var s = (Date.now() - new Date(t)) / 1000;
  if (s < 60) return "teraz";
  if (s < 3600) return "pred " + Math.floor(s / 60) + " min";
  if (s < 86400) return "pred " + Math.floor(s / 3600) + " h";
  return new Date(t).toLocaleDateString("sk-SK");
}
function toast(m) {
  var t = $("#toast"); t.textContent = m; t.className = "show";
  clearTimeout(toast.t); toast.t = setTimeout(function () { t.className = ""; }, 3200);
}
function sk(e) {
  var m = (e && e.message) || String(e || "");
  if (/Invalid login/i.test(m)) return "Nesprávny e-mail alebo heslo.";
  if (/already registered|already been registered/i.test(m)) return "Tento e-mail je už zaregistrovaný.";
  if (/row-level security|permission denied/i.test(m)) return "Na túto akciu nemáš oprávnenie (potrebuješ aktívne členstvo).";
  if (/Password should/i.test(m)) return "Heslo musí mať aspoň 8 znakov.";
  if (/rate limit/i.test(m)) return "Príliš veľa pokusov, skús to o chvíľu.";
  return m || "Niečo sa pokazilo, skús to znova.";
}
function shrink(file, max) {
  return new Promise(function (ok, no) {
    var r = new FileReader();
    r.onerror = no;
    r.onload = function () {
      var i = new Image();
      i.onerror = no;
      i.onload = function () {
        var m = max || 1400, k = Math.min(1, m / Math.max(i.width, i.height));
        var cv = document.createElement("canvas");
        cv.width = Math.round(i.width * k); cv.height = Math.round(i.height * k);
        cv.getContext("2d").drawImage(i, 0, 0, cv.width, cv.height);
        cv.toBlob(function (b) { b ? ok(b) : no(new Error("Obrázok sa nepodarilo spracovať.")); }, "image/jpeg", 0.8);
      };
      i.src = r.result;
    };
    r.readAsDataURL(file);
  });
}
function isAdmin() { return !!(S.profile && S.profile.role === "admin"); }
function isMember() { return !!(S.profile && (S.profile.is_member || S.profile.role === "admin")); }

/* ---------- predvolený obsah (admin ho môže meniť priamo na stránke) ---------- */
var DEF = {
  "brand": "MOMENTUMSOCIETY", "sub": "RUN CLUB", "tag": "Spolu sme silnejší.",
  "img.home": "img/hero1.jpg", "img.about": "img/hero2.jpg", "img.plans": "img/hero3.jpg", "img.side": "img/hero2.jpg",
  "home.eyebrow": "MomentumSociety Run Club", "home.title": "Viac než len beh.",
  "home.sub": "Komunita mladých ľudí, ktorí chcú viac než len behať. Behy, výzvy, chat a výhody na jednom mieste.",
  "home.btn": "Pridaj sa k nám",
  "home.about.eb": "O nás", "home.about.t": "Komunita, ktorá ťa posúva",
  "home.about.p": "MomentumSociety RunClub spája pohyb, disciplínu a chuť posúvať sa ďalej. Beh pre nás nie je len šport, ale spôsob života.",
  "home.events.eb": "Najbližšie behy", "home.events.t": "Spolu na trati",
  "home.cta.t": "Pridaj sa do komunity", "home.cta.p": "Či už si začiatočník alebo pokročilý, vitaj medzi nami.",
  "about.eb": "O nás", "about.title": "MomentumSociety", "about.sub": "Bežci. Ľudia. Príbehy.",
  "about.story.eb": "Náš príbeh", "about.story.t": "Ako to celé začalo",
  "about.story.p": "Začalo sa to malou skupinou priateľov, ktorí sa stretávali na spoločných behoch. Postupne sme zistili, že beh nám dáva viac než fyzickú kondíciu – prináša lepšiu myseľ, nové priateľstvá a silnejší pohľad na život.",
  "about.mission.eb": "Naša misia", "about.mission.t": "Inšpirovať ľudí k pohybu",
  "about.mission.p": "Veríme, že beh má silu meniť životy. Chceme byť zdrojom inšpirácie, praktických informácií a reálnych príbehov – bez ohľadu na vek, výkonnosť či skúsenosti.",
  "about.values.eb": "Naše hodnoty", "about.values.t": "Čo je pre nás dôležité",
  "v1.t": "Komunita", "v1.p": "Spájame ľudí, ktorí si navzájom pomáhajú a motivujú sa.",
  "v2.t": "Rozvoj", "v2.p": "Veríme v neustály pokrok – na bežeckej trati aj v živote.",
  "v3.t": "Rešpekt", "v3.p": "Rešpektujeme každého bežca, bez ohľadu na výkonnosť, vek či ciele.",
  "v4.t": "Príroda", "v4.p": "Milujeme hory, lesy a všetky miesta, kde môžeme behať.",
  "plans.eb": "Predplatné", "plans.title": "Vyber si svoj balíček", "plans.sub": "Tri úrovne predplatného. Jeden cieľ – viac z bežného života.",
  "plan.basic.name": "BASIC", "plan.basic.price": "7 €", "plan.basic.desc": "Základ, ktorý ťa posunie vpred.",
  "plan.basic.list": "Prístup ku komunite a chatu\nExkluzívne zľavy na merch\nZľavy u partnerov\nMotivačný obsah a tipy",
  "plan.standard.name": "STANDARD", "plan.standard.price": "14 €", "plan.standard.desc": "Viac výhod. Viac zážitkov.",
  "plan.standard.list": "Všetko z Basic\nKomunitné eventy (vrátane after run)\nMožnosť začiatočníckej cieľovky\nŠpeciálne edície merchu",
  "plan.premium.name": "PREMIUM", "plan.premium.price": "21 €", "plan.premium.desc": "Pre tých, ktorí chcú viac.",
  "plan.premium.list": "Všetko zo Standard\nOsobné konzultácie s trénerom (raz mesačne)\nPrednostná registrácia na eventy\nExkluzívne výhody a prekvapenia",
  "ben.t": "Viac než len beh",
  "b1.t": "Exkluzívna komunita", "b1.p": "Ľudia s rovnakými hodnotami a cieľmi.",
  "b2.t": "Zľavy na merch", "b2.p": "Špeciálne ceny a limitované edície.",
  "b3.t": "Komunitné eventy", "b3.p": "Spoločné behy, after run, workshopy.",
  "b4.t": "Tipy od trénerov", "b4.p": "Tréning, regenerácia, výživa, mindset.",
  "b5.t": "Prednostná registrácia", "b5.p": "Na všetky naše podujatia a eventy.",
  "b6.t": "Špeciálne prekvapenia", "b6.p": "Pre našich členov a verných bežcov.",
  "ev.t": "Behy", "ev.sub": "Spoločné bežecké výjazdy, ktoré ťa posunú ďalej.",
  "com.t": "Komunita", "com.sub": "Skutoční ľudia. Skutočné príbehy. Spoločne rastieme.",
  "chat.t": "Chat", "chat.sub": "Rozprávaj sa s ostatnými členmi.",
  "ph.t": "Fotky", "ph.sub": "Skutočné momenty našej komunity.",
  "foot.contact": "Kontakt: doplň e-mail",
  "terms.t": "Obchodné podmienky", "terms.p": "Sem vlož znenie obchodných podmienok (predávajúci, cena, platba, odstúpenie od zmluvy, zrušenie predplatného). Odporúčame konzultáciu s právnikom.",
  "priv.t": "Ochrana osobných údajov", "priv.p": "Sem vlož znenie zásad ochrany osobných údajov (správca, aké údaje spracúvame, účel, doba uchovania, práva používateľa, kontakt). Odporúčame konzultáciu s právnikom."
};
function c(k) { return S.content[k] != null && S.content[k] !== "" ? S.content[k] : (DEF[k] != null ? DEF[k] : ""); }
function editing() { return S.edit && isAdmin(); }
function E(k, tag, cls) {
  return "<" + tag + (cls ? ' class="' + cls + '"' : "") + ' data-c="' + k + '"' + (editing() ? " contenteditable" : "") + ">" + esc(c(k)) + "</" + tag + ">";
}
function LST(k) {
  var v = c(k);
  if (editing()) return '<div class="ls" data-c="' + k + '" contenteditable>' + esc(v) + "</div>";
  return "<ul>" + v.split("\n").filter(Boolean).map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>";
}

/* ---------- DEMO dáta (bez backendu) ---------- */
function demoApi() {
  var A = {}, now = Date.now(), listeners = [];
  var D = {
    admin: false, member: false, plan: null, name: "Ty (ukážka)",
    people: { demo: "Ty (ukážka)", a: "Martin K.", b: "Lucia S.", c: "Peter F." },
    content: {},
    events: [0, 7, 14, 21].map(function (n, i) {
      var d = new Date(now + (n + 6) * 864e5);
      return { id: "e" + i, title: ["Guided run", "Nočný beh", "Sunrise run", "Community run"][i], date: d.toISOString().slice(0, 10), place: "Bytča – Base", distance: ["3 km", "9 km", "10 km", "8 km"][i], description: ["Pokojné tempo, vhodné pre začiatočníkov.", "Čelovky na hlavu a ide sa.", "Východ slnka v prírode.", "Spoločný beh a after run."][i] };
    }),
    posts: [
      { id: "p1", uid: "a", cat: "Tréning", title: "Ranný beh na Kamzík", body: "Dnes to bolo 12 km a krásne podmienky. Čistá hlava a veľa energie na celý deň. Ako ste mali dnes vy?", img: "img/hero1.jpg", at: new Date(now - 3 * 36e5).toISOString(), likes: 56, comments: 2, liked: false },
      { id: "p2", uid: "b", cat: "Výživa", title: "Moje raňajky pred dlhým behom", body: "Ovsená kaša, banán, oriešky, trocha medu. Jednoduché, ale funguje to. Čo jete vy?", img: "", at: new Date(now - 6 * 36e5).toISOString(), likes: 42, comments: 0, liked: false },
      { id: "p3", uid: "c", cat: "Otázka", title: "Aké trailové topánky odporúčate?", body: "Hľadám nové trailovky na dlhšie vzdialenosti v horách.", img: "", at: new Date(now - 30 * 36e5).toISOString(), likes: 21, comments: 0, liked: false }
    ],
    cm: { p1: [{ id: "c1", uid: "b", body: "Krásne! Ja som dnes mala 8 km.", at: new Date(now - 2 * 36e5).toISOString() }, { id: "c2", uid: "c", body: "Kamzík je top.", at: new Date(now - 36e5).toISOString() }] },
    msgs: [
      { id: 1, uid: "a", body: "Ahojte! Kto ide v nedeľu na Sunrise run?", at: new Date(now - 50 * 6e4).toISOString() },
      { id: 2, uid: "b", body: "Ja som za 🙌", at: new Date(now - 40 * 6e4).toISOString() },
      { id: 3, uid: "c", body: "Ja tiež, vidíme sa o 6:30.", at: new Date(now - 30 * 6e4).toISOString() }
    ]
  };
  A.demo = D;
  A.user = async function () { return S.user; };
  A.profile = async function () { return S.user ? { id: "demo", name: D.name, role: D.admin ? "admin" : "user", is_member: D.member, plan: D.plan } : null; };
  A.signUp = async function (email, pw, name) { D.name = name || "Ty (ukážka)"; D.people.demo = D.name; S.user = { id: "demo", email: email }; return {}; };
  A.signIn = async function (email) { S.user = { id: "demo", email: email }; return {}; };
  A.signOut = async function () { S.user = null; };
  A.setName = async function (n) { D.name = n; D.people.demo = n; };
  A.people = async function () { return D.people; };
  A.content = async function () { return D.content; };
  A.saveContent = async function (k, v) { D.content[k] = v; };
  A.uploadSite = async function (file) { return URL.createObjectURL(file); };
  A.events = async function () { return D.events.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; }); };
  A.saveEvent = async function (e) { e.id = uuid(); D.events.push(e); };
  A.delEvent = async function (id) { D.events = D.events.filter(function (e) { return e.id !== id; }); };
  A.listPosts = async function () {
    return D.posts.map(function (p) { return Object.assign({ author: D.people[p.uid] || "Člen" }, p, { comments: (D.cm[p.id] || []).length }); });
  };
  A.createPost = async function (p, file) {
    D.posts.unshift({ id: uuid(), uid: "demo", cat: p.cat, title: p.title, body: p.body, img: file ? URL.createObjectURL(file) : "", at: new Date().toISOString(), likes: 0, comments: 0, liked: false });
  };
  A.delPost = async function (p) { D.posts = D.posts.filter(function (x) { return x.id !== p.id; }); };
  A.toggleLike = async function (id, liked) {
    var p = D.posts.find(function (x) { return x.id === id; });
    if (p) { p.liked = !liked; p.likes += liked ? -1 : 1; }
  };
  A.listComments = async function (id) { return (D.cm[id] || []).map(function (x) { return Object.assign({ author: D.people[x.uid] || "Člen" }, x); }); };
  A.addComment = async function (id, body) { (D.cm[id] = D.cm[id] || []).push({ id: uuid(), uid: "demo", body: body, at: new Date().toISOString() }); };
  A.delComment = async function (id, cid) { D.cm[id] = (D.cm[id] || []).filter(function (x) { return x.id !== cid; }); };
  A.listMsgs = async function () { return D.msgs.map(function (m) { return Object.assign({ author: D.people[m.uid] || "Člen" }, m); }); };
  A.sendMsg = async function (body) {
    var m = { id: Date.now(), uid: "demo", body: body, at: new Date().toISOString() };
    D.msgs.push(m); return Object.assign({ author: D.name }, m);
  };
  A.delMsg = async function (id) { D.msgs = D.msgs.filter(function (m) { return m.id !== id; }); };
  A.onMsg = function () { return function () {}; };
  A.checkout = async function (plan) {
    if (confirm("Ukážkový režim: simulovať úspešnú platbu za balíček " + plan.toUpperCase() + "?")) { D.member = true; D.plan = plan; return "demo"; }
  };
  A.portal = async function () { D.member = false; D.plan = null; return "demo"; };
  return A;
}

/* ---------- LIVE dáta (Supabase + Stripe) ---------- */
function liveApi() {
  var A = {};
  function url(path) { return sb.storage.from("photos").getPublicUrl(path).data.publicUrl; }
  function ck(r) { if (r.error) throw r.error; return r.data; }
  async function token() { var s = await sb.auth.getSession(); return s.data.session ? s.data.session.access_token : ""; }
  async function call(path, body) {
    var r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + (await token()) }, body: JSON.stringify(body || {}) });
    var j = await r.json().catch(function () { return {}; });
    if (!r.ok) throw new Error(j.error || "Chyba servera.");
    return j.url;
  }
  A.user = async function () { var s = await sb.auth.getSession(); return s.data.session ? s.data.session.user : null; };
  A.profile = async function () {
    if (!S.user) return null;
    var r = await sb.from("profiles").select("*").eq("id", S.user.id).maybeSingle();
    return r.data || null;
  };
  A.signUp = async function (email, pw, name) {
    var r = await sb.auth.signUp({ email: email, password: pw, options: { data: { name: name }, emailRedirectTo: location.origin + "/" } });
    if (r.error) throw r.error;
    return { needConfirm: !r.data.session };
  };
  A.signIn = async function (email, pw) { var r = await sb.auth.signInWithPassword({ email: email, password: pw }); if (r.error) throw r.error; return {}; };
  A.signOut = async function () { await sb.auth.signOut(); };
  A.setName = async function (n) { ck(await sb.from("profiles").update({ name: n }).eq("id", S.user.id)); };
  A.people = async function () {
    var m = {}; (ck(await sb.from("profiles").select("id,name")) || []).forEach(function (p) { m[p.id] = p.name || "Člen"; }); return m;
  };
  A.content = async function () {
    var m = {}; var r = await sb.from("site_content").select("key,value");
    (r.data || []).forEach(function (x) { m[x.key] = x.value; }); return m;
  };
  A.saveContent = async function (k, v) { ck(await sb.from("site_content").upsert({ key: k, value: v })); };
  A.uploadSite = async function (file) {
    var b = await shrink(file, 1800), path = "site/" + uuid() + ".jpg";
    var u = await sb.storage.from("photos").upload(path, b, { contentType: "image/jpeg" });
    if (u.error) throw u.error; return url(path);
  };
  A.events = async function () {
    var today = new Date().toISOString().slice(0, 10);
    var r = await sb.from("events").select("*").gte("date", today).order("date", { ascending: true });
    return r.data || [];
  };
  A.saveEvent = async function (e) { ck(await sb.from("events").insert(e)); };
  A.delEvent = async function (id) { ck(await sb.from("events").delete().eq("id", id)); };
  A.listPosts = async function () {
    var q = await Promise.all([
      A.people(),
      sb.from("posts").select("id,user_id,category,title,body,image_path,created_at,likes(count),comments(count)").order("created_at", { ascending: false }).limit(50),
      sb.from("likes").select("post_id").eq("user_id", S.user.id)
    ]);
    var mine = {}; (q[2].data || []).forEach(function (l) { mine[l.post_id] = 1; });
    return ck(q[1]).map(function (p) {
      return { id: p.id, uid: p.user_id, cat: p.category, title: p.title, body: p.body, path: p.image_path, img: p.image_path ? url(p.image_path) : "", at: p.created_at,
        likes: p.likes && p.likes[0] ? p.likes[0].count : 0, comments: p.comments && p.comments[0] ? p.comments[0].count : 0, liked: !!mine[p.id], author: q[0][p.user_id] || "Člen" };
    });
  };
  A.createPost = async function (p, file) {
    var path = null;
    if (file) {
      var b = await shrink(file); path = S.user.id + "/" + uuid() + ".jpg";
      var u = await sb.storage.from("photos").upload(path, b, { contentType: "image/jpeg" });
      if (u.error) throw u.error;
    }
    ck(await sb.from("posts").insert({ user_id: S.user.id, category: p.cat, title: p.title, body: p.body, image_path: path }));
  };
  A.delPost = async function (p) {
    ck(await sb.from("posts").delete().eq("id", p.id));
    if (p.path) await sb.storage.from("photos").remove([p.path]);
  };
  A.toggleLike = async function (id, liked) {
    if (liked) ck(await sb.from("likes").delete().eq("post_id", id).eq("user_id", S.user.id));
    else ck(await sb.from("likes").insert({ post_id: id, user_id: S.user.id }));
  };
  A.listComments = async function (id) {
    var pe = await A.people();
    return ck(await sb.from("comments").select("id,user_id,body,created_at").eq("post_id", id).order("created_at")).map(function (x) {
      return { id: x.id, uid: x.user_id, body: x.body, at: x.created_at, author: pe[x.user_id] || "Člen" };
    });
  };
  A.addComment = async function (id, body) { ck(await sb.from("comments").insert({ post_id: id, user_id: S.user.id, body: body })); };
  A.delComment = async function (id, cid) { ck(await sb.from("comments").delete().eq("id", cid)); };
  A.listMsgs = async function () {
    var pe = await A.people();
    var r = ck(await sb.from("messages").select("id,user_id,body,created_at").order("created_at", { ascending: false }).limit(100));
    return r.reverse().map(function (m) { return { id: m.id, uid: m.user_id, body: m.body, at: m.created_at, author: pe[m.user_id] || "Člen" }; });
  };
  A.sendMsg = async function (body) {
    var m = ck(await sb.from("messages").insert({ user_id: S.user.id, body: body }).select().single());
    return { id: m.id, uid: m.user_id, body: m.body, at: m.created_at, author: S.profile && S.profile.name || "Ty" };
  };
  A.delMsg = async function (id) { ck(await sb.from("messages").delete().eq("id", id)); };
  A.onMsg = function (cb) {
    var ch = sb.channel("msgs-" + uuid())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, function (p) {
        cb({ id: p.new.id, uid: p.new.user_id, body: p.new.body, at: p.new.created_at });
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages" }, function (p) { cb({ del: p.old.id }); })
      .subscribe();
    return function () { sb.removeChannel(ch); };
  };
  A.checkout = async function (plan) { var u = await call("/api/create-checkout", { plan: plan }); location.href = u; return u; };
  A.portal = async function () { var u = await call("/api/portal"); location.href = u; return u; };
  return A;
}
var api = LIVE ? liveApi() : demoApi();

/* ---------- vykresľovanie ---------- */
function logo() { return '<svg width="38" height="26" viewBox="0 0 38 26" fill="none" stroke="#fff" stroke-width="2.4" stroke-linejoin="round" aria-hidden="true"><path d="M2 24 14 6l5 8 4-5 13 15"/><path d="m11 12 3-5 4 6"/></svg>'; }
function curHash() { return (location.hash.replace(/^#\/?/, "") || "domov").split("?")[0]; }
function lockIc(k) { return !isMember() && (k === "komunita" || k === "chat" || k === "fotky") ? " 🔒" : ""; }

function nav() {
  var cur = curHash();
  var links = [["domov", "Domov"], ["o-nas", "O nás"], ["predplatne", "Predplatné"], ["behy", "Behy"], ["komunita", "Komunita"], ["chat", "Chat"], ["fotky", "Fotky"]];
  $("#nav").innerHTML =
    '<a class="br" href="#/domov">' + logo() + "<span>" + esc(c("brand")) + "<small>" + esc(c("sub")) + "</small></span></a>" +
    '<nav class="ml" aria-label="Hlavné menu">' + links.map(function (l) { return '<a href="#/' + l[0] + '"' + (cur === l[0] ? ' class="on" aria-current="page"' : "") + ">" + l[1] + lockIc(l[0]) + "</a>"; }).join("") + "</nav>" +
    (S.user
      ? '<a class="btn ghost sm" href="#/ucet">' + (isMember() ? "Člen ✓" : "Účet") + "</a>"
      : '<button class="btn ghost sm" data-act="auth" data-mode="login">Prihlásiť</button><button class="btn sm" data-act="auth" data-mode="register">Registrácia</button>');
  $("#banner").innerHTML = LIVE ? "" : "Ukážkový režim: nič sa neukladá. Pripoj Supabase v súbore config.js (postup je v README).";
}
function foot() {
  $("#foot").innerHTML = '<div class="in"><div><b>' + E("brand", "span") + "</b> " + E("sub", "span", "muted") + '</div><div class="sc">' + E("tag", "span") + "</div>" +
    "<div>" + E("foot.contact", "span", "muted") + ' · <a href="#/podmienky">Podmienky</a> · <a href="#/ochrana">Ochrana údajov</a>' +
    (isAdmin() ? ' · <button class="lnk" data-act="edit">' + (S.edit ? "Dokončiť úpravy" : "Upraviť texty") + "</button>" : "") +
    (!LIVE ? ' · <button class="lnk" data-act="demo-admin">Ukážka: admin</button>' : "") + "</div></div>";
}
function imgBtn(key) {
  return editing() ? '<label class="btn ghost sm">Zmeniť obrázok<input type="file" accept="image/*" hidden data-img="img.' + key + '"></label>' : "";
}
function hero(key, eb, t, sub, btn) {
  var u = c("img." + key).replace(/'/g, "%27");
  return '<section class="hero" style="background-image:linear-gradient(90deg,#000 12%,rgba(0,0,0,.2)),url(\'' + u + '\')"><div class="in">' +
    (eb ? E(eb, "div", "eb") : "") + E(t, "h1") + (sub ? E(sub, "p") : "") +
    (btn ? '<a class="btn" href="#/predplatne">' + E(btn, "span") + "</a>" : "") + imgBtn(key) + "</div></section>";
}
function PH(t) { return '<section class="phead"><div class="in"><h1>' + esc(t) + "</h1></div></section>"; }
function head(t, sub) { return '<section class="phead"><div class="in">' + E(t, "h1") + (sub ? E(sub, "p") : "") + "</div></section>"; }
function cta() {
  return '<section class="dk"><div class="in" style="text-align:center">' + E("home.cta.t", "h2") + E("home.cta.p", "p", "muted") +
    '<a class="btn" href="#/' + (isMember() ? "komunita" : "predplatne") + '">' + (isMember() ? "Do komunity" : "Vybrať predplatné") + "</a></div></section>";
}
var MON = ["jan", "feb", "mar", "apr", "máj", "jún", "júl", "aug", "sep", "okt", "nov", "dec"];
function evCard(e) {
  var d = new Date(e.date + "T00:00:00");
  return '<div class="card"><div class="date">' + d.getDate() + "<small>" + MON[d.getMonth()] + "</small></div><h3>" + esc(e.title) + "</h3>" +
    '<div class="muted">' + [e.distance, e.place].filter(Boolean).map(esc).join(" · ") + "</div>" + (e.description ? "<p>" + esc(e.description) + "</p>" : "") +
    (isAdmin() ? '<p><button class="lnk" data-act="del-event" data-id="' + esc(e.id) + '">Zmazať</button></p>' : "") + "</div>";
}
function gate() {
  if (!S.user) return PH("Pre členov") + '<section><div class="card lockc"><h2>Obsah pre členov</h2><p class="muted">Prihlás sa alebo si vytvor účet.</p><button class="btn dark" data-act="auth" data-mode="login">Prihlásiť sa</button> <button class="btn ghost" data-act="auth" data-mode="register">Registrácia</button></div></section>';
  if (!isMember()) return PH("Pre členov") + '<section><div class="card lockc"><h2>Obsah pre členov</h2><p class="muted">Táto časť je dostupná s aktívnym predplatným.</p><a class="btn dark" href="#/predplatne">Vybrať predplatné</a></div></section>';
  return "";
}

async function home() {
  var ev = (await api.events()).slice(0, 4);
  return hero("home", "home.eyebrow", "home.title", "home.sub", "home.btn") +
    '<section><div class="in tx"><div>' + E("home.about.eb", "div", "eb") + E("home.about.t", "h2") + E("home.about.p", "p") + '<a class="btn dark" href="#/o-nas" style="margin-top:12px">Viac o nás</a></div><div class="im2" style="background-image:url(\'' + esc(c("img.side")) + '\')"></div></div></section>' +
    '<section class="dk"><div class="in">' + E("home.events.eb", "div", "eb") + E("home.events.t", "h2") + '<div class="gr" style="color:var(--ink)">' + (ev.map(evCard).join("") || '<p class="muted">Zatiaľ nie sú naplánované žiadne behy.</p>') + "</div><a class=\"btn\" href=\"#/behy\">Všetky behy</a></div></section>" + cta();
}
async function about() {
  return hero("about", "about.eb", "about.title", "about.sub") +
    '<section><div class="in tx"><div>' + E("about.story.eb", "div", "eb") + E("about.story.t", "h2") + E("about.story.p", "p") + "</div><div>" + E("about.mission.eb", "div", "eb") + E("about.mission.t", "h2") + E("about.mission.p", "p") + "</div></div></section>" +
    '<section><div class="in">' + E("about.values.eb", "div", "eb") + E("about.values.t", "h2") + '<div class="gr">' + [1, 2, 3, 4].map(function (i) { return '<div class="card">' + E("v" + i + ".t", "h3") + E("v" + i + ".p", "p", "muted") + "</div>"; }).join("") + "</div></div></section>" + cta();
}
async function plans() {
  var cur = S.profile && S.profile.plan;
  var pl = ["basic", "standard", "premium"].map(function (id, i) {
    var mine = isMember() && cur === id;
    return '<div class="card plan' + (i === 1 ? " hot" : "") + '">' + (i === 1 ? '<span class="badge">Najpopulárnejší</span>' : "") + E("plan." + id + ".name", "h3") +
      '<div class="price">' + E("plan." + id + ".price", "span") + " <small>/ mesiac</small></div>" + E("plan." + id + ".desc", "p", "muted") + LST("plan." + id + ".list") +
      '<button class="btn' + (i === 1 ? "" : " dark") + '" data-act="plan" data-plan="' + id + '"' + (mine ? " disabled" : "") + ">" + (mine ? "Tvoj balíček" : "Vybrať predplatné") + "</button></div>";
  }).join("");
  return hero("plans", "plans.eb", "plans.title", "plans.sub") + '<section><div class="in"><div class="gr" style="margin-top:8px">' + pl + "</div>" +
    '<p class="muted">Platba kartou prebieha cez Stripe. Predplatné môžeš kedykoľvek zrušiť v sekcii Účet.</p></div></section>' +
    '<section class="dk"><div class="in">' + E("ben.t", "h2") + '<div class="gr" style="color:var(--ink)">' + [1, 2, 3, 4, 5, 6].map(function (i) { return '<div class="card">' + E("b" + i + ".t", "h3") + E("b" + i + ".p", "p", "muted") + "</div>"; }).join("") + "</div></div></section>";
}
async function events() {
  var ev = await api.events();
  var form = isAdmin() ? '<form class="card stack" data-form="event" style="margin-bottom:16px"><b>Pridať beh</b><input name="title" placeholder="Názov" required><input name="date" type="date" required><input name="place" placeholder="Miesto"><input name="distance" placeholder="Dĺžka (napr. 10 km)"><textarea name="description" placeholder="Popis"></textarea><button class="btn dark">Pridať</button></form>' : "";
  return head("ev.t", "ev.sub") + '<section><div class="in">' + form + '<div class="gr">' + (ev.map(evCard).join("") || '<p class="muted">Zatiaľ nie sú naplánované žiadne behy.</p>') + "</div></div></section>";
}
function composer() {
  return '<form class="card stack" data-form="post"><b>Nový príspevok</b><select name="cat">' + CATS.map(function (x) { return "<option>" + x + "</option>"; }).join("") +
    '</select><input name="title" placeholder="Nadpis" required maxlength="120"><textarea name="body" placeholder="Čo máš na srdci?" maxlength="4000"></textarea><input type="file" name="file" accept="image/jpeg,image/png,image/webp"><button class="btn dark">Zverejniť</button></form>';
}
function postCard(p) {
  var own = S.user && (p.uid === S.user.id || (!LIVE && p.uid === "demo"));
  return '<article class="card post" data-id="' + esc(p.id) + '"><div class="who"><span class="av">' + esc((p.author || "?").charAt(0).toUpperCase()) + "</span><div><b>" + esc(p.author) + '</b> <span class="muted">· ' + ago(p.at) + '</span></div><span class="tg" style="margin-left:auto">' + esc(p.cat) + "</span></div>" +
    '<h3 style="margin-top:10px">' + esc(p.title) + '</h3><div class="body">' + esc(p.body) + "</div>" + (p.img ? '<img class="ph" loading="lazy" alt="" src="' + esc(p.img) + '">' : "") +
    '<div class="acts"><button class="' + (p.liked ? "on" : "") + '" data-act="like" aria-pressed="' + !!p.liked + '">♥ ' + p.likes + '</button><button data-act="comments">💬 ' + p.comments + "</button>" +
    (own || isAdmin() ? '<button data-act="del-post">Zmazať</button>' : "") + '</div><div class="cm" hidden></div></article>';
}
async function community() {
  var g = gate(); if (g) return g;
  var posts = await api.listPosts(); window.__posts = posts;
  return head("com.t", "com.sub") + '<section><div class="in narrow">' + composer() + '<div id="feed">' + (posts.map(postCard).join("") || '<p class="muted">Zatiaľ žiadne príspevky. Buď prvý!</p>') + "</div></div></section>";
}
function msgHtml(m) {
  var me = S.user && (m.uid === S.user.id || (!LIVE && m.uid === "demo"));
  return '<div class="msg' + (me ? " me" : "") + '" data-id="' + esc(m.id) + '"><b>' + esc(m.author) + '<span class="t">' + ago(m.at) + "</span>" + (me || isAdmin() ? ' <button class="lnk" style="color:inherit" data-act="del-msg">×</button>' : "") + "</b><span>" + esc(m.body) + "</span></div>";
}
async function chat() {
  var g = gate(); if (g) return g;
  var ms = await api.listMsgs(); S.people = await api.people();
  setTimeout(function () {
    var box = $("#msgs"); if (!box) return; box.scrollTop = box.scrollHeight;
    var off = api.onMsg(async function (m) {
      var b = $("#msgs"); if (!b) return;
      if (m.del) { var d = b.querySelector('[data-id="' + m.del + '"]'); if (d) d.remove(); return; }
      if (b.querySelector('[data-id="' + m.id + '"]')) return;
      if (!S.people[m.uid]) S.people = await api.people();
      m.author = S.people[m.uid] || "Člen"; addMsg(m);
    });
    cleanup = off;
  }, 0);
  return head("chat.t", "chat.sub") + '<section><div class="in narrow card chat"><div id="msgs" aria-live="polite">' + ms.map(msgHtml).join("") + '</div><form class="stack" data-form="msg" style="grid-template-columns:1fr auto"><input name="body" placeholder="Napíš správu…" required maxlength="1000" autocomplete="off"><button class="btn dark">Poslať</button></form></div></section>';
}
function addMsg(m) {
  var b = $("#msgs"); if (!b || b.querySelector('[data-id="' + m.id + '"]')) return;
  var near = b.scrollHeight - b.scrollTop - b.clientHeight < 120;
  b.insertAdjacentHTML("beforeend", msgHtml(m)); if (near) b.scrollTop = b.scrollHeight;
}
async function photos() {
  var g = gate(); if (g) return g;
  var ps = (await api.listPosts()).filter(function (p) { return p.img; });
  return head("ph.t", "ph.sub") + '<section><div class="in"><p><a class="btn dark" href="#/komunita">Pridať fotku</a></p><div class="photos">' +
    (ps.map(function (p) { return '<a href="' + esc(p.img) + '" target="_blank" rel="noopener" aria-label="' + esc(p.title) + '" style="background-image:url(\'' + esc(p.img).replace(/'/g, "%27") + "')\"></a>"; }).join("") || '<p class="muted">Zatiaľ žiadne fotky.</p>') + "</div></div></section>";
}
async function account() {
  if (!S.user) return PH("Pre členov") + '<section><div class="card lockc"><h2>Účet</h2><p class="muted">Prihlás sa, aby si videl svoj účet.</p><button class="btn dark" data-act="auth" data-mode="login">Prihlásiť sa</button></div></section>';
  var paid = /paid=1/.test(location.hash);
  if (paid && !isMember()) pollMember();
  var p = S.profile || {};
  return '<section class="phead"><div class="in"><h1>Môj účet</h1><p>' + esc(S.user.email || "") + "</p></div></section>" +
    '<section><div class="in narrow"><div class="card stack">' +
    (paid && !isMember() ? '<p class="err ok">Ďakujeme! Spracúvame platbu, členstvo sa aktivuje do pár sekúnd…</p>' : "") +
    "<div><b>Členstvo:</b> " + (isMember() ? '<span class="badge">' + esc((p.plan || "aktívne").toUpperCase()) + "</span>" : "nemáš aktívne predplatné") + "</div>" +
    (isMember() && p.role !== "admin" || (!LIVE && isMember()) ? '<button class="btn dark" data-act="portal">Spravovať predplatné a faktúry</button>' : '<a class="btn dark" href="#/predplatne">Vybrať predplatné</a>') +
    '<form class="stack" data-form="name"><label>Meno<input name="name" value="' + esc(p.name || "") + '" maxlength="40" required></label><button class="btn ghost">Uložiť meno</button></form>' +
    '<button class="btn ghost" data-act="logout">Odhlásiť sa</button>' + (isAdmin() ? '<p class="muted">Si administrátor: texty upravíš tlačidlom „Upraviť texty“ v pätičke.</p>' : "") + "</div></div></section>";
}
async function legal(k) { return head(k + ".t", "") + '<section><div class="in narrow">' + E(k + ".p", "p") + "</div></section>"; }

var ROUTES = { domov: home, "o-nas": about, predplatne: plans, behy: events, komunita: community, chat: chat, fotky: photos, ucet: account,
  podmienky: function () { return legal("terms"); }, ochrana: function () { return legal("priv"); } };

async function route() {
  if (cleanup) { try { cleanup(); } catch (e) {} cleanup = null; }
  document.body.classList.toggle("ed", editing());
  var f = ROUTES[curHash()] || home;
  $("#app").innerHTML = '<section><div class="in muted">Načítavam…</div></section>';
  try { $("#app").innerHTML = await f(); }
  catch (e) { console.error(e); $("#app").innerHTML = '<section><div class="in card lockc"><h2>Ups</h2><p class="muted">' + esc(sk(e)) + "</p></div></section>"; }
  nav(); foot();
  document.title = ($("#app h1") ? $("#app h1").textContent + " · " : "") + c("brand");
}
async function loadProfile() { S.profile = S.user ? await api.profile() : null; }
async function afterAuth() { S.user = await api.user(); await loadProfile(); route(); }
function pollMember() {
  var n = 0;
  (function t() {
    setTimeout(async function () {
      if (!/paid=1/.test(location.hash) || ++n > 12) return;
      await loadProfile();
      if (isMember()) { toast("Členstvo je aktívne. Vitaj v komunite!"); route(); } else t();
    }, 2500);
  })();
}

/* ---------- prihlásenie ---------- */
function openAuth(mode, note) {
  var d = $("#dlg"), reg = mode === "register";
  d.innerHTML = '<div class="dh"><b>' + (reg ? "Registrácia" : "Prihlásenie") + '</b><form method="dialog"><button aria-label="Zavrieť">×</button></form></div>' +
    '<form class="stack" data-form="' + mode + '">' + (note ? '<p class="muted">' + esc(note) + "</p>" : "") +
    (reg ? '<input name="name" placeholder="Meno" required maxlength="40" autocomplete="name">' : "") +
    '<input name="email" type="email" placeholder="E-mail" required autocomplete="email">' +
    '<input name="password" type="password" placeholder="Heslo (min. 8 znakov)" required minlength="8" autocomplete="' + (reg ? "new-password" : "current-password") + '">' +
    (reg ? '<label class="ck"><input type="checkbox" name="agree" required><span>Súhlasím s <a href="#/podmienky" data-close>podmienkami</a> a <a href="#/ochrana" data-close>ochranou údajov</a>.</span></label>' : "") +
    '<p class="err" id="aerr" role="alert"></p><button class="btn dark">' + (reg ? "Vytvoriť účet" : "Prihlásiť sa") + "</button>" +
    '<p class="muted">' + (reg ? 'Už máš účet? <a href="#" data-act="auth" data-mode="login">Prihlás sa</a>' : 'Nemáš účet? <a href="#" data-act="auth" data-mode="register">Zaregistruj sa</a>') + "</p></form>";
  if (!d.open) d.showModal();
}

/* ---------- udalosti ---------- */
document.addEventListener("click", async function (e) {
  var t = e.target;
  if (t.closest("[data-close]")) { $("#dlg").close(); return; }
  var a = t.closest("[data-act]"); if (!a) return;
  var act = a.dataset.act; if (a.tagName === "A") e.preventDefault();
  try {
    if (act === "auth") openAuth(a.dataset.mode);
    else if (act === "logout") { await api.signOut(); S.user = null; S.profile = null; S.edit = false; location.hash = "#/domov"; route(); }
    else if (act === "edit") { S.edit = !S.edit; route(); }
    else if (act === "demo-admin") { api.demo.admin = !api.demo.admin; await loadProfile(); S.edit = false; route(); toast(api.demo.admin ? "Admin zapnutý" : "Admin vypnutý"); }
    else if (act === "plan") {
      if (!S.user) { openAuth("register", "Najprv si vytvor účet, potom vyberieš balíček."); return; }
      a.disabled = true;
      try { var r = await api.checkout(a.dataset.plan); if (r === "demo") { await loadProfile(); toast("Ukážka: členstvo aktivované"); route(); } else if (!r) a.disabled = false; }
      catch (er) { a.disabled = false; throw er; }
    }
    else if (act === "portal") { var u = await api.portal(); if (u === "demo") { await loadProfile(); route(); } }
    else if (act === "del-event") { await api.delEvent(a.dataset.id); route(); }
    else if (act === "like") {
      var card = a.closest(".post"), p = window.__posts.find(function (x) { return x.id === card.dataset.id; });
      await api.toggleLike(p.id, p.liked); p.liked = !p.liked; p.likes += p.liked ? 1 : -1;
      a.className = p.liked ? "on" : ""; a.setAttribute("aria-pressed", p.liked); a.textContent = "♥ " + p.likes;
    }
    else if (act === "comments") { var cc = a.closest(".post"); var box = $(".cm", cc); box.hidden = !box.hidden; if (!box.hidden) await loadComments(cc); }
    else if (act === "del-comment") { var pc = a.closest(".post"); await api.delComment(pc.dataset.id, a.dataset.id); await loadComments(pc); }
    else if (act === "del-post") {
      if (!confirm("Zmazať príspevok?")) return;
      var p2 = window.__posts.find(function (x) { return x.id === a.closest(".post").dataset.id; });
      await api.delPost(p2); route();
    }
    else if (act === "del-msg") { var m = a.closest(".msg"); await api.delMsg(isNaN(m.dataset.id) ? m.dataset.id : Number(m.dataset.id)); m.remove(); }
  } catch (er) { console.error(er); toast(sk(er)); }
});
async function loadComments(card) {
  var box = $(".cm", card), id = card.dataset.id, cs = await api.listComments(id);
  box.innerHTML = cs.map(function (x) {
    var own = S.user && (x.uid === S.user.id || (!LIVE && x.uid === "demo"));
    return "<div><b>" + esc(x.author) + '</b> <span class="muted">' + ago(x.at) + "</span>" + (own || isAdmin() ? ' <button class="lnk" data-act="del-comment" data-id="' + esc(x.id) + '">zmazať</button>' : "") + "<p>" + esc(x.body) + "</p></div>";
  }).join("") + '<form class="stack" data-form="comment" style="grid-template-columns:1fr auto"><input name="body" placeholder="Napíš komentár…" required maxlength="1000" autocomplete="off"><button class="btn dark sm">Poslať</button></form>';
}
document.addEventListener("submit", async function (e) {
  var f = e.target, k = f.dataset && f.dataset.form; if (!k) return;
  e.preventDefault();
  var d = Object.fromEntries(new FormData(f)), btn = f.querySelector("button:not([type=button])");
  if (btn) btn.disabled = true;
  try {
    if (k === "login" || k === "register") {
      var r = k === "login" ? await api.signIn(d.email.trim(), d.password) : await api.signUp(d.email.trim(), d.password, d.name.trim());
      if (r && r.needConfirm) { var er = $("#aerr"); er.className = "err ok"; er.textContent = "Skontroluj e-mail a potvrď registráciu, potom sa prihlás."; return; }
      $("#dlg").close(); await afterAuth(); toast(k === "login" ? "Vitaj späť!" : "Účet vytvorený. Teraz si vyber balíček.");
      if (k === "register" && !isMember()) location.hash = "#/predplatne";
    }
    else if (k === "post") { await api.createPost({ cat: d.cat, title: d.title.trim(), body: (d.body || "").trim() }, f.file.files[0]); toast("Príspevok zverejnený"); route(); }
    else if (k === "comment") { var card = f.closest(".post"); await api.addComment(card.dataset.id, d.body.trim()); var p = window.__posts.find(function (x) { return x.id === card.dataset.id; }); p.comments++; $('[data-act="comments"]', card).textContent = "💬 " + p.comments; await loadComments(card); }
    else if (k === "msg") { var m = await api.sendMsg(d.body.trim()); f.reset(); addMsg(m); }
    else if (k === "event") { await api.saveEvent({ title: d.title.trim(), date: d.date, place: d.place || null, distance: d.distance || null, description: d.description || null }); toast("Beh pridaný"); route(); }
    else if (k === "name") { await api.setName(d.name.trim()); await loadProfile(); toast("Meno uložené"); }
  } catch (er2) {
    console.error(er2);
    if ($("#aerr") && $("#dlg").open) { $("#aerr").className = "err"; $("#aerr").textContent = sk(er2); } else toast(sk(er2));
  } finally { if (btn) btn.disabled = false; }
});
document.addEventListener("focusout", async function (e) {
  var el = e.target; if (!editing() || !el.dataset || !el.dataset.c) return;
  var v = el.innerText.replace(/\u00a0/g, " ").trim(), k = el.dataset.c;
  if (v === c(k)) return;
  try { await api.saveContent(k, v); S.content[k] = v; toast("Uložené"); if (k === "brand" || k === "sub") nav(); }
  catch (er) { toast(sk(er)); }
});
document.addEventListener("change", async function (e) {
  var el = e.target; if (!el.dataset || !el.dataset.img || !el.files[0]) return;
  try { var u = await api.uploadSite(el.files[0]); await api.saveContent(el.dataset.img, u); S.content[el.dataset.img] = u; toast("Obrázok zmenený"); route(); }
  catch (er) { toast(sk(er)); }
});
window.addEventListener("hashchange", function () { route(); scrollTo(0, 0); });

/* ---------- štart ---------- */
(async function init() {
  try {
    if (LIVE) {
      S.user = await api.user();
      sb.auth.onAuthStateChange(function (ev, ss) {
        setTimeout(async function () {
          var u = ss ? ss.user : null;
          if ((u && u.id) === (S.user && S.user.id)) return;
          S.user = u; await loadProfile(); route();
        }, 0);
      });
    }
    await loadProfile();
    S.content = await api.content();
  } catch (e) { console.error(e); }
  nav(); foot(); route();
})();
})();
