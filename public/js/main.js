/* =========================================================================
   Blue Jet Holidays — interaction layer

   No inline handlers anywhere: the CSP sets script-src-attr 'none', so every
   binding has to happen from a real script file like this one.
   ========================================================================= */

(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* =======================================================================
     Destination stage
     Only the clip on screen ever holds a src. The other five stay empty
     until someone asks for them, so first load pulls one video, not six.
     ======================================================================= */

  (function () {
    var media = Array.prototype.slice.call(document.querySelectorAll(".stage__media"));
    var tabs = Array.prototype.slice.call(document.querySelectorAll(".dest-tab"));
    var caption = document.getElementById("nowShowing");
    if (!media.length || !tabs.length) return;

    var current = null;

    function clipFor(key) {
      for (var i = 0; i < media.length; i++) {
        if (media[i].dataset.dest === key) return media[i];
      }
      return null;
    }

    function play(clip) {
      if (reduceMotion) return; // the poster frame is the whole experience here

      var attempt = clip.play();
      if (!attempt || typeof attempt.catch !== "function") return;

      attempt.catch(function () {
        // preload="none" means the element usually has no data at all on the
        // first play() after src is assigned, and that rejection is not an
        // autoplay block. Wait for the first frame and try once more.
        clip.addEventListener("canplay", function once() {
          clip.removeEventListener("canplay", once);
          var retry = clip.play();
          // A second failure is a genuine refusal - data saver, battery saver,
          // iOS low power mode. The poster stays up, which is a fine outcome.
          if (retry && typeof retry.catch === "function") retry.catch(function () {});
        });
      });
    }

    function show(key) {
      if (key === current) return;
      var next = clipFor(key);
      if (!next) return;

      if (!next.dataset.loaded) {
        next.src = next.dataset.src;
        next.dataset.loaded = "1";
      }

      media.forEach(function (clip) {
        var active = clip === next;
        clip.classList.toggle("is-active", active);
        if (active) play(clip);
        else clip.pause();
      });

      tabs.forEach(function (tab) {
        var active = tab.dataset.dest === key;
        tab.setAttribute("aria-selected", active ? "true" : "false");
        tab.tabIndex = active ? 0 : -1;
        if (active && caption) caption.textContent = tab.dataset.caption;
      });

      current = key;
    }

    tabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        show(tab.dataset.dest);
      });
    });

    // Roving focus, so the tablist works from the keyboard.
    var tablist = document.querySelector(".dest-tabs");
    if (tablist) {
      tablist.addEventListener("keydown", function (e) {
        var step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
        if (!step) return;
        e.preventDefault();
        var i = tabs.indexOf(document.activeElement);
        var next = tabs[(i + step + tabs.length) % tabs.length];
        next.focus();
        show(next.dataset.dest);
      });
    }

    // A backgrounded tab should not keep decoding video.
    document.addEventListener("visibilitychange", function () {
      var clip = clipFor(current);
      if (!clip) return;
      if (document.hidden) clip.pause();
      else play(clip);
    });

    show(tabs[0].dataset.dest);
  })();

  /* =======================================================================
     Header
     ======================================================================= */

  (function () {
    var header = document.querySelector(".site-header");
    if (!header) return;
    var stuck = false;

    function sync() {
      var next = window.scrollY > 40;
      if (next !== stuck) {
        stuck = next;
        header.classList.toggle("is-stuck", stuck);
      }
    }

    window.addEventListener("scroll", sync, { passive: true });
    sync();
  })();

  /* =======================================================================
     Scroll choreography
     One rise-and-fade, staggered within each group. Nothing bounces, nothing
     loops. If GSAP fails to arrive, .reveal never gets its hidden state and
     the page simply renders — the content is never dependent on the CDN.
     ======================================================================= */

  (function () {
    var targets = Array.prototype.slice.call(document.querySelectorAll(".reveal"));
    if (!targets.length) return;
    if (reduceMotion || !window.gsap || !window.ScrollTrigger) return;

    document.documentElement.classList.add("js-on");
    gsap.registerPlugin(ScrollTrigger);

    ScrollTrigger.batch(targets, {
      start: "top 88%",
      once: true,
      onEnter: function (batch) {
        gsap.to(batch, {
          opacity: 1,
          y: 0,
          duration: 0.75,
          ease: "power2.out",
          stagger: 0.08,
          overwrite: true
        });
      }
    });
  })();

  /* =======================================================================
     FAQ — one answer open at a time
     Done here rather than with the name="" attribute on <details>, which
     older Safari and Firefox builds still ignore.
     ======================================================================= */

  (function () {
    var items = Array.prototype.slice.call(document.querySelectorAll(".faq__item"));
    items.forEach(function (item) {
      item.addEventListener("toggle", function () {
        if (!item.open) return;
        items.forEach(function (other) {
          if (other !== item) other.open = false;
        });
      });
    });
  })();

  /* =======================================================================
     Destination detail modal
     Content is cloned out of the card's hidden .dest-detail block, so the
     must-visit copy stays in the HTML where crawlers can reach it.
     ======================================================================= */

  var destModal = (function () {
    var dlg = document.getElementById("destModal");
    if (!dlg) return { open: function () {} };

    var titleEl = document.getElementById("dmodalTitle");
    var whereEl = document.getElementById("dmodalWhere");
    var bodyEl = document.getElementById("dmodalBody");
    var ctaEl = document.getElementById("dmodalCta");

    var current = null;
    var opener = null;

    function open(btn) {
      var card = btn.closest(".dest-card");
      var source = document.getElementById("detail-" + btn.dataset.destSlug);
      if (!card || !source) return;

      current = btn.dataset.destName;
      opener = btn;

      var heading = card.querySelector("h3");
      var where = card.querySelector(".dest-card__where");
      titleEl.textContent = heading ? heading.textContent : current;
      whereEl.textContent = where ? where.textContent : "";
      ctaEl.textContent = "Request a quote for " + titleEl.textContent;

      // childNodes is live: appending each node to the modal removes it from
      // the clone mid-iteration and silently skips every other element.
      // Draining firstChild into a fragment avoids that entirely.
      var clone = source.cloneNode(true);
      var frag = document.createDocumentFragment();
      while (clone.firstChild) frag.appendChild(clone.firstChild);
      bodyEl.replaceChildren(frag);
      bodyEl.scrollTop = 0;

      dlg.showModal();
    }

    function close() {
      dlg.close();
    }

    dlg.addEventListener("click", function (e) {
      // showModal() makes the backdrop part of the dialog's own box, so a
      // click landing outside the inner card means the backdrop was hit.
      if (e.target.closest("[data-dmodal-close]")) return close();
      if (!e.target.closest(".dmodal__inner")) close();
    });

    // Return focus to the card that opened it, per the dialog pattern.
    dlg.addEventListener("close", function () {
      if (opener) opener.focus({ preventScroll: true });
      opener = null;
    });

    ctaEl.addEventListener("click", function () {
      var place = current;
      close();
      enquiry({
        destination: place,
        notes: "Interested in a " + place + " holiday. Please send a quotation."
      });
    });

    return { open: open };
  })();

  /* =======================================================================
     Routes into the enquiry form
     ======================================================================= */

  var enquiry = (function () {
    var section = document.getElementById("enquiry");
    var dest = document.getElementById("custDest");
    var notes = document.getElementById("custNotes");
    var month = document.getElementById("custMonth");
    var pax = document.getElementById("custPax");
    var name = document.getElementById("custName");

    function setDest(value) {
      if (!dest || !value) return;
      for (var i = 0; i < dest.options.length; i++) {
        if (dest.options[i].value === value) {
          dest.selectedIndex = i;
          return;
        }
      }
    }

    return function prefill(opts) {
      opts = opts || {};
      setDest(opts.destination);
      if (opts.notes && notes) notes.value = opts.notes;
      if (opts.month && month) month.value = opts.month;
      if (opts.pax && pax) pax.value = opts.pax;

      if (section) {
        section.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
      }
      // Land the caret in the first empty field rather than making them hunt.
      if (name && !name.value) {
        window.setTimeout(function () { name.focus({ preventScroll: true }); }, reduceMotion ? 0 : 700);
      }
    };
  })();

  var paxFromLabel = {
    "2 Adults (Couple)": 2,
    "4 Adults (Group Offer)": 4,
    "Family (2A + 2C)": 4,
    "Corporate MICE (10+)": 10
  };

  var routes = {
    // Hero dock: carry across whatever they already told us.
    enquiry: function () {
      var dockDest = document.getElementById("dockDest");
      var dockMonth = document.getElementById("dockMonth");
      var dockPax = document.getElementById("dockPax");
      var dockCity = document.getElementById("dockCity");

      enquiry({
        destination: dockDest ? dockDest.value : null,
        month: dockMonth ? dockMonth.value : null,
        pax: dockPax ? paxFromLabel[dockPax.value] || 2 : null,
        notes: dockCity && dockCity.value ? "Flying from " + dockCity.value + "." : ""
      });
    },

    // Destination cards open the detail view rather than jumping straight
    // to the form; the modal's own button carries them on to the enquiry.
    detail: function (el) {
      destModal.open(el);
    },

    enquire: function (el) {
      var place = el.dataset.destName;
      enquiry({
        destination: place,
        notes: "Interested in a " + place + " holiday. Please send a quotation."
      });
    },

    passdesk: function () {
      enquiry({
        destination: "Passport Assistance",
        notes: "Passport assistance required. Please advise on documents and the appointment process."
      });
    }
  };

  document.querySelectorAll("[data-act]").forEach(function (el) {
    var run = routes[el.dataset.act];
    if (!run) return;
    el.addEventListener("click", function () { run(el); });
  });

  /* =======================================================================
     Lead capture

     The enquiry goes to the server first so it survives even when the
     visitor never completes the WhatsApp handoff. The handoff links are
     rendered for them to click rather than opened for them — a window.open
     fired after an await is blocked as a popup, and auto-launching a message
     the moment a form submits is hostile besides.
     ======================================================================= */

  (function () {
    var form = document.getElementById("leadForm");
    if (!form) return;

    var status = document.getElementById("formStatus");
    var handoff = document.getElementById("formHandoff");
    var submit = form.querySelector('button[type="submit"]');
    var honeypot = document.getElementById("company");
    var loadedAt = Date.now();

    var WHATSAPP = "917620880088";
    var INBOX = "bluejetholidaypune@gmail.com";

    function setStatus(tone, message) {
      status.dataset.tone = tone;
      status.textContent = message;
    }

    function value(id) {
      var el = document.getElementById(id);
      return el ? el.value.trim() : "";
    }

    function summarise(lead) {
      return (
        "New enquiry - Blue Jet Holidays\n" +
        "Name: " + lead.name + "\n" +
        "Phone: " + lead.phone + "\n" +
        "Email: " + lead.email + "\n" +
        "Destination: " + lead.destination + "\n" +
        "Travel month: " + lead.month + "\n" +
        "Travellers: " + lead.pax + "\n" +
        "Notes: " + (lead.notes || "-")
      );
    }

    function showHandoff(body, lead) {
      handoff.querySelector("[data-handoff='whatsapp']").href =
        "https://wa.me/" + WHATSAPP + "?text=" + encodeURIComponent(body);
      handoff.querySelector("[data-handoff='email']").href =
        "mailto:" + INBOX +
        "?subject=" + encodeURIComponent("Tour enquiry: " + lead.destination + " - " + lead.name) +
        "&body=" + encodeURIComponent(body);
      handoff.hidden = false;
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();

      // Two cheap bot filters before anything reaches the network. A filled
      // honeypot, or a submit inside three seconds, is not a human visitor.
      // Both fail silently so a scraper learns nothing from the response.
      if (honeypot && honeypot.value) return;
      if (Date.now() - loadedAt < 3000) return;

      if (!form.checkValidity()) {
        setStatus("error", "Please fill in your name, phone number and email.");
        form.reportValidity();
        return;
      }

      var lead = {
        name: value("custName"),
        email: value("custEmail"),
        // express-validator's isMobilePhone rejects spacing, so send it bare.
        phone: value("custPhone").replace(/[\s()-]/g, ""),
        destination: value("custDest"),
        month: value("custMonth"),
        pax: parseInt(value("custPax"), 10) || 1,
        notes: value("custNotes")
      };

      var body = summarise(lead);
      handoff.hidden = true;
      submit.disabled = true;
      setStatus("working", "Sending your enquiry…");

      fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(lead)
      })
        .then(function (res) {
          return res.json().catch(function () { return {}; }).then(function (data) {
            return { ok: res.ok, status: res.status, data: data };
          });
        })
        .then(function (result) {
          if (result.ok) {
            setStatus("ok", "Got it. A planner will come back to you with a quotation, usually the same working day.");
            form.reset();
          } else if (result.status === 429) {
            setStatus("error", "That is a lot of enquiries from one connection. Please call us instead.");
          } else {
            var first = result.data && result.data.errors && result.data.errors[0];
            setStatus(
              "error",
              first
                ? "Please check the " + (first.path || first.param || "highlighted") + " field and send again."
                : "We could not record that automatically. Please use one of the direct options below."
            );
          }
        })
        .catch(function () {
          setStatus("error", "No connection to our desk right now. Please use one of the direct options below.");
        })
        .then(function () {
          submit.disabled = false;
          showHandoff(body, lead);
        });
    });
  })();

  /* =======================================================================
     Footer year
     ======================================================================= */

  var year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());
})();
