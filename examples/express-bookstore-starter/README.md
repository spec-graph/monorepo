# Express Bookstore Starter

A minimal Express + TypeScript bookstore API, used as a test scenario for spec-graph V2's end-to-end validation.

## Features

- RESTful API for managing books (CRUD)
- TypeScript with strict mode
- In-memory storage (for simplicity)
- Seed data (2 books)
- Test suite with Vitest + Supertest

## Routes

| Method | Path         | Description       | Auth |
|--------|--------------|-------------------|------|
| GET    | /health      | Health check      | No   |
| GET    | /books       | List all books    | No   |
| GET    | /books/:id   | Get a single book | No   |
| POST   | /books       | Create a book     | No ← needs JWT |
| PUT    | /books/:id   | Update a book     | No   |
| DELETE | /books/:id   | Delete a book     | No   |

## Setup

```bash
cd examples/express-bookstore-starter
npm install
npm run build
npm run dev
```

## Running tests

```bash
npm test
```

## Use with spec-graph

From the monorepo root:

```bash
# Start a new session targeting the starter project
cd ../..
spec-graph auto "Add JWT authentication" --adapter claude-code
```

spec-graph will:
1. Create a plan for the JWT auth feature
2. Generate prompts for each stage
3. Delegate to Claude Code to implement
4. Evaluate gates at each stage
5. Advance through all 8 stages
