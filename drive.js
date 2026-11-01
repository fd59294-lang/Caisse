/* Envoi de la caisse vers le Google Drive de l'association (connexion Google, autorisation « drive.file » :
   la caisse ne voit que les fichiers qu'elle a créés et ceux du logiciel du comité). */
const DRIVE = (() => {
  const PORTEE = "https://www.googleapis.com/auth/drive.file";
  const API = "https://www.googleapis.com/drive/v3";
  const ENVOI = "https://www.googleapis.com/upload/drive/v3";
  const DOSSIER = "application/vnd.google-apps.folder";
  let jeton = null, expire = 0, clientJeton = null;

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

  /* À appeler depuis un clic : ouvre la fenêtre Google si nécessaire. */
  async function connecter(clientId, compte) {
    if (!clientId) throw new Error("Renseignez l'identifiant Google dans Réglages → Google Drive.");
    if (jetonValide()) return;
    await chargerGoogle();
    await new Promise((ok, ko) => {
      clientJeton = google.accounts.oauth2.initTokenClient({
        client_id: clientId, scope: PORTEE, hint: compte || undefined,
        callback: r => {
          if (r.error) return ko(new Error("Autorisation Google refusée : " + r.error));
          jeton = r.access_token;
          expire = Date.now() + (parseInt(r.expires_in, 10) || 3600) * 1000;
          ok();
        },
        error_callback: e => ko(new Error(e?.type === "popup_closed" ? "Fenêtre Google fermée." : "Connexion Google impossible : " + (e?.message || e?.type))),
      });
      clientJeton.requestAccessToken({ prompt: "" });
    });
  }

  async function api(methode, url, corps, entetes = {}) {
    if (!jetonValide()) throw new Error("Connexion Google expirée : touchez « Envoyer au Drive ».");
    const r = await fetch(url, { method: methode, body: corps, headers: { Authorization: "Bearer " + jeton, ...entetes } });
    if (r.status === 401) { jeton = null; throw new Error("Connexion Google expirée : touchez « Envoyer au Drive »."); }
    if (!r.ok) throw new Error(`Google Drive a refusé l'envoi (${r.status}).`);
    return r.status === 204 ? null : r.json();
  }

  async function chercherDossier(nom, parent) {
    const q = [`name = '${nom.replace(/'/g, "\\'")}'`, `mimeType = '${DOSSIER}'`, "trashed = false"];
    if (parent) q.push(`'${parent}' in parents`);
    const r = await api("GET", `${API}/files?q=${encodeURIComponent(q.join(" and "))}&fields=files(id,name)&pageSize=10`);
    return r.files[0]?.id || null;
  }

  async function dossier(nom, parent) {
    const id = await chercherDossier(nom, parent);
    if (id) return id;
    const r = await api("POST", `${API}/files?fields=id`, JSON.stringify({ name: nom, mimeType: DOSSIER, ...(parent ? { parents: [parent] } : {}) }),
      { "Content-Type": "application/json" });
    return r.id;
  }

  /* Range la caisse à côté de la compta : « Comité des Fêtes — Logiciel / Caisse » si ce dossier existe,
     sinon un dossier « Comité des Fêtes — Caisse » à la racine du Drive. */
  async function dossiers(memo) {
    if (memo?.z && memo?.sauvegardes) {
      try { await api("GET", `${API}/files/${memo.z}?fields=id,trashed`); return memo; } catch (e) { /* dossier supprimé : on recrée */ }
    }
    const compta = await chercherDossier("Comité des Fêtes — Logiciel");
    const caisse = compta ? await dossier("Caisse", compta) : await dossier("Comité des Fêtes — Caisse");
    return { caisse, aCoteCompta: !!compta, z: await dossier("Z à importer", caisse), sauvegardes: await dossier("Sauvegardes", caisse) };
  }

  /* Crée le fichier, ou le remplace s'il existe déjà sous ce nom dans ce dossier. */
  async function envoyer(fichier, parent) {
    const q = `name = '${fichier.name.replace(/'/g, "\\'")}' and '${parent}' in parents and trashed = false`;
    const existant = (await api("GET", `${API}/files?q=${encodeURIComponent(q)}&fields=files(id)`)).files[0]?.id;
    const frontiere = "caisse" + Math.random().toString(36).slice(2);
    const meta = existant ? {} : { name: fichier.name, parents: [parent] };
    const corps = new Blob([`--${frontiere}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n`,
      `--${frontiere}\r\nContent-Type: ${fichier.type || "application/octet-stream"}\r\n\r\n`, fichier, `\r\n--${frontiere}--`]);
    const url = existant ? `${ENVOI}/files/${existant}?uploadType=multipart&fields=id` : `${ENVOI}/files?uploadType=multipart&fields=id`;
    return (await api(existant ? "PATCH" : "POST", url, corps, { "Content-Type": `multipart/related; boundary=${frontiere}` })).id;
  }

  return { connecter, jetonValide, dossiers, envoyer, deconnecter: () => { jeton = null; expire = 0; } };
})();
