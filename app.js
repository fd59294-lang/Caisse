/* Caisse du Comité des Fêtes — application autonome, hors ligne, pour tablette Android. */
"use strict";

const VERSION_APP = "1.0.0";
const $app = document.getElementById("app");
const S = {
  params: null, categories: [], articles: [], moyens: [], utilisateurs: [], session: null,
  user: null, vue: "caisse", panier: [], remiseTicket: null, categorieActive: "toutes",
  derniereVente: null, modal: null, cache: {}, logoPx: null, fichier: null,
};

// ====================================================================== utilitaires
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const h = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const eur = c => ((c || 0) / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
const versCentimes = v => {
  const n = parseFloat(String(v ?? "").replace(/\s|€/g, "").replace(",", "."));
  return isNaN(n) ? null : Math.round(n * 100);
};
const enEuros = c => Math.round(c) / 100;
const somme = t => t.reduce((a, b) => a + (b || 0), 0);
const dateFr = iso => new Date(iso).toLocaleDateString("fr-FR");
const dateFichier = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const heureFr = iso => new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
const estResponsable = () => S.user?.role === "responsable";
const moyenParId = id => S.moyens.find(m => m.id === id);
const categorieParId = id => S.categories.find(c => c.id === id);

const COMPTES = [["706", "Entrées, inscriptions, repas"], ["707", "Buvette et restauration"],
  ["708", "Emplacements et exposants"], ["7083", "Locations de matériel"], ["7588", "Loto, tombola, jeux"],
  ["758", "Autres recettes"]];
const libelleCompte = code => (COMPTES.find(c => c[0] === code) || [code, code])[1];
const MODES_COMPTA = ["Espèces", "Carte bancaire", "Chèque", "Virement", "Autre"];
const COULEURS = ["#1F4E79", "#2E7D32", "#C62828", "#EF6C00", "#6A1B9A", "#00838F", "#AD1457", "#5D4037", "#455A64", "#B8860B"];
const COUPURES = [50000, 20000, 10000, 5000, 2000, 1000, 500, 200, 100, 50, 20, 10, 5, 2, 1];

function toast(msg, type = "ok") {
  const el = document.createElement("div");
  el.className = "toast toast-" + type;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.classList.add("visible"), 10);
  setTimeout(() => { el.classList.remove("visible"); setTimeout(() => el.remove(), 300); }, type === "erreur" ? 5000 : 2600);
}
function erreur(e) { console.error(e); toast(e?.message || String(e), "erreur"); }

// ====================================================================== initialisation
function paramsDefaut() {
  return {
    id: "config", nomAsso: "Comité des Fêtes", entete: "", pied: "Merci et bonne fête !", logo: null,
    largeur: 58, accents: "ascii", impression: "aucune", impressionAuto: false, formation: false,
    manifestations: ["Brocante", "Scène ouverte", "Fête du 14 juillet", "Centre de loisirs", "Loto", "Marché de Noël"],
    compteurTicket: 0, compteurSession: 0,
  };
}

async function donneesExemple() {
  const cats = [
    { id: uid(), nom: "Boissons", couleur: COULEURS[0], compte: "707", ordre: 1, actif: true },
    { id: uid(), nom: "Restauration", couleur: COULEURS[3], compte: "707", ordre: 2, actif: true },
    { id: uid(), nom: "Jetons", couleur: COULEURS[4], compte: "707", ordre: 3, actif: true },
  ];
  const a = (nom, cat, prix, ordre) => ({ id: uid(), nom, categorieId: cats[cat].id, prixC: prix, codeBarre: "",
    suiviStock: false, stock: 0, seuil: 0, ordre, actif: true });
  await DB.ecrireTous("categories", cats);
  await DB.ecrireTous("articles", [a("Bière", 0, 250, 1), a("Soda", 0, 150, 2), a("Eau", 0, 100, 3),
    a("Café", 0, 100, 4), a("Hot-dog", 1, 300, 1), a("Frites", 1, 250, 2), a("Crêpe", 1, 200, 3),
    a("Jeton 1 €", 2, 100, 1)]);
  await DB.ecrireTous("moyens", [
    { id: uid(), nom: "Espèces", type: "especes", modeCompta: "Espèces", encaisse: true, valeurJetonC: 0, ordre: 1, actif: true },
    { id: uid(), nom: "Carte bancaire", type: "autre", modeCompta: "Carte bancaire", encaisse: true, valeurJetonC: 0, ordre: 2, actif: true },
    { id: uid(), nom: "Chèque", type: "autre", modeCompta: "Chèque", encaisse: true, valeurJetonC: 0, ordre: 3, actif: true },
    { id: uid(), nom: "Jeton", type: "jeton", modeCompta: "Autre", encaisse: false, valeurJetonC: 100, ordre: 4, actif: true },
  ]);
  await DB.ecrire("utilisateurs", { id: uid(), nom: "Responsable", pin: "1234", role: "responsable" });
}

async function recharger() {
  const [c, a, m, u, sessions] = await Promise.all(["categories", "articles", "moyens", "utilisateurs", "sessions"].map(x => DB.tous(x)));
  const tri = (x, y) => (x.ordre ?? 99) - (y.ordre ?? 99) || String(x.nom).localeCompare(y.nom, "fr");
  S.categories = c.sort(tri); S.articles = a.sort(tri); S.moyens = m.sort(tri);
  S.utilisateurs = u.sort((x, y) => x.nom.localeCompare(y.nom, "fr"));
  S.session = sessions.find(s => !s.fermeeLe) || null;
  S.cache = {};
}

async function preparerLogo() {
  S.logoPx = null;
  if (S.params.logo) {
    try { S.logoPx = await ESCPOS.preparerLogo(S.params.logo, S.params.largeur === 80 ? 576 : 384); } catch (e) { console.warn(e); }
  }
}

async function initialiser() {
  try {
    let p = await DB.lire("params", "config");
    if (!p) { p = paramsDefaut(); await DB.ecrire("params", p); await donneesExemple(); }
    S.params = { ...paramsDefaut(), ...p };
    await recharger();
    await preparerLogo();
    try { await navigator.storage?.persist?.(); } catch (e) { /* facultatif */ }
  } catch (e) {
    $app.innerHTML = `<div class="carte centre"><h2>Démarrage impossible</h2><p>${h(e.message)}</p></div>`;
    return;
  }
  render();
}

async function sauverParams(maj = {}) {
  S.params = { ...S.params, ...maj };
  await DB.ecrire("params", S.params);
}

// ====================================================================== rendu général
function render() {
  if (!S.params) return;
  const defilement = document.querySelector(".defile")?.scrollTop;
  if (!S.user) {
    $app.innerHTML = vueVerrou() + rendreModal();
  } else {
    $app.innerHTML = enTete() + bandeaux() + `<main class="vue vue-${S.vue}">${(VUES[S.vue] || VUES.caisse)()}</main>` + rendreModal();
  }
  const d = document.querySelector(".defile");
  if (d && defilement) d.scrollTop = defilement;
  apresRendu();
}

function enTete() {
  const onglets = [["caisse", "Caisse", "🛒"], ["session", "Ma caisse", "💶"]];
  if (estResponsable()) onglets.push(["tableau", "Tableau de bord", "📊"], ["catalogue", "Articles", "🏷️"],
    ["stock", "Stock", "📦"], ["historique", "Historique", "🗂️"], ["reglages", "Réglages", "⚙️"]);
  const info = S.session ? `${h(S.session.manifestation)} · caisse n° ${S.session.numero}` : "Caisse fermée";
  return `<header class="barre">
    <div class="marque"><strong>${h(S.params.nomAsso)}</strong><span>${info}</span></div>
    <nav>${onglets.map(([v, l, i]) => `<button class="onglet ${S.vue === v ? "actif" : ""}" data-a="vue" data-v="${v}">
      <span class="ico">${i}</span><span class="lib">${l}</span></button>`).join("")}</nav>
    <button class="utilisateur" data-a="verrouiller" title="Changer d'utilisateur">👤 ${h(S.user.nom)}<small>Verrouiller</small></button>
  </header>`;
}

function bandeaux() {
  let b = "";
  if (S.params.formation) b += `<div class="bandeau formation">MODE FORMATION — les ventes ne sont pas enregistrées</div>`;
  if (estResponsable() && S.utilisateurs.some(u => u.pin === "1234"))
    b += `<div class="bandeau alerte">Le code 1234 est encore utilisé : changez-le dans Réglages → Utilisateurs.</div>`;
  return b;
}

function apresRendu() {
  if (S.modal?.type === "scan") demarrerScan();
  const auto = document.querySelector("[data-focus]");
  if (auto) auto.focus();
}

// ====================================================================== verrou / connexion
function vueVerrou() {
  return `<div class="verrou">
    <h1>${h(S.params.nomAsso)}</h1><p>Qui tient la caisse ?</p>
    <div class="tuiles-utilisateurs">${S.utilisateurs.map(u => `<button class="tuile-user" data-a="choisirUser" data-id="${u.id}">
      <span class="avatar">${h(u.nom.slice(0, 1).toUpperCase())}</span>${h(u.nom)}<small>${u.role === "responsable" ? "Responsable" : "Caissier"}</small></button>`).join("")}
    </div>
    <p class="discret">Caisse v${VERSION_APP} — fonctionne sans internet</p></div>`;
}

function modalPin(m) {
  return `<div class="modal petit"><h2>${h(m.titre)}</h2>
    <div class="pin-points">${[0, 1, 2, 3, 4, 5].slice(0, Math.max(4, m.saisie.length)).map(i => `<span class="${i < m.saisie.length ? "plein" : ""}"></span>`).join("")}</div>
    ${m.erreur ? `<p class="erreur">${h(m.erreur)}</p>` : ""}
    ${pave("pin", true)}
    <div class="boutons"><button class="secondaire" data-a="fermer">Annuler</button></div></div>`;
}

const A = {}; // actions (clics)
const F = {}; // formulaires
const I = {}; // saisies en direct
const C = {}; // changements

A.choisirUser = d => { S.modal = { type: "pin", titre: "Code de " + S.utilisateurs.find(u => u.id === d.id).nom, userId: d.id, saisie: "" }; render(); };
A.verrouiller = () => { S.user = null; S.modal = null; S.vue = "caisse"; render(); };

function verifierPin(m) {
  if (m.userId) {
    const u = S.utilisateurs.find(x => x.id === m.userId);
    if (u && m.saisie === u.pin) { S.user = u; S.modal = null; S.vue = "caisse"; render(); return; }
    if (m.saisie.length >= (u?.pin.length || 4)) { m.saisie = ""; m.erreur = "Code incorrect"; }
    render(); return;
  }
  // élévation : n'importe quel responsable
  const r = S.utilisateurs.find(x => x.role === "responsable" && x.pin === m.saisie);
  if (r) { const suite = m.suite; S.modal = null; render(); suite(r); return; }
  if (m.saisie.length >= 6 || (m.saisie.length >= 4 && !S.utilisateurs.some(x => x.role === "responsable" && x.pin.startsWith(m.saisie)))) {
    m.saisie = ""; m.erreur = "Code incorrect";
  }
  render();
}

function avecResponsable(suite, titre = "Code d'un responsable") {
  if (estResponsable()) return suite(S.user);
  S.modal = { type: "pin", titre, saisie: "", suite };
  render();
}

// ====================================================================== pavé numérique
function pave(cible, sansVirgule = false) {
  const touches = ["7", "8", "9", "4", "5", "6", "1", "2", "3", sansVirgule ? "C" : "00", "0", "⌫"];
  return `<div class="pave">${touches.map(k => `<button class="touche" data-a="touche" data-k="${k}" data-cible="${cible}">${k}</button>`).join("")}</div>`;
}

A.touche = d => {
  const m = S.modal;
  if (!m) return;
  if (d.k === "⌫") m.saisie = m.saisie.slice(0, -1);
  else if (d.k === "C") m.saisie = "";
  else if (m.saisie.length < 9) m.saisie += d.k;
  m.erreur = "";
  if (d.cible === "pin") return verifierPin(m);
  render();
};
const saisieCentimes = m => (m.saisie ? parseInt(m.saisie, 10) : 0);

// ====================================================================== CAISSE
const VUES = {};

function prixAffiche(a) { return eur(a.prixC); }

