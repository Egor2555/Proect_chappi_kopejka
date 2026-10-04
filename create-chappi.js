const fs = require("fs");
const path = require("path");

const ROOT = path.join(process.cwd(), "chappi-edition");

const files = {
  "README.md": `# Учёт столбов — Chappi Edition

Самостоятельная версия системы учёта производства.

## Основные принципы

- Работник / Бригадир / Администратор
- гибкий справочник типоразмеров
- архивирование старых типоразмеров
- исторические характеристики сохраняются в производственных записях
- переменные цены
- ежедневный учёт производства
- месячные отчёты
- учёт сотрудников
- журнал входов администратора
- фирменная функция «Счастливая копейка от Чаппи»

## Запуск

Требуется Node.js 20+.

    npm install
    npm start

После запуска открыть:

http://localhost:3000

Демо-вход:

admin / 2468

Это стартовая версия. PIN необходимо изменить перед реальной эксплуатацией.
`,

  "package.json": `{
  "name": "chappi-edition",
  "version": "0.1.0",
  "private": true,
  "description": "Учёт производства столбов — Chappi Edition",
  "main": "server.js",
  "scripts": {
    "start": "node server.js"
  },
  "engines": {
    "node": ">=20"
  },
  "dependencies": {
    "express": "^5.1.0"
  }
}
`,

  ".gitignore": `node_modules/
data/db.json
.env
*.log
`,

  "server.js": `
const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "db.json");

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function uid() {
  return crypto.randomUUID();
}

function now() {
  return new Date().toISOString();
}

function initialDatabase() {
  const created = now();

  return {
    version: 1,

    users: [
      {
        id: uid(),
        login: "admin",
        name: "Администратор",
        role: "admin",
        pin: "2468",
        active: true
      },
      {
        id: uid(),
        login: "brigadier",
        name: "Бригадир",
        role: "brigadier",
        pin: "1357",
        active: true
      },
      {
        id: uid(),
        login: "worker",
        name: "Работник",
        role: "worker",
        pin: "1111",
        active: true
      }
    ],

    sizes: [
      {
        id: uid(),
        name: "60×40 × 1.50 м",
        width: 60,
        depth: 40,
        length: 1.5,
        active: true,
        createdAt: created,
        archivedAt: null
      },
      {
        id: uid(),
        name: "60×40 × 1.70 м",
        width: 60,
        depth: 40,
        length: 1.7,
        active: true,
        createdAt: created,
        archivedAt: null
      },
      {
        id: uid(),
        name: "60×40 × 2.00 м",
        width: 60,
        depth: 40,
        length: 2,
        active: true,
        createdAt: created,
        archivedAt: null
      },
      {
        id: uid(),
        name: "60×40 × 2.25 м",
        width: 60,
        depth: 40,
        length: 2.25,
        active: true,
        createdAt: created,
        archivedAt: null
      },
      {
        id: uid(),
        name: "60×40 × 2.50 м",
        width: 60,
        depth: 40,
        length: 2.5,
        active: true,
        createdAt: created,
        archivedAt: null
      },
      {
        id: uid(),
        name: "60×40 × 3.00 м",
        width: 60,
        depth: 40,
        length: 3,
        active: true,
        createdAt: created,
        archivedAt: null
      }
    ],

    prices: [],
    production: [],
    attendance: [],
    loginJournal: []
  };
}

function readDatabase() {
  fs.mkdirSync(DATA_DIR, { recursive: true });

  if (!fs.existsSync(DATA_FILE)) {
    const db = initialDatabase();
    writeDatabase(db);
    return db;
  }

  return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}

function writeDatabase(db) {
  fs.mkdirSync(DATA_DIR, { recursive: true });

  const temp = DATA_FILE + ".tmp";

  fs.writeFileSync(
    temp,
    JSON.stringify(db, null, 2),
    "utf8"
  );

  fs.renameSync(temp, DATA_FILE);
}

const sessions = new Map();

function currentUser(req) {
  const token = req.headers["x-session"];

  if (!token) {
    return null;
  }

  return sessions.get(token) || null;
}

function requireRole(...roles) {
  return (req, res, next) => {
    const user = currentUser(req);

    if (!user || !roles.includes(user.role)) {
      return res.status(403).json({
        error: "Недостаточно прав"
      });
    }

    req.user = user;
    next();
  };
}


// ---------------- LOGIN ----------------

app.post("/api/login", (req, res) => {
  const { login, pin } = req.body || {};
  const db = readDatabase();

  const user = db.users.find(
    u => u.login === login &&
         u.pin === String(pin || "") &&
         u.active
  );

  if (!user) {
    return res.status(401).json({
      error: "Неверный логин или PIN"
    });
  }

  const token = crypto.randomBytes(24).toString("hex");

  sessions.set(token, {
    id: user.id,
    login: user.login,
    name: user.name,
    role: user.role
  });

  db.loginJournal.push({
    id: uid(),
    userId: user.id,
    dateTime: now(),
    profile: user.role,
    adminMode: user.role === "admin"
  });

  writeDatabase(db);

  res.json({
    token,
    user: {
      id: user.id,
      login: user.login,
      name: user.name,
      role: user.role
    }
  });
});

app.post("/api/logout", (req, res) => {
  sessions.delete(req.headers["x-session"]);
  res.json({ ok: true });
});

app.get("/api/me", (req, res) => {
  const user = currentUser(req);

  if (!user) {
    return res.status(401).json({
      error: "Не авторизован"
    });
  }

  res.json({ user });
});


// ---------------- SIZES ----------------

app.get(
  "/api/sizes",
  requireRole("admin", "brigadier", "worker"),
  (req, res) => {
    res.json(readDatabase().sizes);
  }
);

app.post(
  "/api/sizes",
  requireRole("admin"),
  (req, res) => {
    const {
      name,
      width,
      depth,
      length
    } = req.body || {};

    if (
      !name ||
      !Number.isFinite(Number(width)) ||
      !Number.isFinite(Number(depth)) ||
      !Number.isFinite(Number(length))
    ) {
      return res.status(400).json({
        error: "Некорректный типоразмер"
      });
    }

    const db = readDatabase();

    const item = {
      id: uid(),
      name: String(name).trim(),
      width: Number(width),
      depth: Number(depth),
      length: Number(length),
      active: true,
      createdAt: now(),
      archivedAt: null
    };

    db.sizes.push(item);
    writeDatabase(db);

    res.status(201).json(item);
  }
);

app.post(
  "/api/sizes/:id/archive",
  requireRole("admin"),
  (req, res) => {
    const db = readDatabase();

    const size = db.sizes.find(
      s => s.id === req.params.id
    );

    if (!size) {
      return res.status(404).json({
        error: "Типоразмер не найден"
      });
    }

    size.active = false;
    size.archivedAt = now();

    writeDatabase(db);

    res.json(size);
  }
);


// ---------------- USERS ----------------

app.get(
  "/api/users",
  requireRole("admin"),
  (req, res) => {
    const db = readDatabase();

    res.json(
      db.users.map(({ pin, ...user }) => user)
    );
  }
);

app.post(
  "/api/users",
  requireRole("admin"),
  (req, res) => {
    const {
      login,
      name,
      role,
      pin
    } = req.body || {};

    if (
      !login ||
      !name ||
      !pin ||
      !["worker", "brigadier"].includes(role)
    ) {
      return res.status(400).json({
        error: "Некорректные данные"
      });
    }

    const db = readDatabase();

    if (
      db.users.some(
        u => u.login === String(login).trim()
      )
    ) {
      return res.status(409).json({
        error: "Такой логин уже существует"
      });
    }

    const user = {
      id: uid(),
      login: String(login).trim(),
      name: String(name).trim(),
      role,
      pin: String(pin),
      active: true
    };

    db.users.push(user);

    writeDatabase(db);

    const { pin: hiddenPin, ...safeUser } = user;

    res.status(201).json(safeUser);
  }
);


// ---------------- PRICES ----------------

app.get(
  "/api/prices",
  requireRole("admin", "brigadier"),
  (req, res) => {
    res.json(readDatabase().prices);
  }
);

app.post(
  "/api/prices",
  requireRole("admin"),
  (req, res) => {
    const {
      sizeId,
      price
    } = req.body || {};

    const value = Number(price);

    if (
      !sizeId ||
      !Number.isFinite(value) ||
      value < 0
    ) {
      return res.status(400).json({
        error: "Некорректная цена"
      });
    }

    const db = readDatabase();

    const size = db.sizes.find(
      s => s.id === sizeId
    );

    if (!size) {
      return res.status(404).json({
        error: "Типоразмер не найден"
      });
    }

    const priceRecord = {
      id: uid(),
      sizeId,
      price: value,
      validFrom: now()
    };

    db.prices.push(priceRecord);

    writeDatabase(db);

    res.status(201).json(priceRecord);
  }
);


// ---------------- PRODUCTION ----------------

app.post(
  "/api/production",
  requireRole("admin", "brigadier", "worker"),
  (req, res) => {
    const {
      date,
      userId,
      sizeId,
      quantity
    } = req.body || {};

    const qty = Number(quantity);
    const db = readDatabase();

    const user = db.users.find(
      u => u.id === userId && u.active
    );

    const size = db.sizes.find(
      s => s.id === sizeId
    );

    if (
      !date ||
      !user ||
      !size ||
      !Number.isInteger(qty) ||
      qty < 0
    ) {
      return res.status(400).json({
        error: "Некорректная производственная запись"
      });
    }

    const priceHistory = db.prices
      .filter(p => p.sizeId === sizeId)
      .sort((a, b) =>
        a.validFrom.localeCompare(b.validFrom)
      );

    const applicablePrice =
      priceHistory.length
        ? priceHistory[priceHistory.length - 1].price
        : 0;

    const record = {
      id: uid(),
      date,
      userId,
      sizeId,

      // Исторический снимок типоразмера.
      sizeSnapshot: {
        name: size.name,
        width: size.width,
        depth: size.depth,
        length: size.length
      },

      quantity: qty,
      unitPrice: applicablePrice,
      total: qty * applicablePrice,
      createdAt: now()
    };

    db.production.push(record);

    writeDatabase(db);

    res.status(201).json(record);
  }
);

app.get(
  "/api/production",
  requireRole("admin", "brigadier", "worker"),
  (req, res) => {
    const db = readDatabase();

    const month = req.query.month;

    let rows = db.production;

    if (month) {
      rows = rows.filter(
        row => row.date.startsWith(month)
      );
    }

    res.json(rows);
  }
);


// ---------------- REPORT ----------------

app.get(
  "/api/report",
  requireRole("admin", "brigadier"),
  (req, res) => {
    const db = readDatabase();

    const month =
      String(
        req.query.month ||
        new Date().toISOString().slice(0, 7)
      );

    const rows = db.production.filter(
      row => row.date.startsWith(month)
    );

    const quantity = rows.reduce(
      (sum, row) => sum + row.quantity,
      0
    );

    const earnings = rows.reduce(
      (sum, row) => sum + row.total,
      0
    );

    res.json({
      month,
      quantity,
      earnings,
      rows
    });
  }
);


// ---------------- LOGIN JOURNAL ----------------

app.get(
  "/api/login-journal",
  requireRole("admin"),
  (req, res) => {
    res.json(readDatabase().loginJournal);
  }
);


// ---------------- HAPPY COIN ----------------

// Здесь родилась Счастливая копейка от Чаппи 🪙🏆

app.get(
  "/api/chappi",
  requireRole("admin"),
  (req, res) => {
    const db = readDatabase();

    const earnings = db.production.reduce(
      (sum, row) => sum + row.total,
      0
    );

    res.json({
      name: "Счастливая копейка от Чаппи",
      value: Math.round(
        earnings * 0.01 * 100
      ) / 100,
      message: "Фирменный резерв Chappi Edition"
    });
  }
);


app.listen(PORT, () => {
  console.log("");
  console.log("==================================");
  console.log("  CHAPPI EDITION");
  console.log("  Учёт столбов");
  console.log("==================================");
  console.log("");
  console.log("Сервер запущен:");
  console.log("http://localhost:" + PORT);
  console.log("");
});
`,

  "public/index.html": `<!doctype html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport"
        content="width=device-width, initial-scale=1">

  <title>Учёт столбов — Chappi Edition</title>

  <link rel="stylesheet" href="/app.css">
</head>

<body>

<main class="container">

  <header>
    <div>
      <h1>Учёт столбов</h1>
      <p>Chappi Edition</p>
    </div>

    <button id="logout"
            class="hidden">
      Выйти
    </button>
  </header>


  <section id="loginCard"
           class="card">

    <h2>Вход</h2>

    <form id="loginForm">

      <label>
        Логин
        <input id="login"
               required>
      </label>

      <label>
        PIN
        <input id="pin"
               type="password"
               inputmode="numeric"
               required>
      </label>

      <button>
        Войти
      </button>

    </form>

    <p id="loginError"
       class="error"></p>

  </section>


  <section id="app"
           class="hidden">

    <div class="userbar">
      <span id="who"></span>
      <span id="role"></span>
    </div>


    <div class="grid">

      <section class="card">

        <h2>Производство</h2>

        <form id="productionForm">

          <label>
            Дата
            <input id="date"
                   type="date"
                   required>
          </label>

          <label>
            Сотрудник
            <select id="worker"
                    required>
            </select>
          </label>

          <label>
            Типоразмер
            <select id="size"
                    required>
            </select>
          </label>

          <label>
            Количество
            <input id="quantity"
                   type="number"
                   min="0"
                   step="1"
                   required>
          </label>

          <button>
            Записать
          </button>

        </form>

        <p id="productionMessage"></p>

      </section>


      <section class="card">

        <h2>Сводка</h2>

        <pre id="summary"></pre>

      </section>

    </div>


    <section class="card adminOnly">

      <h2>Администрирование</h2>

      <h3>Добавить типоразмер</h3>

      <form id="sizeForm">

        <input id="sizeName"
               placeholder="Название"
               required>

        <input id="sizeWidth"
               type="number"
               placeholder="Ширина, мм"
               required>

        <input id="sizeDepth"
               type="number"
               placeholder="Глубина, мм"
               required>

        <input id="sizeLength"
               type="number"
               step="0.01"
               placeholder="Длина, м"
               required>

        <button>
          Добавить типоразмер
        </button>

      </form>


      <h3>Добавить сотрудника</h3>

      <form id="userForm">

        <input id="userLogin"
               placeholder="Логин"
               required>

        <input id="userName"
               placeholder="Имя"
               required>

        <select id="userRole">
          <option value="worker">
            Работник
          </option>

          <option value="brigadier">
            Бригадир
          </option>
        </select>

        <input id="userPin"
               type="password"
               inputmode="numeric"
               placeholder="PIN"
               required>

        <button>
          Добавить сотрудника
        </button>

      </form>

    </section>


    <section class="card">

      <h2>Месячный отчёт</h2>

      <div class="toolbar">

        <input id="month"
               type="month">

        <button id="reportBtn">
          Показать
        </button>

      </div>

      <pre id="report"></pre>

    </section>


    <section class="card adminOnly">

      <h2>Журнал входов</h2>

      <pre id="journal"></pre>

    </section>

  </section>

</main>

<script src="/app.js"></script>

</body>
</html>
`,

  "public/app.css": `* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family:
    system-ui,
    -apple-system,
    sans-serif;

  background: #f2f4f7;
  color: #17202a;
}

.container {
  max-width: 1050px;
  margin: auto;
  padding: 18px;
}

header,
.userbar,
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.card {
  background: white;
  border-radius: 14px;
  padding: 18px;
  margin: 14px 0;
  box-shadow:
    0 2px 10px #00000012;
}

.grid {
  display: grid;
  grid-template-columns:
    repeat(auto-fit, minmax(280px, 1fr));
  gap: 14px;
}

form {
  display: grid;
  gap: 10px;
}

input,
select,
button {
  width: 100%;
  padding: 11px;
  border-radius: 9px;
  border: 1px solid #cbd2d9;
  font: inherit;
}

button {
  cursor: pointer;
  background: #17202a;
  color: white;
  border: 0;
}

.hidden {
  display: none !important;
}

.error {
  color: #b42318;
  min-height: 1.2em;
}

.userbar {
  padding: 12px;
  background: #e8edf2;
  border-radius: 10px;
}

pre {
  white-space: pre-wrap;
  word-break: break-word;
}
`,

  "public/app.js": `const $ = id =>
  document.getElementById(id);

let token =
  localStorage.getItem("chappi_session");

let me = null;


async function api(url, options = {}) {

  options.headers = {
    ...(options.headers || {}),
    "Content-Type": "application/json"
  };

  if (token) {
    options.headers["x-session"] = token;
  }

  const response =
    await fetch(url, options);

  const data =
    await response
      .json()
      .catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data.error || "Ошибка запроса"
    );
  }

  return data;
}


function today() {
  return new Date()
    .toISOString()
    .slice(0, 10);
}


async function boot() {

  $("date").value = today();
  $("month").value =
    today().slice(0, 7);

  if (!token) {
    return;
  }

  try {

    const data =
      await api("/api/me");

    me = data.user;

    showApp();

  } catch {

    token = null;

    localStorage.removeItem(
      "chappi_session"
    );
  }
}


function showApp() {

  $("loginCard")
    .classList
    .add("hidden");

  $("app")
    .classList
    .remove("hidden");

  $("logout")
    .classList
    .remove("hidden");

  $("who").textContent =
    me.name;

  $("role").textContent =
    me.role;

  document
    .querySelectorAll(".adminOnly")
    .forEach(element => {

      element.classList.toggle(
        "hidden",
        me.role !== "admin"
      );

    });

  loadAll();
}


$("loginForm")
  .addEventListener(
    "submit",
    async event => {

      event.preventDefault();

      $("loginError")
        .textContent = "";

      try {

        const data =
          await api(
            "/api/login",
            {
              method: "POST",

              body: JSON.stringify({
                login:
                  $("login").value,

                pin:
                  $("pin").value
              })
            }
          );

        token = data.token;

        localStorage.setItem(
          "chappi_session",
          token
        );

        me = data.user;

        showApp();

      } catch (error) {

        $("loginError")
          .textContent =
          error.message;
      }
    }
  );


$("logout").onclick =
  async () => {

    try {
      await api(
        "/api/logout",
        { method: "POST" }
      );
    } catch {}

    token = null;

    localStorage.removeItem(
      "chappi_session"
    );

    location.reload();
  };


async function loadAll() {

  const [
    dashboard,
    sizes
  ] = await Promise.all([
    api("/api/dashboard")
      .catch(() => ({
        totalProduction: 0,
        activeSizes: []
      })),

    api("/api/sizes")
  ]);

  $("size").innerHTML =
    sizes
      .filter(size => size.active)
      .map(
        size =>
          '<option value="' +
          size.id +
          '">' +
          size.name +
          "</option>"
      )
      .join("");


  if (me.role === "admin") {

    const users =
      await api("/api/users");

    $("worker").innerHTML =
      users
        .filter(
          user =>
            user.active &&
            user.role !== "admin"
        )
        .map(
          user =>
            '<option value="' +
            user.id +
            '">' +
            user.name +
            " (" +
            user.role +
            ")" +
            "</option>"
        )
        .join("");


    const journal =
      await api(
        "/api/login-journal"
      );

    $("journal").textContent =
      journal
        .map(
          entry =>
            entry.dateTime +
            " · " +
            entry.profile +
            (entry.adminMode
              ? " · АДМИН-РЕЖИМ"
              : "")
        )
        .join("\\n");

  } else {

    $("worker").innerHTML =
      '<option value="' +
      me.id +
      '">' +
      me.name +
      "</option>";
  }


  $("summary").textContent =
    "Всего произведено: " +
    dashboard.totalProduction +
    "\\nАктивных типоразмеров: " +
    dashboard.activeSizes.length;

  await loadReport();
}


$("productionForm")
  .addEventListener(
    "submit",
    async event => {

      event.preventDefault();

      try {

        await api(
          "/api/production",
          {
            method: "POST",

            body: JSON.stringify({

              date:
                $("date").value,

              userId:
                $("worker").value,

              sizeId:
                $("size").value,

              quantity:
                Number(
                  $("quantity").value
                )
            })
          }
        );

        $("productionMessage")
          .textContent =
          "Запись сохранена.";

        $("quantity").value = "";

        await loadReport();

      } catch (error) {

        $("productionMessage")
          .textContent =
          error.message;
      }
    }
  );


$("sizeForm")
  .addEventListener(
    "submit",
    async event => {

      event.preventDefault();

      try {

        await api(
          "/api/sizes",
          {
            method: "POST",

            body: JSON.stringify({

              name:
                $("sizeName").value,

              width:
                Number(
                  $("sizeWidth").value
                ),

              depth:
                Number(
                  $("sizeDepth").value
                ),

              length:
                Number(
                  $("sizeLength").value
                )
            })
          }
        );

        event.target.reset();

        await loadAll();

      } catch (error) {

        alert(error.message);
      }
    }
  );


$("userForm")
  .addEventListener(
    "submit",
    async event => {

      event.preventDefault();

      try {

        await api(
          "/api/users",
          {
            method: "POST",

            body: JSON.stringify({

              login:
                $("userLogin").value,

              name:
                $("userName").value,

              role:
                $("userRole").value,

              pin:
                $("userPin").value
            })
          }
        );

        event.target.reset();

        await loadAll();

      } catch (error) {

        alert(error.message);
      }
    }
  );


$("reportBtn").onclick =
  loadReport;


async function loadReport() {

  if (!me) {
    return;
  }

  if (me.role === "worker") {

    $("report").textContent =
      "Расширенный отчёт доступен " +
      "бригадиру и администратору.";

    return;
  }

  const report =
    await api(
      "/api/report?month=" +
      encodeURIComponent(
        $("month").value
      )
    );

  $("report").textContent =
    "Месяц: " +
    report.month +
    "\\nКоличество: " +
    report.quantity +
    "\\nЗаработок: " +
    report.earnings.toFixed(2);
}


boot();
`
};


// Создание директорий
for (const file of Object.keys(files)) {

  const fullPath =
    path.join(ROOT, file);

  fs.mkdirSync(
    path.dirname(fullPath),
    { recursive: true }
  );
}


// Запись файлов
for (const [file, content] of Object.entries(files)) {

  const fullPath =
    path.join(ROOT, file);

  fs.writeFileSync(
    fullPath,
    content,
    "utf8"
  );

  console.log(
    "Создан:",
    path.relative(ROOT, fullPath)
  );
}


// Пустой каталог data
fs.mkdirSync(
  path.join(ROOT, "data"),
  { recursive: true }
);

fs.writeFileSync(
  path.join(ROOT, "data", ".gitkeep"),
  "",
  "utf8"
);

console.log("");
console.log("==================================");
console.log(" CHAPPI EDITION СОЗДАН");
console.log("==================================");
console.log("");
console.log("Папка:");
console.log(ROOT);
console.log("");
console.log("Следующие команды:");
console.log("cd chappi-edition");
console.log("npm install");
console.log("npm start");
console.log("");
