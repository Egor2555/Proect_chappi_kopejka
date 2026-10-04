const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "chappi-edition-v02");
const PUBLIC = path.join(ROOT, "public");
const DATA = path.join(ROOT, "data");

function write(file, content) {
  const target = path.join(ROOT, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, "utf8");
  console.log("Создан:", path.relative(__dirname, target));
}

fs.mkdirSync(PUBLIC, { recursive: true });
fs.mkdirSync(DATA, { recursive: true });

write("package.json", `{
  "name": "chappi-edition-v02",
  "version": "0.2.0",
  "description": "Операция Столбы — Chappi Edition 0.2",
  "main": "server.js",
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "express": "^4.21.2"
  }
}
`);

write(".gitignore", `node_modules/
data/db.json
`);

write("README.md", `# Операция Столбы — Chappi Edition 0.2

Новая версия проекта учёта производства.

Главные принципы:

- Работник входит общим профилем без личного PIN.
- Работник не идентифицируется системой.
- Бригадир и администратор имеют защищённый вход.
- Журнал входов видит только администратор.
- Сотрудники для табеля хранятся отдельно от аккаунтов.
- Типоразмеры можно добавлять и архивировать.
- Архивные записи сохраняют исторические характеристики.
- Цена хранится с датой начала действия.
- При производстве используется цена, действующая на дату производства.
- Старые записи не пересчитываются по новым ценам.
- Производство и посещаемость разделены.
- Сохраняется фирменная «Счастливая копейка от Чаппи».

## Запуск

npm install
npm start

Открыть:

http://localhost:3000
`);

const server = String.raw`
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

function loadDb() {
  if (!fs.existsSync(DB_FILE)) {
    const db = initialDb();
    saveDb(db);
    return db;
  }

  try {
    const db = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));

    db.users = Array.isArray(db.users)
      ? db.users.filter(u => u.role === "admin" || u.role === "brigadier")
      : [];

    if (!db.users.some(u => u.role === "admin")) {
      db.users.push({
        id: "admin",
        login: "admin",
        pin: "2468",
        role: "admin",
        name: "Админист
