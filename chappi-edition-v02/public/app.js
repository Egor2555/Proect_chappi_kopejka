const state = {
  token: localStorage.getItem("chappi_token") || "",
  user: null,
  page: "dashboard",
  dashboard: null,
  sizes: [],
  employees: [],
  report: null,
  chappi: null
};

const app = document.getElementById("app");

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function roleName(role) {
  if (role === "admin") return "Администратор";
  if (role === "brigadier") return "Бригадир";
  if (role === "worker") return "Работник";
  return role || "";
}

async function api(url, options = {}) {
  const headers = {
    ...(options.headers || {})
  };

  if (options.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  if (state.token) {
    headers["Authorization"] = state.token;
  }

  const response = await fetch(url, {
    ...options,
    headers
  });

  let data = null;

  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {
    throw new Error(data.error || `Ошибка ${response.status}`);
  }

  return data;
}

function setSession(data) {
  state.token = data.token || "";
  state.user = {
    role: data.role,
    name: data.name
  };

  if (state.token) {
    localStorage.setItem("chappi_token", state.token);
  }
}

function clearSession() {
  state.token = "";
  state.user = null;
  localStorage.removeItem("chappi_token");
}

function isLoggedIn() {
  return !!state.token && !!state.user;
}

async function login(role) {
  try {
    let result;

    if (role === "worker") {
      result = await api("/api/login", {
        method: "POST",
        body: JSON.stringify({
          role: "worker"
        })
      });
    } else {
      const loginValue = document.getElementById("login")?.value.trim();
      const pin = document.getElementById("pin")?.value.trim();

      if (!loginValue || !pin) {
        alert("Введите логин и PIN.");
        return;
      }

      result = await api("/api/login", {
        method: "POST",
        body: JSON.stringify({
          role,
          login: loginValue,
          pin
        })
      });
    }

    setSession(result);
    await openApp();

  } catch (error) {
    alert(error.message);
  }
}

async function logout() {
  try {
    await api("/api/logout", {
      method: "POST"
    });
  } catch {
    // Даже если сервер недоступен, локальную сессию всё равно очищаем.
  }

  clearSession();
  state.page = "dashboard";
  renderLogin();
}

async function init() {
  if (!state.token) {
    renderLogin();
    return;
  }

  try {
    const me = await api("/api/me");

    state.user = {
      role: me.role,
      name: roleName(me.role)
    };

    await openApp();
  } catch {
    clearSession();
    renderLogin();
  }
}

function renderLogin() {
  app.innerHTML = `
    <div class="login-screen">
      <div class="login-card">
        <h1>CHAPPI EDITION</h1>
        <p class="subtitle">Учёт столбов</p>

        <div class="login-buttons">
          <button class="primary" onclick="showAdminLogin()">
            Администратор
          </button>

          <button onclick="showBrigadierLogin()">
            Бригадир
          </button>

          <button onclick="login('worker')">
            Работник
          </button>
        </div>

        <div id="login-form"></div>
      </div>
    </div>
  `;
}

function showAdminLogin() {
  showProtectedLogin("admin", "Вход администратора");
}

function showBrigadierLogin() {
  showProtectedLogin("brigadier", "Вход бригадира");
}

function showProtectedLogin(role, title) {
  const form = document.getElementById("login-form");

  form.innerHTML = `
    <div class="login-form">
      <h2>${title}</h2>

      <input
        id="login"
        type="text"
        placeholder="Логин"
        autocomplete="username"
      >

      <input
        id="pin"
        type="password"
        placeholder="PIN"
        inputmode="numeric"
        autocomplete="current-password"
      >

      <button class="primary" onclick="login('${role}')">
        Войти
      </button>

      <button onclick="renderLogin()">
        Назад
      </button>
    </div>
  `;
}

async function openApp() {
  await loadDashboard();
  renderApp();
}

async function loadDashboard() {
  state.dashboard = await api("/api/dashboard");
}

function renderApp() {
  app.innerHTML = `
    <div class="app-shell">

      <header class="topbar">
        <div>
          <div class="brand">CHAPPI EDITION</div>
          <div class="role">${esc(roleName(state.user?.role))}</div>
        </div>

        <button class="logout" onclick="logout()">
          Выйти
        </button>
      </header>

      <main id="content"></main>

      <nav class="bottom-nav">
        <button onclick="showPage('dashboard')">
          Главная
        </button>

        <button onclick="showPage('production')">
          Производство
        </button>

        <button onclick="showPage('attendance')">
          Присутствие
        </button>

        <button onclick="showPage('report')">
          Отчёт
        </button>

        ${
          state.user?.role === "admin"
            ? `<button onclick="showPage('admin')">Админ</button>`
            : ""
        }
      </nav>

    </div>
  `;

  showPage(state.page);
}

async function showPage(page) {
  state.page = page;

  const content = document.getElementById("content");

  if (!content) return;

  try {
    if (page === "dashboard") {
      await loadDashboard();
      renderDashboard(content);
    }

    if (page === "production") {
      await loadSizes();
      renderProduction(content);
    }

    if (page === "attendance") {
      await loadEmployees();
      renderAttendance(content);
    }

    if (page === "report") {
      await loadReport();
      renderReport(content);
    }

    if (page === "admin") {
      await loadAdminData();
      renderAdmin(content);
    }

  } catch (error) {
    content.innerHTML = `
      <div class="error-card">
        <h2>Ошибка</h2>
        <p>${esc(error.message)}</p>
        <button onclick="showPage('${page}')">
          Повторить
        </button>
      </div>
    `;
  }
}

function renderDashboard(content) {
  const d = state.dashboard || {};

  const quantity = Number(d.quantity || 0);
  const earnings = Number(d.earnings || 0);
  const coin = Number(d.chappiCoin || 0);

  content.innerHTML = `
    <section class="page">
      <h1>Главная</h1>

      <div class="welcome-card">
        <h2>Добро пожаловать!</h2>
        <p>${esc(roleName(state.user?.role))}</p>
      </div>

      <div class="stats-grid">

        <div class="stat-card">
          <span>Столбов за месяц</span>
          <strong>${quantity}</strong>
        </div>

        <div class="stat-card">
          <span>Заработок</span>
          <strong>${earnings.toFixed(2)}</strong>
        </div>

        <div class="stat-card">
          <span>Счастливая копейка</span>
          <strong>${coin.toFixed(2)}</strong>
        </div>

      </div>

      <div class="info-card">
        <h3>Месяц</h3>
        <p>${esc(d.month || "")}</p>
      </div>
    </section>
  `;
}

async function loadSizes() {
  state.sizes = await api("/api/sizes");
}

function renderProduction(content) {
  const sizes = state.sizes || [];

  content.innerHTML = `
    <section class="page">
      <h1>Производство</h1>

      <div class="info-card">
        <p>
          Введите количество изготовленных столбов
          по каждому типоразмеру.
        </p>
      </div>

      <form id="production-form">

        <div class="production-list">

          ${
            sizes.filter(s => s.active !== false).map(size => `
              <div class="production-row">

                <div class="size-info">
                  <strong>${esc(size.label)}</strong>
                  <small>
                    ${esc(size.width)} ×
                    ${esc(size.depth)} ×
                    ${esc(size.length)} м
                  </small>
                </div>

                <input
                  type="number"
                  min="0"
                  step="1"
                  inputmode="numeric"
                  data-size-id="${esc(size.id)}"
                  placeholder="0"
                >

              </div>
            `).join("")
          }

        </div>

        <button
          type="submit"
          class="primary big-button"
        >
          Сохранить производство
        </button>

      </form>
    </section>
  `;

  const form = document.getElementById("production-form");

  form.addEventListener("submit", async event => {
    event.preventDefault();

    const records = [];

    form.querySelectorAll("[data-size-id]").forEach(input => {
      const quantity = Number(input.value || 0);

      if (quantity > 0) {
        records.push({
          sizeId: input.dataset.sizeId,
          quantity
        });
      }
    });

    if (!records.length) {
      alert("Введите хотя бы одно количество.");
      return;
    }

    try {
      await api("/api/production", {
        method: "POST",
        body: JSON.stringify({
          records
        })
      });

      alert("Производство сохранено.");

      form.reset();

      await loadDashboard();
      state.page = "dashboard";
      renderApp();

    } catch (error) {
      alert(error.message);
    }
  });
}

async function loadEmployees() {
  state.employees = await api("/api/employees");
}

function renderAttendance(content) {
  const employees = state.employees || [];

  content.innerHTML = `
    <section class="page">
      <h1>Присутствие</h1>

      <div class="info-card">
        <p>
          Отметьте сотрудников, которые сегодня работали.
        </p>
      </div>

      <form id="attendance-form">

        <div class="employee-list">

          ${
            employees.map(employee => `
              <label class="employee-row">
                <input
                  type="checkbox"
                  name="employee"
                  value="${esc(employee.id)}"
                >

                <span>
                  ${esc(employee.name)}
                </span>
              </label>
            `).join("")
          }

        </div>

        ${
          employees.length
            ? `
              <button
                type="submit"
                class="primary big-button"
              >
                Сохранить присутствие
              </button>
            `
            : `
              <div class="info-card">
                <p>Список сотрудников пока пуст.</p>
              </div>
            `
        }

      </form>
    </section>
  `;

  const form = document.getElementById("attendance-form");

  form.addEventListener("submit", async event => {
    event.preventDefault();

    const employeeIds = [...form.querySelectorAll(
      'input[name="employee"]:checked'
    )].map(input => input.value);

    try {
      await api("/api/attendance", {
        method: "POST",
        body: JSON.stringify({
          employeeIds
        })
      });

      alert("Присутствие сохранено.");

    } catch (error) {
      alert(error.message);
    }
  });
}

async function loadReport() {
  state.report = await api("/api/report");
}

function renderReport(content) {
  const report = state.report || {};
  const rows = report.rows || report.production || [];

  content.innerHTML = `
    <section class="page">
      <h1>Отчёт</h1>

      <div class="stats-grid">

        <div class="stat-card">
          <span>Всего столбов</span>
          <strong>${Number(report.quantity || 0)}</strong>
        </div>

        <div class="stat-card">
          <span>Заработок</span>
          <strong>${Number(report.earnings || 0).toFixed(2)}</strong>
        </div>

      </div>

      <div class="info-card">

        <h2>Производство</h2>

        ${
          rows.length
            ? `
              <div class="report-list">
                ${rows.map(row => `
                  <div class="report-row">
                    <span>
                      ${esc(
                        row.label ||
                        row.sizeLabel ||
                        row.length ||
                        "Типоразмер"
                      )}
                    </span>

                    <strong>
                      ${Number(row.quantity || 0)}
                    </strong>
                  </div>
                `).join("")}
              </div>
            `
            : `<p>Данных пока нет.</p>`
        }

      </div>
    </section>
  `;
}

async function loadAdminData() {
  await loadSizes();
  await loadEmployees();

  try {
    state.chappi = await api("/api/chappi");
  } catch {
    state.chappi = null;
  }
}

function renderAdmin(content) {
  content.innerHTML = `
    <section class="page">
      <h1>Администрирование</h1>

      <div class="admin-menu">

        <button onclick="showEmployeesAdmin()">
          Сотрудники
        </button>

        <button onclick="showSizesAdmin()">
          Типоразмеры
        </button>

        <button onclick="showPricesAdmin()">
          Расценки
        </button>

        <button onclick="showJournalAdmin()">
          Журнал входов
        </button>

      </div>

      <div id="admin-panel"></div>
    </section>
  `;
}

function showEmployeesAdmin() {
  const panel = document.getElementById("admin-panel");

  panel.innerHTML = `
    <div class="info-card">
      <h2>Добавить сотрудника</h2>

      <input
        id="employee-name"
        type="text"
        placeholder="Имя сотрудника"
      >

      <button
        class="primary"
        onclick="addEmployee()"
      >
        Добавить
      </button>
    </div>

    <div class="info-card">
      <h2>Сотрудники</h2>

      ${
        state.employees.length
          ? state.employees.map(employee => `
              <div class="report-row">
                <span>${esc(employee.name)}</span>
              </div>
            `).join("")
          : "<p>Сотрудников пока нет.</p>"
      }
    </div>
  `;
}

async function addEmployee() {
  const input = document.getElementById("employee-name");
  const name = input?.value.trim();

  if (!name) {
    alert("Введите имя сотрудника.");
    return;
  }

  try {
    await api("/api/employees", {
      method: "POST",
      body: JSON.stringify({
        name
      })
    });

    await loadEmployees();
    showEmployeesAdmin();

    alert("Сотрудник добавлен.");

  } catch (error) {
    alert(error.message);
  }
}

function showSizesAdmin() {
  const panel = document.getElementById("admin-panel");

  panel.innerHTML = `
    <div class="info-card">
      <h2>Добавить типоразмер</h2>

      <input id="size-label" placeholder="Название">
      <input id="size-width" type="number" step="0.01" placeholder="Ширина">
      <input id="size-depth" type="number" step="0.01" placeholder="Глубина">
      <input id="size-length" type="number" step="0.01" placeholder="Длина">

      <button
        class="primary"
        onclick="addSize()"
      >
        Добавить типоразмер
      </button>
    </div>

    <div class="info-card">
      <h2>Типоразмеры</h2>

      ${
        state.sizes.map(size => `
          <div class="report-row">
            <span>
              ${esc(size.label)}
              —
              ${esc(size.width)} ×
              ${esc(size.depth)} ×
              ${esc(size.length)} м
            </span>

            <span>
              ${size.active === false ? "Архив" : "Активен"}
            </span>
          </div>
        `).join("")
      }
    </div>
  `;
}

async function addSize() {
  const label = document.getElementById("size-label").value.trim();
  const width = Number(document.getElementById("size-width").value);
  const depth = Number(document.getElementById("size-depth").value);
  const length = Number(document.getElementById("size-length").value);

  if (!label || !width || !depth || !length) {
    alert("Заполните все поля.");
    return;
  }

  try {
    await api("/api/sizes", {
      method: "POST",
      body: JSON.stringify({
        label,
        width,
        depth,
        length
      })
    });

    await loadSizes();
    showSizesAdmin();

    alert("Типоразмер добавлен.");

  } catch (error) {
    alert(error.message);
  }
}

function showPricesAdmin() {
  const panel = document.getElementById("admin-panel");

  panel.innerHTML = `
    <div class="info-card">
      <h2>Расценки</h2>

      <p>
        Расценки должны сохраняться по периоду действия,
        чтобы старое производство не пересчитывалось
        по новым ценам.
      </p>

      <p>
        Раздел готов к подключению к серверным данным.
      </p>
    </div>
  `;
}

async function showJournalAdmin() {
  const panel = document.getElementById("admin-panel");

  try {
    const journal = await api("/api/login-journal");

    const rows = journal.rows || journal.journal || journal || [];

    panel.innerHTML = `
      <div class="info-card">
        <h2>Журнал входов</h2>

        ${
          Array.isArray(rows) && rows.length
            ? rows.map(row => `
                <div class="report-row">
                  <span>
                    ${esc(row.date || row.createdAt || "")}
                  </span>

                  <strong>
                    ${esc(
                      row.profile ||
                      row.role ||
                      ""
                    )}
                  </strong>
                </div>
              `).join("")
            : "<p>Записей пока нет.</p>"
        }
      </div>
    `;

  } catch (error) {
    panel.innerHTML = `
      <div class="error-card">
        <p>${esc(error.message)}</p>
      </div>
    `;
  }
}

init();
