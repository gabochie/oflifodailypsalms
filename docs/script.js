document.getElementById("year").textContent = new Date().getFullYear();

// Track page visit (fire-and-forget)
fetch(CONFIG.API_URL + "/api/pageview", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ path: window.location.pathname }),
}).catch(function () {});

// --- Daily Psalm Logic ---
function getTodaysPsalmNumber() {
  var start = new Date("2024-01-01");
  var now = new Date();
  var diff = Math.floor((now - start) / (1000 * 60 * 60 * 24));
  return (diff % 150) + 1;
}

function fetchTodaysVerse() {
  var psalmNum = getTodaysPsalmNumber();
  var url = CONFIG.BIBLE_API_BASE + "/psalms+" + psalmNum + ":1?translation=" + CONFIG.BIBLE_TRANSLATION;

  fetch(url)
    .then(function (r) {
      if (!r.ok) throw new Error("Failed to fetch verse");
      return r.json();
    })
    .then(function (data) {
      document.getElementById("verse-text").textContent = "\u201c" + data.text.trim() + "\u201d";
      document.getElementById("verse-ref").textContent = data.reference;
    })
    .catch(function () {
      document.getElementById("verse-text").textContent =
        "Blessed is the man that walketh not in the counsel of the ungodly...";
      document.getElementById("verse-ref").textContent = "Psalm 1:1 (KJV)";
    });
}
fetchTodaysVerse();

// --- Signup Form ---
function postToBackend(url, data) {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

function showFeedback(msg, type) {
  var el = document.getElementById("form-feedback");
  el.textContent = msg;
  el.className = "feedback " + type;
  el.style.display = "block";
}

document.getElementById("signup-form").addEventListener("submit", function (e) {
  e.preventDefault();
  var btn = document.getElementById("submit-btn");
  btn.disabled = true;
  btn.textContent = "Submitting...";

  var data = {
    name: document.getElementById("name").value.trim(),
    phone: document.getElementById("phone").value.trim(),
  };

  if (!/^\+?\d{7,15}$/.test(data.phone)) {
    showFeedback("Please enter a valid phone number with country code (e.g. +233501234567).", "error");
    btn.disabled = false;
    btn.textContent = "Sign Up";
    return;
  }

  postToBackend(CONFIG.API_URL + "/api/signup", data)
    .then(function (r) {
      btn.disabled = false;
      btn.textContent = "Sign Up";
      if (r.ok) {
        showFeedback("Thanks, " + data.name + "! You've been signed up. Welcome! \uD83D\uDC4F", "success");
        document.getElementById("signup-form").reset();
      } else {
        return r.json().then(function (d) {
          showFeedback(d.error || "Something went wrong. Please try again.", "error");
        });
      }
    })
    .catch(function () {
      showFeedback(
        "Could not reach the server. The admin may be offline. Your info will not be saved right now.",
        "error"
      );
      btn.disabled = false;
      btn.textContent = "Sign Up";
    });
});