VUES.caisse = () => {
  if (!S.session && !S.params.formation) {
    return `<div class="carte centre ouvrir">
      <h2>La caisse est fermée</h2>
      <p>Ouvrez une session de caisse pour la manifestation du jour : fond de caisse, puis ventes, puis ticket Z à la fin.</p>
      <button class="principal grand" data-a="ouvrirSession">Ouvrir la caisse</button>
      <button class="secondaire" data-a="basculerFormation">S'entraîner (mode formation)</button></div>`;
  }
  const cats = S.categories.filter(c => c.actif !== false);
  const visibles = S.articles.filter(a => a.actif !== false && (S.categorieActive === "toutes" || a.categorieId === S.categorieActive));
  return `<div class="caisse">
    <section class="produits">
      <div class="puces">
        <button class="puce ${S.categorieActive === "toutes" ? "actif" : ""}" data-a="filtrer" data-id="toutes">Tout</button>
        ${cats.map(c => `<button class="puce ${S.categorieActive === c.id ? "actif" : ""}" style="--c:${c.couleur}" data-a="filtrer" data-id="${c.id}">${h(c.nom)}</button>`).join("")}
        <button class="puce scan" data-a="scanner" title="Scanner un code-barres">📷 Scanner</button>
      </div>
      <div class="grille defile">${visibles.map(tuileArticle).join("") || `<p class="discret">Aucun article dans cette catégorie.</p>`}</div>
    </section>
    <aside class="panier">${vuePanier()}</aside>
  </div>`;
};

function tuileArticle(a) {
  const c = categorieParId(a.categorieId);
  let badge = "";
  if (a.suiviStock) {
    if (a.stock <= 0) badge = `<span class="badge rouge">épuisé</span>`;
    else if (a.stock <= (a.seuil || 0)) badge = `<span class="badge orange">reste ${a.stock}</span>`;
    else badge = `<span class="badge">${a.stock}</span>`;
  }
  const qte = somme(S.panier.filter(l => l.articleId === a.id).map(l => l.qte));
  return `<button class="tuile ${a.suiviStock && a.stock <= 0 ? "epuise" : ""}" style="--c:${a.couleur || c?.couleur || COULEURS[0]}" data-a="ajouter" data-id="${a.id}">
    <span class="nom">${h(a.nom)}</span><span class="prix">${prixAffiche(a)}</span>${badge}
    ${qte ? `<span class="qte-panier">${qte}</span>` : ""}</button>`;
}

function totauxPanier() {
  const lignes = S.panier.map(l => {
    const brut = l.prixC * l.qte;
    const remise = !l.remise ? 0 : l.remise.type === "%" ? Math.round(brut * l.remise.valeur / 100) : Math.min(brut, l.remise.valeur);
    return { ...l, brutC: brut, remiseC: remise, totalC: brut - remise };
  });
  const sousTotal = somme(lignes.map(l => l.totalC));
  const r = S.remiseTicket;
  const remiseTicket = !r ? 0 : r.type === "%" ? Math.round(sousTotal * r.valeur / 100) : Math.min(sousTotal, r.valeur);
  return { lignes, sousTotalC: sousTotal, remiseTicketC: remiseTicket, totalC: sousTotal - remiseTicket };
}

function vuePanier() {
  const t = totauxPanier();
  if (!S.panier.length) {
    const v = S.derniereVente;
    return `<div class="panier-vide">
      ${v ? `<div class="vente-ok"><div class="coche">✓</div><div>Vente n° ${h(v.numero)} — ${eur(v.totalC)}</div>
        ${v.renduC > 0 ? `<div class="rendu">Rendu : <strong>${eur(v.renduC)}</strong></div>` : ""}
        <button class="secondaire" data-a="imprimerDernier">🖨️ Imprimer le ticket</button></div>`
        : `<p>Touchez un article pour commencer une vente.</p>`}</div>`;
  }
  return `<div class="lignes defile">${t.lignes.map((l, i) => `<div class="ligne" >
      <button class="ligne-nom" data-a="ouvrirLigne" data-i="${i}">${h(l.nom)}<small>${eur(l.prixC)}${l.remise ? ` · remise ${l.remise.type === "%" ? l.remise.valeur + " %" : eur(l.remise.valeur)}` : ""}</small></button>
      <div class="qte"><button data-a="qte" data-i="${i}" data-d="-1">−</button><span>${l.qte}</span><button data-a="qte" data-i="${i}" data-d="1">+</button></div>
      <div class="montant">${eur(l.totalC)}</div></div>`).join("")}</div>
    <div class="totaux">
      ${t.remiseTicketC ? `<div class="sous"><span>Sous-total</span><span>${eur(t.sousTotalC)}</span></div>
        <div class="sous"><span>Remise</span><span>−${eur(t.remiseTicketC)}</span></div>` : ""}
      <div class="total"><span>Total</span><span>${eur(t.totalC)}</span></div>
    </div>
    <div class="actions-panier">
      <button class="secondaire" data-a="viderPanier">Vider</button>
      <button class="secondaire" data-a="remiseTicket">Remise</button>
      <button class="principal encaisser" data-a="encaisser">Encaisser ${eur(t.totalC)}</button>
    </div>`;
}

A.filtrer = d => { S.categorieActive = d.id; render(); };

function ajouterArticle(a) {
  if (!S.session && !S.params.formation) return toast("Ouvrez d'abord la caisse.", "erreur");
  S.derniereVente = null;
  const l = S.panier.find(x => x.articleId === a.id && !x.remise);
  if (l) l.qte += 1;
  else S.panier.push({ articleId: a.id, nom: a.nom, prixC: a.prixC, qte: 1, remise: null });
  if (a.suiviStock && a.stock - somme(S.panier.filter(x => x.articleId === a.id).map(x => x.qte)) < 0)
    toast(`Attention : stock de « ${a.nom} » insuffisant`, "alerte");
  render();
}
A.ajouter = d => ajouterArticle(S.articles.find(a => a.id === d.id));
A.qte = d => {
  const l = S.panier[+d.i];
  l.qte += +d.d;
  if (l.qte <= 0) S.panier.splice(+d.i, 1);
  render();
};
A.viderPanier = () => { S.panier = []; S.remiseTicket = null; render(); };

A.ouvrirLigne = d => {
  const l = S.panier[+d.i];
  S.modal = { type: "ligne", i: +d.i, qte: l.qte, remise: l.remise };
  render();
};
function modalLigne(m) {
  const l = S.panier[m.i];
  return `<div class="modal"><h2>${h(l.nom)}</h2>
    <div class="qte grande"><button data-a="ligneQte" data-d="-1">−</button><span>${m.qte}</span><button data-a="ligneQte" data-d="1">+</button></div>
    <h3>Remise sur cette ligne</h3>
    <div class="choix">${[["Aucune", null], ["10 %", { type: "%", valeur: 10 }], ["20 %", { type: "%", valeur: 20 }],
      ["50 %", { type: "%", valeur: 50 }], ["Offert", { type: "%", valeur: 100 }]].map(([lib, r]) =>
      `<button class="${JSON.stringify(m.remise) === JSON.stringify(r) ? "actif" : ""}" data-a="ligneRemise" data-r='${JSON.stringify(r)}'>${lib}</button>`).join("")}</div>
    <div class="boutons">
      <button class="danger" data-a="ligneSupprimer">Supprimer la ligne</button>
      <button class="secondaire" data-a="fermer">Annuler</button>
      <button class="principal" data-a="ligneValider">Valider</button></div></div>`;
}
A.ligneQte = d => { S.modal.qte = Math.max(1, S.modal.qte + +d.d); render(); };
A.ligneRemise = d => { S.modal.remise = JSON.parse(d.r); render(); };
A.ligneSupprimer = () => { S.panier.splice(S.modal.i, 1); S.modal = null; render(); };
A.ligneValider = () => { const l = S.panier[S.modal.i]; l.qte = S.modal.qte; l.remise = S.modal.remise; S.modal = null; render(); };

A.remiseTicket = () => { S.modal = { type: "remise", mode: S.remiseTicket?.type || "%", saisie: "" }; render(); };
function modalRemise(m) {
  const val = m.mode === "%" ? (m.saisie || "0") + " %" : eur(saisieCentimes(m));
  return `<div class="modal petit"><h2>Remise sur le ticket</h2>
    <div class="choix"><button class="${m.mode === "%" ? "actif" : ""}" data-a="remiseMode" data-m="%">En %</button>
      <button class="${m.mode === "€" ? "actif" : ""}" data-a="remiseMode" data-m="€">En €</button></div>
    <div class="affichage">${val}</div>${pave("remise", m.mode === "%")}
    <div class="boutons"><button class="secondaire" data-a="remiseRetirer">Sans remise</button>
      <button class="principal" data-a="remiseValider">Appliquer</button></div></div>`;
}
A.remiseMode = d => { S.modal.mode = d.m; S.modal.saisie = ""; render(); };
A.remiseRetirer = () => { S.remiseTicket = null; S.modal = null; render(); };
A.remiseValider = () => {
  const m = S.modal;
  const v = m.mode === "%" ? Math.min(100, parseInt(m.saisie || "0", 10)) : saisieCentimes(m);
  S.remiseTicket = v > 0 ? { type: m.mode, valeur: v } : null;
  S.modal = null; render();
};

// ---------------------------------------------------------------- paiement
A.encaisser = () => {
  const t = totauxPanier();
  S.modal = { type: "paiement", totalC: t.totalC, paiements: [], moyen: null, saisie: "" };
  if (t.totalC === 0) return finaliserVente();
  render();
};
const resteAPayer = m => m.totalC - somme(m.paiements.map(p => p.montantC));

function modalPaiement(m) {
  const reste = resteAPayer(m);
  const moyens = S.moyens.filter(x => x.actif !== false);
  let droite;
  if (!m.moyen) {
    const esp = moyens.find(x => x.type === "especes");
    const billets = [500, 1000, 2000, 5000, 10000].filter(b => b > reste).slice(0, 3);
    droite = `${esp ? `<h3>Espèces</h3><div class="rapides">
        <button class="principal" data-a="especesRapide" data-c="${reste}">Compte juste</button>
        ${billets.map(b => `<button data-a="especesRapide" data-c="${b}">${eur(b)}</button>`).join("")}
        <button data-a="choisirMoyen" data-id="${esp.id}">Autre montant…</button></div>` : ""}
      <h3>Autres moyens</h3><div class="moyens">${moyens.filter(x => x.type !== "especes").map(x =>
        `<button data-a="choisirMoyen" data-id="${x.id}">${h(x.nom)}</button>`).join("")}</div>`;
  } else {
    const jeton = m.moyen.type === "jeton";
    const montant = jeton ? (parseInt(m.saisie || "0", 10)) : saisieCentimes(m);
    droite = `<h3>${h(m.moyen.nom)}</h3>
      <div class="affichage">${jeton ? `${montant} jeton(s) = ${eur(montant * m.moyen.valeurJetonC)}` : eur(montant)}</div>
      <p class="discret">${jeton ? `Laissez vide pour ${Math.ceil(reste / (m.moyen.valeurJetonC || 1))} jeton(s).` :
        m.moyen.type === "especes" ? "Montant reçu du client (vide = compte juste)." : "Laissez vide pour le reste à payer."}</p>
      ${pave("paiement", jeton)}
      <div class="boutons"><button class="secondaire" data-a="annulerMoyen">Retour</button>
        <button class="principal" data-a="validerPaiement">OK</button></div>`;
  }
  return `<div class="modal large paiement">
    <div class="col-gauche">
      <div class="a-payer"><span>Total</span><strong>${eur(m.totalC)}</strong></div>
      ${m.paiements.map((p, i) => `<div class="paye"><span>${h(p.nom)}${p.unites ? ` (${p.unites})` : ""}</span><span>${eur(p.montantC)}</span>
        <button class="mini" data-a="retirerPaiement" data-i="${i}">✕</button></div>`).join("")}
      <div class="reste"><span>Reste à payer</span><strong>${eur(reste)}</strong></div>
      <button class="secondaire" data-a="fermer">Retour à la vente</button>
    </div>
    <div class="col-droite">${droite}</div></div>`;
}

