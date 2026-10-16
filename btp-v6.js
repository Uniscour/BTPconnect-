/* ============================================================
   BTP-Connect · btp-v6.js
   - Publication par catégorie (1 annonce / catégorie / utilisateur) avec formulaires dédiés
   - Prix de référence suggérés (prix toujours libre et facultatif)
   - Détails affichés sur les cartes + filtre par service
   - Photos de profil
   - Admin : graphes (dashboard_series / dashboard_breakdown) et journal filtrable (audit_query / audit_mine)
   À charger après index.html : <script src="btp-v6.js"></script> avant </body>
   ============================================================ */
(function () {
  "use strict";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function val(id) { var e = $("#" + id); return e ? String(e.value || "").trim() : ""; }
  function money(n) { return Number(n).toLocaleString("fr-FR") + " FCFA"; }
  function norm(s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }
  function B() { return window.BTP; }
  function G() { return B() && B().get(); }
  function C() { return B() && B().sb(); }
  var tt = null;
  function tip(m, kind) {
    var e = $("#toast"); if (!e) return;
    e.textContent = m; e.className = kind || "ok";
    clearTimeout(tt); tt = setTimeout(function () { e.classList.add("hidden"); }, kind === "err" ? 7000 : 3500);
  }

  var SV = {
    technician: ["👷", "Technicien / Artisan"], supplier: ["🧱", "Vente de matériaux"],
    rental: ["🚜", "Location d'engins"], other: ["📌", "Autre service"], request: ["🔎", "Je cherche (demande)"]
  };
  var TRADES = ["Gros œuvre", "Plomberie", "Électricité", "Menuiserie", "Carrelage & peinture", "Autre"];
  var S = { cat: null, edit: null, rows: [], keep: false };
  var REF = null, AV = {};

  /* ---------- Style + montage dans l'onglet Publier ---------- */
  function mountPub() {
    var v = $("#view-publish"); if (!v || $("#v6-pub")) return;
    var st = document.createElement("style");
    st.textContent = "#pub-form-card{display:none!important}#v6-pub label.tl{display:block;font-size:12px;font-weight:700;color:#6b7280;margin:0 0 4px 2px}#v6-pub .ad input{margin-bottom:8px}.av{background-size:cover;background-position:center}";
    document.head.appendChild(st);
    var d = document.createElement("div"); d.id = "v6-pub"; v.appendChild(d);
    renderPub();
  }

  /* ---------- Chargement des prix de référence ---------- */
  function loadRef() {
    var c = C(); if (!c || REF !== null) return;
    REF = [];
    c.from("reference_prices").select("*").then(function (r) { if (!r.error) REF = r.data || []; });
  }
  function hintFor(r) {
    var n = norm(r.n); if (n.length < 3) return "";
    var m = (REF || []).filter(function (x) { var k = norm(x.material); return n.indexOf(k) >= 0 || k.indexOf(n) >= 0; });
    if (!m.length) return "";
    var f = norm(r.f), exact = m.filter(function (x) { return f && norm(x.format).indexOf(f) >= 0; });
    return (exact.length ? exact : m).slice(0, 2).map(function (x, i) {
      var avg = Math.round((Number(x.min_price) + Number(x.max_price)) / 2);
      return "💡 Prix indicatif (" + esc(x.format) + ") : <b>" + money(x.min_price) + " – " + money(x.max_price) + "</b> " +
        "<button type='button' class='lnk' data-v6='apply' data-v='" + avg + "' data-f='" + esc(x.format) + "'>Appliquer " + money(avg) + "</button>";
    }).join("<br>");
  }

  /* ---------- Publication ---------- */
  function mineList() { var g = G(); return g.listings.filter(function (i) { return String(i.provider_id) === String(g.user.id); }); }
  function allowed() {
    var g = G(), u = g.user, p = g.profiles[u.id] || {}, ty = p.user_type || (u.user_metadata || {}).user_type || "client";
    return ty === "client" ? ["request"] : ["technician", "supplier", "rental", "other"];
  }
  function renderPub() {
    var host = $("#v6-pub"), g = G(); if (!host) return;
    if (!g || !g.user) { host.innerHTML = ""; return; }
    if (!S.cat) {
      var mine = mineList();
      host.innerHTML = "<div class='card'><h3>📢 Que voulez-vous publier ?</h3>" +
        "<p class='tl-note' style='font-size:12px;color:#6b7280;margin-bottom:12px'>Une seule annonce par catégorie : vous pouvez la modifier à tout moment.</p>" +
        allowed().map(function (s) {
          var ex = s === "request" ? null : mine.filter(function (i) { return i.service === s; })[0];
          return "<button type='button' class='btn" + (ex ? " gray" : "") + "' style='margin-bottom:10px' data-v6='pick' data-s='" + s + "' data-id='" + (ex ? esc(ex.id) : "") + "'>" +
            SV[s][0] + " " + SV[s][1] + (ex ? " — ✏️ Modifier" : " — ➕ Publier") + "</button>";
        }).join("") + "</div>";
      return;
    }
    host.innerHTML = formHTML();
    $$("#v6-rows [data-i]").forEach(function (row) { hintRow(row); });
  }
  function opt(list, cur) { return list.map(function (x) { return "<option" + (x === cur ? " selected" : "") + ">" + esc(x) + "</option>"; }).join(""); }
  function lab(t) { return "<label class='tl'>" + t + "</label>"; }
  function rowsHTML(s) {
    var mats = {}, fmts = {};
    (REF || []).forEach(function (x) { mats[x.material] = 1; fmts[x.format] = 1; });
    return "<div id='v6-rows'>" + S.rows.map(function (r, i) {
      return "<div class='ad' data-i='" + i + "' style='padding:10px'>" +
        "<input data-f='n' list='v6-mats' placeholder='" + (s === "supplier" ? "Matériau (ex : Ciment CPJ 42,5)" : "Engin (ex : Pelleteuse)") + "' value='" + esc(r.n) + "'>" +
        "<input data-f='f' list='v6-fmts' placeholder='" + (s === "supplier" ? "Format (ex : sac de 50 kg)" : "Unité (ex : jour, heure)") + "' value='" + esc(r.f) + "'>" +
        "<input data-f='p' type='number' min='0' inputmode='numeric' placeholder='Prix en FCFA (facultatif)' value='" + esc(r.p == null ? "" : r.p) + "'>" +
        "<div class='m' data-hint></div><button type='button' class='ib danger' data-v6='rm' data-i='" + i + "'>✕ Retirer</button></div>";
    }).join("") + "</div><button type='button' class='btn gray' style='margin-bottom:12px' data-v6='addrow'>+ Ajouter une ligne</button>" +
      "<datalist id='v6-mats'>" + Object.keys(mats).map(function (k) { return "<option value='" + esc(k) + "'>"; }).join("") + "</datalist>" +
      "<datalist id='v6-fmts'>" + Object.keys(fmts).map(function (k) { return "<option value='" + esc(k) + "'>"; }).join("") + "</datalist>";
  }
  function formHTML() {
    var s = S.cat, L = S.edit, d = (L && L.details) || {}, g = G(), p = g.profiles[g.user.id] || {};
    var h = "<div class='card'><button type='button' class='btn gray' style='margin-bottom:12px' data-v6='back'>← Changer de catégorie</button><h3>" +
      SV[s][0] + " " + (L ? "Modifier : " : "Publier : ") + SV[s][1] + "</h3>";
    if (s === "technician") {
      h += lab("Votre métier") + "<select id='v6-trade'><option value=''>Choisir…</option>" + opt(TRADES, L && L.category) + "</select>" +
        lab("Années d'expérience") + "<input id='v6-years' type='number' min='0' value='" + esc(d.years == null ? "" : d.years) + "'>" +
        lab("Disponibilité") + "<select id='v6-avail'>" + opt(["Disponible immédiatement", "Sous 1 semaine", "Sur rendez-vous"], d.avail) + "</select>" +
        lab("Zones d'intervention") + "<input id='v6-zones' type='text' placeholder='Ex : Douala, Yaoundé' value='" + esc(d.zones || "") + "'>" +
        lab("Tarif journalier à partir de (FCFA, facultatif)") + "<input id='v6-price' type='number' min='0' value='" + esc(L && L.price != null ? L.price : "") + "'>" +
        lab("Titre (facultatif)") + "<input id='v6-title' type='text' value='" + esc(L ? L.title : "") + "'>" +
        lab("Présentation, réalisations") + "<textarea id='v6-desc' rows='4'>" + esc(L ? L.description : "") + "</textarea>";
    } else if (s === "supplier" || s === "rental") {
      h += lab(s === "supplier" ? "Vos matériaux, formats et prix" : "Vos engins, unités et tarifs") + rowsHTML(s);
      if (s === "supplier") h += lab("Livraison") + "<select id='v6-delivery'>" + opt(["Oui", "Non", "Selon distance"], d.delivery) + "</select>";
      else h += lab("Chauffeur / opérateur") + "<select id='v6-op'>" + opt(["Avec chauffeur", "Sans chauffeur", "Au choix"], d.operator) + "</select>";
      h += lab("Titre (facultatif)") + "<input id='v6-title' type='text' value='" + esc(L ? L.title : "") + "'>" +
        lab("Informations complémentaires") + "<textarea id='v6-desc' rows='3'>" + esc(d.note || "") + "</textarea>";
    } else if (s === "request") {
      h += lab("Vous cherchez") + "<select id='v6-target'>" + ["technician", "supplier", "rental", "other"].map(function (k) { return "<option value='" + k + "'" + (d.target === k ? " selected" : "") + ">" + SV[k][0] + " " + SV[k][1] + "</option>"; }).join("") + "</select>" +
        lab("Titre") + "<input id='v6-title' type='text' value='" + esc(L ? L.title : "") + "'>" +
        lab("Détails du besoin") + "<textarea id='v6-desc' rows='4'>" + esc(L ? L.description : "") + "</textarea>" +
        lab("Budget en FCFA (facultatif)") + "<input id='v6-price' type='number' min='0' value='" + esc(L && L.price != null ? L.price : "") + "'>";
    } else {
      h += lab("Catégorie") + "<select id='v6-cat'>" + opt(TRADES, L && L.category) + "</select>" +
        lab("Titre") + "<input id='v6-title' type='text' value='" + esc(L ? L.title : "") + "'>" +
        lab("Description") + "<textarea id='v6-desc' rows='4'>" + esc(L ? L.description : "") + "</textarea>" +
        lab("Prix en FCFA (facultatif)") + "<input id='v6-price' type='number' min='0' value='" + esc(L && L.price != null ? L.price : "") + "'>";
    }
    h += lab("Ville") + "<input id='v6-city' type='text' value='" + esc((L && L.city) || p.city || "Douala") + "'>" +
      "<label class='photo-pick'><span>📷 " + (L && L.image_url ? "Changer la photo" : "Ajouter une photo (facultatif)") + "</span><input id='v6-photo' type='file' accept='image/*'></label>" +
      "<button type='button' class='btn' id='v6-save' data-v6='save'>" + (L ? "Enregistrer les modifications" : "Publier l'annonce") + "</button></div>";
    return h;
  }
  function hintRow(row) {
    var i = Number(row.getAttribute("data-i")), box = $("[data-hint]", row);
    if (box && S.rows[i]) box.innerHTML = S.cat === "supplier" ? hintFor(S.rows[i]) : "";
  }

  function compress(file, max, square) {
    return new Promise(function (res, rej) {
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        var c = document.createElement("canvas"), x = c.getContext("2d");
        if (square) {
          var m = Math.min(img.width, img.height); c.width = c.height = max;
          x.drawImage(img, (img.width - m) / 2, (img.height - m) / 2, m, m, 0, 0, max, max);
        } else {
          var k = Math.min(1, max / Math.max(img.width, img.height));
          c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); x.drawImage(img, 0, 0, c.width, c.height);
        }
        URL.revokeObjectURL(url);
        c.toBlob(function (b) { b ? res(b) : rej(new Error("Image illisible")); }, "image/jpeg", 0.82);
      };
      img.onerror = function () { rej(new Error("Image illisible")); };
      img.src = url;
    });
  }

  async function save() {
    var g = G(), u = g.user, s = S.cat, L = S.edit, d = {}, title = val("v6-title"), desc = val("v6-desc"), cat = null, price = null;
    var kind = L ? (L.kind || "offer") : (s === "request" ? "request" : "offer");
    var city = val("v6-city"), pn = function (id) { var v = parseFloat(val(id)); return isNaN(v) ? null : v; };
    if (!city) return tip("Indiquez la ville.", "err");
    if (s === "technician") {
      cat = val("v6-trade"); if (!cat) return tip("Choisissez votre métier.", "err");
      if (!desc) return tip("Ajoutez une présentation.", "err");
      d = { trade: cat, years: pn("v6-years"), avail: val("v6-avail"), zones: val("v6-zones") };
      price = pn("v6-price"); title = title || "Technicien – " + cat;
    } else if (s === "supplier" || s === "rental") {
      var items = S.rows.filter(function (r) { return String(r.n || "").trim(); }).map(function (r) {
        return { n: r.n.trim(), f: String(r.f || "").trim(), p: (r.p === "" || r.p == null || isNaN(Number(r.p))) ? null : Number(r.p) };
      });
      if (!items.length) return tip("Ajoutez au moins une ligne.", "err");
      d = { items: items, note: desc };
      if (s === "supplier") { d.delivery = val("v6-delivery"); cat = "Matériaux de construction"; title = title || "Vente de matériaux (" + items.length + " produit(s))"; }
      else { d.operator = val("v6-op"); cat = "Location d'engins"; title = title || "Location d'engins (" + items.length + ")"; }
      var ps = items.map(function (x) { return x.p; }).filter(function (x) { return x > 0; });
      price = ps.length ? Math.min.apply(null, ps) : null;
      desc = (desc ? desc + "\n" : "") + (s === "supplier" ? "Produits : " : "Engins : ") + items.map(function (x) { return x.n; }).join(", ");
    } else if (s === "request") {
      var tg = val("v6-target"); if (!title || !desc) return tip("Titre et détails obligatoires.", "err");
      d = { target: tg }; cat = { technician: "Technicien", supplier: "Matériaux de construction", rental: "Location d'engins", other: "Autre" }[tg];
      price = pn("v6-price");
    } else {
      cat = val("v6-cat"); if (!title || !desc) return tip("Titre et description obligatoires.", "err");
      price = pn("v6-price");
    }
    var btn = $("#v6-save"); if (btn) btn.disabled = true;
    var c = C(), url = null, f = $("#v6-photo") && $("#v6-photo").files[0];
    try {
      if (f) {
        tip("Envoi de la photo…");
        var blob = await compress(f, 1280, false), path = u.id + "/" + Date.now() + ".jpg";
        var up = await c.storage.from("listing-images").upload(path, blob, { contentType: "image/jpeg" });
        if (up.error) throw up.error;
        url = c.storage.from("listing-images").getPublicUrl(path).data.publicUrl;
      }
    } catch (err) { if (btn) btn.disabled = false; return tip("Photo non envoyée : " + (err.message || err), "err"); }
    var row = { kind: kind, title: title, description: desc, category: cat, price: price, city: city, details: d };
    if (url) row.image_url = url;
    var r;
    if (L) r = await c.from("listings").update(row).eq("id", L.id);
    else {
      row.service = s; row.provider_id = u.id; row.phone = (u.user_metadata || {}).phone || null;
      r = await c.from("listings").insert([row]);
    }
    if (btn) btn.disabled = false;
    if (r.error) {
      var m = r.error.message || "";
      if (/duplicate|unique|listings_one/i.test(m)) return tip("Vous avez déjà une annonce dans cette catégorie : modifiez-la.", "err");
      if (/column|service|details/i.test(m)) return tip("La base doit être mise à jour (SQL v6). " + m, "err");
      return tip(m, "err");
    }
    tip(L ? "Annonce modifiée !" : "Annonce publiée !", "ok");
    if (!L) { setTimeout(function () { location.reload(); }, 700); return; }
    setTimeout(function () { location.reload(); }, 600);
  }

  /* ---------- Événements Publier ---------- */
  document.addEventListener("click", function (e) {
    var ed = e.target.closest("[data-act=edit]");
    if (ed && G() && G().user) {            // modifier une annonce : formulaire dédié
      var L = G().listings.filter(function (x) { return String(x.id) === ed.getAttribute("data-id"); })[0];
      if (L) {
        e.preventDefault(); e.stopPropagation();
        S = { cat: L.service || "other", edit: L, rows: ((L.details && L.details.items) || []).map(function (x) { return { n: x.n, f: x.f, p: x.p }; }), keep: true };
        if (!S.rows.length) S.rows = [{ n: "", f: "", p: "" }];
        $("nav button[data-view=publish]").click();
        return;
      }
    }
    var b = e.target.closest("#v6-pub [data-v6]"); if (!b) return;
    var a = b.getAttribute("data-v6");
    if (a === "pick") {
      var id = b.getAttribute("data-id"), L2 = id ? G().listings.filter(function (x) { return String(x.id) === id; })[0] : null;
      S.cat = b.getAttribute("data-s"); S.edit = L2 || null;
      S.rows = L2 && L2.details && L2.details.items ? L2.details.items.map(function (x) { return { n: x.n, f: x.f, p: x.p }; }) : [{ n: "", f: "", p: "" }];
      renderPub();
    } else if (a === "back") { S = { cat: null, edit: null, rows: [], keep: false }; renderPub(); }
    else if (a === "addrow") { S.rows.push({ n: "", f: "", p: "" }); renderPub(); }
    else if (a === "rm") { S.rows.splice(Number(b.getAttribute("data-i")), 1); if (!S.rows.length) S.rows.push({ n: "", f: "", p: "" }); renderPub(); }
    else if (a === "apply") {
      var row = b.closest("[data-i]"), i = Number(row.getAttribute("data-i"));
      S.rows[i].p = Number(b.getAttribute("data-v"));
      if (!S.rows[i].f) S.rows[i].f = b.getAttribute("data-f");
      renderPub();
    } else if (a === "save") save();
  }, true);
  document.addEventListener("input", function (e) {
    var el = e.target, row = el.closest && el.closest("#v6-rows [data-i]"); if (!row) return;
    var i = Number(row.getAttribute("data-i")), f = el.getAttribute("data-f"); if (!f || !S.rows[i]) return;
    S.rows[i][f] = el.value; hintRow(row);
  });
  document.addEventListener("click", function (e) {
    var nb = e.target.closest("nav button[data-view=publish]"); if (!nb) return;
    setTimeout(function () { if (!S.keep) S = { cat: null, edit: null, rows: [], keep: false }; S.keep = false; renderPub(); }, 0);
  });

  /* ---------- Cartes : détails, prix facultatif, avatars ---------- */
  function tag(t) { return "<span class='tag'>" + esc(t) + "</span>"; }
  function detailHTML(L) {
    var d = L.details || {}, s = L.service, h = "";
    if (s && SV[s]) h += tag(SV[s][0] + " " + SV[s][1]);
    if (s === "technician") { if (d.years) h += tag(d.years + " an(s) d'expérience"); if (d.avail) h += tag(d.avail); if (d.zones) h += tag("📍 " + d.zones); }
    if (s === "supplier" && d.delivery) h += tag("🚚 Livraison : " + d.delivery);
    if (s === "rental" && d.operator) h += tag(d.operator);
    if (s === "request" && d.target && SV[d.target]) h += tag("Recherche : " + SV[d.target][1]);
    if (d.items && d.items.length) {
      h += "<div style='margin-top:8px;font-size:13px'>" + d.items.slice(0, 8).map(function (i) {
        return "<div style='display:flex;justify-content:space-between;gap:8px;border-top:1px dashed #e5e7eb;padding:4px 0'><span>" + esc(i.n) +
          (i.f ? " <span class='m'>· " + esc(i.f) + "</span>" : "") + "</span><b style='white-space:nowrap'>" + (i.p > 0 ? money(i.p) : "Sur demande") + "</b></div>";
      }).join("") + (d.items.length > 8 ? "<div class='m'>+ " + (d.items.length - 8) + " autre(s)…</div>" : "") + "</div>";
    }
    return h;
  }
  function enhance() {
    var g = G(); if (!g) return;
    $$(".ad").forEach(function (c) {
      var b = c.querySelector("[data-act=fav],[data-act=edit]"); if (!b) return;
      var id = b.getAttribute("data-id"); if (c.getAttribute("data-v6l") === id) return;
      c.setAttribute("data-v6l", id);
      var L = g.listings.filter(function (x) { return String(x.id) === id; })[0]; if (!L) return;
      var p = c.querySelector(".p");
      if (p) {
        if (L.price == null || L.price === "") p.textContent = L.kind === "request" ? "Budget non précisé" : "Prix sur demande";
        else if (L.service === "supplier" || L.service === "rental") p.textContent = "À partir de " + money(L.price);
      }
      var html = detailHTML(L), anchor = c.querySelector(".chat-btn,.wa,.acts");
      if (html && anchor) anchor.insertAdjacentHTML("beforebegin", "<div>" + html + "</div>");
    });
    $$(".av").forEach(function (a) {
      var id = null;
      if (a.closest("#sub-profile")) id = g.user && g.user.id;
      else if (a.closest("#profile-box")) {
        var h3 = $("#profile-box h3"), nm = h3 && h3.textContent.trim();
        Object.keys(g.profiles).forEach(function (k) { if (g.profiles[k].full_name === nm) id = k; });
      }
      else { var pb = a.closest(".ad") && a.closest(".ad").querySelector("[data-act=prof],[data-fc=prof]"); id = pb && pb.getAttribute("data-id"); }
      var p = id && g.profiles[id];
      if (p && p.avatar_url) AV[id] = p.avatar_url;
      var u = id && AV[id];
      if (u && a.getAttribute("data-v6") !== u) {
        a.setAttribute("data-v6", u); a.style.backgroundImage = "url('" + u.replace(/'/g, "%27") + "')"; a.textContent = "";
      }
    });
  }

  /* ---------- Filtre par service ---------- */
  function chips() {
    var seg = $("#seg"); if (!seg || $("#v6-svcseg")) return;
    var d = document.createElement("div"); d.className = "seg"; d.id = "v6-svcseg"; d.style.flexWrap = "wrap";
    d.innerHTML = "<button type='button' data-sv='' class='active'>Tous services</button>" +
      ["technician", "supplier", "rental", "other"].map(function (k) { return "<button type='button' data-sv='" + k + "'>" + SV[k][0] + " " + SV[k][1].split(" / ")[0] + "</button>"; }).join("");
    seg.insertAdjacentElement("afterend", d);
    d.addEventListener("click", function (e) {
      var b = e.target.closest("button[data-sv]"); if (!b) return;
      window.BTP_SVCF = b.getAttribute("data-sv");
      $$("#v6-svcseg button").forEach(function (x) { x.classList.toggle("active", x === b); });
      svcFilter();
    });
  }

  function svcFilter() {
    var f = window.BTP_SVCF || "", g = G(); if (!g) return;
    $$("#listings .ad").forEach(function (c) {
      var b = c.querySelector("[data-act=fav],[data-act=edit]"), L = b && g.listings.filter(function (x) { return String(x.id) === b.getAttribute("data-id"); })[0];
      c.style.display = (!f || (L && L.service === f)) ? "" : "none";
    });
  }

  /* ---------- Photo de profil ---------- */
  function avatarBox() {
    var g = G(), host = $("#sub-profile"); if (!g || !g.user || !host || $("#v6-av")) return;
    host.insertAdjacentHTML("afterbegin", "<div id='v6-av' class='prow' style='margin-bottom:14px'><div class='av' style='width:72px;height:72px;font-size:30px'>" +
      esc(((g.profiles[g.user.id] || {}).full_name || "?").charAt(0).toUpperCase()) + "</div><div><b>Photo de profil</b><br>" +
      "<label class='btn gray sm' style='margin-top:6px;cursor:pointer'>📷 Choisir une photo<input id='v6-avf' type='file' accept='image/*' style='display:none'></label></div></div>");
  }
  document.addEventListener("change", async function (e) {
    if (e.target.id !== "v6-avf") return;
    var f = e.target.files[0], g = G(); if (!f || !g || !g.user) return;
    try {
      tip("Envoi de la photo…");
      var blob = await compress(f, 400, true), path = g.user.id + "/avatar-" + Date.now() + ".jpg", c = C();
      var up = await c.storage.from("avatars").upload(path, blob, { contentType: "image/jpeg" });
      if (up.error) throw up.error;
      var url = c.storage.from("avatars").getPublicUrl(path).data.publicUrl;
      var r = await c.from("profiles").update({ avatar_url: url }).eq("id", g.user.id);
      if (r.error) throw r.error;
      tip("Photo de profil enregistrée !", "ok"); setTimeout(function () { location.reload(); }, 700);
    } catch (err) { tip("Photo non enregistrée (SQL v6 exécuté ?) : " + (err.message || err), "err"); }
  });

  /* ---------- Admin : graphes et journal filtrable ---------- */
  function adminTabs() {
    var t = $("#adx-tabs"); if (!t || t.querySelector("[data-v6a=graph]")) return;
    t.insertAdjacentHTML("beforeend", "<button type='button' data-v6a='graph'>📈 Graphes</button><button type='button' data-v6a='log'>🔎 Journal+</button>");
  }
  function spark(a, col) {
    var m = Math.max.apply(null, a.concat(1)), bw = 300 / a.length;
    return "<svg viewBox='0 0 300 60' width='100%' height='60' preserveAspectRatio='none'>" + a.map(function (v, i) {
      var h = v / m * 56; return "<rect x='" + (i * bw + 0.5) + "' y='" + (60 - h) + "' width='" + (bw - 1) + "' height='" + h + "' fill='" + col + "' rx='1'/>";
    }).join("") + "</svg>";
  }
  function sum(a) { return (a || []).reduce(function (x, y) { return x + Number(y); }, 0); }
  function hbars(list) {
    var m = Math.max.apply(null, list.map(function (x) { return Number(x.v); }).concat(1));
    return list.map(function (x) {
      return "<div style='margin:6px 0;font-size:13px'><div style='display:flex;justify-content:space-between'><span>" + esc(x.k) + "</span><b>" + esc(x.v) + "</b></div>" +
        "<div style='background:#e5e7eb;border-radius:6px;height:8px'><div style='background:#d97706;border-radius:6px;height:8px;width:" + (Number(x.v) / m * 100) + "%'></div></div></div>";
    }).join("") || "<p class='empty'>Aucune donnée.</p>";
  }
  function obj2list(o) { return Object.keys(o || {}).map(function (k) { return { k: k, v: o[k] }; }); }
  function setActive(b) { $$("#adx-tabs button").forEach(function (x) { x.classList.toggle("active", x === b); }); }
  async function rpc(n, a) { var r = await C().rpc(n, a || {}); if (r.error) throw r.error; return r.data; }

  async function showGraphs() {
    var body = $("#adx-body"); body.innerHTML = "<p class='empty'>Chargement…</p>";
    var s = await rpc("dashboard_series", { p_days: 30 }), b = await rpc("dashboard_breakdown");
    var sc = function (t, a, c) { return "<div class='card'><b>" + t + "</b> <span class='chip'>" + sum(a) + " sur 30 j</span>" + spark(a || [], c) + "</div>"; };
    body.innerHTML = sc("📢 Annonces / jour", s.listings, "#d97706") + sc("👥 Nouveaux membres / jour", s.members, "#2563eb") +
      sc("★ Avis / jour", s.reviews, "#059669") + sc("🛡️ Actions admin / jour", s.actions, "#111827") +
      "<div class='card'><h3>Abonnements</h3><span class='chip'>✅ " + b.subs.active + " actifs</span><span class='chip'>⏳ " + b.subs.expiring + " expirent sous 7 j</span><span class='chip'>⛔ " + b.subs.expired + " expirés</span><span class='chip'>🚩 " + b.reports + " signalements</span></div>" +
      "<div class='card'><h3>Annonces par catégorie</h3>" + hbars(b.by_category) + "</div>" +
      "<div class='card'><h3>Annonces par ville</h3>" + hbars(b.by_city) + "</div>" +
      "<div class='card'><h3>Membres par type</h3>" + hbars(obj2list(b.by_type)) + "</div>" +
      "<div class='card'><h3>Répartition des notes</h3>" + hbars(obj2list(b.ratings)) + "</div>" +
      "<div class='card'><h3>🏆 Meilleurs professionnels</h3>" + (b.top_pros.length ? b.top_pros.map(function (p) { return "<div class='res' style='display:flex;justify-content:space-between;padding:6px 0'><span>" + esc(p.name) + "</span><b>★ " + p.avg + " (" + p.n + ")</b></div>"; }).join("") : "<p class='empty'>Aucun avis.</p>") + "</div>";
  }
  function logList(rows) {
    return rows.length ? rows.map(function (a) {
      var d = a.details && Object.keys(a.details).length ? JSON.stringify(a.details) : "";
      return "<div class='review'><b>" + esc(a.action) + "</b><div class='m'>" + new Date(a.at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) +
        (a.actor ? " · par " + esc(a.actor) : "") + (a.target ? " · cible : " + esc(a.target) : "") + "</div>" + (d ? "<div class='m'>" + esc(d.slice(0, 160)) + "</div>" : "") + "</div>";
    }).join("") : "<p class='empty'>Aucune entrée.</p>";
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-v6a]"); if (!b) return;
    var a = b.getAttribute("data-v6a"), body = $("#adx-body"), run = function (p) { p.catch(function (x) { tip(x.message || String(x), "err"); }); };
    if (a === "graph") { setActive(b); run(showGraphs()); }
    else if (a === "log") {
      setActive(b);
      body.innerHTML = "<div class='card'><h3>🔎 Journal filtrable</h3><select id='v6-lp'><option value=''>Toutes les actions</option><option value='admin.'>Administrateurs</option><option value='role.'>Rôles</option><option value='flag.'>Interrupteurs</option><option value='service.'>Activités</option><option value='account.'>Comptes</option><option value='subscription.'>Abonnements</option><option value='security.'>Sécurité</option></select>" +
        "<select id='v6-ld'><option value='7'>7 jours</option><option value='30' selected>30 jours</option><option value='90'>90 jours</option><option value='365'>1 an</option></select>" +
        "<button type='button' class='btn' data-v6a='logrun'>Filtrer</button><button type='button' class='btn gray' style='margin-top:8px' data-v6a='mine'>Mes propres actions</button></div><div id='v6-lr'></div>";
    } else if (a === "logrun") {
      run(rpc("audit_query", { p_limit: 150, p_prefix: val("v6-lp"), p_days: Number(val("v6-ld")) }).then(function (r) { $("#v6-lr").innerHTML = "<div class='card'>" + logList(r || []) + "</div>"; }));
    } else if (a === "mine") {
      run(rpc("audit_mine", { p_limit: 50 }).then(function (r) { $("#v6-lr").innerHTML = "<div class='card'><h3>Mes actions</h3>" + logList(r || []) + "</div>"; }));
    }
  });

  /* ---------- Démarrage ---------- */
  function tick() {
    try { if (!window.BTP) return; mountPub(); loadRef(); chips(); avatarBox(); enhance(); svcFilter(); adminTabs(); } catch (e) { console.warn("v6:", e); }
  }
  var raf = 0;
  new MutationObserver(function () { if (raf) return; raf = requestAnimationFrame(function () { raf = 0; tick(); }); })
    .observe(document.body, { childList: true, subtree: true });
  tick();
})();
