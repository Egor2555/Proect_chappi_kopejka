const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "chappi-edition-v02");
const PUBLIC = path.join(ROOT, "public");
const DATA = path.join(ROOT, "data");

function write(file, content) {
  const target = path.join(ROOT, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, "utf8");
  console.log("Создан:", path.relative(ROOT, target));
}

fs.mkdirSync(PUBLIC, { recursive: true });
fs.mkdirSync(DATA, { recursive: true });

console.log("");
console.log("================================");
console.log(" CHAPPI EDITION 0.2 INSTALLER");
console.log("================================");
console.log("");
console.log("Папка:", ROOT);
console.log("");
const server = `
const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = 3000;

const DATA_DIR = path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "db.json");

fs.mkdirSync(DATA_DIR, { recursive: true });

function initialDb() {
  return {
    users: [
      {
        id: "admin",
        login: "admin",
        pin: "2468",
        role: "admin",
        name: "Администратор"
      },
      {
        id: "brigadier",
        login: "brigadier",
        pin: "1357",
        role: "brigadier",
        name: "Бригадир"
      }
    ],
    employees: [],
    sizes: [
      {
        id: "size-60x40-150",
        width: 60,
        depth: 40,
        length: 1.5,
        label: "60×40 × 1.50 м",
        active: true,
        createdAt: "2026-01-01"
      },
      {
        id: "size-60x40-170",
        width: 60,
        depth: 40,
        length: 1.7,
        label: "60×40 × 1.70 м",
        active: true,
        createdAt: "2026-01-01"
      },
      {
        id: "size-60x40-200",
        width: 60,
        depth: 40,
        length: 2,
        label: "60×40 × 2.00 м",
        active: true,
        createdAt: "2026-01-01"
      },
      {
        id: "size-60x40-225",
        width: 60,
        depth: 40,
        length: 2.25,
        label: "60×40 × 2.25 м",
        active: true,
        createdAt: "2026-01-01"
      },
      {
        id: "size-60x40-250",
        width: 60,
        depth: 40,
        length: 2.5,
        label: "60×40 × 2.50 м",
        active: true,
        createdAt: "2026-01-01"
      },
      {
        id: "size-60x40-300",
        width: 60,
        depth: 40,
        length: 3,
        label: "60×40 × 3.00 м",
        active: true,
        createdAt: "2026-01-01"
      }
    ],
    prices: [],
    production: [],
    attendance: [],
    loginJournal: [],
    chappi: {
      total: 0
    }
  };
}

function saveDb(db) {
  fs.writeFileSync(
    DB_FILE,
    JSON.stringify(db, null, 2),
    "utf8"
  );
}

function loadDb() {
  if (!fs.existsSync(DB_FILE)) {
    const db = initialDb();
    saveDb(db);
    return db;
  }

  try {
    const db = JSON.parse(
      fs.readFileSync(DB_FILE, "utf8")
    );

    db.users = Array.isArray(db.users)
      ? db.users.filter(
          u =>
            u.role === "admin" ||
            u.role === "brigadier"
        )
      : [];

    if (!db.users.some(u => u.role === "admin")) {
      db.users.push({
        id: "admin",
        login: "admin",
        pin: "2468",
        role: "admin",
        name: "Администратор"
      });
    }

    if (!db.users.some(u => u.role === "brigadier")) {
      db.users.push({
        id: "brigadier",
        login: "brigadier",
        pin: "1357",
        role: "brigadier",
        name: "Бригадир"
      });
    }

    db.employees =
      Array.isArray(db.employees)
        ? db.employees
        : [];

    db.sizes =
      Array.isArray(db.sizes)
        ? db.sizes
        : [];

    db.prices =
      Array.isArray(db.prices)
        ? db.prices
        : [];

    db.production =
      Array.isArray(db.production)
        ? db.production
        : [];

    db.attendance =
      Array.isArray(db.attendance)
        ? db.attendance
        : [];

    db.loginJournal =
      Array.isArray(db.loginJournal)
        ? db.loginJournal
        : [];

    db.chappi =
      db.chappi || { total: 0 };

    saveDb(db);
    return db;
  } catch (error) {
    console.log(
      "База повреждена. Создаю новую."
    );

    const db = initialDb();
    saveDb(db);
    return db;
  }
}

let db = loadDb();

const sessions = new Map();

function id(prefix) {
  return (
    prefix +
    "-" +
    Date.now() +
    "-" +
    Math.random()
      .toString(36)
      .slice(2, 8)
  );
}

function now() {
  return new Date().toISOString();
}

function today() {
  return now().slice(0, 10);
}

function getSize(sizeId) {
  return db.sizes.find(
    s => s.id === sizeId
  );
}

function getPrice(sizeId, date) {
  return db.prices
    .filter(
      p =>
        p.sizeId === sizeId &&
        p.validFrom <= date
    )
    .sort(
      (a, b) =>
        b.validFrom.localeCompare(
          a.validFrom
        )
    )[0] || null;
}

function auth(req, res, roles = []) {
  const token =
    req.headers.authorization || "";

  const session =
    sessions.get(token);

  if (!session) {
    res.status(401).json({
      error: "Требуется вход"
    });
    return null;
  }

  if (
    roles.length &&
    !roles.includes(session.role)
  ) {
    res.status(403).json({
      error: "Недостаточно прав"
    });
    return null;
  }

  return session;
}

function dashboard() {
  const month =
    today().slice(0, 7);

  const records =
    db.production.filter(
      p =>
        p.date.slice(0, 7) === month
    );

  return {
    month,
    quantity:
      records.reduce(
        (sum, p) =>
          sum + Number(p.quantity || 0),
        0
      ),
    earnings:
      records.reduce(
        (sum, p) =>
          sum + Number(p.earnings || 0),
        0
      ),
    productionRecords:
      records.length,
    employees:
      db.employees.length,
    activeSizes:
      db.sizes.filter(
        s => s.active
      ).length,
    chappiCoin:
      db.chappi.total
  };
}

app.use(express.json());

app.use(
  express.static(
    path.join(__dirname, "public")
  )
);

/*
  Вход работника — без личного PIN.
*/
app.post("/api/login", (req, res) => {
  const role =
    String(req.body.role || "");

  if (role === "worker") {
    const token = id("session");

    sessions.set(token, {
      role: "worker",
      userId: null,
      createdAt: now()
    });

    db.loginJournal.push({
      id: id("login"),
      dateTime: now(),
      profile: "Работник",
      adminMode: false
    });

    saveDb(db);

    return res.json({
      token,
      role: "worker",
      name: "Работник"
    });
  }

  const login =
    String(req.body.login || "");

  const pin =
    String(req.body.pin || "");

  const user =
    db.users.find(
      u =>
        u.login === login &&
        u.pin === pin
    );

  if (!user) {
    return res.status(401).json({
      error:
        "Неверный логин или PIN"
    });
  }

  const token = id("session");

  sessions.set(token, {
    role: user.role,
    userId: user.id,
    createdAt: now()
  });

  db.loginJournal.push({
    id: id("login"),
    dateTime: now(),
    profile:
      user.role === "admin"
        ? "Администратор"
        : "Бригадир",
    adminMode:
      user.role === "admin"
  });

  saveDb(db);

  res.json({
    token,
    role: user.role,
    name: user.name
  });
});

app.post("/api/logout", (req, res) => {
  const token =
    req.headers.authorization || "";

  sessions.delete(token);

  res.json({ ok: true });
});

app.get("/api/me", (req, res) => {
  const session =
    auth(req, res);

  if (!session) return;

  res.json({
    role: session.role,
    userId: session.userId
  });
});

app.get("/api/dashboard", (req, res) => {
  const session =
    auth(req, res);

  if (!session) return;

  res.json(dashboard());
});

app.get("/api/sizes", (req, res) => {
  const session =
    auth(req, res);

  if (!session) return;

  res.json(db.sizes);
});

app.post("/api/sizes", (req, res) => {
  const session =
    auth(req, res, ["admin"]);

  if (!session) return;

  const width =
    Number(req.body.width);

  const depth =
    Number(req.body.depth);

  const length =
    Number(req.body.length);

  if (
    !Number.isFinite(width) ||
    !Number.isFinite(depth) ||
    !Number.isFinite(length) ||
    width <= 0 ||
    depth <= 0 ||
    length <= 0
  ) {
    return res.status(400).json({
      error:
        "Некорректные размеры"
    });
  }

  const size = {
    id: id("size"),
    width,
    depth,
    length,
    label:
      width +
      "×" +
      depth +
      " × " +
      length.toFixed(2) +
      " м",
    active: true,
    createdAt: today()
  };

  db.sizes.push(size);
  saveDb(db);

  res.json(size);
});

app.post(
  "/api/sizes/:id/archive",
  (req, res) => {
    const session =
      auth(req, res, ["admin"]);

    if (!session) return;

    const size =
      getSize(req.params.id);

    if (!size) {
      return res.status(404).json({
        error:
          "Типоразмер не найден"
      });
    }

    size.active = false;
    size.archivedAt = today();

    saveDb(db);

    res.json(size);
  }
);

app.get("/api/employees", (req, res) => {
  const session =
    auth(req, res, [
      "admin",
      "brigadier"
    ]);

  if (!session) return;

  res.json(db.employees);
});

app.post("/api/employees", (req, res) => {
  const session =
    auth(req, res, ["admin"]);

  if (!session) return;

  const name =
    String(
      req.body.name || ""
    ).trim();

  if (!name) {
    return res.status(400).json({
      error:
        "Введите имя сотрудника"
    });
  }

  const employee = {
    id: id("employee"),
    name,
    active: true,
    createdAt: today()
  };

  db.employees.push(employee);
  saveDb(db);

  res.json(employee);
});

app.patch(
  "/api/employees/:id",
  (req, res) => {
    const session =
      auth(req, res, ["admin"]);

    if (!session) return;

    const employee =
      db.employees.find(
        e =>
          e.id === req.params.id
      );

    if (!employee) {
      return res.status(404).json({
        error:
          "Сотрудник не найден"
      });
    }

    if (
      typeof req.body.active ===
      "boolean"
    ) {
      employee.active =
        req.body.active;
    }

    saveDb(db);

    res.json(employee);
  }
);

app.get("/api/prices", (req, res) => {
  const session =
    auth(req, res, [
      "admin",
      "brigadier"
    ]);

  if (!session) return;

  res.json(db.prices);
});

app.post("/api/prices", (req, res) => {
  const session =
    auth(req, res, ["admin"]);

  if (!session) return;

  const sizeId =
    String(req.body.sizeId || "");

  const price =
    Number(req.body.price);

  const validFrom =
    String(
      req.body.validFrom || ""
    );

  if (!getSize(sizeId)) {
    return res.status(400).json({
      error:
        "Типоразмер не найден"
    });
  }

  if (
    !Number.isFinite(price) ||
    price < 0
  ) {
    return res.status(400).json({
      error:
        "Некорректная цена"
    });
  }

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      validFrom
    )
  ) {
    return res.status(400).json({
      error:
        "Некорректная дата"
    });
  }

  const record = {
    id: id("price"),
    sizeId,
    price,
    validFrom,
    createdAt: now()
  };

  db.prices.push(record);
  saveDb(db);

  res.json(record);
});

app.get("/api/production", (req, res) => {
  const session =
    auth(req, res);

  if (!session) return;

  let result =
    db.production.slice();

  if (req.query.month) {
    result =
      result.filter(
        p =>
          p.date.slice(0, 7) ===
          req.query.month
      );
  }

  res.json(result);
});

app.post("/api/production", (req, res) => {
  const session =
    auth(req, res, [
      "admin",
      "brigadier"
    ]);

  if (!session) return;

  const date =
    String(
      req.body.date || today()
    );

  const sizeId =
    String(
      req.body.sizeId || ""
    );

  const quantity =
    Number(req.body.quantity);

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      date
    )
  ) {
    return res.status(400).json({
      error:
        "Некорректная дата"
    });
  }

  const size =
    getSize(sizeId);

  if (!size) {
    return res.status(400).json({
      error:
        "Типоразмер не найден"
    });
  }

  if (
    !Number.isInteger(quantity) ||
    quantity <= 0
  ) {
    return res.status(400).json({
      error:
        "Количество должно быть целым числом"
    });
  }

  const price =
    getPrice(sizeId, date);

  if (!price) {
    return res.status(400).json({
      error:
        "На эту дату нет установленной цены"
    });
  }

  const earnings =
    quantity * price.price;

  const record = {
    id: id("production"),
    date,
    sizeId,

    sizeSnapshot: {
      width: size.width,
      depth: size.depth,
      length: size.length,
      label: size.label
    },

    quantity,
    priceId: price.id,
    unitPrice: price.price,
    earnings,

    createdAt: now(),
    createdByRole: session.role
  };

  db.production.push(record);

  const coin =
    earnings * 0.01;

  // Здесь родилась Счастливая копейка от Чаппи 🪙🏆

  db.chappi.total =
    Math.round(
      (db.chappi.total + coin) *
      100
    ) / 100;

  saveDb(db);

  res.json(record);
});

app.get("/api/attendance", (req, res) => {
  const session =
    auth(req, res, [
      "admin",
      "brigadier"
    ]);

  if (!session) return;

  let result =
    db.attendance.slice();

  if (req.query.date) {
    result =
      result.filter(
        a =>
          a.date ===
          req.query.date
      );
  }

  res.json(result);
});

app.post("/api/attendance", (req, res) => {
  const session =
    auth(req, res, [
      "admin",
      "brigadier"
    ]);

  if (!session) return;

  const date =
    String(
      req.body.date || today()
    );

  const employeeId =
    String(
      req.body.employeeId || ""
    );

  const status =
    String(
      req.body.status || ""
    );

  const employee =
    db.employees.find(
      e =>
        e.id === employeeId
    );

  if (!employee) {
    return res.status(400).json({
      error:
        "Сотрудник не найден"
    });
  }

  if (
    !["present", "absent"]
      .includes(status)
  ) {
    return res.status(400).json({
      error:
        "Некорректный статус"
    });
  }

  const existing =
    db.attendance.find(
      a =>
        a.date === date &&
        a.employeeId ===
          employeeId
    );

  if (existing) {
    existing.status = status;
    existing.employeeNameSnapshot =
      employee.name;
    existing.updatedAt = now();

    saveDb(db);

    return res.json(existing);
  }

  const record = {
    id: id("attendance"),
    date,
    employeeId,
    employeeNameSnapshot:
      employee.name,
    status,
    createdAt: now(),
    createdByRole: session.role
  };

  db.attendance.push(record);
  saveDb(db);

  res.json(record);
});

app.get("/api/report", (req, res) => {
  const session =
    auth(req, res);

  if (!session) return;

  const month =
    String(
      req.query.month ||
      today().slice(0, 7)
    );

  const records =
    db.production.filter(
      p =>
        p.date.slice(0, 7) ===
        month
    );

  const bySize = {};

  for (const p of records) {
    if (!bySize[p.sizeId]) {
      bySize[p.sizeId] = {
        sizeId: p.sizeId,
        label:
          p.sizeSnapshot.label,
        quantity: 0,
        earnings: 0
      };
    }

    bySize[p.sizeId].quantity +=
      p.quantity;

    bySize[p.sizeId].earnings +=
      p.earnings;
  }

  res.json({
    month,
    records,
    bySize:
      Object.values(bySize),

    totalQuantity:
      records.reduce(
        (sum, p) =>
          sum + p.quantity,
        0
      ),

    totalEarnings:
      records.reduce(
        (sum, p) =>
          sum + p.earnings,
        0
      ),

    chappiCoin:
      db.chappi.total
  });
});

app.get(
  "/api/login-journal",
  (req, res) => {
    const session =
      auth(req, res, ["admin"]);

    if (!session) return;

    res.json(
      db.loginJournal
        .slice()
        .sort(
          (a, b) =>
            b.dateTime.localeCompare(
              a.dateTime
            )
        )
    );
  }
);

app.get("/api/chappi", (req, res) => {
  const session =
    auth(req, res);

  if (!session) return;

  res.json(db.chappi);
});

app.get("*", (req, res) => {
  res.sendFile(
    path.join(
      __dirname,
      "public",
      "index.html"
    )
  );
});

app.listen(PORT, () => {
  console.log("");
  console.log(
    "CHAPPI EDITION 0.2"
  );
  console.log(
    "Сервер: http://localhost:" +
      PORT
  );
});
`;