A.choisirMoyen = d => { S.modal.moyen = moyenParId(d.id); S.modal.saisie = ""; render(); };
A.annulerMoyen = () => { S.modal.moyen = null; S.modal.saisie = ""; render(); };
A.retirerPaiement = d => { S.modal.paiements.splice(+d.i, 1); render(); };
A.especesRapide = d => {
  const esp = S.moyens.find(x => x.type === "especes");
  ajouterPaiement(esp, +d.c);
};
A.validerPaiement = () => {
  const m = S.modal;
  const reste = resteAPayer(m);
  if (m.moyen.type === "jeton") {
    const unites = parseInt(m.saisie || "0", 10) || Math.ceil(reste / (m.moyen.valeurJetonC || 1));
    return ajouterPaiement(m.moyen, unites * m.moyen.valeurJetonC, unites);
  }
  const montant = saisieCentimes(m) || reste;
  if (m.moyen.type !== "especes" && montant > reste) return toast("Montant supérieur au reste à payer.", "erreur");
  ajouterPaiement(m.moyen, montant);
};

function ajouterPaiement(moyen, valeurC, unites = 0) {
  const m = S.modal;
  const reste = resteAPayer(m);
  if (valeurC <= 0) return;
  const montant = Math.min(valeurC, reste);
  m.paiements.push({ moyenId: moyen.id, nom: moyen.nom, type: moyen.type, modeCompta: moyen.modeCompta,
    encaisse: moyen.encaisse !== false, montantC: montant, recuC: valeurC, unites });
  if (moyen.type === "jeton" && valeurC > reste) toast("Jetons en trop : ils ne sont pas rendus en argent.", "alerte");
  m.moyen = null; m.saisie = "";
  if (resteAPayer(m) <= 0) return finaliserVente();
  render();
}

async function finaliserVente() {
  const m = S.modal;
  const t = totauxPanier();
  const formation = !!S.params.formation;
  const renduC = somme(m.paiements.filter(p => p.type === "especes").map(p => p.recuC - p.montantC));
  // remise ticket répartie sur les lignes (pour la ventilation comptable)
  let restant = t.remiseTicketC;
  const lignes = t.lignes.map((l, i) => {
    const part = i === t.lignes.length - 1 ? restant : (t.sousTotalC ? Math.round(t.remiseTicketC * l.totalC / t.sousTotalC) : 0);
    restant -= part;
    const art = S.articles.find(a => a.id === l.articleId);
    const cat = categorieParId(art?.categorieId);
    return { articleId: l.articleId, nom: l.nom, categorieId: cat?.id || "", categorie: cat?.nom || "", compte: cat?.compte || "707",
      prixC: l.prixC, qte: l.qte, remiseC: l.remiseC, totalC: l.totalC, netC: l.totalC - part };
  });
  let numero = "F";
  const ops = [];
  if (!formation) {
    S.params.compteurTicket = (S.params.compteurTicket || 0) + 1;
    numero = String(S.params.compteurTicket);
    ops.push(["params", S.params]);
    for (const l of lignes) {
      const a = S.articles.find(x => x.id === l.articleId);
      if (a?.suiviStock) { a.stock -= l.qte; ops.push(["articles", a]); }
    }
  }
  const ticket = { id: uid(), numero, sessionId: S.session?.id || "formation", date: new Date().toISOString(),
    caissier: S.user.nom, manifestation: S.session?.manifestation || "Formation", lignes,
    sousTotalC: t.sousTotalC, remiseTicketC: t.remiseTicketC, totalC: t.totalC,
    paiements: m.paiements, renduC, annule: false, formation };
  if (!formation) { ops.push(["tickets", ticket]); await DB.lot(ops); }
  S.cache = {};
  S.derniereVente = ticket;
  S.panier = []; S.remiseTicket = null; S.modal = null;
  render();
  if (S.params.impressionAuto) imprimerTicket(ticket).catch(erreur);
}
A.imprimerDernier = () => S.derniereVente && imprimerTicket(S.derniereVente, true).catch(erreur);

// ---------------------------------------------------------------- scan de codes-barres
A.scanner = () => {
  if (!("BarcodeDetector" in window)) return toast("Scan par caméra non disponible sur cet appareil : utilisez une douchette Bluetooth/USB.", "erreur");
  S.modal = { type: "scan" }; render();
};
function modalScan() {
  return `<div class="modal"><h2>Scanner un code-barres</h2>
    <video id="video-scan" playsinline muted></video>
    <p class="discret">Présentez le code-barres devant la caméra.</p>
    <div class="boutons"><button class="secondaire" data-a="fermer">Fermer</button></div></div>`;
}
let fluxScan = null;
async function demarrerScan() {
  const video = document.getElementById("video-scan");
  if (!video || fluxScan) return;
  try {
    fluxScan = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    video.srcObject = fluxScan;
    await video.play();
    const detecteur = new BarcodeDetector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "qr_code"] });
    const boucle = async () => {
      if (!fluxScan || S.modal?.type !== "scan") return arreterScan();
      try {
        const codes = await detecteur.detect(video);
        if (codes.length) { arreterScan(); S.modal = null; codeScanne(codes[0].rawValue); return; }
      } catch (e) { /* image pas prête */ }
      requestAnimationFrame(boucle);
    };
    boucle();
  } catch (e) { arreterScan(); S.modal = null; render(); erreur(new Error("Caméra inaccessible : " + e.message)); }
}
function arreterScan() { fluxScan?.getTracks().forEach(t => t.stop()); fluxScan = null; }

function codeScanne(code) {
  code = String(code).trim();
  const a = S.articles.find(x => x.codeBarre && x.codeBarre === code && x.actif !== false);
  if (!a) { render(); return toast(`Code ${code} inconnu : ajoutez-le à un article (Articles).`, "erreur"); }
  if (S.vue !== "caisse") { render(); return; }
  ajouterArticle(a);
}
// douchette (lecteur qui tape le code puis Entrée)
let tampon = "", dernierTouche = 0;
document.addEventListener("keydown", e => {
  if (e.target.matches("input, textarea, select")) return;
  const t = Date.now();
  if (t - dernierTouche > 80) tampon = "";
  dernierTouche = t;
  if (e.key === "Enter") { if (tampon.length >= 4) { codeScanne(tampon); e.preventDefault(); } tampon = ""; return; }
  if (e.key.length === 1) tampon += e.key;
});

// ====================================================================== SESSION (ouverture, mouvements, clôture)
A.ouvrirSession = () => avecResponsable(() => {
  S.modal = { type: "ouvrir", manifestation: S.params.manifestations[0] || "", saisie: "" };
  render();
}, "Code responsable pour ouvrir la caisse");

function modalOuvrir(m) {
  return `<div class="modal"><h2>Ouvrir la caisse</h2>
    <label>Manifestation
      <select data-c="choixManif">${S.params.manifestations.map(x => `<option ${!m.autre && x === m.manifestation ? "selected" : ""}>${h(x)}</option>`).join("")}
        <option value="__autre__" ${m.autre ? "selected" : ""}>Autre…</option></select></label>
    ${m.autre ? `<label>Nom de la manifestation<input data-i="nomManif" value="${h(m.manifestation)}" data-focus></label>` : ""}
    <h3>Fond de caisse (espèces au départ)</h3>
    <div class="affichage">${eur(saisieCentimes(m))}</div>${pave("fond")}
    <div class="boutons"><button class="secondaire" data-a="fermer">Annuler</button>
      <button class="principal" data-a="validerOuverture">Ouvrir la caisse</button></div></div>`;
}
C.choixManif = el => {
  if (el.value === "__autre__") { S.modal.autre = true; S.modal.manifestation = ""; }
  else { S.modal.autre = false; S.modal.manifestation = el.value; }
  render();
};
I.nomManif = el => { S.modal.manifestation = el.value; };
A.validerOuverture = async () => {
  const m = S.modal;
  if (!m.manifestation.trim()) return toast("Indiquez la manifestation.", "erreur");
  S.params.compteurSession = (S.params.compteurSession || 0) + 1;
  const session = { id: uid(), numero: S.params.compteurSession, manifestation: m.manifestation.trim(),
    ouverteLe: new Date().toISOString(), ouvertePar: S.user.nom, fondC: saisieCentimes(m), fermeeLe: null };
  if (m.autre && !S.params.manifestations.includes(session.manifestation)) S.params.manifestations.push(session.manifestation);
  await DB.lot([["sessions", session], ["params", S.params]]);
  if (S.params.formation) S.params.formation = false;
  await sauverParams();
  S.session = session; S.modal = null; S.vue = "caisse";
  toast(`Caisse ouverte — ${session.manifestation}`);
  render();
};

async function donneesSession(session) {
  const cle = "s-" + session.id;
  if (!S.cache[cle]) {
    S.cache[cle] = { tickets: await DB.parSession("tickets", session.id), mouvements: await DB.parSession("mouvements", session.id) };
  }
  return S.cache[cle];
}

function calculerZ(session, tickets, mouvements) {
  const valides = tickets.filter(t => !t.annule);
  const parMoyen = {}, parCompte = {}, parArticle = {}, compta = {};
  for (const t of valides) {
    for (const p of t.paiements) {
      const k = p.moyenId;
      parMoyen[k] = parMoyen[k] || { nom: p.nom, type: p.type, modeCompta: p.modeCompta, encaisse: p.encaisse, montantC: 0, nb: 0, unites: 0 };
      parMoyen[k].montantC += p.montantC; parMoyen[k].nb += 1; parMoyen[k].unites += p.unites || 0;
      // ventilation du paiement sur les lignes, au prorata
      let reste = p.montantC;
      t.lignes.forEach((l, i) => {
        const part = i === t.lignes.length - 1 ? reste : (t.totalC ? Math.round(p.montantC * l.netC / t.totalC) : 0);
        reste -= part;
        const ck = l.compte + "|" + p.moyenId;
        compta[ck] = compta[ck] || { compte: l.compte, moyen: p.nom, modeCompta: p.modeCompta, encaisse: p.encaisse, montantC: 0 };
        compta[ck].montantC += part;
      });
    }
    for (const l of t.lignes) {
      parCompte[l.compte] = (parCompte[l.compte] || 0) + l.netC;
      const ka = l.articleId + "|" + l.prixC;
      parArticle[ka] = parArticle[ka] || { nom: l.nom, categorie: l.categorie, qte: 0, montantC: 0 };
      parArticle[ka].qte += l.qte; parArticle[ka].montantC += l.netC;
    }
  }
  const especesEncaissees = somme(Object.values(parMoyen).filter(m => m.type === "especes").map(m => m.montantC));
  const entrees = somme(mouvements.filter(x => x.type === "entree").map(x => x.montantC));
  const sorties = somme(mouvements.filter(x => x.type === "sortie").map(x => x.montantC));
  const theorique = (session.fondC || 0) + especesEncaissees + entrees - sorties;
  return {
    nbTickets: valides.length, nbAnnules: tickets.length - valides.length,
    totalC: somme(valides.map(t => t.totalC)),
    remisesC: somme(valides.map(t => t.remiseTicketC + somme(t.lignes.map(l => l.remiseC)))),
    parMoyen: Object.values(parMoyen).sort((a, b) => b.montantC - a.montantC),
    parCompte: Object.entries(parCompte).map(([compte, montantC]) => ({ compte, libelle: libelleCompte(compte), montantC })),
    parArticle: Object.values(parArticle).sort((a, b) => b.montantC - a.montantC),
    compta: Object.values(compta).filter(c => c.montantC !== 0),
    fondC: session.fondC || 0, especesEncaisseesC: especesEncaissees, entreesC: entrees, sortiesC: sorties,
    especesTheoriquesC: theorique,
    compteC: session.compteC ?? null, ecartC: session.compteC != null ? session.compteC - theorique : null,
  };
}

