/* Google Drive de l'association : envoi des tickets Z et de la sauvegarde, et récupération de la caisse
   sur une tablette neuve ou réinitialisée. Autorisation « drive.file » : la caisse ne voit que les fichiers
   créés par les applis du comité. */
const DRIVE = (() => {
  const PORTEE = "https://www.googleapis.com/auth/drive.file";
  const API = "https://www.googleapis.com/drive/v3";
  const ENVOI = "https://www.googleapis.com/upload/drive/v3";
  const DOSSIER = "application/vnd.google-apps.folder";
  let jeton = null, expire = 0;

  function chargerGoogle() {
    if (window.google?.accounts?.oauth2) return Promise.resolve();
    if (!navigator.onLine) return Promise.reject(new Error("Pas de connexion internet."));
    return new Promise((ok, ko) => {
      const s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client";
      s.onload = ok;
      s.onerror = () => ko(new Error("Connexion à Google impossible (internet ?)."));
      document.head.appendChild(s);
    });
  }

  const jetonValide = () => !!jeton && Date.now() < expire - 60000;

  /* À appeler depuis un appui sur un bouton : ouvre la fenêtre Google si nécessaire. */
  async function connecter(clientId, compte) {
    if (!clientId) throw new Error("Renseignez l'identifiant Google (Réglages → Google Drive du comité).");
    if (jetonValide()) return;
    await chargerGoogle();
    await new Promise((ok, ko) => {
      const client = google.accounts.oauth2.initTokenClient({
        client_id: clientId, scope: PORTEE, hint: compte || undefined,
        callback: r => {
          if (r.error) return ko(new Error("Autorisation Google refusée : " + r.error));
          jeton = r.access_token;
          expire = Date.now() + (parseInt(r.expires_in, 10) || 3600) * 1000;
          ok();
        },
        error_callback: e => ko(new Error(e?.type === "popup_closed" ? "Fenêtre Google fermée." : "Connexion Google impossible : " + (e?.message || e?.type))),
      });
      client.requestAccessToken({ prompt: "" });
    });
  }

  async function api(methode, url, corps, entetes = {}) {
    if (!jetonValide()) throw new Error("Connexion Google expirée : touchez de nouveau le bouton Drive.");
    const r = await fetch(url, { method: methode, body: corps, headers: { Authorization: "Bearer " + jeton, ...entetes } });
    if (r.status === 401) { jeton = null; throw new Error("Connexion Google expirée : touchez de nouveau le bouton Drive."); }
    if (!r.ok) throw new Error(`Google Drive a refusé l'opération (${r.status}).`);
    return r.status === 204 ? null : r.json();
  }

  const echapper = t => t.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

  async function chercherDossier(nom, parent) {
    const q = [`name = '${echapper(nom)}'`, `mimeType = '${DOSSIER}'`, "trashed = false"];
    if (parent) q.push(`'${parent}' in parents`);
    const r = await api("GET", `${API}/files?q=${encodeURIComponent(q.join(" and "))}&fields=files(id,name)&pageSize=10`);
    return r.files[0]?.id || null;
  }

  async function chercherFichier(nom, parent) {
    const q = `name = '${echapper(nom)}' and '${parent}' in parents and trashed = false`;
    return (await api("GET", `${API}/files?q=${encodeURIComponent(q)}&fields=files(id,appProperties)`)).files[0] || null;
  }

  async function dossier(nom, parent) {
    const id = await chercherDossier(nom, parent);
    if (id) return id;
    const r = await api("POST", `${API}/files?fields=id`, JSON.stringify({ name: nom, mimeType: DOSSIER, ...(parent ? { parents: [parent] } : {}) }),
      { "Content-Type": "application/json" });
    return r.id;
  }

  /* Dossier de la caisse sans rien créer (pour la récupération). */
  async function trouverCaisse() {
    const compta = await chercherDossier("Comité des Fêtes — Logiciel");
    return (compta && await chercherDossier("Caisse", compta)) || await chercherDossier("Comité des Fêtes — Caisse");
  }

  /* Range la caisse à côté de la compta : « Comité des Fêtes — Logiciel / Caisse » si ce dossier existe,
     sinon « Comité des Fêtes — Caisse » à la racine du Drive. */
  async function dossiers(memo) {
    if (memo?.z && memo?.sauvegardes) {
      try { await api("GET", `${API}/files/${memo.z}?fields=id`); return memo; } catch (e) { /* dossier supprimé : on recrée */ }
    }
    const compta = await chercherDossier("Comité des Fêtes — Logiciel");
    const caisse = compta ? await dossier("Caisse", compta) : await dossier("Comité des Fêtes — Caisse");
    return { caisse, aCoteCompta: !!compta, z: await dossier("Z à importer", caisse), sauvegardes: await dossier("Sauvegardes", caisse) };
  }

  /* Envoie le fichier ; remplace celui du même nom s'il vient de la même caisse (idBase).
     S'il vient d'une autre caisse (tablette réinitialisée par ex.), il n'est jamais écrasé :
     le fichier est créé sous un autre nom et « conflit » est signalé. */
  async function envoyer(fichier, parent, idBase) {
    let nom = fichier.name;
    let existant = await chercherFichier(nom, parent);
    let conflit = false;
    if (existant?.appProperties?.idBase && existant.appProperties.idBase !== idBase) {
      conflit = true;
      nom = nom.replace(/(\.\w+)$/, `_${idBase.slice(0, 6)}$1`);
      existant = await chercherFichier(nom, parent);
    }
    const frontiere = "caisse" + Math.random().toString(36).slice(2);
    const meta = existant ? { appProperties: { idBase } } : { name: nom, parents: [parent], appProperties: { idBase } };
    const corps = new Blob([`--${frontiere}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n`,
      `--${frontiere}\r\nContent-Type: ${fichier.type || "application/octet-stream"}\r\n\r\n`, fichier, `\r\n--${frontiere}--`]);
    const url = existant ? `${ENVOI}/files/${existant.id}?uploadType=multipart&fields=id` : `${ENVOI}/files?uploadType=multipart&fields=id`;
    const r = await api(existant ? "PATCH" : "POST", url, corps, { "Content-Type": `multipart/related; boundary=${frontiere}` });
    return { id: r.id, nom, conflit };
  }

  /* Sauvegardes disponibles, la plus récente d'abord. */
  async function listerSauvegardes() {
    const caisse = await trouverCaisse();
    if (!caisse) return [];
    const sauv = await chercherDossier("Sauvegardes", caisse);
    if (!sauv) return [];
    const q = `'${sauv}' in parents and trashed = false and name contains '.json'`;
    const r = await api("GET", `${API}/files?q=${encodeURIComponent(q)}&orderBy=modifiedTime desc&pageSize=60&fields=files(id,name,modifiedTime,size,appProperties)`);
    return r.files;
  }

  const telecharger = id => api("GET", `${API}/files/${id}?alt=media`);

  return { connecter, jetonValide, dossiers, envoyer, listerSauvegardes, telecharger,
    deconnecter: () => { jeton = null; expire = 0; } };
})();
