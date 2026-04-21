# Quick Start — Railway + GitHub

## 1. Подготовка

**Создайте Telegram бота:**
1. Откройте [@BotFather](https://t.me/BotFather)
2. `/newbot` → задайте имя → получите токен

**Узнайте свой Telegram ID:**
1. Напишите [@userinfobot](https://t.me/userinfobot)
2. Скопируйте свой ID

## 2. GitHub

```bash
cd tg-task-bot
git init
git add .
git commit -m "init"
git branch -M main
git remote add origin https://github.com/USERNAME/REPO.git
git push -u origin main
```

> В репозитории уже включена начальная миграция `prisma/migrations/20260101000000_init/` — Railway применит её автоматически при первом деплое.

## 3. Railway

1. [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub**
2. Выберите репозиторий
3. Добавьте PostgreSQL: **New** → **Database** → **PostgreSQL**
4. В настройках сервиса бота → **Variables**:

```
BOT_TOKEN=123456:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
DATABASE_URL=${{Postgres.DATABASE_URL}}
OWNER_TELEGRAM_ID=123456789
NODE_ENV=production
```

> `${{Postgres.DATABASE_URL}}` — Railway сам подставит URL вашей БД.

5. **Deploy** → подождите 2–3 минуты

## 4. Первый запуск

1. Откройте бота в Telegram
2. Отправьте `/start` (с аккаунта, чей ID в `OWNER_TELEGRAM_ID`)
3. Вы получите роль Owner
4. Создавайте инвайты → приглашайте команду

## 5. Что дальше

- **Логи**: `railway logs` или через UI Railway
- **БД**: `railway connect postgres` → SQL доступ
- **Обновление**: push в GitHub → Railway автоматически редеплоит

## Проблемы?

**Бот не отвечает:**
- Проверьте `BOT_TOKEN` в Variables
- Посмотрите логи: `railway logs`

**Ошибка миграций:**
- Убедитесь что `DATABASE_URL` правильно подставлен
- Первый запуск применяет миграции автоматически через `prisma migrate deploy`

**"Prisma Client not generated":**
- Убедитесь что `postinstall` скрипт в `package.json` присутствует
- Или вручную: `railway run npx prisma generate`