VUES.session = () => {
  if (!S.session) return `<div class="carte centre"><h2>Aucune caisse ouverte</h2>
    <button class="principal grand" data-a="ouvrirSession">Ouvrir la caisse</button></div>`;
  const d = S.cache["s-" + S.session.id];
  if (!d) { donneesSession(S.session).then(render).catch(erreur); return `<p class="discret">Chargement…</p>`; }
  const z = calculerZ(S.session, d.tickets, d.mouvements);
  const tickets = [...d.tickets].sort((a, b) => b.date.localeCompare(a.date));
  return `<div class="page defile">
    <div class="entete-page"><div><h2>${h(S.session.manifestation)} — caisse n° ${S.session.numero}</h2>
      <p class="discret">Ouverte le ${dateFr(S.session.ouverteLe)} à ${heureFr(S.session.ouverteLe)} par ${h(S.session.ouvertePar)}</p></div>
      <div class="boutons-ligne">
        <button class="secondaire" data-a="mouvement" data-t="entree">+ Entrée d'espèces</button>
        <button class="secondaire" data-a="mouvement" data-t="sortie">− Sortie d'espèces</button>
        <button class="principal" data-a="cloturer">Clôturer (ticket Z)</button></div></div>
    <div class="chiffres">
      <div class="chiffre"><span>Ventes</span><strong>${eur(z.totalC)}</strong></div>
      <div class="chiffre"><span>Tickets</span><strong>${z.nbTickets}</strong></div>
      <div class="chiffre"><span>Panier moyen</span><strong>${eur(z.nbTickets ? Math.round(z.totalC / z.nbTickets) : 0)}</strong></div>
      <div class="chiffre"><span>Espèces en caisse (théorique)</span><strong>${eur(z.especesTheoriquesC)}</strong></div>
    </div>
    <div class="deux-col">
      <div class="carte"><h3>Par moyen de paiement</h3>${barres(z.parMoyen.map(m => [m.nom + (m.unites ? ` (${m.unites} jetons)` : ""), m.montantC]), eur)}
        <h3>Mouvements d'espèces</h3>
        <div class="liste">${[["Fond de caisse", S.session.fondC]].concat(d.mouvements.map(x => [`${x.type === "entree" ? "Entrée" : "Sortie"} — ${x.motif} (${heureFr(x.date)})`, x.type === "entree" ? x.montantC : -x.montantC]))
          .map(([l, v]) => `<div class="ligne-liste"><span>${h(l)}</span><span>${eur(v)}</span></div>`).join("")}</div></div>
      <div class="carte"><h3>Tickets (${tickets.length})</h3><div class="liste">${tickets.map(t => `<button class="ligne-liste ${t.annule ? "barre" : ""}" data-a="voirTicket" data-id="${t.id}">
          <span>n° ${h(t.numero)} · ${heureFr(t.date)} · ${h(t.paiements.map(p => p.nom).join(" + "))}</span><span>${eur(t.totalC)}${t.annule ? " — annulé" : ""}</span></button>`).join("") || `<p class="discret">Aucune vente.</p>`}</div></div>
    </div></div>`;
};

function barres(donnees, format = v => v) {
  if (!donnees.length) return `<p class="discret">Aucune donnée.</p>`;
  const max = Math.max(...donnees.map(d => Math.abs(d[1])), 1);
  return `<div class="barres">${donnees.map(([lib, v]) => `<div class="barre-ligne"><span class="barre-lib">${h(lib)}</span>
    <span class="barre-fond"><span class="barre-val" style="width:${Math.max(2, Math.abs(v) / max * 100)}%"></span></span>
    <span class="barre-chiffre">${format(v)}</span></div>`).join("")}</div>`;
}

A.mouvement = d => {
  const ouvrir = () => { S.modal = { type: "mouvement", t: d.t, saisie: "", motif: d.t === "entree" ? "Apport de monnaie" : "Dépôt en banque" }; render(); };
  d.t === "sortie" ? avecResponsable(ouvrir, "Code responsable pour sortir des espèces") : ouvrir();
};
function modalMouvement(m) {
  const motifs = m.t === "entree" ? ["Apport de monnaie", "Autre"] : ["Dépôt en banque", "Achat urgent", "Remise au trésorier", "Autre"];
  return `<div class="modal petit"><h2>${m.t === "entree" ? "Entrée" : "Sortie"} d'espèces</h2>
    <div class="choix">${motifs.map(x => `<button class="${m.motif === x ? "actif" : ""}" data-a="motif" data-m="${h(x)}">${h(x)}</button>`).join("")}</div>
    <div class="affichage">${eur(saisieCentimes(m))}</div>${pave("mvt")}
    <div class="boutons"><button class="secondaire" data-a="fermer">Annuler</button>
      <button class="principal" data-a="validerMouvement">Enregistrer</button></div></div>`;
}
A.motif = d => { S.modal.motif = d.m; render(); };
A.validerMouvement = async () => {
  const m = S.modal;
  if (!saisieCentimes(m)) return toast("Indiquez un montant.", "erreur");
  await DB.ecrire("mouvements", { id: uid(), sessionId: S.session.id, date: new Date().toISOString(), type: m.t,
    montantC: saisieCentimes(m), motif: m.motif, par: S.user.nom });
  S.cache = {}; S.modal = null; toast("Mouvement enregistré"); render();
};

A.voirTicket = async d => {
  const t = await DB.lire("tickets", d.id);
  S.modal = { type: "ticket", ticket: t }; render();
};
function modalTicket(m) {
  const t = m.ticket;
  return `<div class="modal"><h2>Ticket n° ${h(t.numero)} ${t.annule ? "— ANNULÉ" : ""}</h2>
    <p class="discret">${dateFr(t.date)} ${heureFr(t.date)} · ${h(t.caissier)} · ${h(t.manifestation)}</p>
    <div class="liste">${t.lignes.map(l => `<div class="ligne-liste"><span>${l.qte} × ${h(l.nom)}${l.remiseC ? ` (remise ${eur(l.remiseC)})` : ""}</span><span>${eur(l.totalC)}</span></div>`).join("")}
      ${t.remiseTicketC ? `<div class="ligne-liste"><span>Remise</span><span>−${eur(t.remiseTicketC)}</span></div>` : ""}
      <div class="ligne-liste fort"><span>Total</span><span>${eur(t.totalC)}</span></div>
      ${t.paiements.map(p => `<div class="ligne-liste"><span>${h(p.nom)}${p.unites ? ` (${p.unites} jetons)` : ""}</span><span>${eur(p.montantC)}</span></div>`).join("")}
      ${t.renduC ? `<div class="ligne-liste"><span>Rendu</span><span>${eur(t.renduC)}</span></div>` : ""}</div>
    <div class="boutons">
      ${!t.annule && S.session && t.sessionId === S.session.id ? `<button class="danger" data-a="annulerTicket">Annuler ce ticket</button>` : ""}
      <button class="secondaire" data-a="reimprimer">🖨️ Réimprimer</button>
      <button class="principal" data-a="fermer">Fermer</button></div></div>`;
}
A.reimprimer = () => imprimerTicket(S.modal.ticket, true).catch(erreur);
A.annulerTicket = () => {
  const t = S.modal.ticket;
  avecResponsable(async () => {
    t.annule = true; t.annulePar = S.user.nom; t.annuleLe = new Date().toISOString();
    const ops = [["tickets", t]];
    for (const l of t.lignes) {
      const a = S.articles.find(x => x.id === l.articleId);
      if (a?.suiviStock) { a.stock += l.qte; ops.push(["articles", a]); }
    }
    await DB.lot(ops);
    S.cache = {}; S.modal = null; toast(`Ticket n° ${t.numero} annulé${ops.length > 1 ? ", stock remis" : ""}`); render();
  }, "Code responsable pour annuler un ticket");
};

// ---------------------------------------------------------------- clôture
A.cloturer = () => avecResponsable(async () => {
  const d = await donneesSession(S.session);
  S.modal = { type: "cloture", comptage: {}, z: calculerZ(S.session, d.tickets, d.mouvements) };
  render();
}, "Code responsable pour clôturer la caisse");

function modalCloture(m) {
  const compte = somme(COUPURES.map(c => c * (m.comptage[c] || 0)));
  const ecart = compte - m.z.especesTheoriquesC;
  const autres = m.z.parMoyen.filter(x => x.type !== "especes");
  return `<div class="modal large"><h2>Clôture de la caisse — comptage des espèces</h2>
    <div class="cloture">
      <div class="comptage">${COUPURES.map(c => `<label class="coupure"><span>${c >= 500 ? "Billet" : "Pièce"} ${eur(c)}</span>
        <input type="number" inputmode="numeric" min="0" value="${m.comptage[c] || ""}" data-i="coupure" data-c="${c}" placeholder="0"></label>`).join("")}</div>
      <div class="bilan">
        <div class="ligne-liste"><span>Fond de caisse</span><span>${eur(m.z.fondC)}</span></div>
        <div class="ligne-liste"><span>+ Ventes en espèces</span><span>${eur(m.z.especesEncaisseesC)}</span></div>
        <div class="ligne-liste"><span>+ Entrées / − sorties</span><span>${eur(m.z.entreesC - m.z.sortiesC)}</span></div>
        <div class="ligne-liste fort"><span>Espèces attendues</span><span>${eur(m.z.especesTheoriquesC)}</span></div>
        <div class="ligne-liste fort"><span>Espèces comptées</span><span id="total-compte">${eur(compte)}</span></div>
        <div class="ligne-liste fort ${ecart === 0 ? "vert" : "rouge"}" id="ligne-ecart"><span>Écart</span><span id="ecart">${eur(ecart)}</span></div>
        ${autres.length ? `<h3>À vérifier aussi</h3>${autres.map(x => `<div class="ligne-liste"><span>${h(x.nom)} (${x.nb} paiement${x.nb > 1 ? "s" : ""}${x.unites ? `, ${x.unites} jetons` : ""})</span><span>${eur(x.montantC)}</span></div>`).join("")}
          <p class="discret">Comparez le total carte au relevé du terminal de paiement.</p>` : ""}
      </div></div>
    <div class="boutons"><button class="secondaire" data-a="fermer">Annuler</button>
      <button class="principal" data-a="validerCloture">Valider la clôture et éditer le Z</button></div></div>`;
}
I.coupure = el => {
  const m = S.modal;
  m.comptage[el.dataset.c] = Math.max(0, parseInt(el.value || "0", 10) || 0);
  const compte = somme(COUPURES.map(c => c * (m.comptage[c] || 0)));
  const ecart = compte - m.z.especesTheoriquesC;
  document.getElementById("total-compte").textContent = eur(compte);
  document.getElementById("ecart").textContent = eur(ecart);
  document.getElementById("ligne-ecart").className = "ligne-liste fort " + (ecart === 0 ? "vert" : "rouge");
};
A.validerCloture = async () => {
  const m = S.modal;
  const s = S.session;
  s.compteC = somme(COUPURES.map(c => c * (m.comptage[c] || 0)));
  s.comptage = m.comptage;
  s.fermeeLe = new Date().toISOString();
  s.fermeePar = S.user.nom;
  const d = await donneesSession(s);
  s.z = calculerZ(s, d.tickets, d.mouvements);
  await DB.ecrire("sessions", s);
  S.session = null; S.cache = {};
  S.modal = { type: "fin-z", session: s };
  render();
  if (S.params.impression !== "aucune") imprimerZ(s).catch(erreur);
};
function modalFinZ(m) {
  const z = m.session.z;
  return `<div class="modal"><h2>Caisse n° ${m.session.numero} clôturée</h2>
    <div class="chiffres petits"><div class="chiffre"><span>Ventes</span><strong>${eur(z.totalC)}</strong></div>
      <div class="chiffre"><span>Tickets</span><strong>${z.nbTickets}</strong></div>
      <div class="chiffre ${z.ecartC === 0 ? "" : "rouge"}"><span>Écart espèces</span><strong>${eur(z.ecartC)}</strong></div></div>
    <p>Envoyez le fichier pour la compta : il s'importe tel quel dans l'écran « Import Excel » du logiciel du comité.</p>
    <div class="boutons colonne">
      <button class="principal grand" data-a="exporterZ" data-id="${m.session.id}">📤 Fichier pour la compta (Excel)</button>
      <button class="secondaire" data-a="imprimerZ" data-id="${m.session.id}">🖨️ Imprimer le ticket Z</button>
      <button class="secondaire" data-a="sauvegarder">💾 Sauvegarder toute la caisse</button>
      <button class="secondaire" data-a="fermer">Terminer</button></div></div>`;
}

