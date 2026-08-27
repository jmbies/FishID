// theme.js — appearance + difficulty settings for Field Marks.
// Loaded in <head> before render so stored settings apply with no flash.
// Independent of game.js: it only sets attributes on <html>. style.css reads
// them for looks, game.js reads data-answers to decide what counts as a guess.

(function () {
  "use strict";

  var THEME_KEY = "fieldmarks-theme";         // "system" | "light" | "dark"
  var SUGGEST_KEY = "fieldmarks-suggestions"; // "on" | "off"
  var ANSWERS_KEY = "fieldmarks-answers";     // "common" | "sci"
  var root = document.documentElement;

  function read(key, allowed, fallback) {
    try {
      var v = localStorage.getItem(key);
      return allowed.indexOf(v) >= 0 ? v : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function store(key, value) {
    try { localStorage.setItem(key, value); } catch (e) {}
  }

  function readTheme() { return read(THEME_KEY, ["light", "dark"], "system"); }
  function readSuggestions() { return read(SUGGEST_KEY, ["off"], "on"); }
  function readAnswers() { return read(ANSWERS_KEY, ["sci"], "common"); }

  function applyTheme(choice) {
    // "system" removes the attribute so the media query decides.
    if (choice === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", choice);
  }

  function applySuggestions(value) {
    if (value === "off") root.setAttribute("data-suggestions", "off");
    else root.removeAttribute("data-suggestions");
  }

  function applyAnswers(value) {
    if (value === "sci") root.setAttribute("data-answers", "sci");
    else root.removeAttribute("data-answers");
    // game.js listens so the open dropdown and placeholder follow immediately.
    document.dispatchEvent(
      new CustomEvent("fieldmarks:answermode", { detail: { mode: value } })
    );
  }

  // Run immediately, before first paint.
  applyTheme(readTheme());
  applySuggestions(readSuggestions());
  applyAnswers(readAnswers());

  document.addEventListener("DOMContentLoaded", function () {
    var openers = [
      document.getElementById("settings-btn"),
      document.getElementById("intro-settings-btn"),
    ].filter(Boolean);
    var sheet = document.getElementById("settings-sheet");
    var closeBtn = document.getElementById("settings-close");
    var themeSwitch = document.getElementById("theme-switch");
    var suggestToggle = document.getElementById("suggestions-toggle");
    var sciToggle = document.getElementById("scinames-toggle");
    if (!openers.length || !sheet) return;

    var lastOpener = openers[0];

    function markTheme(choice) {
      themeSwitch.querySelectorAll("button").forEach(function (b) {
        b.setAttribute(
          "aria-pressed",
          b.dataset.themeChoice === choice ? "true" : "false"
        );
      });
    }

    function setChecked(el, on) {
      el.setAttribute("aria-checked", on ? "true" : "false");
    }

    function open(opener) {
      lastOpener = opener;
      sheet.classList.remove("hidden");
      openers.forEach(function (b) { b.setAttribute("aria-expanded", "false"); });
      opener.setAttribute("aria-expanded", "true");
      closeBtn.focus();
    }

    function close() {
      sheet.classList.add("hidden");
      openers.forEach(function (b) { b.setAttribute("aria-expanded", "false"); });
      if (lastOpener && lastOpener.offsetParent !== null) lastOpener.focus();
    }

    markTheme(readTheme());
    setChecked(suggestToggle, readSuggestions() !== "off");
    setChecked(sciToggle, readAnswers() === "sci");

    openers.forEach(function (b) {
      b.addEventListener("click", function () { open(b); });
    });
    closeBtn.addEventListener("click", close);
    // Backdrop only — clicks inside the panel shouldn't dismiss.
    sheet.addEventListener("click", function (e) {
      if (e.target === sheet) close();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !sheet.classList.contains("hidden")) {
        e.stopPropagation();
        close();
      }
    }, true);
    // The sheet sits over the game; its keys are its own.
    sheet.addEventListener("keydown", function (e) { e.stopPropagation(); });

    themeSwitch.addEventListener("click", function (e) {
      var target = e.target.closest("button[data-theme-choice]");
      if (!target) return;
      var choice = target.dataset.themeChoice;
      applyTheme(choice);
      markTheme(choice);
      store(THEME_KEY, choice);
    });

    suggestToggle.addEventListener("click", function () {
      var next = suggestToggle.getAttribute("aria-checked") === "true" ? "off" : "on";
      applySuggestions(next);
      setChecked(suggestToggle, next === "on");
      store(SUGGEST_KEY, next);
    });

    sciToggle.addEventListener("click", function () {
      var next = sciToggle.getAttribute("aria-checked") === "true" ? "common" : "sci";
      applyAnswers(next);
      setChecked(sciToggle, next === "sci");
      store(ANSWERS_KEY, next);
    });

    // game.js closes the sheet after a session action (retry / reset).
    document.addEventListener("fieldmarks:closesettings", close);
  });
})();