write("server.js", server);

console.log("server.js готов.");
const packageJson = `{
  "name": "chappi-edition-v02",
  "version": "0.2.0",
  "description": "Учёт столбов — Chappi Edition",
  "main": "server.js",
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "express": "^4.21.2"
  }
}`;

write("package.json", packageJson);
console.log("package.json готов.");
const indexHtml = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Chappi Edition</title>
  <link rel="stylesheet" href="/app.css">
</head>
<body>

  <div id="app">
    <header class="topbar">
      <div>
        <h1>CHAPPI EDITION</h1>
        <div class="subtitle">Учёт столбов</div>
      </div>
      <div id="sessionInfo"></div>
    </header>

    <main>
      <section id="loginScreen" class="screen">
        <div class="card login-card">
          <h2>Вход</h2>

          <div class="login-buttons">
            <button class="big-button" onclick="showWorkerLogin()">
              👷 Работник
            </button>

            <button class="big-button" onclick="showBrigadierLogin()">
              🧭 Бригадир
            </button>

            <button class="big-button" onclick="showAdminLogin()">
              🔐 Администратор
            </button>
          </div>

          <div id="loginForm"></div>
        </div>
      </section>

      <section id="mainScreen" class="screen hidden">
        <nav class="menu">
          <button onclick="showPage('dashboard')">📊 Главная</button>
          <button onclick="showPage('production')">🏗 Производство</button>
          <button onclick="showPage('attendance')">👥 Присутствие</button>
          <button onclick="showPage('report')">📋 Отчёт</button>
          <button id="adminMenu" class="hidden" onclick="showPage('admin')">
            ⚙️ Админ
          </button>
          <button onclick="logout()">🚪 Выход</button>
        </nav>

        <div id="page"></div>
      </section>
    </main>
  </div>

  <script src="/app.js"></script>