// ====================================================================== IMPRESSION
function lignesTicket(t, duplicata) {
  const p = S.params, L = [];
  if (p.logo) L.push({ t: "logo" });
  L.push({ t: "txt", v: p.nomAsso, a: "c", gras: true, double: true });
  for (const x of (p.entete || "").split("\n").filter(Boolean)) L.push({ t: "txt", v: x, a: "c" });
  L.push({ t: "txt", v: `${dateFr(t.date)} ${heureFr(t.date)} - ${t.manifestation}`, a: "c" });
  L.push({ t: "txt", v: `Ticket n° ${t.numero} - ${t.caissier}`, a: "c" });
  if (t.formation) L.push({ t: "txt", v: "*** FORMATION - NON VALABLE ***", a: "c", gras: true });
  if (duplicata) L.push({ t: "txt", v: "--- DUPLICATA ---", a: "c" });
  if (t.annule) L.push({ t: "txt", v: "*** TICKET ANNULÉ ***", a: "c", gras: true });
  L.push({ t: "trait" });
  for (const l of t.lignes) {
    L.push({ t: "deux", g: `${l.qte} x ${l.nom}`, d: eur(l.totalC + l.remiseC) });
    if (l.remiseC) L.push({ t: "deux", g: "   remise", d: "-" + eur(l.remiseC) });
  }
  L.push({ t: "trait" });
  if (t.remiseTicketC) L.push({ t: "deux", g: "Remise", d: "-" + eur(t.remiseTicketC) });
  L.push({ t: "deux", g: "TOTAL", d: eur(t.totalC), gras: true, double: true });
  for (const x of t.paiements) L.push({ t: "deux", g: x.nom + (x.unites ? ` (${x.unites})` : ""), d: eur(x.type === "especes" ? x.recuC : x.montantC) });
  if (t.renduC) L.push({ t: "deux", g: "Rendu", d: eur(t.renduC), gras: true });
  L.push({ t: "trait" });
  for (const x of (p.pied || "").split("\n").filter(Boolean)) L.push({ t: "txt", v: x, a: "c" });
  return L;
}

function lignesZ(s) {
  const z = s.z, p = S.params, L = [];
  if (p.logo) L.push({ t: "logo" });
  L.push({ t: "txt", v: p.nomAsso, a: "c", gras: true });
  L.push({ t: "txt", v: `TICKET Z n° ${s.numero}`, a: "c", gras: true, double: true });
  L.push({ t: "txt", v: s.manifestation, a: "c" });
  L.push({ t: "txt", v: `Du ${dateFr(s.ouverteLe)} ${heureFr(s.ouverteLe)}`, a: "c" });
  L.push({ t: "txt", v: `au ${dateFr(s.fermeeLe)} ${heureFr(s.fermeeLe)}`, a: "c" });
  L.push({ t: "txt", v: `Ouverte: ${s.ouvertePar} / Close: ${s.fermeePar}`, a: "c" });
  L.push({ t: "trait" });
  L.push({ t: "deux", g: "VENTES", d: eur(z.totalC), gras: true, double: true });
  L.push({ t: "deux", g: "Tickets", d: String(z.nbTickets) });
  if (z.nbAnnules) L.push({ t: "deux", g: "Tickets annulés", d: String(z.nbAnnules) });
  if (z.remisesC) L.push({ t: "deux", g: "Remises accordées", d: eur(z.remisesC) });
  L.push({ t: "trait" }, { t: "txt", v: "PAR MOYEN DE PAIEMENT", gras: true });
  for (const m of z.parMoyen) L.push({ t: "deux", g: `${m.nom} (${m.nb})${m.unites ? ` ${m.unites} jet.` : ""}`, d: eur(m.montantC) });
  L.push({ t: "trait" }, { t: "txt", v: "PAR COMPTE", gras: true });
  for (const c of z.parCompte) L.push({ t: "deux", g: `${c.compte} ${c.libelle}`, d: eur(c.montantC) });
  L.push({ t: "trait" }, { t: "txt", v: "ARTICLES", gras: true });
  for (const a of z.parArticle) L.push({ t: "deux", g: `${a.qte} x ${a.nom}`, d: eur(a.montantC) });
  L.push({ t: "trait" }, { t: "txt", v: "ESPÈCES", gras: true });
  L.push({ t: "deux", g: "Fond de caisse", d: eur(z.fondC) });
  L.push({ t: "deux", g: "Ventes espèces", d: eur(z.especesEncaisseesC) });
  if (z.entreesC) L.push({ t: "deux", g: "Entrées", d: eur(z.entreesC) });
  if (z.sortiesC) L.push({ t: "deux", g: "Sorties", d: "-" + eur(z.sortiesC) });
  L.push({ t: "deux", g: "Attendu", d: eur(z.especesTheoriquesC) });
  L.push({ t: "deux", g: "Compté", d: eur(z.compteC) });
  L.push({ t: "deux", g: "ÉCART", d: eur(z.ecartC), gras: true });
  L.push({ t: "trait" }, { t: "txt", v: `Édité le ${dateFr(new Date().toISOString())} ${heureFr(new Date().toISOString())}`, a: "c" });
  return L;
}

function versEscpos(L) {
  const p = S.params;
  const tk = new ESCPOS.Ticket(p.largeur, p.accents);
  for (const x of L) {
    if (x.t === "logo") { if (S.logoPx) tk.aligner("c").image(S.logoPx.pixels, S.logoPx.largeur, S.logoPx.hauteur); continue; }
    if (x.t === "trait") { tk.aligner("g").trait(); continue; }
    tk.gras(!!x.gras).taille(!!x.double);
    if (x.t === "txt") tk.aligner(x.a || "g").ligne(x.v);
    if (x.t === "deux") tk.aligner("g").deux(x.g, x.d, x.double ? tk.colonnes / 2 : tk.colonnes);
    tk.gras(false).taille(false);
  }
  return tk.avance(4).couper().octets();
}

