
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
    !/^d{4}-d{2}-d{2}$/.test(
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
    !/^d{4}-d{2}-d{2}$/.test(
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
