/* Warenkorb über die Shopify Storefront-API.
   Läuft komplett im Browser, es gibt keinen eigenen Server dafür.
   Der Warenkorb liegt im Local Storage (technisch notwendig, § 25 Abs. 2 Nr. 2 TDDDG). */
(function () {
  "use strict";

  var SHOP = "p4ew11-rb.myshopify.com";
  var TOKEN = "ab26f15fc71ff5ff15ef4836c9d8ce90";
  var VERSION = "2025-07";
  var URL_API = "https://" + SHOP + "/api/" + VERSION + "/graphql.json";
  var SPEICHER = "seli-korb-v1";

  /* ---------- Hilfen ---------- */
  function geld(betrag, waehrung) {
    var zahl = Number(betrag);
    try {
      return new Intl.NumberFormat("de-DE", {
        style: "currency", currency: waehrung || "EUR",
        minimumFractionDigits: zahl % 1 === 0 ? 0 : 2
      }).format(zahl);
    } catch (e) { return zahl.toFixed(2) + " €"; }
  }

  function meldung(text) {
    var el = document.querySelector(".meldung");
    if (!el) { el = document.createElement("div"); el.className = "meldung"; el.setAttribute("role", "status"); document.body.appendChild(el); }
    el.textContent = text;
    el.classList.add("zeigen");
    clearTimeout(el._zeit);
    el._zeit = setTimeout(function () { el.classList.remove("zeigen"); }, 2600);
  }

  function frage(abfrage, variablen) {
    return fetch(URL_API, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Storefront-Access-Token": TOKEN },
      body: JSON.stringify({ query: abfrage, variables: variablen || {} })
    }).then(function (a) {
      if (!a.ok) throw new Error("Shopify antwortet nicht (" + a.status + ")");
      return a.json();
    }).then(function (d) {
      if (d.errors && d.errors.length) throw new Error(d.errors[0].message);
      return d.data;
    });
  }

  /* ---------- Produkte laden ---------- */
  var FELDER_PRODUKT = [
    "id title availableForSale",
    "variants(first: 1) { nodes { id availableForSale",
    "  price { amount currencyCode } compareAtPrice { amount currencyCode } } }"
  ].join(" ");

  function produktLaden(handle) {
    return frage(
      "query($h: String!) { product(handle: $h) { " + FELDER_PRODUKT + " } }",
      { h: handle }
    ).then(function (d) {
      var p = d && d.product;
      if (!p || !p.variants.nodes.length) return null;
      var v = p.variants.nodes[0];
      return {
        handle: handle, titel: p.title, variantId: v.id,
        kaufbar: p.availableForSale && v.availableForSale,
        preis: v.price, vorher: v.compareAtPrice
      };
    });
  }

  /* Alle Produktknöpfe der Seite füllen: <button data-handle="..."> */
  function produkteVorbereiten() {
    var knoepfe = [].slice.call(document.querySelectorAll("[data-handle]"));
    knoepfe.forEach(function (knopf) {
      var handle = knopf.getAttribute("data-handle");
      knopf.disabled = true;
      var alt = knopf.textContent;
      knopf.textContent = "Lädt …";
      produktLaden(handle).then(function (p) {
        if (!p) { knopf.textContent = "Zur Zeit nicht verfügbar"; return; }
        knopf._produkt = p;
        knopf.textContent = p.kaufbar ? alt : "Zur Zeit nicht verfügbar";
        knopf.disabled = !p.kaufbar;
        /* Preis einsetzen, falls ein Platzhalter vorhanden ist */
        var feld = document.querySelector('[data-preis="' + handle + '"]');
        if (feld && p.preis) {
          feld.textContent = geld(p.preis.amount, p.preis.currencyCode);
          var vorher = document.querySelector('[data-vorher="' + handle + '"]');
          if (vorher) {
            if (p.vorher && Number(p.vorher.amount) > Number(p.preis.amount)) {
              vorher.textContent = "statt " + geld(p.vorher.amount, p.vorher.currencyCode);
              vorher.hidden = false;
            } else { vorher.hidden = true; }
          }
        }
      }).catch(function (f) {
        knopf.textContent = "Shop gerade nicht erreichbar";
        console.warn("Produkt " + handle + ":", f.message);
      });
    });
  }

  /* ---------- Warenkorb ---------- */
  var FELDER_KORB = [
    "id checkoutUrl totalQuantity",
    "cost { subtotalAmount { amount currencyCode } totalAmount { amount currencyCode } }",
    "lines(first: 50) { nodes { id quantity merchandise { ... on ProductVariant {",
    "  id price { amount currencyCode } product { title } } } } }"
  ].join(" ");

  var korb = null;

  function merken(id) {
    try { id ? localStorage.setItem(SPEICHER, id) : localStorage.removeItem(SPEICHER); } catch (e) {}
  }
  function gemerkt() {
    try { return localStorage.getItem(SPEICHER); } catch (e) { return null; }
  }

  function korbLaden() {
    var id = gemerkt();
    if (!id) return Promise.resolve(null);
    return frage("query($id: ID!) { cart(id: $id) { " + FELDER_KORB + " } }", { id: id })
      .then(function (d) {
        korb = d && d.cart;
        if (!korb) merken(null);
        return korb;
      }).catch(function () { return null; });
  }

  function korbAnlegen(variantId, menge) {
    return frage(
      "mutation($lines: [CartLineInput!]!) { cartCreate(input: { lines: $lines }) { cart { " + FELDER_KORB + " } userErrors { message } } }",
      { lines: [{ merchandiseId: variantId, quantity: menge || 1 }] }
    ).then(function (d) {
      var a = d.cartCreate;
      if (a.userErrors && a.userErrors.length) throw new Error(a.userErrors[0].message);
      korb = a.cart; merken(korb.id); return korb;
    });
  }

  function hinzufuegen(variantId, menge) {
    if (!korb) {
      return korbLaden().then(function (k) {
        return k ? hinzufuegen(variantId, menge) : korbAnlegen(variantId, menge);
      });
    }
    return frage(
      "mutation($id: ID!, $lines: [CartLineInput!]!) { cartLinesAdd(cartId: $id, lines: $lines) { cart { " + FELDER_KORB + " } userErrors { message } } }",
      { id: korb.id, lines: [{ merchandiseId: variantId, quantity: menge || 1 }] }
    ).then(function (d) {
      var a = d.cartLinesAdd;
      if (a.userErrors && a.userErrors.length) throw new Error(a.userErrors[0].message);
      korb = a.cart; return korb;
    });
  }

  function aendern(lineId, menge) {
    return frage(
      "mutation($id: ID!, $lines: [CartLineUpdateInput!]!) { cartLinesUpdate(cartId: $id, lines: $lines) { cart { " + FELDER_KORB + " } userErrors { message } } }",
      { id: korb.id, lines: [{ id: lineId, quantity: menge }] }
    ).then(function (d) { korb = d.cartLinesUpdate.cart; return korb; });
  }

  function entfernen(lineId) {
    return frage(
      "mutation($id: ID!, $lines: [ID!]!) { cartLinesRemove(cartId: $id, lineIds: $lines) { cart { " + FELDER_KORB + " } userErrors { message } } }",
      { id: korb.id, lines: [lineId] }
    ).then(function (d) { korb = d.cartLinesRemove.cart; return korb; });
  }

  function kasse() {
    if (!korb || !korb.checkoutUrl) return;
    var u = korb.checkoutUrl;
    u += (u.indexOf("?") === -1 ? "?" : "&") + "channel=online_store";
    window.location.href = u;
  }

  /* ---------- Schublade ---------- */
  var schublade, schatten, zahlEl, listeEl, summeEl, zurKasse, vorherAktiv;

  function schubladeBauen() {
    schatten = document.createElement("div");
    schatten.className = "korb-schatten";
    schatten.addEventListener("click", zumachen);

    schublade = document.createElement("aside");
    schublade.className = "korb";
    schublade.setAttribute("aria-label", "Warenkorb");
    schublade.setAttribute("aria-hidden", "true");
    schublade.innerHTML =
      '<header><h2>Dein Warenkorb</h2><button class="zu" type="button" aria-label="Warenkorb schließen">&times;</button></header>' +
      '<div class="liste"></div>' +
      '<footer>' +
      '  <div class="summe"><span>Summe</span><span class="betrag">0 €</span></div>' +
      '  <button class="knopf knopf--voll knopf--breit zur-kasse" type="button">Zur Kasse</button>' +
      '  <p class="steuer">Bezahlung und Versand laufen sicher über Shopify.</p>' +
      '</footer>';
    document.body.appendChild(schatten);
    document.body.appendChild(schublade);

    listeEl = schublade.querySelector(".liste");
    summeEl = schublade.querySelector(".betrag");
    zurKasse = schublade.querySelector(".zur-kasse");
    schublade.querySelector(".zu").addEventListener("click", zumachen);
    zurKasse.addEventListener("click", kasse);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") zumachen(); });
  }

  function aufmachen() {
    vorherAktiv = document.activeElement;
    schublade.classList.add("offen");
    schatten.classList.add("offen");
    schublade.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    schublade.querySelector(".zu").focus();
  }
  function zumachen() {
    if (!schublade || !schublade.classList.contains("offen")) return;
    schublade.classList.remove("offen");
    schatten.classList.remove("offen");
    schublade.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    if (vorherAktiv && vorherAktiv.focus) vorherAktiv.focus();
  }

  function zeichnen() {
    var zeilen = (korb && korb.lines && korb.lines.nodes) || [];
    if (zahlEl) {
      var n = (korb && korb.totalQuantity) || 0;
      zahlEl.textContent = n;
      zahlEl.hidden = n === 0;
    }
    if (!listeEl) return;
    if (!zeilen.length) {
      listeEl.innerHTML = '<p class="leer">Dein Warenkorb ist noch leer.</p>';
      summeEl.textContent = geld(0, "EUR");
      zurKasse.disabled = true;
      return;
    }
    zurKasse.disabled = false;
    listeEl.innerHTML = "";
    zeilen.forEach(function (z) {
      var preis = z.merchandise.price;
      var el = document.createElement("div");
      el.className = "korb-zeile";
      el.innerHTML =
        '<div><span class="name"></span><div class="preis"></div>' +
        '<div class="menge"><button type="button" class="minus" aria-label="Menge verringern">–</button>' +
        '<span class="anzahl"></span>' +
        '<button type="button" class="plus" aria-label="Menge erhöhen">+</button></div></div>' +
        '<button type="button" class="weg">entfernen</button>';
      el.querySelector(".name").textContent = z.merchandise.product.title;
      el.querySelector(".preis").textContent = geld(preis.amount, preis.currencyCode);
      el.querySelector(".anzahl").textContent = z.quantity;
      el.querySelector(".minus").addEventListener("click", function () {
        (z.quantity <= 1 ? entfernen(z.id) : aendern(z.id, z.quantity - 1)).then(zeichnen);
      });
      el.querySelector(".plus").addEventListener("click", function () {
        aendern(z.id, z.quantity + 1).then(zeichnen);
      });
      el.querySelector(".weg").addEventListener("click", function () {
        entfernen(z.id).then(zeichnen);
      });
      listeEl.appendChild(el);
    });
    var s = korb.cost && korb.cost.subtotalAmount;
    summeEl.textContent = s ? geld(s.amount, s.currencyCode) : "";
  }

  /* ---------- Start ---------- */
  function start() {
    var knopfKorb = document.querySelector(".korb-knopf");
    if (!knopfKorb) return;              /* Seite ohne Shop */
    zahlEl = knopfKorb.querySelector(".zahl");
    schubladeBauen();
    knopfKorb.addEventListener("click", function () { aufmachen(); });

    produkteVorbereiten();
    korbLaden().then(zeichnen);

    document.addEventListener("click", function (e) {
      var knopf = e.target.closest("[data-handle]");
      if (!knopf || !knopf._produkt) return;
      e.preventDefault();
      knopf.disabled = true;
      var alt = knopf.textContent;
      knopf.textContent = "Moment …";
      hinzufuegen(knopf._produkt.variantId, 1).then(function () {
        zeichnen();
        knopf.textContent = alt;
        knopf.disabled = false;
        aufmachen();
      }).catch(function (f) {
        knopf.textContent = alt;
        knopf.disabled = false;
        meldung("Hat nicht geklappt: " + f.message);
      });
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
