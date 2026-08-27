// theme.js — appearance + difficulty settings for Field Marks.
// Loaded in <head> before render so the stored theme applies with no flash.
// Independent of game.js: it only sets attributes that style.css reads.

(function () {
  "use strict";

  var THEME_KEY = "fieldmarks-theme";        // "system" | "light" | "dark"
  var SUGGEST_KEY = "fieldmarks-suggestions"; // "on" | "off"
  var root = document.documentElement;

  function readTheme() {
    try {
      var v = localStorage.getItem(THEME_KEY);
      return v === "light" || v === "dark" ? v : "system";
    } catch (e) {
      return "system";
    }
  }

  function readSuggestions() {
    try {
      return localStorage.getItem(SUGGEST_KEY) === "off" ? "off" : "on";
    } catch (e) {
      return "on";
    }
  }

  function applyTheme(choice) {
    // "system" removes the attribute so the media query decides.
    if (choice === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", choice);
  }

  function applySuggestions(value) {
    if (value === "off") root.setAttribute("data-suggestions", "off");
    else root.removeAttribute("data-suggestions");
  }

  // Run immediately, before first paint.
  applyTheme(readTheme());
  applySuggestions(readSuggestions());

  document.addEventListener("DOMContentLoaded", function () {
    var btn = document.getElementById("settings-btn");
    var sheet = document.getElementById("settings-sheet");
    var closeBtn = document.getElementById("settings-close");
    var themeSwitch = document.getElementById("theme-switch");
    var suggestToggle = document.getElementById("suggestions-toggle");
    if (!btn || !sheet) return;

    function markTheme(choice) {
      themeSwitch.querySelectorAll("button").forEach(function (b) {
        b.setAttribute(
          "aria-pressed",
          b.dataset.themeChoice === choice ? "true" : "false"
        );
      });
    }

    function markSuggestions(value) {
      suggestToggle.setAttribute("aria-checked", value === "off" ? "false" : "true");
    }

    function open() {
      sheet.classList.remove("hidden");
      btn.setAttribute("aria-expanded", "true");
      closeBtn.focus();
    }

    function close() {
      sheet.classList.add("hidden");
      btn.setAttribute("aria-expanded", "false");
    }

    markTheme(readTheme());
    markSuggestions(readSuggestions());

    btn.addEventListener("click", open);
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

    themeSwitch.addEventListener("click", function (e) {
      var target = e.target.closest("button[data-theme-choice]");
      if (!target) return;
      var choice = target.dataset.themeChoice;
      applyTheme(choice);
      markTheme(choice);
      try { localStorage.setItem(THEME_KEY, choice); } catch (err) {}
    });

    suggestToggle.addEventListener("click", function () {
      var next = suggestToggle.getAttribute("aria-checked") === "true" ? "off" : "on";
      applySuggestions(next);
      markSuggestions(next);
      try { localStorage.setItem(SUGGEST_KEY, next); } catch (err) {}
    });
  });
})();