function versHtml(L) {
  const col = S.params.largeur === 80 ? 48 : 32;
  const lignes = L.map(x => {
    if (x.t === "logo") return S.params.logo ? `<div class="c"><img src="${S.params.logo}" style="max-width:60%"></div>` : "";
    if (x.t === "trait") return `<div>${"-".repeat(col)}</div>`;
    const style = `${x.gras ? "font-weight:bold;" : ""}${x.double ? "font-size:1.4em;" : ""}`;
    if (x.t === "txt") return `<div class="${x.a === "c" ? "c" : ""}" style="${style}">${h(x.v)}</div>`;
    return `<div class="d" style="${style}"><span>${h(x.g)}</span><span>${h(x.d)}</span></div>`;
  }).join("");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Ticket</title><style>
    @page{margin:0;size:${S.params.largeur}mm auto}body{font:12px monospace;width:${S.params.largeur - 6}mm;margin:3mm}
    .c{text-align:center}.d{display:flex;justify-content:space-between;gap:6px}</style></head><body>${lignes}</body></html>`;
}

async function imprimer(L) {
  const mode = S.params.impression;
  if (mode === "aucune") return toast("Aucune imprimante réglée (Réglages → Imprimante).", "alerte");
  if (mode === "navigateur") {
    const f = document.createElement("iframe");
    f.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
    document.body.appendChild(f);
    f.contentDocument.open(); f.contentDocument.write(versHtml(L)); f.contentDocument.close();
    setTimeout(() => { f.contentWindow.print(); setTimeout(() => f.remove(), 2000); }, 300);
    return;
  }
  const octets = versEscpos(L);
  if (mode === "rawbt") return ESCPOS.envoyerRawBT(octets);
  if (mode === "bluetooth") { await ESCPOS.envoyerBluetooth(octets); toast("Ticket imprimé"); }
}
const imprimerTicket = (t, duplicata = false) => imprimer(lignesTicket(t, duplicata));
const imprimerZ = s => imprimer(lignesZ(s));
A.imprimerZ = async d => imprimerZ(await DB.lire("sessions", d.id)).catch(erreur);

// ====================================================================== FICHIERS (Excel, sauvegarde, partage)
async function chargerXLSX() {
  if (window.XLSX) return;
  await new Promise((ok, ko) => {
    const s = document.createElement("script");
    s.src = "xlsx.full.min.js"; s.onload = ok; s.onerror = () => ko(new Error("Module Excel introuvable"));
    document.head.appendChild(s);
  });
}

async function fichierExcel(nom, feuilles) {
  await chargerXLSX();
  const wb = XLSX.utils.book_new();
  for (const [titre, entetes, lignes] of feuilles) {
    const ws = XLSX.utils.aoa_to_sheet([entetes, ...lignes]);
    ws["!cols"] = entetes.map((e, i) => ({ wch: Math.min(60, Math.max(10, e.length + 2, ...lignes.map(l => String(l[i] ?? "").length + 2))) }));
    XLSX.utils.book_append_sheet(wb, ws, titre.slice(0, 31));
  }
  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  return new File([buf], nom, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

function proposerFichier(fichier, explication) {
  S.fichier = fichier;
  S.modal = { type: "fichier", nom: fichier.name, explication };
  render();
}
function modalFichier(m) {
  const partage = navigator.canShare && navigator.canShare({ files: [S.fichier] });
  return `<div class="modal petit"><h2>Fichier prêt</h2><p><strong>${h(m.nom)}</strong></p>
    ${m.explication ? `<p class="discret">${h(m.explication)}</p>` : ""}
    <div class="boutons colonne">
      ${partage ? `<button class="principal grand" data-a="partagerFichier">📤 Envoyer (Drive, mail, WhatsApp…)</button>` : ""}
      <button class="${partage ? "secondaire" : "principal grand"}" data-a="telechargerFichier">⬇️ Enregistrer sur la tablette</button>
      <button class="secondaire" data-a="fermer">Fermer</button></div></div>`;
}
A.partagerFichier = async () => {
  try { await navigator.share({ files: [S.fichier], title: S.fichier.name }); toast("Fichier envoyé"); }
  catch (e) { if (e.name !== "AbortError") erreur(e); }
};
A.telechargerFichier = () => {
  const url = URL.createObjectURL(S.fichier);
  const a = document.createElement("a");
  a.href = url; a.download = S.fichier.name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  toast("Fichier enregistré dans Téléchargements");
};

const ENTETES_COMPTA = ["Date", "Manifestation", "Sens", "Catégorie", "Libellé", "Montant", "Mode de paiement", "Tiers", "N° pièce"];

function lignesCompta(s) {
  const z = s.z, date = dateFr(s.ouverteLe), piece = `Z${s.numero}`;
  const lignes = z.compta.filter(c => c.encaisse).sort((a, b) => a.compte.localeCompare(b.compte) || a.moyen.localeCompare(b.moyen))
    .map(c => [date, s.manifestation, "Recette", c.compte, `Caisse ${s.manifestation} — ${libelleCompte(c.compte)} (${c.moyen}) — Z n°${s.numero}`,
      enEuros(c.montantC), c.modeCompta, "", piece]);
  if (z.ecartC) {
    lignes.push([date, s.manifestation, z.ecartC > 0 ? "Recette" : "Dépense", z.ecartC > 0 ? "758" : "658",
      `Écart de caisse ${z.ecartC > 0 ? "positif" : "négatif"} — Z n°${s.numero}`, enEuros(Math.abs(z.ecartC)), "Espèces", "", piece]);
  }
  return lignes;
}

A.exporterZ = async d => {
  const s = await DB.lire("sessions", d.id);
  const z = s.z;
  const nonEncaisse = z.parMoyen.filter(m => !m.encaisse);
  const resume = [["Manifestation", s.manifestation], ["Caisse n°", s.numero], ["Ouverture", `${dateFr(s.ouverteLe)} ${heureFr(s.ouverteLe)} (${s.ouvertePar})`],
    ["Clôture", `${dateFr(s.fermeeLe)} ${heureFr(s.fermeeLe)} (${s.fermeePar})`], ["Ventes", enEuros(z.totalC)], ["Tickets", z.nbTickets],
    ["Tickets annulés", z.nbAnnules], ["Remises", enEuros(z.remisesC)], ["Fond de caisse", enEuros(z.fondC)],
    ["Ventes en espèces", enEuros(z.especesEncaisseesC)], ["Entrées d'espèces", enEuros(z.entreesC)], ["Sorties d'espèces", enEuros(z.sortiesC)],
    ["Espèces attendues", enEuros(z.especesTheoriquesC)], ["Espèces comptées", enEuros(z.compteC)], ["Écart", enEuros(z.ecartC)],
    ...z.parMoyen.map(m => [`Payé en ${m.nom}${m.encaisse ? "" : " (non recompté en recette)"}`, enEuros(m.montantC)])];
  const f = await fichierExcel(`caisse_Z${s.numero}_${s.manifestation.replace(/[^\w-]+/g, "_")}_${dateFichier(new Date(s.ouverteLe))}.xlsx`, [
    ["Opérations", ENTETES_COMPTA, lignesCompta(s)],
    ["Ventes par article", ["Article", "Catégorie", "Quantité", "Montant"], z.parArticle.map(a => [a.nom, a.categorie, a.qte, enEuros(a.montantC)])],
    ["Ticket Z", ["Rubrique", "Valeur"], resume],
  ]);
  proposerFichier(f, "Logiciel du comité → Import Excel → déposez ce fichier. " +
    (nonEncaisse.length ? "Les paiements en jetons ne sont pas comptés une 2e fois : les jetons ont déjà été encaissés à leur vente." : ""));
};

A.sauvegarder = async () => {
  const sauvegarde = await DB.exporter();
  const n = new Date();
  const nom = `caisse_sauvegarde_${dateFichier(n)}_${String(n.getHours()).padStart(2, "0")}h${String(n.getMinutes()).padStart(2, "0")}.json`;
  await sauverParams({ derniereSauvegarde: new Date().toISOString() });
  proposerFichier(new File([JSON.stringify(sauvegarde)], nom, { type: "application/json" }),
    "Rangez ce fichier dans le Drive du comité : il permet de tout restaurer sur une autre tablette.");
};

// ====================================================================== TABLEAU DE BORD
VUES.tableau = () => {
  if (!S.cache.sessions) {
    DB.tous("sessions").then(s => { S.cache.sessions = s.sort((a, b) => b.ouverteLe.localeCompare(a.ouverteLe)); render(); }).catch(erreur);
    return `<p class="discret">Chargement…</p>`;
  }
  const choix = S.cache.tbChoix || (S.session ? S.session.id : (S.cache.sessions[0]?.id || "toutes"));
  const cle = "tb-" + choix;
  if (!S.cache[cle]) {
    (choix === "toutes" ? DB.tous("tickets") : DB.parSession("tickets", choix))
      .then(t => { S.cache[cle] = t.filter(x => !x.annule); render(); }).catch(erreur);
    return `<p class="discret">Chargement…</p>`;
  }
  const tickets = S.cache[cle];
  const total = somme(tickets.map(t => t.totalC));
  const articles = {}, heures = {}, moyens = {}, cats = {};
  for (const t of tickets) {
    const hr = new Date(t.date).getHours() + " h";
    heures[hr] = (heures[hr] || 0) + t.totalC;
    for (const p of t.paiements) moyens[p.nom] = (moyens[p.nom] || 0) + p.montantC;
    for (const l of t.lignes) {
      articles[l.nom] = articles[l.nom] || [0, 0];
      articles[l.nom][0] += l.qte; articles[l.nom][1] += l.netC;
      cats[l.categorie || "—"] = (cats[l.categorie || "—"] || 0) + l.netC;
    }
  }
  const topArticles = Object.entries(articles).sort((a, b) => b[1][1] - a[1][1]).slice(0, 15);
  const ordreHeures = Object.entries(heures).sort((a, b) => parseInt(a[0]) - parseInt(b[0]));
  return `<div class="page defile">
    <div class="entete-page"><h2>Tableau de bord</h2>
      <select data-c="choixTb"><option value="toutes" ${choix === "toutes" ? "selected" : ""}>Toutes les caisses</option>
        ${S.cache.sessions.map(s => `<option value="${s.id}" ${choix === s.id ? "selected" : ""}>Caisse n° ${s.numero} — ${h(s.manifestation)} — ${dateFr(s.ouverteLe)}${s.fermeeLe ? "" : " (en cours)"}</option>`).join("")}</select></div>
    <div class="chiffres">
      <div class="chiffre"><span>Chiffre d'affaires</span><strong>${eur(total)}</strong></div>
      <div class="chiffre"><span>Tickets</span><strong>${tickets.length}</strong></div>
      <div class="chiffre"><span>Panier moyen</span><strong>${eur(tickets.length ? Math.round(total / tickets.length) : 0)}</strong></div>
      <div class="chiffre"><span>Articles vendus</span><strong>${somme(Object.values(articles).map(a => a[0]))}</strong></div></div>
    <div class="deux-col">
      <div class="carte"><h3>Meilleures ventes</h3>${barres(topArticles.map(([n, [q, c]]) => [`${n} (${q})`, c]), eur)}</div>
      <div class="carte"><h3>Ventes par heure</h3>${barres(ordreHeures, eur)}
        <h3>Par moyen de paiement</h3>${barres(Object.entries(moyens).sort((a, b) => b[1] - a[1]), eur)}
        <h3>Par catégorie</h3>${barres(Object.entries(cats).sort((a, b) => b[1] - a[1]), eur)}</div></div></div>`;
};
C.choixTb = el => { S.cache.tbChoix = el.value; render(); };

// ====================================================================== CATALOGUE
VUES.catalogue = () => {
  const filtre = S.cache.catFiltre || "toutes";
  const arts = S.articles.filter(a => filtre === "toutes" || a.categorieId === filtre);
  return `<div class="page defile">
    <div class="entete-page"><h2>Articles et catégories</h2>
      <div class="boutons-ligne"><button class="secondaire" data-a="modeleCatalogue">Modèle Excel</button>
        <label class="bouton secondaire">Importer Excel<input type="file" accept=".xlsx,.xls,.csv" data-c="importCatalogue" hidden></label>
        <button class="secondaire" data-a="exporterCatalogue">Exporter</button>
        <button class="principal" data-a="editerArticle">+ Article</button></div></div>
    <div class="carte"><h3>Catégories</h3><div class="puces">
      ${S.categories.map(c => `<button class="puce" style="--c:${c.couleur}" data-a="editerCategorie" data-id="${c.id}">${h(c.nom)} · ${c.compte}${c.actif === false ? " (masquée)" : ""}</button>`).join("")}
      <button class="puce" data-a="editerCategorie">+ Catégorie</button></div></div>
    <div class="carte"><div class="entete-page"><h3>Articles (${arts.length})</h3>
      <select data-c="filtreCatalogue"><option value="toutes">Toutes les catégories</option>
        ${S.categories.map(c => `<option value="${c.id}" ${filtre === c.id ? "selected" : ""}>${h(c.nom)}</option>`).join("")}</select></div>
      <table class="tableau"><thead><tr><th>Article</th><th>Catégorie</th><th class="d">Prix</th><th>Code-barres</th><th class="d">Stock</th><th></th></tr></thead>
      <tbody>${arts.map(a => `<tr class="${a.actif === false ? "inactif" : ""}"><td>${h(a.nom)}</td><td>${h(categorieParId(a.categorieId)?.nom || "—")}</td>
        <td class="d">${eur(a.prixC)}</td><td>${h(a.codeBarre || "")}</td><td class="d">${a.suiviStock ? a.stock : "—"}</td>
        <td><button class="mini" data-a="editerArticle" data-id="${a.id}">Modifier</button></td></tr>`).join("")}</tbody></table></div></div>`;
};
C.filtreCatalogue = el => { S.cache.catFiltre = el.value; render(); };

A.editerArticle = d => {
  const a = d.id ? S.articles.find(x => x.id === d.id) : { id: "", nom: "", categorieId: S.categories[0]?.id, prixC: 0, codeBarre: "",
    suiviStock: false, stock: 0, seuil: 0, ordre: 99, actif: true };
  S.modal = { type: "article", ...a, codeBarre: a.codeBarre };
  render();
};
function modalArticle(m) {
  return `<div class="modal"><h2>${m.id ? "Modifier l'article" : "Nouvel article"}</h2>
    <form data-f="article" class="formulaire">
      <label>Nom<input name="nom" required value="${h(m.nom)}" ${m.id ? "" : "data-focus"}></label>
      <label>Catégorie<select name="categorieId">${S.categories.map(c => `<option value="${c.id}" ${c.id === m.categorieId ? "selected" : ""}>${h(c.nom)}</option>`).join("")}</select></label>
      <label>Prix (€)<input name="prix" inputmode="decimal" required value="${m.prixC ? String(enEuros(m.prixC)).replace(".", ",") : ""}"></label>
      <label>Code-barres<span class="avec-bouton"><input name="codeBarre" value="${h(m.codeBarre || "")}">
        ${"BarcodeDetector" in window ? `<button type="button" class="mini" data-a="scanArticle">📷</button>` : ""}</span></label>
      <label>Ordre d'affichage<input name="ordre" type="number" value="${m.ordre ?? 99}"></label>
      <label class="case"><input type="checkbox" name="suiviStock" ${m.suiviStock ? "checked" : ""}> Suivre le stock</label>
      <label>Stock actuel<input name="stock" type="number" value="${m.stock || 0}"></label>
      <label>Alerte quand il reste<input name="seuil" type="number" value="${m.seuil || 0}"></label>
      <label class="case"><input type="checkbox" name="actif" ${m.actif !== false ? "checked" : ""}> Visible en caisse</label>
      <div class="boutons">${m.id ? `<button type="button" class="danger" data-a="supprimerArticle">Supprimer</button>` : ""}
        <button type="button" class="secondaire" data-a="fermer">Annuler</button><button class="principal">Enregistrer</button></div>
    </form></div>`;
}
A.scanArticle = () => {
  const form = document.querySelector("form[data-f=article]");
  const fd = Object.fromEntries(new FormData(form));
  Object.assign(S.modal, { ...fd, suiviStock: !!fd.suiviStock, actif: !!fd.actif, prixC: versCentimes(form.prix.value) || 0,
    stock: parseInt(fd.stock || "0", 10), seuil: parseInt(fd.seuil || "0", 10), ordre: parseInt(fd.ordre || "99", 10) });
  S.retourArticle = { ...S.modal };
  S.modal = { type: "scan", pourArticle: true };
  render();
};
F.article = async v => {
  const prix = versCentimes(v.prix);
  if (prix === null || prix < 0) return toast("Prix invalide.", "erreur");
  if (v.codeBarre && S.articles.some(a => a.codeBarre === v.codeBarre.trim() && a.id !== S.modal.id))
    return toast("Ce code-barres est déjà utilisé par un autre article.", "erreur");
  const a = { ...(S.articles.find(x => x.id === S.modal.id) || {}), id: S.modal.id || uid(), nom: v.nom.trim(), categorieId: v.categorieId,
    prixC: prix, codeBarre: (v.codeBarre || "").trim(), ordre: parseInt(v.ordre || "99", 10), suiviStock: !!v.suiviStock,
    stock: parseInt(v.stock || "0", 10), seuil: parseInt(v.seuil || "0", 10), actif: !!v.actif };
  await DB.ecrire("articles", a);
  await recharger(); S.modal = null; toast("Article enregistré"); render();
};
A.supprimerArticle = () => confirmer("Supprimer cet article ? Les ventes passées restent dans l'historique.", async () => {
  await DB.supprimer("articles", S.modal.id); await recharger(); S.modal = null; render();
});

A.editerCategorie = d => {
  const c = d.id ? categorieParId(d.id) : { id: "", nom: "", couleur: COULEURS[S.categories.length % COULEURS.length], compte: "707", ordre: S.categories.length + 1, actif: true };
  S.modal = { type: "categorie", ...c }; render();
};
function modalCategorie(m) {
  return `<div class="modal petit"><h2>${m.id ? "Modifier la catégorie" : "Nouvelle catégorie"}</h2>
    <form data-f="categorie" class="formulaire">
      <label>Nom<input name="nom" required value="${h(m.nom)}"></label>
      <label>Compte comptable (pour l'export)<select name="compte">${COMPTES.map(([c, l]) => `<option value="${c}" ${c === m.compte ? "selected" : ""}>${c} — ${l}</option>`).join("")}</select></label>
      <label>Ordre<input name="ordre" type="number" value="${m.ordre ?? 1}"></label>
      <div class="couleurs">${COULEURS.map(c => `<label><input type="radio" name="couleur" value="${c}" ${c === m.couleur ? "checked" : ""}><span style="background:${c}"></span></label>`).join("")}</div>
      <label class="case"><input type="checkbox" name="actif" ${m.actif !== false ? "checked" : ""}> Visible en caisse</label>
      <div class="boutons">${m.id ? `<button type="button" class="danger" data-a="supprimerCategorie">Supprimer</button>` : ""}
        <button type="button" class="secondaire" data-a="fermer">Annuler</button><button class="principal">Enregistrer</button></div></form></div>`;
}
F.categorie = async v => {
  await DB.ecrire("categories", { id: S.modal.id || uid(), nom: v.nom.trim(), compte: v.compte, couleur: v.couleur || COULEURS[0],
    ordre: parseInt(v.ordre || "1", 10), actif: !!v.actif });
  await recharger(); S.modal = null; render();
};
A.supprimerCategorie = () => {
  if (S.articles.some(a => a.categorieId === S.modal.id)) return toast("Des articles utilisent cette catégorie : déplacez-les ou masquez la catégorie.", "erreur");
  confirmer("Supprimer cette catégorie ?", async () => { await DB.supprimer("categories", S.modal.id); await recharger(); S.modal = null; render(); });
};

const ENTETES_CATALOGUE = ["Article", "Catégorie", "Prix", "Code-barres", "Suivi stock", "Stock", "Alerte stock"];
A.modeleCatalogue = async () => proposerFichier(await fichierExcel("modele_catalogue_caisse.xlsx", [["Catalogue", ENTETES_CATALOGUE,
  [["Bière pression 25 cl", "Boissons", 2.5, "", "oui", 120, 24], ["Hot-dog", "Restauration", 3, "", "non", "", ""]]]]),
  "Remplissez une ligne par article puis importez-le.");
A.exporterCatalogue = async () => proposerFichier(await fichierExcel("catalogue_caisse.xlsx", [["Catalogue", ENTETES_CATALOGUE,
  S.articles.map(a => [a.nom, categorieParId(a.categorieId)?.nom || "", enEuros(a.prixC), a.codeBarre || "", a.suiviStock ? "oui" : "non", a.suiviStock ? a.stock : "", a.suiviStock ? a.seuil : ""])]]));

C.importCatalogue = async el => {
  const fichier = el.files[0];
  el.value = "";
  if (!fichier) return;
  await chargerXLSX();
  const wb = XLSX.read(await fichier.arrayBuffer());
  const lignes = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
  const cle = (o, ...noms) => { for (const k of Object.keys(o)) if (noms.includes(k.trim().toLowerCase())) return o[k]; return ""; };
  const nouveaux = [], majs = [], erreurs = [], nouvellesCats = [];
  const cats = [...S.categories];
  lignes.forEach((r, i) => {
    const nom = String(cle(r, "article", "nom", "produit", "désignation")).trim();
    const prix = versCentimes(cle(r, "prix", "prix de vente", "tarif"));
    if (!nom) return;
    if (prix === null) { erreurs.push(`ligne ${i + 2} : prix illisible`); return; }
    const nomCat = String(cle(r, "catégorie", "categorie", "famille") || "Divers").trim();
    let cat = cats.find(c => c.nom.toLowerCase() === nomCat.toLowerCase());
    if (!cat) {
      cat = { id: uid(), nom: nomCat, couleur: COULEURS[cats.length % COULEURS.length], compte: "707", ordre: cats.length + 1, actif: true };
      cats.push(cat); nouvellesCats.push(cat);
    }
    const suivi = /^(oui|o|x|1|vrai|yes)$/i.test(String(cle(r, "suivi stock", "suivi")).trim());
    const existant = S.articles.find(a => a.nom.toLowerCase() === nom.toLowerCase());
    const art = { ...(existant || { id: uid(), ordre: 99, actif: true }), nom, categorieId: cat.id, prixC: prix,
      codeBarre: String(cle(r, "code-barres", "code barre", "code-barre", "ean") || existant?.codeBarre || "").trim(),
      suiviStock: suivi, stock: parseInt(cle(r, "stock", "quantité") || existant?.stock || 0, 10) || 0,
      seuil: parseInt(cle(r, "alerte stock", "seuil") || existant?.seuil || 0, 10) || 0 };
    (existant ? majs : nouveaux).push(art);
  });
  S.modal = { type: "confirm", message: `${nouveaux.length} nouvel(s) article(s), ${majs.length} mis à jour, ${nouvellesCats.length} nouvelle(s) catégorie(s).` +
      (erreurs.length ? ` Ignorées : ${erreurs.join(" ; ")}.` : ""),
    suite: async () => {
      if (nouvellesCats.length) await DB.ecrireTous("categories", nouvellesCats);
      await DB.ecrireTous("articles", [...nouveaux, ...majs]);
      await recharger(); toast("Catalogue importé"); render();
    } };
  render();
};

// ====================================================================== STOCK
VUES.stock = () => {
  const suivis = S.articles.filter(a => a.suiviStock);
  return `<div class="page defile"><div class="entete-page"><h2>Stock</h2>
    <p class="discret">Pour suivre un article : Articles → Modifier → « Suivre le stock ». Les ventes le décomptent automatiquement.</p></div>
    ${suivis.length ? `<table class="tableau"><thead><tr><th>Article</th><th class="d">Stock</th><th class="d">Alerte</th><th>État</th><th></th></tr></thead>
    <tbody>${suivis.map(a => `<tr><td>${h(a.nom)}</td><td class="d"><strong>${a.stock}</strong></td><td class="d">${a.seuil || 0}</td>
      <td>${a.stock <= 0 ? `<span class="badge rouge">épuisé</span>` : a.stock <= (a.seuil || 0) ? `<span class="badge orange">bas</span>` : `<span class="badge vert">ok</span>`}</td>
      <td class="boutons-ligne"><button class="mini" data-a="ajuster" data-id="${a.id}" data-t="reception">+ Réception</button>
        <button class="mini" data-a="ajuster" data-id="${a.id}" data-t="perte">− Perte</button>
        <button class="mini" data-a="ajuster" data-id="${a.id}" data-t="inventaire">= Inventaire</button></td></tr>`).join("")}</tbody></table>`
      : `<div class="carte centre"><p>Aucun article suivi en stock.</p></div>`}</div>`;
};
A.ajuster = d => { S.modal = { type: "ajustement", articleId: d.id, t: d.t, saisie: "" }; render(); };
function modalAjustement(m) {
  const a = S.articles.find(x => x.id === m.articleId);
  const lib = { reception: "Réception (ajouter)", perte: "Perte / casse (retirer)", inventaire: "Inventaire (quantité comptée)" }[m.t];
  return `<div class="modal petit"><h2>${h(a.nom)}</h2><p>${lib} — stock actuel : <strong>${a.stock}</strong></p>
    <div class="affichage">${m.saisie || "0"}</div>${pave("ajust", true)}
    <div class="boutons"><button class="secondaire" data-a="fermer">Annuler</button><button class="principal" data-a="validerAjustement">Valider</button></div></div>`;
}
A.validerAjustement = async () => {
  const m = S.modal, a = S.articles.find(x => x.id === m.articleId), n = parseInt(m.saisie || "0", 10);
  const avant = a.stock;
  a.stock = m.t === "reception" ? a.stock + n : m.t === "perte" ? a.stock - n : n;
  await DB.lot([["articles", a], ["ajustements", { id: uid(), date: new Date().toISOString(), articleId: a.id, nom: a.nom,
    type: m.t, avant, apres: a.stock, par: S.user.nom }]]);
  S.modal = null; toast(`${a.nom} : ${avant} → ${a.stock}`); render();
};

// ====================================================================== HISTORIQUE
VUES.historique = () => {
  if (!S.cache.sessions) {
    DB.tous("sessions").then(s => { S.cache.sessions = s.sort((a, b) => b.ouverteLe.localeCompare(a.ouverteLe)); render(); }).catch(erreur);
    return `<p class="discret">Chargement…</p>`;
  }
  const der = S.params.derniereSauvegarde;
  return `<div class="page defile">
    <div class="entete-page"><h2>Historique des caisses</h2>
      <div class="boutons-ligne"><button class="secondaire" data-a="exporterVentes">Exporter toutes les ventes</button>
        <button class="principal" data-a="sauvegarder">💾 Sauvegarder la caisse</button>
        <label class="bouton secondaire">Restaurer<input type="file" accept=".json" data-c="restaurer" hidden></label></div></div>
    <p class="discret">Dernière sauvegarde : ${der ? `${dateFr(der)} à ${heureFr(der)}` : "jamais"}.</p>
    <table class="tableau"><thead><tr><th>Caisse</th><th>Manifestation</th><th>Date</th><th class="d">Ventes</th><th class="d">Écart</th><th></th></tr></thead>
    <tbody>${S.cache.sessions.map(s => `<tr><td>n° ${s.numero}</td><td>${h(s.manifestation)}</td><td>${dateFr(s.ouverteLe)}</td>
      <td class="d">${s.z ? eur(s.z.totalC) : "en cours"}</td><td class="d ${s.z && s.z.ecartC ? "rouge" : ""}">${s.z ? eur(s.z.ecartC) : ""}</td>
      <td class="boutons-ligne">${s.z ? `<button class="mini" data-a="exporterZ" data-id="${s.id}">📤 Compta</button>
        <button class="mini" data-a="imprimerZ" data-id="${s.id}">🖨️ Z</button>` : ""}</td></tr>`).join("") || `<tr><td colspan="6">Aucune caisse.</td></tr>`}</tbody></table></div>`;
};
A.exporterVentes = async () => {
  const tickets = (await DB.tous("tickets")).sort((a, b) => a.date.localeCompare(b.date));
  const lignes = [];
  for (const t of tickets) for (const l of t.lignes) lignes.push([dateFr(t.date), heureFr(t.date), t.numero, t.manifestation, t.caissier,
    l.nom, l.categorie, l.qte, enEuros(l.prixC), enEuros(l.netC), t.paiements.map(p => p.nom).join(" + "), t.annule ? "oui" : ""]);
  proposerFichier(await fichierExcel(`ventes_caisse_${dateFichier()}.xlsx`, [["Ventes",
    ["Date", "Heure", "Ticket", "Manifestation", "Caissier", "Article", "Catégorie", "Quantité", "Prix unitaire", "Montant", "Paiement", "Annulé"], lignes]]));
};
C.restaurer = async el => {
  const f = el.files[0]; el.value = "";
  if (!f) return;
  const donnees = JSON.parse(await f.text());
  confirmer(`Remplacer TOUTES les données de cette tablette par la sauvegarde du ${dateFr(donnees.exporteLe)} ?`, async () => {
    await DB.restaurer(donnees);
    S.params = { ...paramsDefaut(), ...(await DB.lire("params", "config")) };
    await recharger(); await preparerLogo(); S.user = null; S.modal = null; toast("Sauvegarde restaurée"); render();
  });
};

// ====================================================================== RÉGLAGES
VUES.reglages = () => {
  const p = S.params;
  return `<div class="page defile"><div class="entete-page"><h2>Réglages</h2></div>
  <div class="deux-col">
    <div class="carte"><h3>Association et ticket</h3>
      <form data-f="reglages" class="formulaire">
        <label>Nom affiché<input name="nomAsso" value="${h(p.nomAsso)}"></label>
        <label>En-tête du ticket (adresse, téléphone…)<textarea name="entete" rows="3">${h(p.entete)}</textarea></label>
        <label>Pied du ticket<textarea name="pied" rows="2">${h(p.pied)}</textarea></label>
        <label>Manifestations (une par ligne, mêmes noms que dans le logiciel du comité)<textarea name="manifestations" rows="6">${h(p.manifestations.join("\n"))}</textarea></label>
        <button class="principal">Enregistrer</button></form>
      <h3>Logo du ticket</h3>
      ${p.logo ? `<img class="apercu-logo" src="${p.logo}" alt="logo"><button class="mini" data-a="retirerLogo">Retirer</button>` : ""}
      <label class="bouton secondaire">Choisir une image<input type="file" accept="image/*" data-c="logo" hidden></label>
    </div>
    <div class="carte"><h3>Imprimante</h3>
      <label>Mode d'impression<select data-c="param" data-p="impression">
        ${[["aucune", "Pas d'impression"], ["bluetooth", "Bluetooth direct (imprimante BLE)"], ["rawbt", "Via l'appli RawBT (Bluetooth classique)"], ["navigateur", "Impression Android / navigateur"]]
          .map(([v, l]) => `<option value="${v}" ${p.impression === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      <label>Largeur du papier<select data-c="param" data-p="largeur">${[58, 80].map(l => `<option value="${l}" ${p.largeur === l ? "selected" : ""}>${l} mm</option>`).join("")}</select></label>
      <label>Accents<select data-c="param" data-p="accents">${[["ascii", "Sans accents (marche partout)"], ["cp858", "Avec accents (page PC858)"], ["w1252", "Avec accents (Windows-1252)"]]
        .map(([v, l]) => `<option value="${v}" ${p.accents === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      <label class="case"><input type="checkbox" data-c="param" data-p="impressionAuto" ${p.impressionAuto ? "checked" : ""}> Imprimer le ticket à chaque vente</label>
      <div class="boutons-ligne">${p.impression === "bluetooth" ? `<button class="secondaire" data-a="connecterImprimante">Connecter l'imprimante</button>` : ""}
        <button class="secondaire" data-a="ticketTest">Ticket de test</button></div>
      <p class="discret">${p.impression === "rawbt" ? "Installez l'appli gratuite RawBT (Play Store), appairez l'imprimante dans RawBT, puis faites un ticket de test." :
        p.impression === "bluetooth" ? "Imprimantes Bluetooth « BLE » : allumez l'imprimante puis « Connecter ». Si elle n'apparaît pas, choisissez le mode RawBT." : ""}</p>
      <h3>Moyens de paiement</h3>
      <div class="liste">${S.moyens.map(m => `<button class="ligne-liste" data-a="editerMoyen" data-id="${m.id}"><span>${h(m.nom)}${m.actif === false ? " (masqué)" : ""}</span>
        <span>${m.type === "jeton" ? `jeton ${eur(m.valeurJetonC)}` : m.modeCompta}${m.encaisse === false ? " · non recompté" : ""}</span></button>`).join("")}</div>
      <button class="mini" data-a="editerMoyen">+ Moyen de paiement</button>
      <h3>Utilisateurs</h3>
      <div class="liste">${S.utilisateurs.map(u => `<button class="ligne-liste" data-a="editerUser" data-id="${u.id}"><span>${h(u.nom)}</span><span>${u.role === "responsable" ? "Responsable" : "Caissier"}</span></button>`).join("")}</div>
      <button class="mini" data-a="editerUser">+ Utilisateur</button>
      <h3>Formation</h3>
      <label class="case"><input type="checkbox" data-c="formation" ${p.formation ? "checked" : ""}> Mode formation : ventes d'essai, rien n'est enregistré</label>
      <h3>Zone sensible</h3>
      <button class="danger" data-a="toutEffacer">Effacer toutes les données de la tablette</button>
      <p class="discret">Caisse v${VERSION_APP}</p>
    </div></div></div>`;
};
F.reglages = async v => {
  await sauverParams({ nomAsso: v.nomAsso.trim() || "Comité des Fêtes", entete: v.entete, pied: v.pied,
    manifestations: v.manifestations.split("\n").map(x => x.trim()).filter(Boolean) });
  toast("Réglages enregistrés"); render();
};
C.param = async el => {
  const v = el.type === "checkbox" ? el.checked : el.dataset.p === "largeur" ? parseInt(el.value, 10) : el.value;
  await sauverParams({ [el.dataset.p]: v });
  if (el.dataset.p === "largeur") await preparerLogo();
  render();
};
C.formation = async el => {
  if (el.checked && S.session) { el.checked = false; return toast("Clôturez d'abord la caisse ouverte pour passer en formation.", "erreur"); }
  await sauverParams({ formation: el.checked }); render();
};
A.basculerFormation = async () => { await sauverParams({ formation: true }); render(); };
C.logo = async el => {
  const f = el.files[0]; el.value = "";
  if (!f) return;
  const url = await new Promise(ok => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(f); });
  const img = new Image();
  await new Promise((ok, ko) => { img.onload = ok; img.onerror = () => ko(new Error("Image illisible")); img.src = url; });
  const l = Math.min(576, img.width), c = document.createElement("canvas");
  c.width = l; c.height = Math.round(img.height * l / img.width);
  const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
  await sauverParams({ logo: c.toDataURL("image/png") });
  await preparerLogo(); toast("Logo enregistré"); render();
};
A.retirerLogo = async () => { await sauverParams({ logo: null }); S.logoPx = null; render(); };
A.connecterImprimante = async () => { try { toast(`Connecté à ${await ESCPOS.connecterBluetooth()}`); } catch (e) { if (e.name !== "NotFoundError") erreur(e); } };
A.ticketTest = () => imprimer([
  ...(S.params.logo ? [{ t: "logo" }] : []), { t: "txt", v: S.params.nomAsso, a: "c", gras: true, double: true },
  { t: "txt", v: "Ticket de test", a: "c" }, { t: "trait" }, { t: "deux", g: "1 x Bière", d: eur(250) },
  { t: "deux", g: "2 x Crêpe", d: eur(400) }, { t: "trait" }, { t: "deux", g: "TOTAL", d: eur(650), gras: true, double: true },
  { t: "txt", v: "Accents : é è à ç ù ê ô €", a: "c" }]).catch(erreur);

A.editerMoyen = d => {
  const m = d.id ? moyenParId(d.id) : { id: "", nom: "", type: "autre", modeCompta: "Autre", encaisse: true, valeurJetonC: 100, ordre: S.moyens.length + 1, actif: true };
  S.modal = { type: "moyen", ...m }; render();
};
function modalMoyen(m) {
  return `<div class="modal petit"><h2>${m.id ? "Moyen de paiement" : "Nouveau moyen de paiement"}</h2>
    <form data-f="moyen" class="formulaire">
      <label>Nom<input name="nom" required value="${h(m.nom)}"></label>
      <label>Type<select name="type">${[["especes", "Espèces (avec rendu de monnaie)"], ["autre", "Carte, chèque, autre"], ["jeton", "Jetons / tickets boisson"]]
        .map(([v, l]) => `<option value="${v}" ${m.type === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      <label>Valeur d'un jeton (€, pour le type jetons)<input name="valeurJeton" inputmode="decimal" value="${String(enEuros(m.valeurJetonC || 0)).replace(".", ",")}"></label>
      <label>Mode de paiement dans la compta<select name="modeCompta">${MODES_COMPTA.map(x => `<option ${x === m.modeCompta ? "selected" : ""}>${x}</option>`).join("")}</select></label>
      <label class="case"><input type="checkbox" name="encaisse" ${m.encaisse !== false ? "checked" : ""}> Compter en recette dans le fichier compta
        <small>(décochez pour les jetons : ils ont déjà été encaissés à leur vente)</small></label>
      <label class="case"><input type="checkbox" name="actif" ${m.actif !== false ? "checked" : ""}> Proposé en caisse</label>
      <div class="boutons"><button type="button" class="secondaire" data-a="fermer">Annuler</button><button class="principal">Enregistrer</button></div></form></div>`;
}
F.moyen = async v => {
  if (v.type === "especes" && S.moyens.some(m => m.type === "especes" && m.id !== S.modal.id)) return toast("Il existe déjà un moyen « Espèces ».", "erreur");
  await DB.ecrire("moyens", { id: S.modal.id || uid(), nom: v.nom.trim(), type: v.type, modeCompta: v.modeCompta,
    encaisse: !!v.encaisse, valeurJetonC: versCentimes(v.valeurJeton) || 0, ordre: S.modal.ordre, actif: !!v.actif });
  await recharger(); S.modal = null; render();
};

A.editerUser = d => {
  const u = d.id ? S.utilisateurs.find(x => x.id === d.id) : { id: "", nom: "", pin: "", role: "caissier" };
  S.modal = { type: "user", ...u }; render();
};
function modalUser(m) {
  return `<div class="modal petit"><h2>${m.id ? "Utilisateur" : "Nouvel utilisateur"}</h2>
    <form data-f="user" class="formulaire">
      <label>Prénom ou nom<input name="nom" required value="${h(m.nom)}"></label>
      <label>Code (4 à 6 chiffres)<input name="pin" inputmode="numeric" pattern="[0-9]{4,6}" required value="${h(m.pin)}"></label>
      <label>Rôle<select name="role"><option value="caissier" ${m.role === "caissier" ? "selected" : ""}>Caissier : vend, entrées d'espèces</option>
        <option value="responsable" ${m.role === "responsable" ? "selected" : ""}>Responsable : tout (ouverture, clôture, annulation, réglages)</option></select></label>
      <div class="boutons">${m.id ? `<button type="button" class="danger" data-a="supprimerUser">Supprimer</button>` : ""}
        <button type="button" class="secondaire" data-a="fermer">Annuler</button><button class="principal">Enregistrer</button></div></form></div>`;
}
F.user = async v => {
  if (!/^\d{4,6}$/.test(v.pin)) return toast("Le code doit faire 4 à 6 chiffres.", "erreur");
  if (S.utilisateurs.some(u => u.pin === v.pin && u.id !== S.modal.id)) return toast("Ce code est déjà pris par un autre utilisateur.", "erreur");
  const autresResp = S.utilisateurs.filter(u => u.role === "responsable" && u.id !== S.modal.id);
  if (v.role !== "responsable" && !autresResp.length) return toast("Il faut garder au moins un responsable.", "erreur");
  const u = { id: S.modal.id || uid(), nom: v.nom.trim(), pin: v.pin, role: v.role };
  await DB.ecrire("utilisateurs", u);
  await recharger();
  if (S.user.id === u.id) S.user = u;
  S.modal = null; toast("Utilisateur enregistré"); render();
};
A.supprimerUser = () => {
  if (S.modal.id === S.user.id) return toast("Vous ne pouvez pas supprimer l'utilisateur connecté.", "erreur");
  if (S.modal.role === "responsable" && S.utilisateurs.filter(u => u.role === "responsable").length <= 1) return toast("Il faut garder au moins un responsable.", "erreur");
  confirmer("Supprimer cet utilisateur ?", async () => { await DB.supprimer("utilisateurs", S.modal.id); await recharger(); S.modal = null; render(); });
};
A.toutEffacer = () => confirmer("Effacer TOUTES les ventes, caisses, articles et réglages de cette tablette ? Faites d'abord une sauvegarde.", () =>
  confirmer("Dernière confirmation : tout effacer ?", async () => {
    for (const m of DB.MAGASINS) await DB.vider(m);
    location.reload();
  }));

// ====================================================================== modales génériques
function confirmer(message, suite) {
  S.modal = { type: "confirm", message, suite };
  render();
}
function modalConfirm(m) {
  return `<div class="modal petit"><h2>Confirmation</h2><p>${h(m.message)}</p>
    <div class="boutons"><button class="secondaire" data-a="fermer">Annuler</button><button class="principal" data-a="confirmerOui">Confirmer</button></div></div>`;
}
A.confirmerOui = async () => { const suite = S.modal.suite; S.modal = null; await suite(); };
A.fermer = () => {
  if (S.modal?.type === "scan") {
    arreterScan();
    if (S.modal.pourArticle && S.retourArticle) { S.modal = S.retourArticle; S.retourArticle = null; return render(); }
  }
  S.modal = null; render();
};
A.vue = d => { S.vue = d.v; S.modal = null; if (["tableau", "historique"].includes(d.v)) delete S.cache.sessions; render(); };

const MODALES = { pin: modalPin, ligne: modalLigne, remise: modalRemise, paiement: modalPaiement, scan: modalScan,
  ouvrir: modalOuvrir, mouvement: modalMouvement, ticket: modalTicket, cloture: modalCloture, "fin-z": modalFinZ,
  fichier: modalFichier, article: modalArticle, categorie: modalCategorie, ajustement: modalAjustement, moyen: modalMoyen,
  user: modalUser, confirm: modalConfirm };
function rendreModal() {
  if (!S.modal) return "";
  return `<div class="voile" data-a="voile">${MODALES[S.modal.type](S.modal)}</div>`;
}
A.voile = (d, el) => { /* clic sur le fond : ne ferme pas, pour éviter les fausses manipulations */ };

// scan pendant l'édition d'un article : renvoyer le code dans le formulaire
const codeScanneOrigine = codeScanne;
// eslint-disable-next-line no-func-assign
codeScanne = function (code) {
  if (S.retourArticle) { S.modal = { ...S.retourArticle, codeBarre: String(code).trim() }; S.retourArticle = null; render(); return; }
  codeScanneOrigine(code);
};

// ====================================================================== évènements
document.addEventListener("click", e => {
  const el = e.target.closest("[data-a]");
  if (!el || el.disabled) return;
  if (el.dataset.a === "voile" && e.target !== el) return;
  const f = A[el.dataset.a];
  if (f) { e.preventDefault(); Promise.resolve(f(el.dataset, el)).catch(erreur); }
});
document.addEventListener("submit", e => {
  const f = e.target.closest("form[data-f]");
  if (!f) return;
  e.preventDefault();
  Promise.resolve(F[f.dataset.f](Object.fromEntries(new FormData(f)), f)).catch(erreur);
});
document.addEventListener("input", e => {
  const el = e.target.closest("[data-i]");
  if (el && I[el.dataset.i]) I[el.dataset.i](el);
});
document.addEventListener("change", e => {
  const el = e.target.closest("[data-c]");
  if (el && C[el.dataset.c]) Promise.resolve(C[el.dataset.c](el)).catch(erreur);
});

if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  navigator.serviceWorker.register("sw.js").catch(e => console.warn("Hors ligne indisponible", e));
}
initialiser();
