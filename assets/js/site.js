/* Kleine Helfer: Kopierknöpfe, Video-Filter, "mehr anzeigen", Videos pausieren */
(function () {
  "use strict";

  function meldung(text) {
    var el = document.querySelector(".meldung");
    if (!el) { el = document.createElement("div"); el.className = "meldung"; el.setAttribute("role", "status"); document.body.appendChild(el); }
    el.textContent = text;
    el.classList.add("zeigen");
    clearTimeout(el._zeit);
    el._zeit = setTimeout(function () { el.classList.remove("zeigen"); }, 2400);
  }

  /* Kopieren: <button class="kopieren" data-kopieren="TEXT"> */
  document.addEventListener("click", function (e) {
    var k = e.target.closest("[data-kopieren]");
    if (!k) return;
    var wert = k.getAttribute("data-kopieren");
    if (wert === "SEITE") wert = window.location.href;
    function erfolg() { meldung("Kopiert: " + wert); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(wert).then(erfolg, ersatz);
    } else { ersatz(); }
    function ersatz() {
      var f = document.createElement("textarea");
      f.value = wert; f.setAttribute("readonly", "");
      f.style.position = "fixed"; f.style.opacity = "0";
      document.body.appendChild(f); f.select();
      try { document.execCommand("copy"); erfolg(); } catch (x) { meldung("Bitte von Hand kopieren: " + wert); }
      document.body.removeChild(f);
    }
  });

  /* Portfolio-Filter und "Weitere Videos ansehen" */
  var raster = document.querySelector("[data-videos]");
  if (raster) {
    var kacheln = [].slice.call(raster.querySelectorAll(".video-kachel"));
    var mehrKnopf = document.querySelector("[data-mehr]");
    var grenze = 9;
    var alleZeigen = false;
    var filter = "alle";

    function auffrischen() {
      var sichtbar = 0;
      kacheln.forEach(function (k) {
        var passt = filter === "alle" || (k.getAttribute("data-kategorie") || "").split(" ").indexOf(filter) > -1;
        var zeigen = passt && (alleZeigen || sichtbar < grenze);
        if (passt) sichtbar++;
        k.classList.toggle("versteckt", !zeigen);
        if (!zeigen) { var v = k.querySelector("video"); if (v) v.pause(); }
      });
      if (mehrKnopf) mehrKnopf.hidden = alleZeigen || sichtbar <= grenze;
    }

    document.querySelectorAll("[data-filter]").forEach(function (b) {
      b.addEventListener("click", function () {
        filter = b.getAttribute("data-filter");
        alleZeigen = false;
        document.querySelectorAll("[data-filter]").forEach(function (x) {
          x.setAttribute("aria-pressed", String(x === b));
        });
        auffrischen();
      });
    });
    if (mehrKnopf) mehrKnopf.addEventListener("click", function () { alleZeigen = true; auffrischen(); });
    auffrischen();
  }

  /* Portfolio-Videos: antippen startet, zweites Antippen pausiert. Immer nur eins läuft. */
  document.querySelectorAll(".video-kachel").forEach(function (kachel) {
    var video = kachel.querySelector("video");
    if (!video) return;
    kachel.addEventListener("click", function () {
      if (video.paused) {
        document.querySelectorAll(".video-kachel video").forEach(function (v) { if (v !== video) v.pause(); });
        video.play();
        kachel.classList.add("laeuft");
      } else {
        video.pause();
        kachel.classList.remove("laeuft");
      }
    });
  });

  /* Videos pausieren, wenn sie aus dem Bild scrollen */
  if ("IntersectionObserver" in window) {
    var wache = new IntersectionObserver(function (eintraege) {
      eintraege.forEach(function (e) {
        if (!e.isIntersecting) { try { e.target.pause(); } catch (x) {} }
      });
    }, { threshold: 0.15 });
    document.querySelectorAll("video").forEach(function (v) { wache.observe(v); });
  }
})();
