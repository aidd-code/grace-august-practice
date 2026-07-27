(function () {
  const password = "626306";
  const storageKey = "grace-local-password";

  function isLoggedIn() {
    return localStorage.getItem(storageKey) === password;
  }

  function applyState() {
    const loggedIn = isLoggedIn();
    document.body.classList.toggle("read-only", !loggedIn);
    document.querySelectorAll("textarea").forEach(field => {
      field.readOnly = !loggedIn;
    });

    const button = document.getElementById("authBtn");
    if (button) {
      button.textContent = loggedIn ? "已登录 · 退出" : "密码登录";
      button.classList.toggle("logged-in", loggedIn);
    }

    const saveButton = document.getElementById("cloudSaveRetry");
    if (saveButton) saveButton.disabled = !loggedIn;

    window.dispatchEvent(new CustomEvent("grace:auth-changed", {
      detail: {loggedIn}
    }));
  }

  function openLogin() {
    const modal = document.getElementById("loginModal");
    const input = document.getElementById("localPassword");
    input.value = "";
    document.getElementById("localLoginStatus").textContent = "";
    modal.classList.add("show");
    setTimeout(() => input.focus(), 0);
  }

  function closeLogin() {
    document.getElementById("loginModal").classList.remove("show");
  }

  window.graceIsLoggedIn = isLoggedIn;
  window.graceRequireLogin = () => {
    if (isLoggedIn()) return true;
    openLogin();
    return false;
  };

  window.addEventListener("DOMContentLoaded", () => {
    document.getElementById("authBtn").addEventListener("click", () => {
      if (isLoggedIn()) {
        localStorage.removeItem(storageKey);
        applyState();
      } else {
        openLogin();
      }
    });

    document.getElementById("cancelLogin").addEventListener("click", closeLogin);
    document.getElementById("loginModal").addEventListener("click", event => {
      if (event.target.id === "loginModal") closeLogin();
    });

    document.getElementById("localLoginForm").addEventListener("submit", event => {
      event.preventDefault();
      const input = document.getElementById("localPassword");
      if (input.value !== password) {
        document.getElementById("localLoginStatus").textContent = "密码不正确，请重新输入";
        input.select();
        return;
      }

      localStorage.setItem(storageKey, password);
      closeLogin();
      applyState();
    });

    applyState();
  });
})();