</body>
</html>`;

write("public/index.html", indexHtml);
console.log("index.html готов.");
const appCss = `* {
  box-sizing: border-box;
}

:root {
  font-family: Arial, sans-serif;
  color: #17202a;
  background: #eef2f5;
}

body {
  margin: 0;
  min-height: 100vh;
  background: #eef2f5;
}

button,
input,
select {
  font: inherit;
}

button {
  cursor: pointer;
}

.topbar {
  background: #18232f;
  color: white;
  padding: 18px 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 15px;
}

.topbar h1 {
  margin: 0;
  font-size: 24px;
}

.subtitle {
  margin-top: 4px;
  opacity: 0.75;
}

main {
  width: 100%;
  max-width: 1100px;
  margin: 0 auto;
  padding: 20px;
}

.screen {
  width: 100%;
}

.hidden {
  display: none !important;
}

.card {
  background: white;
  border-radius: 16px;
  padding: 22px;
  box-shadow: 0 4px 18px rgba(0,0,0,0.08);
  margin-bottom: 18px;
}

.login-card {
  max-width: 520px;
  margin: 30px auto;
}

.login-card h2 {
  text-align: center;
  margin-top: 0;
}

.login-buttons {
  display: grid;
  gap: 14px;
}

.big-button {
  width: 100%;
  min-height: 64px;
  border: 0;
  border-radius: 12px;
  background: #263746;
  color: white;
  font-size: 20px;
  font-weight: bold;
}

