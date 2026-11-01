/* Impression des tickets : commandes ESC/POS pour imprimantes thermiques 58/80 mm.
   Trois voies : Bluetooth direct (BLE, via Chrome), appli Android RawBT (Bluetooth classique), impression navigateur. */
const ESCPOS = (() => {
  const ESC = 0x1b, GS = 0x1d;

  // Correspondance des caractères français pour les pages de code courantes
  const CP858 = { "Ç": 0x80, "ü": 0x81, "é": 0x82, "â": 0x83, "ä": 0x84, "à": 0x85, "ç": 0x87, "ê": 0x88,
    "ë": 0x89, "è": 0x8a, "ï": 0x8b, "î": 0x8c, "Ä": 0x8e, "É": 0x90, "ô": 0x93, "ö": 0x94, "û": 0x96,
    "ù": 0x97, "Ö": 0x99, "Ü": 0x9a, "€": 0xd5, "°": 0xf8, "È": 0xd4, "Ê": 0xd2, "À": 0xb7, "Â": 0xb6, "Ô": 0xe2 };
  const W1252 = { "€": 0x80, "Œ": 0x8c, "œ": 0x9c, "°": 0xb0 };

  function sansAccents(t) {
    return t.replace(/€/g, "EUR").replace(/œ/g, "oe").replace(/Œ/g, "OE")
      .normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\x20-\x7e\n]/g, "?");
  }

  function encoder(texte, mode) {
    texte = texte.replace(/[  ]/g, " ").replace(/[’‘]/g, "'").replace(/[“”«»]/g, '"').replace(/[—–]/g, "-");
    if (mode === "ascii") return Array.from(sansAccents(texte), c => c.charCodeAt(0));
    const table = mode === "cp858" ? CP858 : W1252;
    const octets = [];
    for (const c of texte) {
      const code = c.charCodeAt(0);
      if (code < 0x80) octets.push(code);
      else if (table[c] !== undefined) octets.push(table[c]);
      else if (mode === "w1252" && code < 0x100) octets.push(code);
      else octets.push(...Array.from(sansAccents(c), x => x.charCodeAt(0)));
    }
    return octets;
  }

  class Ticket {
    constructor(largeur = 58, accents = "ascii") {
      this.colonnes = largeur === 80 ? 48 : 32;
      this.points = largeur === 80 ? 576 : 384;
      this.accents = accents;
      this.o = [ESC, 0x40];
      if (accents === "cp858") this.o.push(ESC, 0x74, 19);
      if (accents === "w1252") this.o.push(ESC, 0x74, 16);
    }
    texte(t) { this.o.push(...encoder(t, this.accents)); return this; }
    ligne(t = "") { return this.texte(t + "\n"); }
    aligner(a) { this.o.push(ESC, 0x61, { g: 0, c: 1, d: 2 }[a] ?? 0); return this; }
    gras(on) { this.o.push(ESC, 0x45, on ? 1 : 0); return this; }
    taille(double) { this.o.push(GS, 0x21, double ? 0x11 : 0x00); return this; }
    trait(c = "-") { return this.ligne(c.repeat(this.colonnes)); }
    deux(gauche, droite, largeurCol = this.colonnes) {
      gauche = String(gauche); droite = String(droite);
      const place = largeurCol - droite.length - 1;
      if (gauche.length > place) {
        this.ligne(gauche.slice(0, largeurCol));
        return this.ligne(" ".repeat(Math.max(0, largeurCol - droite.length)) + droite);
      }
      return this.ligne(gauche + " ".repeat(largeurCol - gauche.length - droite.length) + droite);
    }
    avance(n = 3) { this.o.push(ESC, 0x64, n); return this; }
    couper() { this.o.push(GS, 0x56, 0x42, 0x00); return this; }
    tiroir() { this.o.push(ESC, 0x70, 0x00, 0x19, 0xfa); return this; }
    /* Image monochrome (logo) : pixels = tableau 0/1 ligne par ligne, largeur multiple de 8 */
    image(pixels, largeur, hauteur) {
      const octetsLigne = largeur / 8;
      this.o.push(GS, 0x76, 0x30, 0x00, octetsLigne & 0xff, (octetsLigne >> 8) & 0xff, hauteur & 0xff, (hauteur >> 8) & 0xff);
      for (let y = 0; y < hauteur; y++) {
        for (let xb = 0; xb < octetsLigne; xb++) {
          let b = 0;
          for (let bit = 0; bit < 8; bit++) if (pixels[y * largeur + xb * 8 + bit]) b |= 0x80 >> bit;
          this.o.push(b);
        }
      }
      return this;
    }
    octets() { return new Uint8Array(this.o); }
  }

  /* Convertit une image (data URL) en pixels noir/blanc tramés, largeur max en points */
  function preparerLogo(dataUrl, largeurMax) {
    return new Promise((ok, ko) => {
      const img = new Image();
      img.onload = () => {
        let l = Math.min(largeurMax, img.width);
        l -= l % 8;
        const h = Math.max(1, Math.round(img.height * l / img.width));
        const c = document.createElement("canvas");
        c.width = l; c.height = h;
        const ctx = c.getContext("2d");
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, l, h);
        ctx.drawImage(img, 0, 0, l, h);
        const d = ctx.getImageData(0, 0, l, h).data;
        const gris = new Float32Array(l * h);
        for (let i = 0; i < l * h; i++) gris[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
        const px = new Uint8Array(l * h);
        for (let y = 0; y < h; y++) for (let x = 0; x < l; x++) {   // tramage Floyd-Steinberg
          const i = y * l + x, ancien = gris[i], nouveau = ancien < 128 ? 0 : 255, err = ancien - nouveau;
          px[i] = nouveau === 0 ? 1 : 0;
          if (x + 1 < l) gris[i + 1] += err * 7 / 16;
          if (y + 1 < h) {
            if (x > 0) gris[i + l - 1] += err * 3 / 16;
            gris[i + l] += err * 5 / 16;
            if (x + 1 < l) gris[i + l + 1] += err / 16;
          }
        }
        ok({ pixels: px, largeur: l, hauteur: h });
      };
      img.onerror = () => ko(new Error("Logo illisible"));
      img.src = dataUrl;
    });
  }

  // ---------------------------------------------------------------- Bluetooth direct (BLE)
  const SERVICES = ["000018f0-0000-1000-8000-00805f9b34fb", "e7810a71-73ae-499d-8c15-faa9aef0c3f2",
    "49535343-fe7d-4ae5-8fa9-9fafd205e455", "0000ff00-0000-1000-8000-00805f9b34fb",
    "0000ffe0-0000-1000-8000-00805f9b34fb", "0000fee7-0000-1000-8000-00805f9b34fb",
    "0000ae30-0000-1000-8000-00805f9b34fb"];
  let caracteristique = null, appareil = null;

  async function trouverEcriture(serveur) {
    const services = await serveur.getPrimaryServices();
    for (const s of services) {
      for (const c of await s.getCharacteristics()) {
        if (c.properties.write || c.properties.writeWithoutResponse) return c;
      }
    }
    throw new Error("Aucune voie d'impression trouvée sur cet appareil Bluetooth.");
  }

  async function connecterBluetooth() {
    if (!navigator.bluetooth) throw new Error("Bluetooth direct indisponible dans ce navigateur : utilisez Chrome sur Android, ou l'appli RawBT.");
    appareil = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: SERVICES });
    const serveur = await appareil.gatt.connect();
    caracteristique = await trouverEcriture(serveur);
    return appareil.name || "Imprimante";
  }

  async function reconnecter() {
    if (caracteristique && appareil?.gatt.connected) return true;
    if (appareil) {
      const serveur = await appareil.gatt.connect();
      caracteristique = await trouverEcriture(serveur);
      return true;
    }
    if (navigator.bluetooth?.getDevices) {
      const deja = await navigator.bluetooth.getDevices();
      if (deja.length) { appareil = deja[0]; return reconnecter(); }
    }
    return false;
  }

  async function envoyerBluetooth(octets) {
    if (!(await reconnecter())) throw new Error("Imprimante non connectée : Réglages → Imprimante → Connecter.");
    const morceau = 180;
    for (let i = 0; i < octets.length; i += morceau) {
      const part = octets.slice(i, i + morceau);
      if (caracteristique.properties.writeWithoutResponse) await caracteristique.writeValueWithoutResponse(part);
      else await caracteristique.writeValue(part);
    }
  }

  // ---------------------------------------------------------------- RawBT (Bluetooth classique)
  function envoyerRawBT(octets) {
    let bin = "";
    for (const b of octets) bin += String.fromCharCode(b);
    window.location.href = "intent:base64," + btoa(bin) + "#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;";
  }

  return { Ticket, preparerLogo, connecterBluetooth, envoyerBluetooth, envoyerRawBT, estConnecte: () => !!(appareil?.gatt?.connected) };
})();
