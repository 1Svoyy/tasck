# Telegram Task Manager Bot

Production-ready Telegram бот для управления задачами арбитражной команды.

## Стек

- **Node.js 20 + TypeScript**
- **grammY** — Telegram Bot framework
- **PostgreSQL** + **Prisma ORM**
- **Redis** (опционально, для сессий)
- **Railway** — хостинг

## Возможности

- 🎭 **RBAC** — 7 ролей: Owner → Head → Team Lead → Buyer → Assistant + Designer / Tech Specialist
- 📋 **Две очереди задач** — для дизайнеров и технических специалистов
- 🎨 **10 типов задач** с автоматическими шаблонами описания
- 🏷 **Теги** — для фильтрации и статистики
- 🔄 **Статусы** — OPEN → IN_PROGRESS → WAITING_APPROVAL → REVISION → DONE → CLOSED
- 💬 **Приватный чат** между заказчиком и исполнителем
- 📜 **История** — полный лог действий по задаче
- 🏆 **Рейтинг** исполнителей — автоматический подсчёт
- 📊 **Статистика** — по командам, тегам, типам задач
- 🔗 **Инвайт-система** — регистрация только по приглашению

## Структура проекта

```
src/
├── bot/
│   ├── handlers/          # бизнес-логика (задачи, очередь, рейтинг...)
│   ├── keyboards/         # inline-клавиатуры
│   ├── middleware/        # auth, роли
│   └── index.ts           # сборка бота
├── services/              # доменные сервисы (TaskService, UserService...)
├── db/client.ts           # Prisma singleton
├── types/                 # shared типы и константы
├── utils/                 # форматтеры, helpers
├── config.ts              # env конфиг
└── index.ts               # entrypoint
prisma/
└── schema.prisma          # схема БД
```

## Локальный запуск

```bash
# 1. Зависимости
npm install

# 2. .env
cp .env.example .env
# заполните BOT_TOKEN, DATABASE_URL, OWNER_TELEGRAM_ID

# 3. Миграции
npx prisma migrate dev --name init
npx prisma generate

# 4. Dev-режим
npm run dev
```

## Deploy на Railway

### 1. Создайте проект на Railway

1. Зайдите на [railway.app](https://railway.app)
2. New Project → Deploy from GitHub repo → выберите репозиторий
3. Добавьте сервисы:
   - **PostgreSQL**: New → Database → Add PostgreSQL
   - **Redis** (опционально): New → Database → Add Redis

### 2. Переменные окружения

В сервисе бота (Variables):

```
BOT_TOKEN=<токен от @BotFather>
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}     # опционально
OWNER_TELEGRAM_ID=<ваш Telegram ID>
NODE_ENV=production
```

> Получить свой Telegram ID: напишите [@userinfobot](https://t.me/userinfobot)
> Токен бота: создайте через [@BotFather](https://t.me/BotFather)

### 3. Деплой

Railway автоматически подхватит:
- `nixpacks.toml` (или `railway.toml`) — конфиг билда
- `package.json` — зависимости
- `prisma/schema.prisma` — схема БД

При деплое автоматически выполнится:
1. `npm ci`
2. `npx prisma generate`
3. `npm run build`
4. `npx prisma migrate deploy` (применит миграции)
5. `node dist/index.js` (запустит бота)

### 4. Первый вход

1. Нажмите `/start` в боте с аккаунта с `OWNER_TELEGRAM_ID` → получите роль Owner
2. Создайте инвайт для Head через меню
3. Head создаёт инвайты для Team Lead, Designer, Tech Specialist
4. Team Lead создаёт инвайты для Buyer и Assistant своей команды

## Иерархия прав

| Роль             | Создаёт задачи | Выполняет | Создаёт инвайты           | Видит задачи        |
|------------------|:-------------:|:---------:|:-------------------------:|---------------------|
| Owner            | ❌            | ❌        | Любые                     | Все                 |
| Head             | ✅            | ❌        | Все кроме Owner           | Все                 |
| Team Lead        | ✅            | ❌        | Buyer, Assistant (в свою) | Свои + своей команды|
| Buyer            | ✅            | ❌        | ❌                        | Свои + ассистентов  |
| Buyer Assistant  | ✅            | ❌        | ❌                        | Только свои         |
| Designer         | ❌            | ✅        | ❌                        | Очередь Designer    |
| Tech Specialist  | ❌            | ✅        | ❌                        | Очередь Tech        |

## Типы задач и шаблоны

При создании задачи пользователь выбирает тип — система подставляет шаблон:

- **Landing**: ГЕО, Вертикаль, Источник, Оффер, Референс, Комментарий
- **Prelanding**: ГЕО, Вертикаль, Оффер, Референс, Комментарий
- **Creatives**: ГЕО, Вертикаль, Формат, Размеры, Количество, Комментарий
- **Banner**: ГЕО, Размеры, Текст, Комментарий
- **Video**: ГЕО, Формат, Длительность, Комментарий
- **Pixel Setup**: Платформа, Оффер, URL, Комментарий
- **Cloaking**: Домен, Трафик, Комментарий
- **Domain Setup**: Домен, Регистратор, Комментарий
- **Hosting Setup**: Хостинг, Домен, Комментарий
- **Other**: Описание, Комментарий

## Жизненный цикл задачи

```
OPEN
  │
  │ [Executor берёт]
  ▼
IN_PROGRESS
  │
  │ [Executor отправляет на проверку]
  ▼
WAITING_APPROVAL
  │        │
  │        │ [Creator: "Доработать"]
  │        ▼
  │    REVISION  ──── [Executor → заново submit] ──→ WAITING_APPROVAL
  │
  │ [Creator одобряет]
  ▼
DONE  ──── [Creator закрывает] ──→ CLOSED
```

На любом шаге до DONE заказчик может удалить задачу → CANCELLED.
На шагах IN_PROGRESS / REVISION исполнитель может отказаться → обратно в OPEN.

## Система рейтинга

Формула: `score = completed×10 − cancelled×5 − revisions×2 − overdue×3 + fast_bonus`

Где `fast_bonus = +5` если среднее время < 24 часов.

Рейтинг считается по месяцам (YYYY-MM) и обновляется автоматически.

## Полезные команды

```bash
# Посмотреть БД
npx prisma studio

# Сбросить БД (осторожно!)
npx prisma migrate reset

# Создать новую миграцию
npx prisma migrate dev --name <name>

# Логи Railway
railway logs
```

## TODO / Возможные улучшения

- [ ] Загрузка файлов через Telegram API (сохранение file_id)
- [ ] Нотификации по дедлайнам (cron)
- [ ] Экспорт статистики в CSV
- [ ] Поиск по задачам
- [ ] Фильтры в очереди (по тегам, приоритету)
- [ ] Webhook вместо long-polling для продакшена

## Лицензия

MIT