.big-button:active {
  transform: scale(0.98);
}

.menu {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(145px, 1fr));
  gap: 10px;
  margin-bottom: 20px;
}

.menu button {
  min-height: 54px;
  border: 0;
  border-radius: 10px;
  background: white;
  color: #17202a;
  font-weight: bold;
  box-shadow: 0 2px 8px rgba(0,0,0,0.08);
}

.menu button:active {
  transform: scale(0.98);
}

.form-row {
  display: grid;
  gap: 8px;
  margin-bottom: 14px;
}

.form-row label {
  font-weight: bold;
}

input,
select {
  width: 100%;
  min-height: 48px;
  padding: 10px 12px;
  border: 1px solid #cbd3da;
  border-radius: 9px;
  background: white;
}

.primary {
  width: 100%;
  min-height: 52px;
  border: 0;
  border-radius: 10px;
  background: #1f6feb;
  color: white;
  font-weight: bold;
  font-size: 17px;
}

.danger {
  background: #c0392b !important;
}

.success {
  background: #218838 !important;
}

.muted {
  color: #68737d;
}

.stat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 14px;
}

.stat {
  background: white;
  border-radius: 14px;
  padding: 18px;
  box-shadow: 0 3px 12px rgba(0,0,0,0.07);
}

.stat-title {
  color: #68737d;
  font-size: 14px;
}

.stat-value {
  margin-top: 8px;
  font-size: 28px;
  font-weight: bold;
}

.table-wrap {
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
  background: white;
}

th,
td {
  padding: 11px 9px;
  border-bottom: 1px solid #e1e5e8;
  text-align: left;
}

th {
  background: #f4f6f8;
}

.message {
  margin-top: 12px;
  padding: 12px;
  border-radius: 9px;
  background: #f1f3f5;
}

@media (max-width: 600px) {
  main {
    padding: 12px;
  }

  .topbar {
    padding: 14px;
  }

  .topbar h1 {
    font-size: 20px;
  }

  .card {
    padding: 16px;
  }

  .menu {
    grid-template-columns: 1fr 1fr;
  }
}`;

write("public/app.css", appCss);
console.log("app.css готов.");
const appJs = `let currentUser = null;

async function api(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Ошибка сервера");
  }

  return data;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function showLoginForm(role) {
  const form = document.getElementById("loginForm");

  if (role === "worker") {
    form.innerHTML = \`
      <div class="card">
        <h3>Работник</h3>
        <p class="muted">
          Общий профиль работника. Личный PIN не требуется.
        </p>
        <button class="primary" onclick="loginWorker()">
          Войти как работник
        </button>
      </div>
    \`;
    return;
  }

  const title = role === "brigadier"
    ? "Вход бригадира"
    : "Вход администратора";

  form.innerHTML = \`
    <div class="card">
      <h3>\${title}</h3>

      <div class="form-row">
        <label>Логин</label>
        <input id="loginName" autocomplete="off">
      </div>

      <div class="form-row">
        <label>PIN</label>
        <input id="loginPin" type="password" inputmode="numeric">
      </div>

      <button class="primary" onclick="loginProtected('\${role}')">
        Войти
      </button>

      <div id="loginError"></div>
    </div>
  \`;
}

function showWorkerLogin() {
  showLoginForm("worker");
}

function showBrigadierLogin() {
  showLoginForm("brigadier");
}

function showAdminLogin() {
  showLoginForm("admin");
}

async function loginWorker() {
  try {
    const result = await api("/api/login", {
      method: "POST",
      body: JSON.stringify({
        role: "worker"
      })
    });

    currentUser = result.user;
    openApp();
  } catch (error) {
    alert(error.message);
  }
}

async function loginProtected(role) {
  const login = document.getElementById("loginName").value.trim();
  const pin = document.getElementById("loginPin").value;

  if (!login || !pin) {
    document.getElementById("loginError").innerHTML =
      '<div class="message">Введите логин и PIN.</div>';
    return;
  }

  try {
    const result = await api("/api/login", {
      method: "POST",
      body: JSON.stringify({
        role,
        login,
        pin
      })
    });

    currentUser = result.user;
    openApp();
  } catch (error) {
    document.getElementById("loginError").innerHTML =
      \`<div class="message">\${escapeHtml(error.message)}</div>\`;
  }
}

function openApp() {
  document.getElementById("loginScreen").classList.add("hidden");
  document.getElementById("mainScreen").classList.remove("hidden");

  const roleNames = {
    worker: "Работник",
    brigadier: "Бригадир",
    admin: "Администратор"
  };

  document.getElementById("sessionInfo").textContent =
    roleNames[currentUser.role] || currentUser.role;

  const adminMenu = document.getElementById("adminMenu");

  if (currentUser.role === "admin") {
    adminMenu.classList.remove("hidden");
  } else {
    adminMenu.classList.add("hidden");
  }

  showPage("dashboard");
}

async function logout() {
  try {
    await api("/api/logout", {
      method: "POST"
    });
  } catch (error) {
    console.warn(error);
  }

  currentUser = null;

  document.getElementById("mainScreen").classList.add("hidden");
  document.getElementById("loginScreen").classList.remove("hidden");
  document.getElementById("loginForm").innerHTML = "";
  document.getElementById("sessionInfo").textContent = "";
}

async function showPage(page) {
  const container = document.getElementById("page");

  try {
    if (page === "dashboard") {
      await renderDashboard(container);
    } else if (page === "production") {
      await renderProduction(container);
    } else if (page === "attendance") {
      await renderAttendance(container);
    } else if (page === "report") {
      await renderReport(container);
    } else if (page === "admin") {
      await renderAdmin(container);
    }
  } catch (error) {
    container.innerHTML = \`
      <div class="card">
        <h2>Ошибка</h2>
        <div class="message">\${escapeHtml(error.message)}</div>
      </div>
    \`;
  }
}

async function renderDashboard(container) {
  const data = await api("/api/dashboard");

  container.innerHTML = \`
    <div class="card">
      <h2>Главная</h2>
      <p class="muted">
        Chappi Edition — текущая производственная информация.
      </p>
    </div>

    <div class="stat-grid">
      <div class="stat">
        <div class="stat-title">Столбов сегодня</div>
        <div class="stat-value">\${data.todayQuantity || 0}</div>
      </div>

      <div class="stat">
        <div class="stat-title">Столбов за месяц</div>
        <div class="stat-value">\${data.monthQuantity || 0}</div>
      </div>

      <div class="stat">
        <div class="stat-title">Заработок за месяц</div>
        <div class="stat-value">\${Number(data.monthEarnings || 0).toFixed(2)}</div>
      </div>

      <div class="stat">
        <div class="stat-title">Счастливая копейка</div>
        <div class="stat-value">\${Number(data.chappiCoin || 0).toFixed(2)}</div>
      </div>
    </div>
  \`;
}

async function renderProduction(container) {
  const sizes = await api("/api/sizes");

  container.innerHTML = \`
    <div class="card">
      <h2>Производство</h2>
      <p class="muted">
        Здесь будет ежедневный ввод произведённых столбов.
      </p>

      <div class="form-row">
        <label>Дата</label>
        <input id="productionDate" type="date"
          value="\${new Date().toISOString().slice(0,10)}">
      </div>

      <div id="productionSizes">
        \${sizes.map(size => \`
          <div class="form-row">
            <label>
              \${escapeHtml(size.name)}
              — \${escapeHtml(size.length)} м
            </label>
            <input
              type="number"
              min="0"
              step="1"
              data-size-id="\${escapeHtml(size.id)}"
              placeholder="Количество">
          </div>
        \`).join("")}
      </div>

      <button class="primary" onclick="saveProduction()">
        Сохранить производство
      </button>

      <div id="productionMessage"></div>
    </div>
  \`;
}

async function saveProduction() {
  const date = document.getElementById("productionDate").value;
  const inputs = document.querySelectorAll("[data-size-id]");

  const rows = [];

  inputs.forEach(input => {
    const quantity = Number(input.value || 0);

    if (quantity > 0) {
      rows.push({
        sizeId: input.dataset.sizeId,
        quantity
      });
    }
  });

  if (!rows.length) {
    document.getElementById("productionMessage").innerHTML =
      '<div class="message">Введите хотя бы одно количество.</div>';
    return;
  }

  try {
    await api("/api/production", {
      method: "POST",
      body: JSON.stringify({
        date,
        rows
      })
    });

    document.getElementById("productionMessage").innerHTML =
      '<div class="message">Производство сохранено.</div>';

    setTimeout(() => showPage("production"), 500);
  } catch (error) {
    document.getElementById("productionMessage").innerHTML =
      \`<div class="message">\${escapeHtml(error.message)}</div>\`;
  }
}

async function renderAttendance(container) {
  if (!["admin", "brigadier"].includes(currentUser.role)) {
    container.innerHTML = \`
      <div class="card">
        <h2>Присутствие</h2>
        <p class="muted">
          Отметку присутствия выполняет бригадир или администратор.
        </p>
      </div>
    \`;
    return;
  }

  const employees = await api("/api/employees");

  container.innerHTML = \`
    <div class="card">
      <h2>Присутствие</h2>

      <div class="form-row">
        <label>Дата</label>
        <input id="attendanceDate" type="date"
          value="\${new Date().toISOString().slice(0,10)}">
      </div>

      <div id="attendanceList">
        \${employees.filter(e => e.active).map(employee => \`
          <label style="display:block; margin:12px 0;">
            <input
              type="checkbox"
              value="\${escapeHtml(employee.id)}"
              class="attendance-check">
            \${escapeHtml(employee.name)}
          </label>
        \`).join("")}
      </div>

      <button class="primary" onclick="saveAttendance()">
        Сохранить присутствие
      </button>

      <div id="attendanceMessage"></div>
    </div>
  \`;
}

async function saveAttendance() {
  const date = document.getElementById("attendanceDate").value;

  const employeeIds = [...document.querySelectorAll(".attendance-check:checked")]
    .map(input => input.value);

  try {
    await api("/api/attendance", {
      method: "POST",
      body: JSON.stringify({
        date,
        employeeIds
      })
    });

    document.getElementById("attendanceMessage").innerHTML =
      '<div class="message">Присутствие сохранено.</div>';
  } catch (error) {
    document.getElementById("attendanceMessage").innerHTML =
      \`<div class="message">\${escapeHtml(error.message)}</div>\`;
  }
}

async function renderReport(container) {
  const report = await api("/api/report");

  container.innerHTML = \`
    <div class="card">
      <h2>Отчёт</h2>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Размер</th>
              <th>Количество</th>
              <th>Цена</th>
              <th>Заработок</th>
            </tr>
          </thead>
          <tbody>
            \${(report.rows || []).map(row => \`
              <tr>
                <td>\${escapeHtml(row.sizeName)}</td>
                <td>\${row.quantity}</td>
                <td>\${Number(row.unitPrice || 0).toFixed(2)}</td>
                <td>\${Number(row.earnings || 0).toFixed(2)}</td>
              </tr>
            \`).join("")}
          </tbody>
        </table>
      </div>
    </div>

    <div class="stat-grid">
      <div class="stat">
        <div class="stat-title">Всего</div>
        <div class="stat-value">\${report.totalQuantity || 0}</div>
      </div>

      <div class="stat">
        <div class="stat-title">Заработок</div>
        <div class="stat-value">\${Number(report.totalEarnings || 0).toFixed(2)}</div>
      </div>
    </div>
  \`;
}

async function renderAdmin(container) {
  if (currentUser.role !== "admin") {
    container.innerHTML = \`
      <div class="card">
        <h2>Доступ запрещён</h2>
      </div>
    \`;
    return;
  }

  const employees = await api("/api/employees");

  container.innerHTML = \`
    <div class="card">
      <h2>Администратор</h2>
      <p class="muted">
        Управление сотрудниками и системными данными.
      </p>
    </div>

    <div class="card">
      <h3>Сотрудники</h3>

      <div class="form-row">
        <label>Имя сотрудника</label>
        <input id="employeeName" placeholder="Введите имя">
      </div>

      <button class="primary" onclick="addEmployee()">
        Добавить сотрудника
      </button>

      <div class="table-wrap" style="margin-top:18px;">
        <table>
          <thead>
            <tr>
              <th>Имя</th>
              <th>Статус</th>
            </tr>
          </thead>
          <tbody>
            \${employees.map(employee => \`
              <tr>
                <td>\${escapeHtml(employee.name)}</td>
                <td>\${employee.active ? "Активен" : "Архив"}</td>
              </tr>
            \`).join("")}
          </tbody>
        </table>
      </div>
    </div>
  \`;
}

async function addEmployee() {
  const input = document.getElementById("employeeName");
  const name = input.value.trim();

  if (!name) {
    alert("Введите имя сотрудника.");
    return;
  }

  try {
    await api("/api/employees", {
      method: "POST",
      body: JSON.stringify({ name })
    });

    await renderAdmin(document.getElementById("page"));
  } catch (error) {
    alert(error.message);
  }
}

async function init() {
  try {
    const result = await api("/api/me");

    if (result.user) {
      currentUser = result.user;
      openApp();
    }
  } catch (error) {
    console.log("Нет активной сессии.");
  }
}

init();
`;

write("public/app.js", appJs);
console.log("app.js готов.");
